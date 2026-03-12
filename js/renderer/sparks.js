// =============================================================
// RENDERER/SPARKS — HDR spark particle system
// =============================================================
// Exports: updateSparks, getSparkPool, drawSparks

import { renderState as state } from '../state.js';
import { physicsRandom } from '../random.js';


// =============================================================
// SPARK PARTICLE POOL
// =============================================================

// Spark particle pool. Particles are recycled via the `alive` flag.
const sparkPool = [];
const MAX_SPARKS = 300;

// Pre-allocate the pool.
for (let i = 0; i < MAX_SPARKS; i++) {
  sparkPool.push({
    x: 0, y: 0, vx: 0, vy: 0,
    life: 0, maxLife: 0, size: 0,
    alive: false,
    hdrIndex: 0, // index into color palette
  });
}

// Free-list for O(1) spark allocation (QW-4).
// Stack of dead particle indices — pop to alloc, push to free.
const sparkFreeList = [];
for (let i = MAX_SPARKS - 1; i >= 0; i--) sparkFreeList.push(i);

// HDR-capable spark colors using display-p3 gamut.
// On SDR displays these clamp to bright white/yellow — still looks good.
const SPARK_COLORS_HDR = [
  'color(display-p3 1.0 0.95 0.5)',   // bright HDR yellow
  'color(display-p3 1.0 0.85 0.3)',   // golden
  'color(display-p3 1.0 0.6 0.2)',    // HDR orange
  'color(display-p3 1.0 1.0 0.85)',   // near-white hot
  'color(display-p3 1.0 0.7 0.1)',    // deep gold
];

// Fallback sRGB colors for browsers that don't support display-p3.
const SPARK_COLORS_SDR = [
  '#fff8a0',
  '#ffd966',
  '#ff9933',
  '#ffffdd',
  '#ffb31a',
];

// Test display-p3 support once.
let useHDR = false;
try {
  const testCanvas = document.createElement('canvas');
  const testCtx = testCanvas.getContext('2d');
  testCtx.fillStyle = 'color(display-p3 1 0 0)';
  // If it parsed successfully, fillStyle won't be reset to default.
  useHDR = testCtx.fillStyle !== '#000000' && testCtx.fillStyle.includes('color');
} catch (e) {
  useHDR = false;
}
const SPARK_COLORS = useHDR ? SPARK_COLORS_HDR : SPARK_COLORS_SDR;


// =============================================================
// SPARK UPDATE
// =============================================================

// Spawns sparks at wheels where friction utilization is high (slipping/locking).
// Called each physics step from main.js.
export function updateSparks(dt) {
  const body = state.body;
  const utilization = state.wheelFrictionUtil;  // Changed from wheelGrip (semantic clarity)
  const wheels = state.wheels;
  const heading = body.heading;
  const speed = body.speed;
  const params = state.params;

  const GRIP_THRESHOLD = params.sparkGripThreshold; // tunable via slider; now means utilization threshold
  const intensityMult = params.sparkIntensity;       // spawn rate multiplier
  const sizeMult = params.sparkSize;                 // particle size multiplier
  const lifeMult = params.sparkLifetime;             // lifetime multiplier
  const wheelNames = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'];
  const isFront = { frontLeft: true, frontRight: true, rearLeft: false, rearRight: false };

  for (const name of wheelNames) {
    const u = utilization[name] || 0;
    // Spawn sparks when friction utilization EXCEEDS threshold (high traction use = slip/lock)
    if (u <= GRIP_THRESHOLD || speed < 2.0) continue;

    // Spark intensity: stronger with higher utilization (more aggressive slipping), higher speed, higher jerk.
    const slipIntensity = (u - GRIP_THRESHOLD) / (1.0 - GRIP_THRESHOLD);  // Normalize to [0, 1] above threshold
    // Use filtered jerk to avoid constraint-noise spikes.
    const jerkFactor = Math.min(state.filteredBody.jerkMagnitude / 200, 1.0);
    const intensity = speed * slipIntensity * (0.3 + 0.7 * jerkFactor) * intensityMult;

    // Spawn rate proportional to intensity.
    const spawnCount = Math.floor(intensity * 0.15 * (60 * dt));
    if (spawnCount < 1 && physicsRandom() > intensity * 0.1) continue;

    const wheel = wheels[name];
    const steerAngle = isFront[name] ? state.steering.frontWheelAngle : 0;

    // Wheel tangent direction (direction of travel at wheel).
    const armX = wheel.x - body.centerX;
    const armY = wheel.y - body.centerY;
    const wheelVelX = body.velocityX + (-body.angularVelocity * armY);
    const wheelVelY = body.velocityY + ( body.angularVelocity * armX);
    const wheelSpeed = Math.hypot(wheelVelX, wheelVelY);

    for (let s = 0; s < Math.max(1, spawnCount); s++) {
      // O(1) allocation via free-list (QW-4).
      if (sparkFreeList.length === 0) break; // pool full
      const _sparkIdx = sparkFreeList.pop();
      const spark = sparkPool[_sparkIdx];

      // Spawn at wheel position with slight random offset.
      spark.x = wheel.x + (physicsRandom() - 0.5) * 0.2;
      spark.y = wheel.y + (physicsRandom() - 0.5) * 0.2;

      // Velocity: tangent to wheel motion + random spread + upward bias (world Y is down)
      const tangentScale = 2.0 + physicsRandom() * 4.0;
      const spread = (physicsRandom() - 0.5) * 3.0;
      if (wheelSpeed > 0.1) {
        spark.vx = (wheelVelX / wheelSpeed) * tangentScale + spread;
        spark.vy = (wheelVelY / wheelSpeed) * tangentScale + spread - (1.0 + physicsRandom() * 2.0);
      } else {
        spark.vx = (physicsRandom() - 0.5) * 4.0;
        spark.vy = -(1.0 + physicsRandom() * 3.0);
      }

      spark.life = 0;
      spark.maxLife = (0.1 + physicsRandom() * 0.25) * lifeMult;
      spark.size = (0.03 + physicsRandom() * 0.06) * sizeMult;
      spark.alive = true;
      spark.hdrIndex = Math.floor(physicsRandom() * SPARK_COLORS.length);
    }
  }

  // Age and kill particles.
  for (let i = 0; i < MAX_SPARKS; i++) {
    const p = sparkPool[i];
    if (!p.alive) continue;

    p.life += dt;
    if (p.life >= p.maxLife) {
      p.alive = false;
      sparkFreeList.push(i); // return slot to free-list (QW-4)
      continue;
    }

    // Simple physics: gravity (world Y down) + drag.
    p.vy += 9.81 * dt; // gravity pulls sparks down
    p.vx *= 0.97;      // air drag
    p.vy *= 0.97;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

// Returns the spark pool for GPU rendering (gpu-renderer.js reads this).
export function getSparkPool() { return sparkPool; }

// Draws all alive sparks. Called in world space.
export function drawSparks(ctx) {
  for (let i = 0; i < MAX_SPARKS; i++) {
    const p = sparkPool[i];
    if (!p.alive) continue;

    const t = p.life / p.maxLife; // 0→1 over lifetime
    const alpha = 1.0 - t * t;   // quadratic fade out
    const size = p.size * (1.0 - t * 0.5); // shrink slightly

    ctx.globalAlpha = alpha;
    ctx.fillStyle = SPARK_COLORS[p.hdrIndex];
    ctx.fillRect(p.x - size * 0.5, p.y - size * 0.5, size, size);
  }
  ctx.globalAlpha = 1.0;
}
