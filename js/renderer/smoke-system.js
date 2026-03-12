// =============================================================
// RENDERER/SMOKE — Tire smoke particle system
// =============================================================
// Exports: updateSmoke, getSmokePool, MAX_SMOKE
//
// Spawns smoke puffs at wheel contact patches when slip ratio κ exceeds
// emission thresholds:
//   Locked wheels   (κ < params.smokeLockedThreshold):    dark, dense braking smoke
//   Overspinning    (κ > params.smokeOverspinThreshold):  light, diffuse burnout smoke
//
// Architecture: CPU-managed particle pool (mirrors sparks.js).
// GPU rendering done in gpu-renderer.js via the shared partPipeline (particles.wgsl).
// =============================================================

import { renderState as state } from '../state.js';
import { physicsRandom } from '../random.js';


// =============================================================
// SMOKE PARTICLE POOL
// =============================================================

export const MAX_SMOKE = 2000;

// Pre-allocated particle pool — no per-frame GC.
const smokePool = [];
for (let i = 0; i < MAX_SMOKE; i++) {
  smokePool.push({
    x: 0, y: 0,           // world position (metres)
    vx: 0, vy: 0,         // world velocity (m/s)
    life: 0,              // age (seconds)
    maxLife: 0,           // total lifetime (seconds)
    size: 0,              // base world-space radius (metres)
    r: 0, g: 0, b: 0,     // colour [0, 1]
    alpha: 0,             // base opacity [0, 1]
    alive: false,
  });
}

// Free-list stack for O(1) allocation/deallocation.
const smokeFreeList = [];
for (let i = MAX_SMOKE - 1; i >= 0; i--) smokeFreeList.push(i);

// Accumulated simulation time — drives the gentle drift field.
let smokeTime = 0;


// =============================================================
// SMOKE UPDATE
// =============================================================

// Called each physics step from main.js (after updateSparks).
export function updateSmoke(dt) {
  const params = state.params;

  smokeTime += dt;

  const body   = state.body;
  const wheels = state.wheels;
  const kappa  = state.wheelSlipRatio;
  const alpha  = state.wheelSlipAngle;
  const mu     = state.wheelFrictionUtil;
  const kin    = state.wheelKinematics;
  const speed  = body.speed;

  const lockedThresh   = params.smokeLockedThreshold   ?? -0.10;
  const overspinThresh = params.smokeOverspinThreshold ??  0.15;
  const minSpeed       = params.smokeMinSpeed          ??  3.0;
  const spawnRate      = params.smokeSpawnRate         ??  50;

  // ---- Spawn new particles ----
  if (speed >= minSpeed) {
    const wheelNames = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'];

    for (const name of wheelNames) {
      const k = kappa[name] || 0;
      const a = alpha[name] || 0;
      const u = mu[name]    || 0;

      const isLocked      = k < lockedThresh;
      const isOverspinning = k > overspinThresh;
      if (!isLocked && !isOverspinning) continue;

      // Emission metric: weighted sum of slip contributors.
      const emission = 0.6 * Math.abs(k) + 0.2 * Math.abs(a) + 0.2 * u;

      // Fractional spawning: always check stochastic roll for sub-1 counts.
      const spawnCount = Math.floor(emission * spawnRate * dt);
      if (spawnCount < 1 && physicsRandom() > emission * spawnRate * dt) continue;
      const count = Math.max(1, spawnCount);

      const wheel = wheels[name];
      // Use the pre-computed kinematic wheel velocity (includes angular contribution).
      const wk  = kin[name];
      const wvx = wk ? wk.wheelVelX : body.velocityX;
      const wvy = wk ? wk.wheelVelY : body.velocityY;

      for (let s = 0; s < count; s++) {
        if (smokeFreeList.length === 0) break; // pool exhausted

        const idx = smokeFreeList.pop();
        const p   = smokePool[idx];

        // Position: contact patch + small lateral jitter (tyre width variation).
        p.x = wheel.x + (physicsRandom() - 0.5) * 0.18;
        p.y = wheel.y + (physicsRandom() - 0.5) * 0.18;

        // Velocity: small fraction of wheel motion + random spread.
        // Keep the fraction low (3–6%) — smoke mostly rises, not tracks the car.
        const speedFrac = 0.03 + physicsRandom() * 0.03;
        const spread    = 0.6;
        p.vx = wvx * speedFrac + (physicsRandom() - 0.5) * spread;
        // Upward bias: Y is positive-down in world space, so subtract = rise.
        p.vy = wvy * speedFrac + (physicsRandom() - 0.5) * spread
               - (0.3 + physicsRandom() * 0.5);

        // Lifetime: longer smoke for heavier slip.
        p.maxLife = 0.8 + physicsRandom() * 0.7;
        p.life    = 0;

        // Base radius — will grow during lifetime in the GPU render loop.
        p.size = 0.35 + physicsRandom() * 0.35; // 0.35–0.70 m

        // Colour: locked = dark rubber smoke, overspinning = pale burnout dust.
        if (isLocked) {
          p.r = 0.26 + physicsRandom() * 0.08;
          p.g = 0.26 + physicsRandom() * 0.08;
          p.b = 0.28 + physicsRandom() * 0.08;
          p.alpha = 0.45 + physicsRandom() * 0.25; // 0.45–0.70
        } else {
          p.r = 0.58 + physicsRandom() * 0.12;
          p.g = 0.58 + physicsRandom() * 0.12;
          p.b = 0.60 + physicsRandom() * 0.12;
          p.alpha = 0.28 + physicsRandom() * 0.18; // 0.28–0.46
        }

        p.alive = true;
      }
    }
  }

  // ---- Age, advect, and cull particles ----
  const t = smokeTime;
  for (let i = 0; i < MAX_SMOKE; i++) {
    const p = smokePool[i];
    if (!p.alive) continue;

    p.life += dt;
    if (p.life >= p.maxLife) {
      p.alive = false;
      smokeFreeList.push(i);
      continue;
    }

    // Slow sinusoidal drift field — cheap approximation of turbulence.
    // Two waves at different frequencies prevent linear streaking.
    const driftX = Math.sin(t * 0.8 + p.x * 0.25) * 0.5;
    const driftY = Math.cos(t * 0.6 + p.y * 0.20) * 0.4;

    // Light upward buoyancy (smoke rises), plus turbulent drift.
    p.vy -= 1.0 * dt;          // buoyancy: upward in world space (Y-down)
    p.vx += driftX * dt;
    p.vy += driftY * dt;

    // Gentle air drag.
    p.vx *= 0.975;
    p.vy *= 0.975;

    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}


// Returns the particle pool for gpu-renderer.js to iterate.
export function getSmokePool() { return smokePool; }
