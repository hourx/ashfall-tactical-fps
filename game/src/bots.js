// Enemy and teammate bots. Each one walks a lane, watches a cone, hears gunfire,
// takes a moment to react, strafes while it shoots, and falls back on its route when
// it loses the target. The bomb is part of the behaviour, not a scripted cutscene.
import * as THREE from 'three';
import { BOT, MATCH, WEAPON_BY_ID } from './config.js';
import { SITES } from './world.js';
import { losBlocked, stepBody } from './physics.js';

const _wish = new THREE.Vector3();
const _to = new THREE.Vector3();

const NAMES = ['Vole', 'Marsh', 'Kite', 'Ferro', 'Dune', 'Pike', 'Slate', 'Wren'];

export function createBot(id, team, spawn, weaponId, routeName, routes) {
  const pos = new THREE.Vector3(spawn.x, 0, spawn.z);
  return {
    kind: 'bot',
    id,
    name: NAMES[id % NAMES.length],
    team,
    pos,
    body: { pos, vel: new THREE.Vector3(), radius: 0.32, height: 1.8, onGround: true, crouching: false },
    yaw: spawn.yaw,
    pitch: 0,
    health: BOT.health,
    armour: 0,
    alive: true,
    money: 800,
    weapon: weaponId,
    ammo: { mag: weaponId === 'vantage' ? 30 : 30, reserve: 90 },
    lastShot: -10,
    reloadUntil: 0,
    state: 'patrol',
    target: null,
    targetEye: new THREE.Vector3(),
    reaction: 0,
    lostAt: 0,
    route: routes[routeName],
    routeName,
    routeIndex: 0,
    strafe: 1,
    strafeUntil: 0,
    stuck: 0,
    lastPos: new THREE.Vector3(spawn.x, 0, spawn.z),
    carryBomb: false,
    holdUntil: 0,
    holdAnchor: null,
    heardAt: null,
    heardUntil: 0,
    crouching: false,
  };
}

export function resetBot(bot, spawn, routeName, routes) {
  bot.pos.set(spawn.x, 0, spawn.z);
  bot.body.vel.set(0, 0, 0);
  bot.yaw = spawn.yaw;
  bot.pitch = 0;
  bot.health = BOT.health;
  bot.alive = true;
  bot.state = 'patrol';
  bot.target = null;
  bot.reaction = 0;
  bot.route = routes[routeName];
  bot.routeName = routeName;
  bot.routeIndex = 0;
  bot.lastShot = -10;
  bot.reloadUntil = 0;
  bot.carryBomb = false;
  bot.holdAnchor = null;
  bot.holdUntil = 0;
  bot.heardAt = null;
  bot.heardUntil = 0;
  bot.stuck = 0;
  bot.lastPos.copy(bot.pos);
  bot.body.height = 1.8;
  bot.crouching = false;
}

function enemyOf(bot, combatants) {
  return combatants.filter((other) => other.alive && other.team !== bot.team);
}

function eyeOf(entity, out) {
  return out.set(entity.pos.x, entity.pos.y + 1.58, entity.pos.z);
}

// A cone plus a line of sight, so cover is real and a bot never shoots through a wall.
function canSee(bot, other, colliders) {
  const eye = _to.set(bot.pos.x, bot.pos.y + 1.58, bot.pos.z);
  const dx = other.pos.x - eye.x;
  const dz = other.pos.z - eye.z;
  const dist = Math.hypot(dx, dz);
  if (dist > BOT.viewRange || dist < 0.2) return false;
  const want = Math.atan2(-dx, -dz);
  let delta = Math.atan2(Math.sin(want - bot.yaw), Math.cos(want - bot.yaw));
  if (Math.abs(delta) > (BOT.fovDeg * Math.PI) / 360) return false;
  const target = new THREE.Vector3(other.pos.x, other.pos.y + 1.1, other.pos.z);
  return !losBlocked(eye, target, colliders);
}

function turnToward(bot, point, dt) {
  const dx = point.x - bot.pos.x;
  const dz = point.z - bot.pos.z;
  const wantYaw = Math.atan2(-dx, -dz);
  const wantPitch = Math.atan2(point.y - (bot.pos.y + 1.58), Math.hypot(dx, dz));
  const step = BOT.aimTurn * dt;
  let delta = Math.atan2(Math.sin(wantYaw - bot.yaw), Math.cos(wantYaw - bot.yaw));
  bot.yaw += THREE.MathUtils.clamp(delta, -step, step);
  bot.pitch += THREE.MathUtils.clamp(wantPitch - bot.pitch, -step, step);
  return Math.abs(delta);
}

function advanceRoute(bot) {
  if (!bot.route) return false;
  if (bot.routeIndex >= bot.route.length - 1) {
    bot.state = 'hold';
    bot.holdAnchor = bot.pos.clone();
    return false;
  }
  bot.routeIndex += 1;
  return true;
}

function moveAlongRoute(bot, dt, colliders, speed) {
  if (!bot.route || bot.state === 'hold' || bot.state === 'plant') return;
  const waypoint = bot.route[bot.routeIndex];
  if (!waypoint) {
    bot.state = 'hold';
    return;
  }
  const dx = waypoint.x - bot.pos.x;
  const dz = waypoint.z - bot.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1.1) {
    advanceRoute(bot);
    return;
  }
  _wish.set(dx / dist, 0, dz / dist);
  stepBody(bot.body, _wish, speed, dt, colliders, false);
  const wantYaw = Math.atan2(-dx, -dz);
  const step = BOT.aimTurn * dt * 0.7;
  bot.yaw += THREE.MathUtils.clamp(Math.atan2(Math.sin(wantYaw - bot.yaw), Math.cos(wantYaw - bot.yaw)), -step, step);
  bot.pitch *= 0.92;
}

// Stuck bots nudge to the next waypoint instead of grinding into a crate.
function checkStuck(bot, dt) {
  const moved = bot.pos.distanceTo(bot.lastPos);
  if (moved < 0.02 * dt * 60) {
    bot.stuck += dt;
    if (bot.stuck > 0.7) {
      bot.stuck = 0;
      advanceRoute(bot);
      bot.pos.x += (Math.random() - 0.5) * 0.2;
      bot.pos.z += (Math.random() - 0.5) * 0.2;
    }
  } else {
    bot.stuck = 0;
  }
  bot.lastPos.copy(bot.pos);
}

function strafeStep(bot, dt, colliders, speed) {
  if (bot.strafeUntil < 0) {
    bot.strafe = Math.random() < 0.5 ? -1 : 1;
    bot.strafeUntil = 0.5 + Math.random() * 0.8;
  }
  _wish.set(Math.cos(bot.yaw) * bot.strafe, 0, -Math.sin(bot.yaw) * bot.strafe);
  stepBody(bot.body, _wish, speed, dt, colliders, false);
}

export function updateBot(bot, dt, ctx) {
  if (!bot.alive) return;
  const { colliders, combatants, now, phase, fire, plant, defuse, bomb } = ctx;
  bot.strafeUntil -= dt;

  if (phase !== 'live') {
    bot.body.vel.multiplyScalar(0.8);
    return;
  }

  // Perception: the nearest enemy inside the cone with a clear line wins.
  let seen = null;
  let seenDist = Infinity;
  for (const other of enemyOf(bot, combatants)) {
    if (!canSee(bot, other, colliders)) continue;
    const dist = bot.pos.distanceTo(other.pos);
    if (dist < seenDist) {
      seen = other;
      seenDist = dist;
    }
  }

  if (seen) {
    eyeOf(seen, bot.targetEye);
    if (bot.target !== seen) {
      bot.target = seen;
      bot.reaction = BOT.reaction * (0.6 + Math.random() * 0.9);
    }
    bot.state = 'engage';
    bot.lostAt = now + 1.4;
  } else if (bot.target && now > bot.lostAt) {
    bot.target = null;
    bot.state = 'patrol';
  }

  if (bot.reloadUntil > 0 && now >= bot.reloadUntil) {
    const spec = WEAPON_BY_ID[bot.weapon];
    const need = spec.mag - bot.ammo.mag;
    const take = Math.min(need, bot.ammo.reserve);
    bot.ammo.mag += take;
    bot.ammo.reserve -= take;
    bot.reloadUntil = 0;
  }

  if (bot.state === 'engage' && bot.target) {
    // The bomb carrier does not stop for a long-range duel: it keeps walking its lane and
    // only fights what is close enough to block the plant. Otherwise the clock runs out.
    const rushing = bot.carryBomb && !bomb.planted && seenDist > 13;
    if (rushing) {
      moveAlongRoute(bot, dt, colliders, BOT.patrolSpeed);
      return;
    }

    bot.reaction -= dt;
    // Aim at the chest with a small vertical drift, so a patient bot lands headshots over
    // a burst while the first shots still go low.
    const aim = _to.set(
      bot.targetEye.x,
      bot.targetEye.y - 0.42 + Math.random() * 0.5,
      bot.targetEye.z,
    );
    turnToward(bot, aim, dt);
    if (bot.strafeUntil < 0) strafeStep(bot, dt, colliders, BOT.strafeSpeed);
    // A long-range duel should not freeze an attacker in place: keep pushing the lane
    // while trading shots, or the bomb never reaches a site.
    if (seenDist > 17 && bot.route && bot.routeIndex < bot.route.length - 1) {
      moveAlongRoute(bot, dt, colliders, BOT.patrolSpeed * 0.9);
    }
    if (bot.reaction <= 0 && seenDist < BOT.fireRange && bot.reloadUntil === 0) {
      const settled = Math.abs(Math.atan2(Math.sin(Math.atan2(-(aim.x - bot.pos.x), -(aim.z - bot.pos.z)) - bot.yaw), Math.cos(Math.atan2(-(aim.x - bot.pos.x), -(aim.z - bot.pos.z)) - bot.yaw)));
      if (settled < 0.14 && now - bot.lastShot > 0.19) {
        bot.lastShot = now;
        bot.ammo.mag -= 1;
        if (bot.ammo.mag <= 0) {
          bot.ammo.mag = 0;
          bot.reloadUntil = now + WEAPON_BY_ID[bot.weapon].reload;
        }
        fire(bot, aim);
      }
    }
    return;
  }

  // Bomb play: the carrier plants at a site, defenders go to defuse a planted bomb.
  if (bot.carryBomb && bot.team === 'attack' && !bomb.planted) {
    const site = SITES[bomb.targetSite];
    const atSite = Math.hypot(bot.pos.x - site.x, bot.pos.z - site.z) < MATCH.siteRadius;
    if (atSite) {
      if (bot.state !== 'plant') bot.state = 'plant';
      plant(bot, dt);
      return;
    }
  }
  if (bot.team === 'defend' && bomb.planted) {
    const toBomb = Math.hypot(bot.pos.x - bomb.x, bot.pos.z - bomb.z);
    if (toBomb < 1.8) {
      defuse(bot, dt);
      return;
    }
    // Walk straight at the bomb once it is down: the fuse is the new clock.
    _wish.set((bomb.x - bot.pos.x) / toBomb, 0, (bomb.z - bot.pos.z) / toBomb);
    stepBody(bot.body, _wish, BOT.patrolSpeed, dt, colliders, false);
    const wantYaw = Math.atan2(-(bomb.x - bot.pos.x), -(bomb.z - bot.pos.z));
    bot.yaw += THREE.MathUtils.clamp(Math.atan2(Math.sin(wantYaw - bot.yaw), Math.cos(wantYaw - bot.yaw)), -BOT.aimTurn * dt, BOT.aimTurn * dt);
    return;
  }

  // A fresh noise pulls a free bot off its route for a couple of seconds: it walks to
  // the corner the shots came from instead of standing still while the fight moves.
  if (bot.heardAt && now < bot.heardUntil && bot.state !== 'plant') {
    const dx = bot.heardAt.x - bot.pos.x;
    const dz = bot.heardAt.z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 2.4) {
      _wish.set(dx / dist, 0, dz / dist);
      stepBody(bot.body, _wish, BOT.patrolSpeed * 0.8, dt, colliders, false);
      const wantYaw = Math.atan2(-dx, -dz);
      const step = BOT.aimTurn * dt * 0.8;
      bot.yaw += THREE.MathUtils.clamp(Math.atan2(Math.sin(wantYaw - bot.yaw), Math.cos(wantYaw - bot.yaw)), -step, step);
      bot.pitch *= 0.92;
      checkStuck(bot, dt);
      return;
    }
    bot.heardUntil = 0;
  }

  const speed = bot.team === 'attack' ? BOT.patrolSpeed : BOT.patrolSpeed * 0.85;
  if (bot.state === 'hold') {
    // Hold a corner: a small shuffle on the angle, but never further than a step from
    // the anchor. Without the anchor a bot random-walks off its site over a long round.
    if (!bot.holdAnchor) bot.holdAnchor = bot.pos.clone();
    bot.holdUntil -= dt;
    if (bot.holdUntil < 0) {
      bot.holdUntil = 1.6 + Math.random() * 1.8;
      bot.strafe = -bot.strafe;
    }
    const drift = Math.hypot(bot.pos.x - bot.holdAnchor.x, bot.pos.z - bot.holdAnchor.z);
    if (drift > 1.5) {
      _wish.set(bot.holdAnchor.x - bot.pos.x, 0, bot.holdAnchor.z - bot.pos.z).normalize();
      stepBody(bot.body, _wish, 1.6, dt, colliders, false);
    } else {
      _wish.set(Math.cos(bot.yaw) * bot.strafe * 0.22, 0, -Math.sin(bot.yaw) * bot.strafe * 0.22);
      stepBody(bot.body, _wish, 1.0, dt, colliders, false);
    }
    return;
  }

  moveAlongRoute(bot, dt, colliders, speed);
  checkStuck(bot, dt);
}

// Gunfire is information: a bot within earshot turns toward the noise and, for a moment,
// walks to where the shots came from. A defender only chases noise close to its post,
// so a distant firefight never pulls it off the site it is holding.
export function botHears(bot, origin, now) {
  if (!bot.alive || bot.state === 'engage') return;
  const range = bot.team === 'defend' ? 9 : BOT.hearingRange;
  if (bot.pos.distanceTo(origin) > range) return;
  if (!bot.heardAt) bot.heardAt = new THREE.Vector3();
  bot.heardAt.copy(origin);
  bot.heardUntil = now + 2.4;
  const wantYaw = Math.atan2(-(origin.x - bot.pos.x), -(origin.z - bot.pos.z));
  bot.yaw += Math.atan2(Math.sin(wantYaw - bot.yaw), Math.cos(wantYaw - bot.yaw)) * 0.6;
}
