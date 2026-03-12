// =============================================================
// RENDERER/SMOKE — Tire Smoke Particle System (GPU Compute)
// =============================================================
// Exports: updateSmoke, getSmokePool, MAX_SMOKE
//
// CPU-side responsibility: Spawn particles at wheel contact patches
// based on slip conditions (κ, α, μ).
//
// GPU-side responsibility: Advect particles via compute shader with
// Perlin curl noise turbulence, gravity, drag, and lifetime aging.
// =============================================================

import { renderState as state } from '../state.js';
import { physicsRandom } from '../random.js';


// =============================================================
// SMOKE PARTICLE POOL (CPU-side)
// =============================================================

export const MAX_SMOKE = 8000;

// Pre-allocated pool — particles spawned here, then GPU compute updates them
const smokePool = [];
for (let i = 0; i < MAX_SMOKE; i++) {
  smokePool.push({
    pos: { x: 0, y: 0 },      // world position (metres)
    vel: { x: 0, y: 0 },      // initial velocity (m/s)
    life: 0,                  // remaining lifetime (seconds)
    maxLife: 0,               // original lifetime
    size: 0,                  // base radius (metres) — GPU grows this
    r: 0, g: 0, b: 0,        // colour [0, 1]
    alpha: 0,                 // opacity [0, 1]
    alive: false,
  });
}

// Free-list for O(1) spawn
const smokeFreeList = [];
for (let i = MAX_SMOKE - 1; i >= 0; i--) smokeFreeList.push(i);


// =============================================================
// SMOKE SPAWN
// =============================================================

// Called each physics step. Only spawns particles.
// GPU compute shader handles all advection (motion, turbulence, aging).
export function updateSmoke(dt) {
  const params = state.params;
  if (!params.smokeEnabled) return;

  const body = state.body;
  const wheels = state.wheels;
  const kappa = state.wheelSlipRatio;
  const kin = state.wheelKinematics;
  const speed = body.speed;

  const lockedThresh   = params.smokeLockedThreshold   ?? -0.10;
  const overspinThresh = params.smokeOverspinThreshold ?? 0.15;
  const minSpeed       = params.smokeMinSpeed          ?? 3.0;
  const spawnRate      = params.smokeSpawnRate         ?? 75;

  // ---- Spawn new particles ----
  if (speed >= minSpeed) {
    const wheelNames = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'];

    for (const name of wheelNames) {
      const k = kappa[name] || 0;
      const isLocked = k < lockedThresh;
      const isOverspinning = k > overspinThresh;
      if (!isLocked && !isOverspinning) continue;

      // Emission intensity based on slip
      const emission = 0.6 * Math.abs(k) + 0.2 * 0; // simplified: just slip ratio

      // Fractional spawn count
      const spawnCount = Math.floor(emission * spawnRate * dt);
      if (spawnCount < 1 && physicsRandom() > emission * spawnRate * dt) continue;
      const count = Math.max(1, spawnCount);

      const wheel = wheels[name];
      const wk = kin[name];
      const wvx = wk ? wk.wheelVelX : body.velocityX;
      const wvy = wk ? wk.wheelVelY : body.velocityY;

      for (let s = 0; s < count; s++) {
        if (smokeFreeList.length === 0) break;

        const idx = smokeFreeList.pop();
        const p = smokePool[idx];

        // ---- Position: contact patch + jitter ----
        p.pos.x = wheel.x + (physicsRandom() - 0.5) * 0.2;
        p.pos.y = wheel.y + (physicsRandom() - 0.5) * 0.2;

        // ---- Velocity: small fraction of wheel motion + random drift ----
        // GPU compute will apply turbulence, so keep initial velocity modest
        const speedFrac = 0.02 + physicsRandom() * 0.03;
        const spread = 0.7;
        p.vel.x = wvx * speedFrac + (physicsRandom() - 0.5) * spread;
        p.vel.y = wvy * speedFrac + (physicsRandom() - 0.5) * spread
                  - (0.3 + physicsRandom() * 0.5);  // upward bias

        // ---- Lifetime ----
        const lifetime = params.smokeLifetimeMin ?? 1.0;
        const lifetimeMax = params.smokeLifetimeMax ?? 2.0;
        p.maxLife = lifetime + physicsRandom() * (lifetimeMax - lifetime);
        p.life = p.maxLife;

        // ---- Size: base size (GPU grows it) ----
        const sizeMin = params.smokeSizeMin ?? 0.35;
        const sizeMax = params.smokeSizeMax ?? 0.70;
        p.size = sizeMin + physicsRandom() * (sizeMax - sizeMin);

        // ---- Colour: locked = dark, overspinning = light ----
        if (isLocked) {
          p.r = 0.26 + physicsRandom() * 0.06;
          p.g = 0.26 + physicsRandom() * 0.06;
          p.b = 0.28 + physicsRandom() * 0.06;
          p.alpha = (params.smokeOpacityLocked ?? 0.65) + physicsRandom() * 0.15;
        } else {
          p.r = 0.58 + physicsRandom() * 0.12;
          p.g = 0.58 + physicsRandom() * 0.12;
          p.b = 0.60 + physicsRandom() * 0.12;
          p.alpha = (params.smokeOpacityOverspun ?? 0.40) + physicsRandom() * 0.10;
        }

        p.alive = true;
      }
    }
  }

  // Note: GPU compute shader handles all other particle physics (aging, advection, culling).
  // CPU does NOT age or advect particles — that's the GPU's job now!
}


// ---- Return pool to gpu-renderer for upload to GPU buffer ----
export function getSmokePool() { return smokePool; }
