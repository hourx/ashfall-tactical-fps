// Collision and ray tests. Bodies are upright boxes on a flat floor: cheap, stable,
// and enough for a game where map shape matters more than ragdolls.
import * as THREE from 'three';

const EPS = 1e-4;

export function collider(minX, minY, minZ, maxX, maxY, maxZ) {
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

// The floor is not a collider: it is y = 0 and every body rests on it.

function overlaps(body, box) {
  const r = body.radius;
  return (
    body.pos.x + r > box.minX && body.pos.x - r < box.maxX &&
    body.pos.z + r > box.minZ && body.pos.z - r < box.maxZ &&
    body.pos.y + body.height > box.minY && body.pos.y < box.maxY
  );
}

function resolveAxis(body, axis, amount, colliders) {
  body.pos[axis] += amount;
  for (const box of colliders) {
    if (!overlaps(body, box)) continue;
    if (axis === 'x') {
      body.pos.x = amount > 0 ? box.minX - body.radius - EPS : box.maxX + body.radius + EPS;
      body.vel.x = 0;
    } else if (axis === 'z') {
      body.pos.z = amount > 0 ? box.minZ - body.radius - EPS : box.maxZ + body.radius + EPS;
      body.vel.z = 0;
    } else {
      if (amount > 0) {
        body.pos.y = box.minY - body.height - EPS;
        body.vel.y = 0;
      } else {
        body.pos.y = box.maxY + EPS;
        body.vel.y = 0;
        body.onGround = true;
      }
    }
  }
}

// Accelerate toward a wish direction, apply friction when grounded, then move in
// three separate axis sweeps so sliding along a wall stays smooth.
export function stepBody(body, wish, speed, dt, colliders, jumpQueued) {
  const accel = body.onGround ? 62 : 9;
  const targetX = wish.x * speed;
  const targetZ = wish.z * speed;
  body.vel.x += THREE.MathUtils.clamp(targetX - body.vel.x, -accel * dt, accel * dt);
  body.vel.z += THREE.MathUtils.clamp(targetZ - body.vel.z, -accel * dt, accel * dt);

  if (body.onGround && wish.lengthSq() < 1e-4) {
    const damp = Math.max(0, 1 - 9.5 * dt);
    body.vel.x *= damp;
    body.vel.z *= damp;
  }

  if (jumpQueued && body.onGround) {
    body.vel.y = 5.2;
    body.onGround = false;
  }

  body.vel.y -= 19.6 * dt;
  body.onGround = false;
  resolveAxis(body, 'x', body.vel.x * dt, colliders);
  resolveAxis(body, 'z', body.vel.z * dt, colliders);
  resolveAxis(body, 'y', body.vel.y * dt, colliders);
  if (body.pos.y <= 0) {
    body.pos.y = 0;
    body.vel.y = 0;
    body.onGround = true;
  }
  return body;
}

// Slab test against one axis-aligned box; returns the entry distance or Infinity.
export function rayBox(origin, dir, box, maxDist) {
  let tmin = 0;
  let tmax = maxDist;
  for (const axis of ['x', 'y', 'z']) {
    const o = origin[axis];
    const d = dir[axis];
    const lo = box[`min${axis.toUpperCase()}`];
    const hi = box[`max${axis.toUpperCase()}`];
    if (Math.abs(d) < 1e-8) {
      if (o < lo || o > hi) return Infinity;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

// Line of sight is blocked when any collider is hit before the target distance.
export function losBlocked(origin, target, colliders) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dz = target.z - origin.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-4) return false;
  const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
  for (const box of colliders) {
    const t = rayBox(origin, dir, box, dist - 0.15);
    if (t < dist - 0.15) return true;
  }
  return false;
}

// A bot's body is two stacked boxes: a head that pays a multiplier and a torso.
export function botBoxes(bot) {
  const r = 0.3;
  return [
    { part: 'head', box: collider(bot.pos.x - r, bot.pos.y + 1.44, bot.pos.z - r, bot.pos.x + r, bot.pos.y + 1.8, bot.pos.z + r) },
    { part: 'body', box: collider(bot.pos.x - 0.36, bot.pos.y + 0.1, bot.pos.z - 0.36, bot.pos.x + 0.36, bot.pos.y + 1.44, bot.pos.z + 0.36) },
  ];
}

// The player gets the same treatment, sized from the current stance, so crouching
// genuinely shrinks the hitbox instead of just the camera.
export function playerBoxes(player) {
  const body = player.body;
  const height = body.height;
  const headBottom = body.pos.y + height - 0.3;
  const r = body.radius;
  return [
    { part: 'head', box: collider(body.pos.x - 0.17, headBottom, body.pos.z - 0.17, body.pos.x + 0.17, body.pos.y + height, body.pos.z + 0.17) },
    { part: 'body', box: collider(body.pos.x - r, body.pos.y + 0.08, body.pos.z - r, body.pos.x + r, headBottom, body.pos.z + r) },
  ];
}

export function entityBoxes(entity) {
  return entity.kind === 'player' ? playerBoxes(entity) : botBoxes(entity);
}

// Nearest entity hit along a ray, with the wall check done first so cover is real.
export function raycastTargets(origin, dir, maxDist, entities, colliders) {
  let wallT = maxDist;
  for (const box of colliders) {
    const t = rayBox(origin, dir, box, maxDist);
    if (t < wallT) wallT = t;
  }
  let best = null;
  for (const entity of entities) {
    if (!entity.alive) continue;
    for (const { part, box } of entityBoxes(entity)) {
      const t = rayBox(origin, dir, box, wallT);
      if (t < wallT && (!best || t < best.distance)) best = { bot: entity, part, distance: t };
    }
  }
  return best;
}
