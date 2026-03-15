/**
 * Fault Detection & Escalation System
 * Monitors physics state for invalid conditions and records faults to event buffer
 * with escalation policy: warn → event → error → freeze
 */

import { logger } from './logger.js';
import { eventBuffer } from './events.js';
import { physicsState as state } from '../state.js';

// Fault state tracking — each fault class has its own timer to prevent cross-suppression.
// Initialized to -Infinity so the first call always fires regardless of performance.now() value.
const faultState = {
  lastNonFiniteFault: -Infinity,
  lastConstraintSpikeFault: -Infinity,
  lastOmegaRunawayFault: -Infinity,
  lastSlipAnomaly: -Infinity,
  lastTimingAnomaly: -Infinity,
};

const DEDUPE_INTERVAL_MS = 1000; // Don't spam same fault more than once per second

// One-shot latch: fires exactly once per freeze entry, reset by resetFaultState()
let frozenEventFired = false;

/**
 * Record freeze entry — fires a single sim_frozen event to the ring buffer.
 * Called by main.js immediately when isFrozen transitions false→true.
 * Subsequent calls within the same freeze have no effect.
 */
export function markFreezeEntered() {
  if (frozenEventFired) return;
  frozenEventFired = true;
  if (eventBuffer) {
    eventBuffer.pushEvent({
      level: 'warn',
      channel: 'main',
      type: 'sim_frozen',
      msg: 'Simulation frozen due to fault — check console and overlays for details',
    });
  }
}

/**
 * Check for non-finite values in physics state (NaN, Infinity)
 * Called every render frame
 */
export function checkNonFinites() {
  const now = performance.now();
  const body = state.body;
  const wheels = state.wheels;

  const checks = [
    { name: 'centerX', value: body.centerX },
    { name: 'centerY', value: body.centerY },
    { name: 'heading', value: body.heading },
    { name: 'velocityX', value: body.velocityX },
    { name: 'velocityY', value: body.velocityY },
    { name: 'angularVelocity', value: body.angularVelocity },
    { name: 'wheelFL.x', value: wheels.frontLeft.x },
    { name: 'wheelFL.y', value: wheels.frontLeft.y },
    { name: 'wheelFR.x', value: wheels.frontRight.x },
    { name: 'wheelFR.y', value: wheels.frontRight.y },
    { name: 'wheelRL.x', value: wheels.rearLeft.x },
    { name: 'wheelRL.y', value: wheels.rearLeft.y },
    { name: 'wheelRR.x', value: wheels.rearRight.x },
    { name: 'wheelRR.y', value: wheels.rearRight.y },
  ];

  for (const check of checks) {
    if (!isFinite(check.value)) {
      const severity = isNaN(check.value) ? 'warn' : 'error';
      if (now - faultState.lastNonFiniteFault > DEDUPE_INTERVAL_MS) {
        faultState.lastNonFiniteFault = now;
        const msg = `Non-finite ${check.name}: ${check.value}`;
        logger[severity]('fault', msg);
        if (eventBuffer) {
          eventBuffer.pushEvent({
            level: severity,
            channel: 'fault',
            type: 'non_finite',
            msg,
            data: { field: check.name, value: check.value },
            dedupeKey: `non_finite:${check.name}`,
          });
        }
        if (severity === 'error' && state.debug.faults.freezeOnError) {
          state.debug.faults.isFrozen = true;
        }
      }
    }
  }
}

/**
 * Check for wheel omega runaway (> 1000 rad/s indicates instability)
 * Called every physics substep
 */
export function checkWheelOmegaRunaway() {
  const now = performance.now();
  const MAX_OMEGA = 1000; // rad/s

  for (const [name, omega] of Object.entries(state.wheelOmega || {})) {
    if (Math.abs(omega) > MAX_OMEGA) {
      if (now - faultState.lastOmegaRunawayFault > DEDUPE_INTERVAL_MS) {
        faultState.lastOmegaRunawayFault = now;
        const msg = `Wheel ${name} omega runaway: ${omega.toFixed(1)} rad/s`;
        logger.warn('fault', msg);
        if (eventBuffer) {
          eventBuffer.pushEvent({
            level: 'warn',
            channel: 'fault',
            type: 'omega_runaway',
            msg,
            data: { wheel: name, omega },
            dedupeKey: `omega_runaway:${name}`,
          });
        }
      }
    }
  }
}

/**
 * Check for constraint solver issues (spikes, under-convergence)
 * Called every physics substep
 */
export function checkConstraintHealth() {
  const now = performance.now();
  const metrics = state.debug.metrics;

  // Correction spike detection: current max > 5× previous frame
  // Guard: skip ratio check when previous frame is near-zero (startup / resting state)
  // to prevent false-positive spikes on the first frames with active constraints.
  const MIN_CORRECTION_THRESHOLD = 0.001; // 1mm — below this the ratio is meaningless
  if (
    metrics.prevConstraintMaxCorr > MIN_CORRECTION_THRESHOLD &&
    metrics.constraintMaxCorr > metrics.prevConstraintMaxCorr * 5
  ) {
    if (now - faultState.lastConstraintSpikeFault > DEDUPE_INTERVAL_MS) {
      faultState.lastConstraintSpikeFault = now;
      const msg = `Constraint spike: ${metrics.constraintMaxCorr.toFixed(4)}m`;
      logger.warn('fault', msg);
      if (eventBuffer) {
        eventBuffer.pushEvent({
          level: 'warn',
          channel: 'fault',
          type: 'constraint_spike',
          msg,
          data: { magnitude: metrics.constraintMaxCorr },
          dedupeKey: 'constraint_spike',
        });
      }
    }
  }

  // Large correction magnitude indicates instability
  if (metrics.constraintMaxCorr > 1.0) {
    logger.sampleEvery('warn', 'fault', 50, () =>
      `Large constraint correction: ${metrics.constraintMaxCorr.toFixed(4)}m (instability warning)`
    );
  }
}

/**
 * Check for slip ratio/angle anomalies (invalid physics state)
 * Called every physics substep
 */
export function checkSlipAnomalies() {
  const now = performance.now();
  const slipRatio = state.wheelSlipRatio || {};
  const slipAngle = state.wheelSlipAngle || {};

  for (const [name, kappa] of Object.entries(slipRatio)) {
    // tires.js clamps κ to [-1.0, 1.0] before storing. Threshold > 1.01 catches
    // any code path that bypasses the clamp (physics bug or NaN propagation).
    if (Math.abs(kappa) > 1.01) {
      if (now - faultState.lastSlipAnomaly > DEDUPE_INTERVAL_MS) {
        faultState.lastSlipAnomaly = now;
        const msg = `Slip ratio out of bounds: ${name}=${kappa.toFixed(2)} (tires.js clamps to ±1.0)`;
        logger.warn('fault', msg);
      }
    }
  }

  for (const [name, alpha] of Object.entries(slipAngle)) {
    // tires.js computes slipAngle = atan2(vLat, slipDenom) with slipDenom >= 0.5 > 0,
    // so the result is always in (-π/2, π/2). Threshold π/2 - 0.1 (~84°) catches
    // extreme-but-not-yet-mathematically-impossible values for future proofing.
    if (Math.abs(alpha) > Math.PI / 2 - 0.1) {
      if (now - faultState.lastSlipAnomaly > DEDUPE_INTERVAL_MS) {
        faultState.lastSlipAnomaly = now;
        const msg = `Slip angle extreme: ${name}=${(alpha * 180 / Math.PI).toFixed(1)}° (near ±90° limit)`;
        logger.warn('fault', msg);
      }
    }
  }
}

/**
 * Check for timing anomalies (frame drops, high dt)
 * Called every render frame
 */
export function checkTimingAnomalies(wallFrameTimeMs) {
  const now = performance.now();
  const MAX_FRAME_TIME = 100; // ms (frame drops indicate < 10 FPS)

  if (wallFrameTimeMs > MAX_FRAME_TIME) {
    if (now - faultState.lastTimingAnomaly > DEDUPE_INTERVAL_MS) {
      faultState.lastTimingAnomaly = now;
      const msg = `High frame time: ${wallFrameTimeMs.toFixed(1)}ms (frame drop or tab background)`;
      logger.warn('fault', msg);
      if (eventBuffer) {
        eventBuffer.pushEvent({
          level: 'warn',
          channel: 'fault',
          type: 'frame_drop',
          msg,
          data: { frameTimeMs: wallFrameTimeMs },
          dedupeKey: 'frame_drop',
        });
      }
    }
  }

  // Check for dropped physics substeps
  if (state.loop.droppedSubstepsLastFrame > 2) {
    if (now - faultState.lastTimingAnomaly > DEDUPE_INTERVAL_MS) {
      faultState.lastTimingAnomaly = now;
      const msg = `Physics substeps dropped: ${state.loop.droppedSubstepsLastFrame} (CPU overload)`;
      logger.warn('fault', msg);
      if (eventBuffer) {
        eventBuffer.pushEvent({
          level: 'warn',
          channel: 'fault',
          type: 'substep_drop',
          msg,
          data: { dropped: state.loop.droppedSubstepsLastFrame },
          dedupeKey: 'substep_drop',
        });
      }
    }
  }
}

/**
 * Main fault check function called from main.js
 * @param {string} phase - 'physics' or 'render' to indicate which checks to run
 * @param {number} wallFrameTimeMs - Current frame time in ms (for render phase)
 */
export function checkFaults(phase = 'render', wallFrameTimeMs = 0) {
  if (phase === 'render') {
    checkNonFinites();
    checkTimingAnomalies(wallFrameTimeMs);
  } else if (phase === 'physics') {
    checkWheelOmegaRunaway();
    checkConstraintHealth();
    checkSlipAnomalies();
  }
}

/**
 * Reset fault state (call at simulation reset)
 */
export function resetFaultState() {
  faultState.lastNonFiniteFault = -Infinity;
  faultState.lastConstraintSpikeFault = -Infinity;
  faultState.lastOmegaRunawayFault = -Infinity;
  faultState.lastSlipAnomaly = -Infinity;
  faultState.lastTimingAnomaly = -Infinity;
  frozenEventFired = false;
}

export default {
  checkFaults,
  checkNonFinites,
  checkWheelOmegaRunaway,
  checkConstraintHealth,
  checkSlipAnomalies,
  checkTimingAnomalies,
  resetFaultState,
};
