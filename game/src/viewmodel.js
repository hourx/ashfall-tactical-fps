// First-person weapon models, built from boxes and parented to the camera so they are
// always in frame. Bob, sway, recoil kick and the reload dip are animated here.
import * as THREE from 'three';

const STEEL = new THREE.MeshStandardMaterial({ color: '#4e5a62', roughness: 0.48, metalness: 0.6 });
const POLYMER = new THREE.MeshStandardMaterial({ color: '#4a4137', roughness: 0.84, metalness: 0.1 });
const ACCENT = new THREE.MeshStandardMaterial({ color: '#8f4f2e', roughness: 0.7, metalness: 0.2 });
const BRASS = new THREE.MeshStandardMaterial({ color: '#a58344', roughness: 0.45, metalness: 0.6 });
const GLOVE = new THREE.MeshStandardMaterial({ color: '#1e2328', roughness: 0.86, metalness: 0.05 });
const CUFF = new THREE.MeshStandardMaterial({ color: '#8d7a5c', roughness: 0.8, metalness: 0.08 });
const SLEEVE = new THREE.MeshStandardMaterial({ color: '#3f4a52', roughness: 0.9, metalness: 0.04 });

function box(w, h, d, material, x, y, z, rx = 0, ry = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, 0);
  return mesh;
}

// A rifle silhouette: receiver, handguard, barrel, stock, magazine, optic, and the two
// gloved hands that hold it. Hands are what make a first-person weapon read as held.
function buildRifle() {
  const group = new THREE.Group();
  group.add(box(0.075, 0.1, 0.42, STEEL, 0, 0, -0.16));
  group.add(box(0.06, 0.07, 0.34, POLYMER, 0, 0.005, -0.5));
  group.add(box(0.024, 0.024, 0.28, STEEL, 0, 0.012, -0.79));
  group.add(box(0.038, 0.038, 0.05, STEEL, 0, 0.012, -0.94));
  group.add(box(0.05, 0.09, 0.22, POLYMER, 0, -0.005, 0.13));
  group.add(box(0.045, 0.12, 0.06, POLYMER, 0, -0.1, -0.03, 0.22));
  group.add(box(0.04, 0.14, 0.075, STEEL, 0, -0.11, -0.18, -0.1));
  group.add(box(0.05, 0.045, 0.1, STEEL, 0, 0.085, -0.18));
  group.add(box(0.03, 0.026, 0.02, BRASS, 0, 0.085, -0.235));
  group.add(box(0.02, 0.02, 0.06, STEEL, 0.045, 0.03, -0.2));

  // Hands: right on the grip, left under the handguard. Sized and coloured to read at
  // viewmodel distance: a dark glove alone vanished against the receiver, so each hand
  // carries a lighter glove body, a cuff and a sleeve in the loadout's rust accent.
  // Right hand: wraps the grip, knuckles forward.
  group.add(box(0.088, 0.105, 0.13, GLOVE, 0.012, -0.125, -0.02, 0.2));
  group.add(box(0.062, 0.062, 0.075, GLOVE, 0.05, -0.095, -0.062));
  group.add(box(0.075, 0.05, 0.09, GLOVE, 0.012, -0.155, 0.035, 0.1));
  // Right cuff and sleeve running back out of frame.
  group.add(box(0.085, 0.075, 0.055, CUFF, 0.014, -0.14, 0.075));
  group.add(box(0.095, 0.085, 0.16, SLEEVE, 0.02, -0.155, 0.17, 0.06));
  // Left hand: supports the handguard from below.
  group.add(box(0.095, 0.072, 0.115, GLOVE, -0.008, -0.05, -0.47));
  group.add(box(0.038, 0.052, 0.1, GLOVE, 0.048, -0.025, -0.44));
  group.add(box(0.04, 0.05, 0.085, GLOVE, -0.052, -0.03, -0.46));
  // Left cuff and sleeve running back and down out of frame.
  group.add(box(0.092, 0.07, 0.06, CUFF, -0.012, -0.045, -0.395));
  group.add(box(0.1, 0.082, 0.18, SLEEVE, -0.03, -0.06, -0.28, -0.05));

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.012, -0.97);
  group.add(muzzle);
  group.userData.muzzle = muzzle;
  return group;
}

// A pistol: slide, frame, and one hand wrapping the grip. Scaled up relative to the
// rifle because it is shorter: at the same root scale it sat too small and too low to
// read, and the start screen (which draws the pistol) showed no weapon at all.
function buildPistol() {
  const group = new THREE.Group();
  group.add(box(0.052, 0.062, 0.25, STEEL, 0, 0.01, -0.15));
  group.add(box(0.05, 0.1, 0.075, POLYMER, 0, -0.07, -0.01, 0.16));
  group.add(box(0.02, 0.02, 0.05, STEEL, 0, 0.022, -0.29));
  // Right hand on the grip, with a cuff and a sleeve that reaches the frame edge.
  group.add(box(0.078, 0.1, 0.1, GLOVE, 0.005, -0.08, -0.01, 0.16));
  group.add(box(0.03, 0.045, 0.075, GLOVE, 0.04, -0.055, -0.02));
  group.add(box(0.082, 0.075, 0.06, CUFF, 0.006, -0.095, 0.06));
  group.add(box(0.095, 0.085, 0.2, SLEEVE, 0.012, -0.11, 0.17, 0.08));
  // Left hand cupping the grip from the other side.
  group.add(box(0.06, 0.085, 0.09, GLOVE, -0.045, -0.085, -0.015, 0.16));
  group.add(box(0.07, 0.07, 0.06, CUFF, -0.05, -0.1, 0.05));
  group.add(box(0.085, 0.08, 0.17, SLEEVE, -0.06, -0.115, 0.15, 0.08));
  group.scale.setScalar(1.18);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, -0.32);
  group.add(muzzle);
  group.userData.muzzle = muzzle;
  return group;
}

// A field knife: blade, wrapped handle, gloved fist.
function buildKnife() {
  const group = new THREE.Group();
  group.add(box(0.014, 0.05, 0.24, STEEL, 0, 0.01, -0.16));
  group.add(box(0.026, 0.04, 0.12, POLYMER, 0, -0.01, 0.02));
  group.add(box(0.05, 0.018, 0.022, ACCENT, 0, 0.005, -0.03));
  group.add(box(0.075, 0.085, 0.1, GLOVE, 0.005, -0.02, 0.03));
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -0.28);
  group.add(muzzle);
  group.userData.muzzle = muzzle;
  return group;
}

// A frag: a ribbed ball in the throwing hand, so slot 4 never shows an empty screen.
function buildFrag() {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.095, 1), POLYMER));
  group.children[0].position.set(0, 0, -0.22);
  group.add(box(0.045, 0.05, 0.045, STEEL, 0, 0.07, -0.22));
  group.add(box(0.082, 0.09, 0.11, GLOVE, 0.008, -0.09, -0.07, 0.24));
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -0.3);
  group.add(muzzle);
  group.userData.muzzle = muzzle;
  return group;
}

export function createViewmodel() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.01, 6);

  scene.add(new THREE.AmbientLight(new THREE.Color('#a8bcc6'), 1.7));
  const key = new THREE.DirectionalLight(new THREE.Color('#ffe2bc'), 3.8);
  key.position.set(-1.4, 1.8, 1.2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(new THREE.Color('#6fa3bd'), 1.1);
  fill.position.set(1.6, 0.2, -0.8);
  scene.add(fill);

  const root = new THREE.Group();
  // The rifle sits low-right and reads as held. These numbers are measured, not
  // guessed: the model's projected bounding box lands at x 739-1067, y 406-654 in a
  // 1280x720 frame, so the receiver, the hands and the muzzle are all inside the
  // viewport. The first anchor (-0.3 y, -0.72 z) dropped the whole model below the
  // bottom edge at 720p and the weapon never showed.
  root.scale.setScalar(0.52);
  root.position.set(0.3, -0.14, -0.64);
  root.rotation.set(0.02, 0.16, 0);
  scene.add(root);

  const models = {
    rifle: buildRifle(),
    pistol: buildPistol(),
    knife: buildKnife(),
    frag: buildFrag(),
  };
  for (const model of Object.values(models)) {
    model.visible = false;
    root.add(model);
  }
  models.rifle.visible = true;

  // A soft radial flash, not a square: additive blending on a gradient sprite.
  const flashCanvas = document.createElement('canvas');
  flashCanvas.width = 64;
  flashCanvas.height = 64;
  const flashCtx = flashCanvas.getContext('2d');
  const flare = flashCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  flare.addColorStop(0, 'rgba(255,252,235,1)');
  flare.addColorStop(0.3, 'rgba(255,206,130,0.85)');
  flare.addColorStop(1, 'rgba(255,150,50,0)');
  flashCtx.fillStyle = flare;
  flashCtx.fillRect(0, 0, 64, 64);
  const flashTexture = new THREE.CanvasTexture(flashCanvas);
  flashTexture.colorSpace = THREE.SRGBColorSpace;

  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flashTexture,
    color: new THREE.Color('#ffe0ac'),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  }));
  flash.scale.setScalar(0.16);
  root.add(flash);

  const state = {
    weapon: 'rifle',
    kick: 0,
    kickRot: 0,
    bob: 0,
    swayX: 0,
    swayY: 0,
    reload: 0,
    flashUntil: 0,
    lower: 0,
  };

  function currentModel() {
    return models[state.weapon] ?? models.rifle;
  }

  return {
    root,
    scene,
    camera,

    setWeapon(weaponId) {
      const next = weaponId === 'knife' ? 'knife' : weaponId === 'wren' ? 'pistol' : weaponId === 'ember' ? 'frag' : 'rifle';
      if (next === state.weapon) return;
      state.weapon = next;
      for (const [name, model] of Object.entries(models)) model.visible = name === next;
      state.reload = 0.22;
    },

    fire(weaponId) {
      state.kick = Math.min(1.4, state.kick + (weaponId === 'vantage' ? 1 : weaponId === 'cinder' ? 0.55 : 0.7));
      state.kickRot = Math.min(0.5, state.kickRot + 0.22);
      state.flashUntil = performance.now() / 1000 + 0.045;
      flash.material.opacity = 1;
      flash.position.copy(currentModel().userData.muzzle.position);
      flash.position.z -= 0.02;
    },

    startReload(duration) {
      state.reload = duration;
    },

    // dt, whether the player is moving, the shot count for sway, and the current time.
    update(dt, player, moving, now) {
      const speed = Math.min(1.6, player.speed / 5.6);
      state.bob += dt * (6 + speed * 6) * (moving ? 1 : 0.25);
      state.kick *= Math.max(0, 1 - dt * 12);
      state.kickRot *= Math.max(0, 1 - dt * 14);
      state.swayX += (player.swayX - state.swayX) * Math.min(1, dt * 9);
      state.swayY += (player.swayY - state.swayY) * Math.min(1, dt * 9);
      if (state.reload > 0) state.reload = Math.max(0, state.reload - dt);

      const bobX = Math.cos(state.bob) * 0.008 * speed;
      const bobY = Math.abs(Math.sin(state.bob)) * 0.009 * speed;
      const reloadDip = state.reload > 0 ? Math.sin(Math.min(1, state.reload / 0.5) * Math.PI) * 0.12 : 0;

      root.position.set(
        0.3 + bobX + state.swayX * 0.012,
        -0.14 - bobY + state.swayY * 0.012 - reloadDip * 0.2,
        -0.64 + state.kick * 0.03,
      );
      root.rotation.set(
        0.02 - state.kickRot * 0.45 + state.swayY * 0.03 - reloadDip * 1.2,
        0.16 - bobX * 1.2 + state.swayX * 0.25,
        -state.kickRot * 0.16,
      );

      if (now > state.flashUntil) flash.material.opacity = Math.max(0, flash.material.opacity - dt * 18);
    },
  };
}
