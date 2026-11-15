// The player's body and inventory. Nothing here knows about rounds or bots: it turns
// intents into motion and keeps the camera's eye where the body says it is.
import * as THREE from 'three';
import { MOVE } from './config.js';
import { stepBody } from './physics.js';

const _wish = new THREE.Vector3();

export function createPlayer(spawn) {
  const body = {
    pos: new THREE.Vector3(spawn.x, 0, spawn.z),
    vel: new THREE.Vector3(),
    radius: MOVE.radius,
    height: MOVE.standHeight,
    onGround: true,
    crouching: false,
  };
  return {
    kind: 'player',
    name: 'You',
    team: 'attack',
    body,
    // Every combatant exposes pos at the top level so rays and kills read the same.
    pos: body.pos,
    yaw: spawn.yaw,
    pitch: 0,
    health: 100,
    armour: 0,
    alive: true,
    money: 800,
    primary: null,
    secondary: 'wren',
    grenades: 0,
    smokes: 0,
    current: 'wren',
    ammo: { wren: { mag: 15, reserve: 60 }, cinder: { mag: 0, reserve: 0 }, vantage: { mag: 0, reserve: 0 }, ember: { mag: 1, reserve: 0 } },
    recoil: { x: 0, y: 0 },
    bob: 0,
    swayX: 0,
    swayY: 0,
    crouching: false,
    lastShot: -10,
    lastThrow: -10,
    reloadUntil: 0,
    shotIndex: 0,
    speed: 0,
  };
}

export function resetPlayer(player, spawn) {
  player.body.pos.set(spawn.x, 0, spawn.z);
  player.body.vel.set(0, 0, 0);
  player.body.onGround = true;
  player.yaw = spawn.yaw;
  player.pitch = 0;
  player.health = 100;
  player.alive = true;
  player.recoil.x = 0;
  player.recoil.y = 0;
}

// Mouse look, with pitch clamped so the view never rolls over.
export function look(player, dx, dy) {
  player.yaw -= dx * MOVE.mouseSensitivity;
  player.pitch -= dy * MOVE.mouseSensitivity;
  player.pitch = THREE.MathUtils.clamp(player.pitch, -MOVE.maxPitch, MOVE.maxPitch);
}

// One fixed step of movement. Crouching lowers the body and slows it, so a crouched
// player is a smaller target and a steadier shot.
export function movePlayer(player, input, dt, colliders, jump) {
  const body = player.body;
  const crouching = input.crouch();
  body.crouching = crouching;
  body.height = crouching ? MOVE.crouchHeight : MOVE.standHeight;

  const speed = crouching ? MOVE.crouchSpeed : input.walk() ? MOVE.walkSpeed : MOVE.runSpeed;
  const forward = input.forward();
  const strafe = input.strafe();
  _wish.set(strafe, 0, -forward);
  if (_wish.lengthSq() > 1) _wish.normalize();
  _wish.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw);
  stepBody(body, _wish, speed, dt, colliders, jump);
  player.speed = Math.hypot(body.vel.x, body.vel.z);
  return body;
}

// The eye sits at the body's top, plus the weapon's recoil offset and a walk bob.
export function eyePosition(player, out) {
  const base = player.crouching ? MOVE.eyeCrouch : MOVE.eyeStand;
  out.set(player.body.pos.x, player.body.pos.y + base, player.body.pos.z);
  return out;
}

// Adds recoil to the view without touching the aim offset the weapon uses.
export function applyRecoilToView(player, dt) {
  player.pitch += player.recoil.x * dt * 6;
  player.yaw += player.recoil.y * dt * 6;
  player.recoil.x *= Math.max(0, 1 - dt * 9);
  player.recoil.y *= Math.max(0, 1 - dt * 9);
  player.pitch = THREE.MathUtils.clamp(player.pitch, -MOVE.maxPitch, MOVE.maxPitch);
}

// Equips the best thing the player owns for a slot.
export function equipSlot(player, slot) {
  if (slot === 1 && player.primary) player.current = player.primary;
  if (slot === 2) player.current = player.secondary;
  if (slot === 3) player.current = 'knife';
  if (slot === 4 && player.grenades > 0) player.current = 'ember';
  return player.current;
}
