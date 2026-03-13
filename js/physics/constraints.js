// =============================================================
// PHYSICS / CONSTRAINTS
// Jakobsen rigid-body constraint solver and anti-tunnelling clamp.
// Also handles boundary collisions (wheel ↔ map edge).
// =============================================================
//
// INVARIANTS — do not alter these:
//   correctionScale = (currentDist - restDist) / currentDist * 0.5   (equal-mass split)
//   cd = clamp(constraintDamping, 0.05, 1.0)                          (0.05 floor is intentional)
//   particleA.prevX += corrAX * cd                                    (velocity damping)
//   Verlet bounce: prevX = x - (-velocityX * bounciness)              (double-negative intentional)

import { physicsState as state } from '../state.js';
import {
  CONSTRAINT_AXLE_WIDTH,
  CONSTRAINT_SIDE_LENGTH,
  CONSTRAINT_DIAGONAL,
  MAX_DISPLACEMENT_PER_STEP,
} from '../constants.js';

import { logger } from '../debug/logger.js';

// --------------- private helpers ---------------

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

// -----------------------------------------------


// Enforces the fixed rest distance between a pair of Verlet particles.
// If the current distance differs from the rest distance, each particle is
// moved by half the error (equal mass assumption) to correct it.
//
// Jakobsen's insight: you do not need to compute velocity — moving the position
// and leaving prevPosition unchanged automatically encodes a velocity impulse.
// enforceDistanceConstraint uses state.params.constraintDamping (0.0–1.0).
// 0.0 = pure Jakobsen (phantom velocity injects energy, can jitter under high forces)
// 0.5 = balanced default (kills oscillation without sluggish feel)
// 1.0 = fully damped (all constraint impulse velocity absorbed — rigid but heavy)
function enforceDistanceConstraint(particleA, particleB, restDistance) {
  const deltaX = particleB.x - particleA.x;
  const deltaY = particleB.y - particleA.y;
  const currentDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

  if (currentDistance < 0.0001) return; // degenerate; skip

  // Fraction of the error each particle should move (half each for equal mass).
  const correctionScale = (currentDistance - restDistance) / currentDistance * 0.5;

  const corrAX = deltaX * correctionScale;
  const corrAY = deltaY * correctionScale;

  // Record correction magnitude for metrics
  const correctionMagnitude = Math.sqrt(corrAX * corrAX + corrAY * corrAY);
  recordConstraintCorrection(correctionMagnitude);

  particleA.x += corrAX;
  particleA.y += corrAY;
  particleB.x -= corrAX;
  particleB.y -= corrAY;

  // Damping: also shift prevX/prevY by a fraction of the correction.
  // This prevents the constraint from injecting velocity impulses that
  // the Verlet integrator amplifies on the next step.
  // Stabilizer #2 — keep nonzero damping floor so Jakobsen corrections never
  // fully reinject constraint impulse energy. Feel impact: less idle jitter.
  const cd = clamp(state.params.constraintDamping, 0.05, 1.0);
  particleA.prevX += corrAX * cd;
  particleA.prevY += corrAY * cd;
  particleB.prevX -= corrAX * cd;
  particleB.prevY -= corrAY * cd;
}


// Runs CONSTRAINT_ITERATIONS passes of all six rigid distance constraints.
// Multiple iterations converge the body toward rigidity. After 6 iterations
// the constraint error is typically below 0.01 px for reasonable forces.
//
// The six constraints are the edges of the quadrilateral: four sides and
// two diagonals. The diagonals prevent the rectangle from shearing into a
// parallelogram, which would happen with only four side constraints.
// Track constraint metrics for telemetry
let constraintMetrics = {
  maxCorrectionMagnitude: 0,
  sumCorrectionMagnitude: 0,
  correctionCount: 0,
  prevMaxCorrection: 0,
};

export function solveRigidBodyConstraints() {
  const wh     = state.wheels;
  // Stabilizer #2 — iteration clamp by mode.
  // Determinism mode uses a tighter cap to keep CPU cost and correction order
  // stable across machines; normal mode allows a higher cap for rigidity tuning.
  const modeCap = state.params.determinismMode ? 8 : 12;
  const iters = clamp(Math.round(state.params.constraintIterations || 1), 1, modeCap);

  // Reset metrics for this frame
  constraintMetrics.maxCorrectionMagnitude = 0;
  constraintMetrics.sumCorrectionMagnitude = 0;
  constraintMetrics.correctionCount = 0;
  constraintMetrics.prevMaxCorrection = state.debug.metrics.constraintMaxCorr || 0;

  for (let iteration = 0; iteration < iters; iteration++) {
    // Four edges: front axle, rear axle, left side, right side.
    enforceDistanceConstraint(wh.frontLeft,  wh.frontRight, CONSTRAINT_AXLE_WIDTH);
    enforceDistanceConstraint(wh.rearLeft,   wh.rearRight,  CONSTRAINT_AXLE_WIDTH);
    enforceDistanceConstraint(wh.frontLeft,  wh.rearLeft,   CONSTRAINT_SIDE_LENGTH);
    enforceDistanceConstraint(wh.frontRight, wh.rearRight,  CONSTRAINT_SIDE_LENGTH);
    // Two diagonals: prevents shear.
    enforceDistanceConstraint(wh.frontLeft,  wh.rearRight,  CONSTRAINT_DIAGONAL);
    enforceDistanceConstraint(wh.frontRight, wh.rearLeft,   CONSTRAINT_DIAGONAL);
  }

  // Update telemetry metrics
  if (constraintMetrics.correctionCount > 0) {
    state.debug.metrics.constraintMaxCorr = constraintMetrics.maxCorrectionMagnitude;
    state.debug.metrics.constraintAvgCorr = constraintMetrics.sumCorrectionMagnitude / constraintMetrics.correctionCount;
    state.debug.metrics.constraintIters = iters;

    // Detect constraint spike (correction 5× larger than previous frame)
    const spike = constraintMetrics.maxCorrectionMagnitude > constraintMetrics.prevMaxCorrection * 5;
    if (spike && constraintMetrics.maxCorrectionMagnitude > 0.01) {
      logger.sampleEvery('warn', 'constraints', 30, () => ({
        msg: `Constraint spike: ${constraintMetrics.maxCorrectionMagnitude.toFixed(4)}m (5× prev ${constraintMetrics.prevMaxCorrection.toFixed(4)}m)`,
      }));
    }
  }
}

/**
 * Track correction magnitude for metrics (called from enforceDistanceConstraint)
 */
export function recordConstraintCorrection(magnitude) {
  constraintMetrics.maxCorrectionMagnitude = Math.max(constraintMetrics.maxCorrectionMagnitude, magnitude);
  constraintMetrics.sumCorrectionMagnitude += magnitude;
  constraintMetrics.correctionCount++;
}


// Resolves collisions between each wheel particle and the map boundary.
// Uses coefficient of restitution (bounciness) to reflect the velocity
// component normal to the wall.
//
// Strategy: clamp each particle independently, then run the constraint
// solver again (in main.js) to restore body rigidity.
export function handleBoundaryCollisions() {
  const params = state.params;
  const bounciness = params.bounciness;

  const maxX = params.mapWidth;
  const maxY = params.mapHeight;

  for (const wheel of Object.values(state.wheels)) {
    // --- Left wall (x = 0) ---
    if (wheel.x < 0) {
      const velocityX = wheel.x - wheel.prevX;
      wheel.prevX = wheel.x; // place prevX at current position
      wheel.x = 0;
      wheel.prevX = wheel.x - (-velocityX * bounciness); // reflect velocity
    }

    // --- Right wall (x = mapWidth) ---
    if (wheel.x > maxX) {
      const velocityX = wheel.x - wheel.prevX;
      wheel.prevX = wheel.x;
      wheel.x = maxX;
      wheel.prevX = wheel.x - (-velocityX * bounciness);
    }

    // --- Top wall (y = 0) ---
    if (wheel.y < 0) {
      const velocityY = wheel.y - wheel.prevY;
      wheel.prevY = wheel.y;
      wheel.y = 0;
      wheel.prevY = wheel.y - (-velocityY * bounciness);
    }

    // --- Bottom wall (y = mapHeight) ---
    if (wheel.y > maxY) {
      const velocityY = wheel.y - wheel.prevY;
      wheel.prevY = wheel.y;
      wheel.y = maxY;
      wheel.prevY = wheel.y - (-velocityY * bounciness);
    }
  }
}


// Clamps each wheel particle's displacement in a single sub-step to prevent
// tunnelling through walls at high speeds. If a particle moved more than
// MAX_DISPLACEMENT_PER_STEP, its previous position is adjusted so the
// effective velocity is limited. The Verlet integrator will still apply
// acceleration correctly next step.
export function clampParticleDisplacements() {
  for (const wheel of Object.values(state.wheels)) {
    const displacementX = wheel.x - wheel.prevX;
    const displacementY = wheel.y - wheel.prevY;
    const displacementMagnitude = Math.hypot(displacementX, displacementY);

    if (displacementMagnitude > MAX_DISPLACEMENT_PER_STEP) {
      const scale = MAX_DISPLACEMENT_PER_STEP / displacementMagnitude;
      // Adjust prevX/Y so that the stored velocity is clamped.
      wheel.prevX = wheel.x - displacementX * scale;
      wheel.prevY = wheel.y - displacementY * scale;
    }
  }
}
