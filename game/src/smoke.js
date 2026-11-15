// Smoke: a thrown canister that blooms into a volume of opaque haze for a few seconds.
// The haze is a stack of billboarded sprites rather than a mesh, so it is cheap and it
// reads from every angle. It plugs into the same vision test the bots already use, which
// is what makes it a tactic instead of an effect: a smoke on the angle really does blind
// a defender, and a push through it really is blind for the player too.
import * as THREE from 'three';

const POOL = 4;
const PUFFS_PER_CLOUD = 26;
const GRAVITY = 15;
const RADIUS = 0.1;
const DRAG = 0.995;

const _dir = new THREE.Vector3();

// A soft round blob, drawn once into a canvas and reused by every puff. No image file,
// and the falloff is what keeps the cloud from looking like a bag of circles.
function puffTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(196,203,198,0.95)');
  gradient.addColorStop(0.45, 'rgba(178,186,181,0.70)');
  gradient.addColorStop(0.78, 'rgba(160,168,163,0.30)');
  gradient.addColorStop(1, 'rgba(148,156,151,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createSmoke(scene, { colliders }) {
  const texture = puffTexture();
  const clouds = [];

  for (let i = 0; i < POOL; i += 1) {
    const canister = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.22, 8),
      new THREE.MeshStandardMaterial({ color: '#5d6b62', roughness: 0.7, metalness: 0.35 }),
    );
    canister.visible = false;
    scene.add(canister);

    const puffs = [];
    for (let p = 0; p < PUFFS_PER_CLOUD; p += 1) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        color: new THREE.Color('#a8b0ab'),
      }));
      sprite.visible = false;
      sprite.frustumCulled = false;
      scene.add(sprite);
      puffs.push({
        sprite,
        offset: new THREE.Vector3(),
        drift: new THREE.Vector3(),
        // Each puff grows on its own clock so the cloud boils instead of inflating as one.
        bornAt: 0,
        scale: 1,
      });
    }

    clouds.push({
      canister,
      puffs,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      // live: in the air. blooming: haze is up. Both false: free slot.
      live: false,
      blooming: false,
      fuse: 0,
      life: 0,
      radius: 0,
    });
  }

  // Same wall bounce as a frag: push out on the axis of least penetration, reflect it.
  function bounce(cloud) {
    const p = cloud.pos;
    const v = cloud.vel;
    for (const box of colliders) {
      if (p.x + RADIUS <= box.minX || p.x - RADIUS >= box.maxX) continue;
      if (p.z + RADIUS <= box.minZ || p.z - RADIUS >= box.maxZ) continue;
      if (p.y + RADIUS <= box.minY || p.y - RADIUS >= box.maxY) continue;
      const outX = Math.min(p.x + RADIUS - box.minX, box.maxX - (p.x - RADIUS));
      const outZ = Math.min(p.z + RADIUS - box.minZ, box.maxZ - (p.z - RADIUS));
      const outY = Math.min(p.y + RADIUS - box.minY, box.maxY - (p.y - RADIUS));
      if (outY <= outX && outY <= outZ) {
        p.y = p.y > (box.minY + box.maxY) / 2 ? box.maxY + RADIUS : box.minY - RADIUS;
        v.y = -v.y * 0.3;
        v.x *= 0.7;
        v.z *= 0.7;
      } else if (outX <= outZ) {
        p.x = p.x > (box.minX + box.maxX) / 2 ? box.maxX + RADIUS : box.minX - RADIUS;
        v.x = -v.x * 0.4;
        v.z *= 0.8;
      } else {
        p.z = p.z > (box.minZ + box.maxZ) / 2 ? box.maxZ + RADIUS : box.minZ - RADIUS;
        v.z = -v.z * 0.4;
        v.x *= 0.8;
      }
    }
    if (p.y < RADIUS) {
      p.y = RADIUS;
      if (v.y < 0) v.y = -v.y * 0.3;
      if (Math.abs(v.y) < 0.5) v.y = 0;
      v.x *= 0.7;
      v.z *= 0.7;
    }
  }

  function bloom(cloud) {
    cloud.live = false;
    cloud.canister.visible = false;
    cloud.blooming = true;
    cloud.life = 0;
    cloud.radius = 0;
    const now = performance.now() / 1000;
    for (let i = 0; i < cloud.puffs.length; i += 1) {
      const puff = cloud.puffs[i];
      // Spread the seed points through a squat ellipsoid: smoke sits low and wide.
      const theta = (i / cloud.puffs.length) * Math.PI * 2 + Math.random() * 0.6;
      const ring = 0.35 + Math.random() * 1.15;
      puff.offset.set(
        Math.cos(theta) * ring,
        0.25 + Math.random() * 1.5,
        Math.sin(theta) * ring,
      );
      puff.drift.set(
        (Math.random() - 0.5) * 0.35,
        0.1 + Math.random() * 0.22,
        (Math.random() - 0.5) * 0.35,
      );
      puff.bornAt = now + Math.random() * 0.55;
      puff.scale = 1.5 + Math.random() * 1.4;
      puff.sprite.position.copy(cloud.pos).add(puff.offset);
      puff.sprite.visible = false;
      puff.sprite.material.opacity = 0;
    }
  }

  return {
    // Throws along the view direction with a little loft, from the eye.
    throwFrom(origin, direction) {
      const cloud = clouds.find((entry) => !entry.live && !entry.blooming);
      if (!cloud) return false;
      cloud.pos.copy(origin);
      cloud.vel.copy(direction).multiplyScalar(15);
      cloud.vel.y += 15 * 0.16;
      cloud.fuse = 1.35;
      cloud.live = true;
      cloud.canister.position.copy(cloud.pos);
      cloud.canister.visible = true;
      return true;
    },

    // How much haze sits between two points, 0 (clear) to 1 (fully smoked off). The bot
    // vision test multiplies its range by this, so a smoke on the angle really does
    // shorten how far a defender can see down it.
    opacityBetween(from, to) {
      let worst = 0;
      for (const cloud of clouds) {
        if (!cloud.blooming) continue;
        const reach = cloud.radius;
        if (reach < 0.5) continue;
        // Sample along the sightline and keep the densest overlap with the cloud body.
        for (let s = 0; s <= 6; s += 1) {
          const k = s / 6;
          const x = from.x + (to.x - from.x) * k;
          const y = from.y + (to.y - from.y) * k;
          const z = from.z + (to.z - from.z) * k;
          const dist = Math.hypot(x - cloud.pos.x, (y - (cloud.pos.y + 1.0)) * 0.8, z - cloud.pos.z);
          if (dist < reach) {
            // Dense at the core, thinning at the edge, and fading as the cloud expires.
            const core = 1 - dist / reach;
            const fade = Math.min(1, cloud.life / 0.6) * Math.min(1, (9 - cloud.life) / 2.2);
            worst = Math.max(worst, Math.min(1, core * 1.6) * Math.max(0, fade));
          }
        }
      }
      return worst;
    },

    // Shot mode only: bloom a cloud at a fixed spot so a screenshot can show the haze
    // without waiting out a throw and a fuse.
    preview(x, z, growTo = 3.4) {
      const cloud = clouds[0];
      if (!cloud) return;
      cloud.pos.set(x, 0.15, z);
      cloud.live = false;
      cloud.blooming = true;
      cloud.life = 2.6;
      cloud.radius = growTo;
      const now = performance.now() / 1000;
      for (let i = 0; i < cloud.puffs.length; i += 1) {
        const puff = cloud.puffs[i];
        const theta = (i / cloud.puffs.length) * Math.PI * 2 + Math.random() * 0.6;
        const ring = 0.35 + Math.random() * 1.15;
        puff.offset.set(Math.cos(theta) * ring, 0.25 + Math.random() * 1.5, Math.sin(theta) * ring);
        puff.drift.set((Math.random() - 0.5) * 0.35, 0.1 + Math.random() * 0.22, (Math.random() - 0.5) * 0.35);
        puff.bornAt = now - 1;
        puff.scale = 1.5 + Math.random() * 1.4;
        puff.sprite.position.copy(cloud.pos).add(puff.offset);
        puff.sprite.visible = true;
        puff.sprite.scale.setScalar(puff.scale * (0.7 + cloud.radius * 0.16));
        puff.sprite.material.opacity = 0.72;
      }
    },

    reset() {
      for (const cloud of clouds) {
        cloud.live = false;
        cloud.blooming = false;
        cloud.canister.visible = false;
        for (const puff of cloud.puffs) {
          puff.sprite.visible = false;
          puff.sprite.material.opacity = 0;
        }
      }
    },

    update(dt) {
      const now = performance.now() / 1000;
      for (const cloud of clouds) {
        if (cloud.live) {
          cloud.fuse -= dt;
          cloud.vel.y -= GRAVITY * dt;
          cloud.vel.multiplyScalar(DRAG);
          cloud.pos.addScaledVector(cloud.vel, dt);
          bounce(cloud);
          cloud.canister.position.copy(cloud.pos);
          if (cloud.fuse <= 0) bloom(cloud);
          continue;
        }
        if (!cloud.blooming) continue;

        cloud.life += dt;
        // Grow to full radius over the first second, then hold, then thin out at the end.
        cloud.radius = Math.min(3.4, cloud.radius + dt * 6.2);
        if (cloud.life > 9) {
          cloud.blooming = false;
          for (const puff of cloud.puffs) {
            puff.sprite.visible = false;
            puff.sprite.material.opacity = 0;
          }
          continue;
        }

        const fadeIn = Math.min(1, cloud.life / 0.6);
        const fadeOut = Math.min(1, (9 - cloud.life) / 2.2);
        const density = Math.max(0, fadeIn * fadeOut);
        for (const puff of cloud.puffs) {
          if (now < puff.bornAt) continue;
          puff.sprite.visible = true;
          // Drift up and out, so the cloud churns instead of sitting still.
          puff.offset.addScaledVector(puff.drift, dt);
          puff.sprite.position.copy(cloud.pos).add(puff.offset);
          puff.sprite.scale.setScalar(puff.scale * (0.7 + cloud.radius * 0.16));
          puff.sprite.material.opacity = 0.72 * density;
        }
      }
    },
  };
}
