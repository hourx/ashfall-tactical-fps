// Frag grenades: a small pool of thrown bodies with gravity, wall bounces and a fuse.
// The blast falls off with distance and is cut by cover, and it reports through a
// callback so match.js stays the only place that applies damage.
import * as THREE from 'three';
import { WEAPON_BY_ID } from './config.js';
import { losBlocked } from './physics.js';

const POOL = 6;
const GRAVITY = 18;
const RADIUS = 0.11;
const DRAG = 0.997;

const _from = new THREE.Vector3();
const _to = new THREE.Vector3();

function fragMesh() {
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(RADIUS, 0),
    new THREE.MeshStandardMaterial({
      color: '#333a34',
      roughness: 0.6,
      metalness: 0.5,
      emissive: '#511d05',
      emissiveIntensity: 0.7,
    }),
  );
  mesh.visible = false;
  return mesh;
}

export function createGrenades(scene, { colliders, combatants, damage, effects, audio }) {
  const weapon = WEAPON_BY_ID.ember;
  const items = [];
  for (let i = 0; i < POOL; i += 1) {
    const mesh = fragMesh();
    scene.add(mesh);
    items.push({
      mesh,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      live: false,
      fuse: 0,
      owner: null,
    });
  }

  // Sphere against each wall box: push out on the axis of least penetration and reflect
  // that one velocity component, so a frag rattles down a doorway instead of sticking.
  function bounce(item) {
    const p = item.pos;
    const v = item.vel;
    for (const box of colliders) {
      if (p.x + RADIUS <= box.minX || p.x - RADIUS >= box.maxX) continue;
      if (p.z + RADIUS <= box.minZ || p.z - RADIUS >= box.maxZ) continue;
      if (p.y + RADIUS <= box.minY || p.y - RADIUS >= box.maxY) continue;
      const outX = Math.min(p.x + RADIUS - box.minX, box.maxX - (p.x - RADIUS));
      const outZ = Math.min(p.z + RADIUS - box.minZ, box.maxZ - (p.z - RADIUS));
      const outY = Math.min(p.y + RADIUS - box.minY, box.maxY - (p.y - RADIUS));
      if (outY <= outX && outY <= outZ) {
        p.y = p.y > (box.minY + box.maxY) / 2 ? box.maxY + RADIUS : box.minY - RADIUS;
        v.y = -v.y * 0.34;
        v.x *= 0.7;
        v.z *= 0.7;
      } else if (outX <= outZ) {
        p.x = p.x > (box.minX + box.maxX) / 2 ? box.maxX + RADIUS : box.minX - RADIUS;
        v.x = -v.x * 0.45;
        v.z *= 0.82;
      } else {
        p.z = p.z > (box.minZ + box.maxZ) / 2 ? box.maxZ + RADIUS : box.minZ - RADIUS;
        v.z = -v.z * 0.45;
        v.x *= 0.82;
      }
    }
    if (p.y < RADIUS) {
      p.y = RADIUS;
      if (v.y < 0) v.y = -v.y * 0.34;
      if (Math.abs(v.y) < 0.55) v.y = 0;
      v.x *= 0.72;
      v.z *= 0.72;
    }
  }

  function detonate(item) {
    item.live = false;
    item.mesh.visible = false;
    effects.explosion(item.pos);
    audio.blast();
    _from.set(item.pos.x, item.pos.y + 0.2, item.pos.z);
    for (const target of combatants()) {
      if (!target.alive || target === item.owner) continue;
      const dist = Math.hypot(
        target.pos.x - item.pos.x,
        target.pos.y + 1.0 - item.pos.y,
        target.pos.z - item.pos.z,
      );
      if (dist > weapon.blastRadius) continue;
      _to.set(target.pos.x, target.pos.y + 1.0, target.pos.z);
      // A crate between the charge and the body eats most of the shrapnel: cover is real.
      const covered = losBlocked(_from, _to, colliders);
      const amount = weapon.damage * (1 - dist / weapon.blastRadius) * (covered ? 0.35 : 1);
      if (amount >= 1) damage(target, amount, 'body', item.owner, 'ember');
    }
    item.owner = null;
  }

  return {
    // Throws along the view direction with a little loft, from the eye. Returns false when
    // every pool slot is in the air, which the caller reports as a dry throw.
    throwFrom(owner, origin, direction) {
      const item = items.find((entry) => !entry.live);
      if (!item) return false;
      item.pos.copy(origin);
      item.vel.copy(direction).multiplyScalar(weapon.throwSpeed);
      item.vel.y += weapon.throwSpeed * 0.14;
      item.fuse = weapon.fuse;
      item.owner = owner;
      item.live = true;
      item.mesh.position.copy(item.pos);
      item.mesh.visible = true;
      return true;
    },

    update(dt) {
      for (const item of items) {
        if (!item.live) continue;
        item.fuse -= dt;
        item.vel.y -= GRAVITY * dt;
        item.vel.multiplyScalar(DRAG);
        item.pos.addScaledVector(item.vel, dt);
        bounce(item);
        item.mesh.position.copy(item.pos);
        item.mesh.rotation.x += dt * 7;
        item.mesh.rotation.z += dt * 5;
        if (item.fuse <= 0) detonate(item);
      }
    },

    reset() {
      for (const item of items) {
        item.live = false;
        item.mesh.visible = false;
        item.owner = null;
      }
    },
  };
}
