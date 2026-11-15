// Pooled visual effects: tracers, impact sparks, muzzle flashes and the bomb blast.
// Nothing here allocates during play, so the fixed step stays flat at 60 Hz.
import * as THREE from 'three';

const TRACER_COUNT = 28;
const SPARK_COUNT = 48;

// A radial sprite drawn into a canvas once, shared by every spark and flash.
function glowTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,240,200,1)');
  gradient.addColorStop(0.35, 'rgba(255,190,110,0.75)');
  gradient.addColorStop(1, 'rgba(255,150,60,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createEffects(scene) {
  const group = new THREE.Group();
  group.name = 'effects';
  scene.add(group);

  const glow = glowTexture();

  // Tracers are stretched boxes: cheap, and they read as a line of light from any angle.
  const tracerGeo = new THREE.BoxGeometry(0.006, 0.006, 1);
  const tracerMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffd28a'),
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const mesh = new THREE.Mesh(tracerGeo, tracerMat.clone());
    mesh.visible = false;
    mesh.frustumCulled = false;
    group.add(mesh);
    tracers.push({ mesh, until: 0 });
  }
  let tracerCursor = 0;

  // Sparks: additive sprites that drift and fade. Pooled, never removed.
  const sparks = [];
  for (let i = 0; i < SPARK_COUNT; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow,
      color: new THREE.Color('#ffcf8f'),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    sprite.visible = false;
    group.add(sprite);
    sparks.push({ sprite, until: 0, life: 1, vel: new THREE.Vector3(), scale: 0.2 });
  }
  let sparkCursor = 0;

  const bombMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.18, 0.24),
    new THREE.MeshStandardMaterial({ color: '#2a2a26', roughness: 0.8, metalness: 0.3, emissive: '#431b06', emissiveIntensity: 0.6 }),
  );
  bombMesh.visible = false;
  group.add(bombMesh);

  const bombLight = new THREE.PointLight(new THREE.Color('#ff5a2a'), 0, 6, 2);
  group.add(bombLight);

  const blastLight = new THREE.PointLight(new THREE.Color('#ffb066'), 0, 20, 2);
  group.add(blastLight);

  const now = () => performance.now() / 1000;

  function spark(position, velocity, color, scale, seconds) {
    const entry = sparks[sparkCursor];
    sparkCursor = (sparkCursor + 1) % sparks.length;
    entry.sprite.position.copy(position);
    entry.sprite.material.color.set(color);
    entry.sprite.material.opacity = 1;
    entry.sprite.scale.setScalar(scale);
    entry.sprite.visible = true;
    entry.vel.copy(velocity);
    entry.life = seconds;
    entry.until = now() + seconds;
    entry.scale = scale;
    return entry;
  }

  return {
    // A line of light from the muzzle to whatever the round hit.
    tracer(from, to) {
      const entry = tracers[tracerCursor];
      tracerCursor = (tracerCursor + 1) % tracers.length;
      const length = from.distanceTo(to);
      if (length < 0.05) return;
      entry.mesh.position.copy(from).add(to).multiplyScalar(0.5);
      entry.mesh.lookAt(to);
      entry.mesh.scale.set(1, 1, length);
      entry.mesh.visible = true;
      entry.mesh.material.opacity = 0.34;
      entry.until = now() + 0.055;
    },

    // Bullet hitting world geometry: a small cone of sparks plus a puff.
    impact(point, normal, colour = '#ffc27a', count = 3) {
      for (let i = 0; i < count; i += 1) {
        const velocity = new THREE.Vector3(
          normal.x + (Math.random() - 0.5) * 1.5,
          normal.y + Math.random() * 1.2,
          normal.z + (Math.random() - 0.5) * 1.5,
        ).multiplyScalar(1.6 + Math.random() * 1.6);
        spark(point, velocity, colour, 0.1 + Math.random() * 0.1, 0.1 + Math.random() * 0.14);
      }
    },

    // Blood reads as a short dark spray rather than a fountain.
    blood(point) {
      for (let i = 0; i < 4; i += 1) {
        const velocity = new THREE.Vector3(
          (Math.random() - 0.5) * 2.4,
          Math.random() * 1.4,
          (Math.random() - 0.5) * 2.4,
        );
        spark(point, velocity, '#7d2b22', 0.12 + Math.random() * 0.08, 0.24);
      }
    },

    // Muzzle flash: a brief bright sprite plus a point light, at the gun.
    flash(point, forward) {
      spark(point.clone().addScaledVector(forward, 0.25), new THREE.Vector3(0, 0.2, 0), '#ffe6ae', 0.55, 0.06);
      blastLight.position.copy(point);
      blastLight.intensity = 2.4;
    },

    explosion(point) {
      for (let i = 0; i < 26; i += 1) {
        const velocity = new THREE.Vector3(
          (Math.random() - 0.5) * 9,
          Math.random() * 7,
          (Math.random() - 0.5) * 9,
        );
        spark(point, velocity, i % 3 === 0 ? '#ffdca0' : '#ff7a3c', 0.5 + Math.random() * 0.7, 0.4 + Math.random() * 0.5);
      }
      blastLight.position.copy(point).y += 1;
      blastLight.intensity = 26;
    },

    showBomb(position, planted) {
      if (!position) {
        bombMesh.visible = false;
        bombLight.intensity = 0;
        return;
      }
      bombMesh.position.copy(position);
      bombMesh.position.y = 0.09;
      bombMesh.visible = true;
      bombLight.position.copy(position);
      bombLight.position.y += 0.5;
      bombLight.intensity = planted ? 1.6 : 0;
    },

    pulseBomb(planted, timer) {
      if (!planted) return;
      const beat = Math.max(0.2, Math.min(1, timer / 40));
      bombLight.intensity = 0.6 + Math.abs(Math.sin(now() * (3 + (1 - beat) * 9))) * 2.2;
    },

    update(dt) {
      const t = now();
      for (const entry of tracers) {
        if (!entry.mesh.visible) continue;
        if (t >= entry.until) entry.mesh.visible = false;
        else entry.mesh.material.opacity = Math.max(0, (entry.until - t) / 0.055) * 0.34;
      }
      for (const entry of sparks) {
        if (!entry.sprite.visible) continue;
        if (t >= entry.until) {
          entry.sprite.visible = false;
          continue;
        }
        entry.vel.y -= 9 * dt;
        entry.sprite.position.addScaledVector(entry.vel, dt);
        const k = (entry.until - t) / entry.life;
        entry.sprite.material.opacity = Math.max(0, k);
        entry.sprite.scale.setScalar(entry.scale * (0.4 + k * 0.8));
      }
      blastLight.intensity *= Math.max(0, 1 - dt * 14);
    },
  };
}
