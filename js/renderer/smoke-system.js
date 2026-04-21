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
// CPU only seeds newly spawned particles and recycles freed indices
// reported back from GPU readback.
// =============================================================

import { renderState as state } from '../state.js';
import { physicsRandom } from '../random.js';

import { logger } from '../debug/logger.js';
import { eventBuffer } from '../debug/events.js';


// =============================================================
// SMOKE PARTICLE POOL (CPU-side)
// =============================================================

export const MAX_SMOKE = 16000;

// Pre-allocated pool — particles spawned here, then GPU compute updates them
const smokePool = [];
for (let i = 0; i < MAX_SMOKE; i++) {
  smokePool.push({
    pos: { x: 0, y: 0 },      // world position (metres)
    vel: { x: 0, y: 0 },      // initial velocity (m/s)
    life: 0,                  // remaining lifetime (seconds)
    maxLife: 0,               // original lifetime
    size: 0,                  // current radius (metres) — grows during lifetime
    sizeBase: 0,              // original base radius (metres) — used for growth calc
    r: 0, g: 0, b: 0,        // colour [0, 1]
    alpha: 0,                 // opacity [0, 1]
    alive: false,
  });
}

// Free-list for O(1) spawn
const smokeFreeList = [];
for (let i = MAX_SMOKE - 1; i >= 0; i--) smokeFreeList.push(i);

// Spawn queue consumed by gpu-renderer. Contains particle indices written this frame.
const spawnedSmokeIndices = [];

// Track alive particles: MAX_SMOKE - smokeFreeList.length
// Updated when particles are spawned and when dead particles are reclaimed from GPU
let smokeAliveCount = 0;

// Track maximum particle index spawned (for GPU render range)
let maxSpawnedIndex = -1;

// Per-wheel fractional spawn accumulators — carry sub-integer remainders between frames
// so spawning is smooth and continuous rather than bursty
const spawnAccum = { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 };


// =============================================================
// SMOKE SPAWN
// =============================================================

// Called ONCE per render frame with wall-clock dt.
// Decoupled from physics substeps — spawning is steady at ~60Hz regardless of
// whether physics dropped frames or caught up with a burst of substeps.
// GPU compute shader handles all advection (motion, turbulence, aging).
export function updateSmoke(dt) {
  const params = state.params;
  if (!params.smokeEnabled) return;

  // Clamp dt to a sensible range — protects against tab-switch stalls
  if (dt > 0.1) dt = 0.1;
  if (dt <= 0) return;

  const body = state.body;
  const wheels = state.wheels;
  const kappa = state.wheelSlipRatio;
  const kin = state.wheelKinematics;
  const speed = body.speed;

  const lockedThresh   = params.smokeLockedThreshold   ?? -0.05;
  const overspinThresh = params.smokeOverspinThreshold ?? 0.08;
  const minSpeed       = params.smokeMinSpeed          ?? 1.0;
  const spawnRate      = params.smokeSpawnRate         ?? 400;  // particles/sec/wheel at full emission

  // Trace-gated smoke spawn debug logging (only in trace mode for smoke channel)
  logger.trace('smoke', () => `Speed: ${speed.toFixed(2)} m/s, Slip: FL=${kappa.frontLeft?.toFixed(3)} FR=${kappa.frontRight?.toFixed(3)} RL=${kappa.rearLeft?.toFixed(3)} RR=${kappa.rearRight?.toFixed(3)}`);

  // ---- Spawn new particles ----
  if (speed >= minSpeed) {
    const wheelNames = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'];

    for (const name of wheelNames) {
      const k = kappa[name] || 0;
      const isLocked = k < lockedThresh;
      const isOverspinning = k > overspinThresh;
      if (!isLocked && !isOverspinning) continue;

      // Phase C: Event Enrichment - Emit smoke enter/exit events
      const wasLockedLastFrame = state.debug.transitionState.wheelSmokeLocked[name];
      const wasOverspinLastFrame = state.debug.transitionState.wheelSmokeOverspin[name];

      if (isLocked && !wasLockedLastFrame && eventBuffer) {
        eventBuffer.pushEvent({
          level: 'info',
          channel: 'smoke',
          type: 'smoke_locked_enter',
          msg: `${name} locked smoke starts`,
          data: {
            wheel: name,
            slipRatio: k,
            speed: speed,
          },
          dedupeKey: `smoke:${name}:locked:enter`,
        });
      } else if (!isLocked && wasLockedLastFrame && eventBuffer) {
        eventBuffer.pushEvent({
          level: 'info',
          channel: 'smoke',
          type: 'smoke_locked_exit',
          msg: `${name} locked smoke stops`,
          data: { wheel: name, slipRatio: k },
          dedupeKey: `smoke:${name}:locked:exit`,
        });
      }

      if (isOverspinning && !wasOverspinLastFrame && eventBuffer) {
        eventBuffer.pushEvent({
          level: 'info',
          channel: 'smoke',
          type: 'smoke_overspin_enter',
          msg: `${name} overspin smoke starts`,
          data: {
            wheel: name,
            slipRatio: k,
            speed: speed,
          },
          dedupeKey: `smoke:${name}:overspin:enter`,
        });
      } else if (!isOverspinning && wasOverspinLastFrame && eventBuffer) {
        eventBuffer.pushEvent({
          level: 'info',
          channel: 'smoke',
          type: 'smoke_overspin_exit',
          msg: `${name} overspin smoke stops`,
          data: { wheel: name, slipRatio: k },
          dedupeKey: `smoke:${name}:overspin:exit`,
        });
      }

      state.debug.transitionState.wheelSmokeLocked[name] = isLocked;
      state.debug.transitionState.wheelSmokeOverspin[name] = isOverspinning;

      // Clear accumulator when re-entering slip to avoid burst on first frame
      if ((isLocked && !wasLockedLastFrame) || (isOverspinning && !wasOverspinLastFrame)) {
        spawnAccum[name] = 0;
      }

      // Emission: reaches max at ~0.15 slip (above threshold) — aggressive curve for visibility
      const slipExcess = Math.abs(k) - (isLocked ? Math.abs(lockedThresh) : overspinThresh);
      const emission = Math.max(0.3, Math.min(1.0, 0.3 + slipExcess / 0.15));

      // Fractional accumulator — carry remainder across render frames for smooth continuous spawn
      spawnAccum[name] += emission * spawnRate * dt;
      // Cap per-frame spawn to prevent any single frame burst (e.g. after tab-switch)
      const count = Math.min(Math.floor(spawnAccum[name]), 20);
      if (count < 1) continue;
      spawnAccum[name] -= count;

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
        const lifetime = params.smokeLifetimeMin ?? 3.0;
        const lifetimeMax = params.smokeLifetimeMax ?? 5.0;
        p.maxLife = lifetime + physicsRandom() * (lifetimeMax - lifetime);
        p.life = p.maxLife;

        // ---- Size: starts small, GPU grows to 4x ----
        const sizeMin = params.smokeSizeMin ?? 0.4;
        const sizeMax = params.smokeSizeMax ?? 0.9;
        p.size = sizeMin + physicsRandom() * (sizeMax - sizeMin);
        p.sizeBase = p.size;

        // ---- Colour: locked = medium gray, overspinning = light gray ----
        // Lower alpha so particles stack naturally without saturating
        if (isLocked) {
          p.r = 0.55 + physicsRandom() * 0.10;
          p.g = 0.55 + physicsRandom() * 0.10;
          p.b = 0.58 + physicsRandom() * 0.10;
          p.alpha = (params.smokeOpacityLocked ?? 0.55) + physicsRandom() * 0.15;
        } else {
          p.r = 0.80 + physicsRandom() * 0.12;
          p.g = 0.80 + physicsRandom() * 0.12;
          p.b = 0.82 + physicsRandom() * 0.10;
          p.alpha = (params.smokeOpacityOverspun ?? 0.45) + physicsRandom() * 0.15;
        }

        p.alive = true;
        spawnedSmokeIndices.push(idx);
        smokeAliveCount++;
        if (idx > maxSpawnedIndex) maxSpawnedIndex = idx;
      }
    }
  }

  // Note: GPU compute shader handles all other particle physics (aging, advection, culling).
  // CPU does NOT age or advect particles — that's the GPU's job now!
}


// ---- Return pool to gpu-renderer for upload to GPU buffer ----
export function getSmokePool() { return smokePool; }

export function consumeSpawnedSmokeIndices() {
  const out = spawnedSmokeIndices.slice();
  spawnedSmokeIndices.length = 0;
  return out;
}

export function getMaxSpawnedSmokeIndex() {
  return maxSpawnedIndex;
}

// GPU-side simulation is authoritative after spawn. Dead particles are returned
// via periodic readback so the CPU free-list can continue allocating.
export function reclaimSmokeParticles(deadIndices) {
  for (let i = 0; i < deadIndices.length; i++) {
    const idx = deadIndices[i];
    const p = smokePool[idx];
    if (!p || !p.alive) continue;
    p.alive = false;
    p.life = 0;
    p.alpha = 0;
    // Clear color to prevent any stale data
    p.r = 0;
    p.g = 0;
    p.b = 0;
    // Clear position and velocity as well
    p.pos.x = 0;
    p.pos.y = 0;
    p.vel.x = 0;
    p.vel.y = 0;
    p.size = 0;
    p.maxLife = 0;
    smokeFreeList.push(idx);
    smokeAliveCount--;
  }
}

// O(1) alive count. Counter is maintained incrementally on spawn / reclaim.
export function getSmokeAliveCount() {
  return smokeAliveCount;
}
