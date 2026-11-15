// Ashfall: a water-treatment plant at dusk. Three lanes run between the attacker
// spawn in the south and two bomb sites in the north, with mid connectors that let
// a team rotate. Everything is built from boxes, so collision and art never drift.
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { collider } from './physics.js';

const WALL = 1;

// One declarative list drives both the meshes and the colliders.
export const BLOCKS = [
  // Outer shell.
  { x: 0, z: -19, w: 40, d: WALL, h: 6, kind: 'wall' },
  { x: 0, z: 19, w: 40, d: WALL, h: 6, kind: 'wall' },
  { x: -20, z: 0, w: WALL, d: 40, h: 6, kind: 'wall' },
  { x: 20, z: 0, w: WALL, d: 40, h: 6, kind: 'wall' },

  // Left separator: a pumping house split into three blocks, with doorways between.
  { x: -8.5, z: -9.5, w: 7, d: 5, h: 3.4, kind: 'concrete' },
  { x: -8.5, z: 0, w: 7, d: 8, h: 3.4, kind: 'concrete' },
  { x: -8.5, z: 9.5, w: 7, d: 5, h: 3.4, kind: 'concrete' },

  // Right separator, the mirror of it.
  { x: 8.5, z: -9.5, w: 7, d: 5, h: 3.4, kind: 'concrete' },
  { x: 8.5, z: 0, w: 7, d: 8, h: 3.4, kind: 'concrete' },
  { x: 8.5, z: 9.5, w: 7, d: 5, h: 3.4, kind: 'concrete' },

  // Mid cover: two low crates that make the centre a decision, not a straight line.
  { x: -1.4, z: 2.2, w: 1.7, d: 1.7, h: 1.15, kind: 'crate' },
  { x: 1.6, z: -2.4, w: 1.7, d: 1.7, h: 1.15, kind: 'crate' },
  { x: 0.2, z: -8.4, w: 2.4, d: 1.2, h: 1.5, kind: 'crate' },

  // Site A: pump hall cover around the plant zone.
  { x: -16.4, z: -6.2, w: 1.6, d: 1.6, h: 1.2, kind: 'crate' },
  { x: -13.1, z: -12.6, w: 1.6, d: 1.6, h: 1.2, kind: 'crate' },
  { x: -17.6, z: -12.9, w: 2.6, d: 1.2, h: 1.6, kind: 'crate' },

  // Site B: the tank yard, with its own cover.
  { x: 16.4, z: -6.2, w: 1.6, d: 1.6, h: 1.2, kind: 'crate' },
  { x: 13.1, z: -12.6, w: 1.6, d: 1.6, h: 1.2, kind: 'crate' },
  { x: 17.6, z: -12.9, w: 2.6, d: 1.2, h: 1.6, kind: 'crate' },

  // Lane shoulders: long low walls that give the lanes a spine and block long angles.
  { x: -12.4, z: 5.4, w: 1.1, d: 3.6, h: 2.2, kind: 'rust' },
  { x: 12.4, z: 5.4, w: 1.1, d: 3.6, h: 2.2, kind: 'rust' },
  { x: -12.4, z: -3.4, w: 1.1, d: 3.0, h: 2.2, kind: 'rust' },
  { x: 12.4, z: -3.4, w: 1.1, d: 3.0, h: 2.2, kind: 'rust' },

  // Spawn furniture, so neither spawn is a bare box.
  { x: -5.6, z: 15.4, w: 2.2, d: 1.1, h: 1.3, kind: 'crate' },
  { x: 5.6, z: 15.4, w: 2.2, d: 1.1, h: 1.3, kind: 'crate' },
  { x: -3.4, z: -16.2, w: 1.8, d: 1.1, h: 1.2, kind: 'crate' },
  { x: 3.4, z: -16.2, w: 1.8, d: 1.1, h: 1.2, kind: 'crate' },
];

// Tanks are round, so they are drawn as cylinders with a square collider around them.
const TANKS = [
  { x: 17.2, z: 12.4, r: 1.5, h: 4.6 },
  { x: -17.2, z: 12.4, r: 1.5, h: 4.6 },
];

const MATERIALS = {
  wall: { color: '#2e3a40', roughness: 0.92, metalness: 0.05 },
  concrete: { color: '#4b5352', roughness: 0.95, metalness: 0.03 },
  crate: { color: '#8a5334', roughness: 0.72, metalness: 0.18 },
  rust: { color: '#6a3d28', roughness: 0.8, metalness: 0.24 },
  tank: { color: '#3a7f86', roughness: 0.55, metalness: 0.45 },
  pipe: { color: '#5b6a70', roughness: 0.42, metalness: 0.7 },
  lamp: { color: PALETTE.amber, roughness: 0.4, metalness: 0 },
};

function materialFor(kind) {
  const spec = MATERIALS[kind] ?? MATERIALS.concrete;
  return new THREE.MeshStandardMaterial(spec);
}

// A procedural concrete tile keeps the floor from reading as a flat colour, with no
// texture file and no network request.
function floorTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#20272a';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i += 1) {
    const shade = 28 + Math.floor(Math.random() * 18);
    ctx.fillStyle = `rgb(${shade},${shade + 5},${shade + 6})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  // Expansion joints every quarter tile so the floor reads as poured concrete.
  ctx.strokeStyle = 'rgba(150,160,152,0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  ctx.strokeStyle = 'rgba(120,132,126,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size);
  ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(16, 16);
  texture.anisotropy = 4;
  return texture;
}

// A dusk sky as an equirectangular gradient: no image file, but the horizon still
// reads correctly when the camera pitches up or down.
function skyTexture() {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#05080a');
  gradient.addColorStop(0.34, '#111a20');
  gradient.addColorStop(0.46, '#2a343c');
  gradient.addColorStop(0.52, '#7a5738');
  gradient.addColorStop(0.57, '#3a3129');
  gradient.addColorStop(0.75, '#101517');
  gradient.addColorStop(1, '#080b0d');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildWorld(scene) {
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  scene.background = skyTexture();
  scene.fog = new THREE.Fog(new THREE.Color('#1d262a'), 34, 96);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.98, metalness: 0.02 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  for (const block of BLOCKS) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(block.w, block.h, block.d), materialFor(block.kind));
    mesh.position.set(block.x, block.h / 2, block.z);
    mesh.castShadow = block.kind !== 'wall';
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(collider(
      block.x - block.w / 2, 0, block.z - block.d / 2,
      block.x + block.w / 2, block.h, block.z + block.d / 2,
    ));
  }

  for (const tank of TANKS) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(tank.r, tank.r, tank.h, 20),
      materialFor('tank'),
    );
    mesh.position.set(tank.x, tank.h / 2, tank.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(collider(
      tank.x - tank.r, 0, tank.z - tank.r,
      tank.x + tank.r, tank.h, tank.z + tank.r,
    ));
  }

  // Lighting: a low amber sun, a cool fill from the sky, and warm lamps that make the
  // lanes read at a glance. Values are in three's physical units, so intensity is
  // larger than the pre-2023 defaults.
  scene.add(new THREE.HemisphereLight(new THREE.Color('#75909f'), new THREE.Color('#1a2225'), 0.9));
  scene.add(new THREE.AmbientLight(new THREE.Color('#39454d'), 0.3));
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffc27a'), 2.3);
  sun.position.set(-16, 18, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  scene.add(sun);

  for (const lamp of [
    { x: -15.5, z: -10.5 }, { x: 15.5, z: -10.5 }, { x: 0, z: 0 },
    { x: 0, z: 12.0 }, { x: -12.4, z: 3.0 }, { x: 12.4, z: 3.0 },
    { x: 0, z: 16.6 }, { x: 0, z: -16.6 },
  ]) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), materialFor('lamp'));
    bulb.position.set(lamp.x, 3.35, lamp.z);
    group.add(bulb);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.22, 10, 1, true), materialFor('pipe'));
    shade.position.set(lamp.x, 3.46, lamp.z);
    group.add(shade);
    const point = new THREE.PointLight(new THREE.Color('#ffb266'), 34, 20, 2);
    point.position.set(lamp.x, 3.2, lamp.z);
    scene.add(point);

    // A mast under each lamp so it reads as installed, not floating.
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.3, 6), materialFor('pipe'));
    mast.position.set(lamp.x, 1.65, lamp.z);
    group.add(mast);
  }

  // A cool fill from the far side keeps the shadowed walls from going pure black.
  const fill = new THREE.DirectionalLight(new THREE.Color('#6f93ab'), 0.75);
  fill.position.set(14, 9, -16);
  scene.add(fill);

  // Pipe runs along the walls: silhouette, not collision. They sit above head height
  // so no round can ever be blocked by decoration.
  const pipes = [
    { x: -19.2, z: 0, w: 0.32, d: 36, y: 2.9 },
    { x: 19.2, z: 0, w: 0.32, d: 36, y: 2.9 },
    { x: 0, z: -18.2, w: 38, d: 0.32, y: 2.55 },
    { x: 0, z: 18.2, w: 38, d: 0.32, y: 2.55 },
    { x: -8.5, z: 6.4, w: 8.4, d: 0.3, y: 2.5 },
    { x: 8.5, z: 6.4, w: 8.4, d: 0.3, y: 2.5 },
  ];
  for (const pipe of pipes) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, pipe.w > pipe.d ? pipe.w : pipe.d, 8), materialFor('pipe'));
    mesh.rotation.z = Math.PI / 2;
    if (pipe.d > pipe.w) mesh.rotation.set(Math.PI / 2, 0, 0);
    mesh.position.set(pipe.x, pipe.y, pipe.z);
    group.add(mesh);
  }

  // Lane markings on the floor: attackers push north, and the arrows say so.
  const stripe = new THREE.MeshBasicMaterial({ color: new THREE.Color('#b98c4e'), transparent: true, opacity: 0.22, depthWrite: false });
  for (const lane of [-16.2, 0, 16.2]) {
    for (let i = 0; i < 5; i += 1) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 1.5), stripe);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(lane, 0.015, 12.5 - i * 3.6);
      group.add(dash);
    }
  }

  // Site rings read the objective at a glance from any angle.
  for (const [name, site] of Object.entries(SITES)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.18, site.r, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(name === 'A' ? PALETTE.teal : PALETTE.rust), side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.02, site.z);
    group.add(ring);
  }

  return { colliders };
}

// Two plant zones, both on the defender half so attackers must cross a lane to reach one.
export const SITES = {
  A: { x: -15.5, z: -10.5, r: 2.9 },
  B: { x: 15.5, z: -10.5, r: 2.9 },
};

export const SPAWNS = {
  attack: [
    { x: -2.2, z: 16.2, yaw: 0 },
    { x: -1.0, z: 17.0, yaw: 0 },
    { x: 1.2, z: 16.4, yaw: 0 },
    { x: 2.4, z: 17.2, yaw: 0 },
  ],
  defend: [
    { x: -15.0, z: -13.4, yaw: Math.PI },
    { x: -12.2, z: -14.6, yaw: Math.PI },
    { x: 12.2, z: -14.6, yaw: Math.PI },
    { x: 15.0, z: -13.4, yaw: Math.PI },
  ],
};

// Named routes keep bots on lanes instead of letting them drift through walls.
export const ROUTES = {
  aLong: [
    { x: -16.6, z: 12.4 },
    { x: -16.6, z: 5.0 },
    { x: -16.2, z: -1.0 },
    { x: -16.0, z: -6.4 },
    { x: -15.5, z: -10.5 },
  ],
  aShort: [
    { x: 0.0, z: 12.0 },
    { x: 0.0, z: 5.4 },
    { x: -3.6, z: -0.6 },
    { x: -6.2, z: -5.6 },
    { x: -11.0, z: -8.2 },
    { x: -15.5, z: -10.5 },
  ],
  mid: [
    { x: 0.0, z: 13.0 },
    { x: 0.0, z: 7.0 },
    { x: 0.0, z: 1.0 },
    { x: 0.0, z: -5.6 },
    { x: 0.0, z: -12.0 },
  ],
  bLong: [
    { x: 16.6, z: 12.4 },
    { x: 16.6, z: 5.0 },
    { x: 16.2, z: -1.0 },
    { x: 16.0, z: -6.4 },
    { x: 15.5, z: -10.5 },
  ],
  bShort: [
    { x: 0.0, z: 12.0 },
    { x: 0.0, z: 5.4 },
    { x: 3.6, z: -0.6 },
    { x: 6.2, z: -5.6 },
    { x: 11.0, z: -8.2 },
    { x: 15.5, z: -10.5 },
  ],
  // Defensive holds: a defender walks to the site, then shuffles on the angle.
  holdA: [
    { x: -15.0, z: -9.0 },
    { x: -14.2, z: -11.6 },
  ],
  holdB: [
    { x: 15.0, z: -9.0 },
    { x: 14.2, z: -11.6 },
  ],
};
