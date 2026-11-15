// Shooting model shared by the player and the bots: spread that grows with movement,
// a recoil pattern that pushes the view up, and hits resolved against head and body.
import * as THREE from 'three';
import { raycastTargets } from './physics.js';

const _dir = new THREE.Vector3();

// A cone sample: uniform inside a disc, so most shots land near the centre.
export function spreadDirection(forward, right, up, spreadDeg, rng, out) {
  const radius = Math.tan((spreadDeg * Math.PI) / 180) * Math.sqrt(rng());
  const theta = rng() * Math.PI * 2;
  out.copy(forward)
    .addScaledVector(right, Math.cos(theta) * radius)
    .addScaledVector(up, Math.sin(theta) * radius);
  return out.normalize();
}

// Effective spread: standing still and crouched is the tightest the weapon gets, and
// firing while running opens it wide enough that stopping to aim always pays.
export function effectiveSpread(weapon, moving, crouching, airborne) {
  if (weapon.kind !== 'hitscan') return 0;
  const base = crouching ? weapon.spreadCrouch : weapon.spreadStand;
  const movePenalty = moving ? weapon.spreadMove : 0;
  const airPenalty = airborne ? weapon.spreadMove * 0.8 : 0;
  return base + movePenalty + airPenalty;
}

export function damageFor(weapon, part, distance) {
  const multiplier = part === 'head' ? weapon.headMul : 1;
  const falloff = 1 - Math.min(1, distance / Math.max(weapon.range, 1)) * 0.22;
  return weapon.damage * multiplier * falloff;
}

// Fires one hitscan round and reports what it hit. Returns the tracer's end point.
export function fireHitscan({ origin, dir, weapon, colliders, bots, rng, onHit, out, tracer }) {
  spreadDirection(dir, tracer.right, tracer.up, weapon.spread, rng, _dir);
  const hit = raycastTargets(origin, _dir, weapon.range, bots, colliders);
  const distance = hit ? hit.distance : weapon.range;
  out.copy(origin).addScaledVector(_dir, distance);
  if (hit) onHit(hit.bot, damageFor(weapon, hit.part, hit.distance), hit.part);
  return { hit, end: out, dir: _dir };
}

// Recoil: mostly vertical, drifting left and right as the magazine empties, so a long
// spray walks off the target and short bursts are the answer.
export function recoilStep(weapon, shotIndex, rng) {
  const climb = weapon.recoil * (1 - Math.min(shotIndex, 8) * 0.05);
  const drift = (rng() - 0.5) * weapon.recoil * 0.55;
  return { x: climb, y: drift };
}

// The view kick applied to the camera, in radians, kept apart from the aim so the
// player can fight it back down.
export function applyShotKick(player, weapon, shotIndex, rng) {
  const kick = recoilStep(weapon, shotIndex, rng);
  player.recoil.x += (kick.x * Math.PI) / 180;
  player.recoil.y += (kick.y * Math.PI) / 180;
}

export function canFire(ammo, weapon, now, lastShot) {
  if (weapon.kind === 'melee') return now - lastShot >= 60 / weapon.rpm;
  if (!ammo || ammo.mag <= 0) return false;
  return now - lastShot >= 60 / weapon.rpm;
}

export function startReload(ammo, weapon) {
  if (!ammo || weapon.kind === 'melee' || weapon.kind === 'grenade') return null;
  if (ammo.mag >= weapon.mag || ammo.reserve <= 0) return null;
  return { until: 0, duration: weapon.reload };
}

export function finishReload(ammo, weapon) {
  const need = weapon.mag - ammo.mag;
  const take = Math.min(need, ammo.reserve);
  ammo.mag += take;
  ammo.reserve -= take;
}
