// Bot bodies: a helmet, a vest, a rifle, and a walk cycle. Team colour is the only
// difference between attackers and defenders, so a glance across the map is enough.
import * as THREE from 'three';

const TEAM = {
  attack: { vest: '#8c4a2c', helmet: '#6d3a22', cloth: '#3a3630' },
  defend: { vest: '#2f6f76', helmet: '#285a60', cloth: '#33393b' },
};

const materialCache = new Map();
function mat(color, roughness = 0.85, metalness = 0.1) {
  const key = `${color}:${roughness}:${metalness}`;
  if (!materialCache.has(key)) {
    materialCache.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  }
  return materialCache.get(key);
}

function part(w, h, d, color, x, y, z, roughness = 0.85) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, roughness));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createBotView(scene, bot) {
  const palette = TEAM[bot.team] ?? TEAM.attack;
  const group = new THREE.Group();
  group.position.set(bot.pos.x, 0, bot.pos.z);
  group.rotation.y = bot.yaw;

  const hips = new THREE.Group();
  group.add(hips);

  // Legs pivot at the hip so the walk is a swing, not a slide.
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(-0.11, 0.82, 0);
  legR.position.set(0.11, 0.82, 0);
  legL.add(part(0.16, 0.78, 0.18, palette.cloth, 0, -0.39, 0));
  legR.add(part(0.16, 0.78, 0.18, palette.cloth, 0, -0.39, 0));
  hips.add(legL, legR);

  const torso = part(0.48, 0.56, 0.26, palette.cloth, 0, 1.12, 0);
  const vest = part(0.5, 0.42, 0.3, palette.vest, 0, 1.16, 0.01, 0.7);
  group.add(torso, vest);
  group.add(part(0.16, 0.1, 0.16, palette.cloth, 0, 1.46, 0)); // neck

  const head = new THREE.Group();
  head.position.set(0, 1.56, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), mat('#b99a7d', 0.9));
  skull.castShadow = true;
  head.add(skull);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(palette.helmet, 0.6, 0.25));
  helmet.position.y = 0.02;
  helmet.castShadow = true;
  head.add(helmet);
  group.add(head);

  // Arms hold the rifle in front of the chest.
  const armL = part(0.1, 0.42, 0.11, palette.cloth, -0.26, 1.18, 0.1);
  armL.rotation.x = -0.9;
  const armR = part(0.1, 0.4, 0.11, palette.cloth, 0.24, 1.16, 0.06);
  armR.rotation.x = -0.7;
  group.add(armL, armR);

  const gun = new THREE.Group();
  gun.position.set(0.06, 1.16, 0.28);
  gun.add(part(0.06, 0.08, 0.5, '#22262a', 0, 0, 0, 0.5));
  gun.add(part(0.05, 0.1, 0.16, '#33322e', 0, -0.04, -0.06));
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, 0.32);
  gun.add(muzzle);
  group.add(gun);

  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    color: '#ffd08a',
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  flash.scale.setScalar(0.42);
  flash.position.copy(muzzle.position);
  gun.add(flash);

  scene.add(group);

  return {
    group,
    muzzle,
    flash,
    hips,
    head,
    legL,
    legR,
    gun,
    walk: Math.random() * 6,
    deadT: 0,
    flashUntil: 0,
    lastShot: -10,
    visibleToPlayer: false,
  };
}

export function updateBotView(view, bot, dt, now, playerTeam, playerEye, playerYaw, colliders, losCheck) {
  const group = view.group;

  if (!bot.alive) {
    view.deadT = Math.min(1, view.deadT + dt * 4);
    const ease = view.deadT * view.deadT;
    group.position.set(bot.pos.x, 0.16 * (1 - ease) + 0.12, bot.pos.z);
    group.rotation.x = -Math.PI * 0.5 * ease;
    group.rotation.z = 0.12 * ease;
    view.flash.material.opacity = 0;
    return;
  }

  view.deadT = 0;
  group.rotation.x = 0;
  group.rotation.z = 0;
  group.position.set(bot.pos.x, bot.pos.y, bot.pos.z);
  group.rotation.y = bot.yaw;

  const speed = Math.hypot(bot.body.vel.x, bot.body.vel.z);
  view.walk += dt * (3 + speed * 2.2);
  const swing = Math.sin(view.walk) * Math.min(1, speed / 3) * 0.7;
  view.legL.rotation.x = swing;
  view.legR.rotation.x = -swing;
  view.hips.position.y = Math.abs(Math.cos(view.walk)) * 0.03 * Math.min(1, speed / 3);
  view.head.rotation.x = -bot.pitch * 0.7;
  view.gun.rotation.x = -bot.pitch * 0.6;

  // Enemy silhouettes only show on the radar when the player can actually see them.
  if (playerEye && losCheck) {
    const enemy = bot.team !== playerTeam;
    if (!enemy) view.visibleToPlayer = true;
    else {
      const dist = Math.hypot(bot.pos.x - playerEye.x, bot.pos.z - playerEye.z);
      if (dist < 46) {
        const wantYaw = Math.atan2(-(bot.pos.x - playerEye.x), -(bot.pos.z - playerEye.z));
        const delta = Math.abs(Math.atan2(Math.sin(wantYaw - playerYaw), Math.cos(wantYaw - playerYaw)));
        view.visibleToPlayer = delta < 1.1 && !losCheck(playerEye, new THREE.Vector3(bot.pos.x, bot.pos.y + 1.2, bot.pos.z), colliders);
      } else {
        view.visibleToPlayer = false;
      }
    }
  }
}

export function botMuzzleFlash(view, now) {
  view.flashUntil = now + 0.05;
}

export function tickBotViewFlash(view, dt, now) {
  if (now < view.flashUntil) view.flash.material.opacity = 0.95;
  else view.flash.material.opacity = Math.max(0, view.flash.material.opacity - dt * 20);
}
