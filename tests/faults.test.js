/**
 * Unit tests for fault detection & escalation system
 * Tests: cross-suppression isolation, startup false-positive guard,
 * one-shot freeze latch, and fault timer independence.
 *
 * state.js uses localStorage at module-load time (soundParams), so we mock it
 * here. vi.hoisted() ensures the mock object exists when vi.mock() factory runs.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Hoist the mock state so vi.mock factory can reference it ──────────────────
const { mockState } = vi.hoisted(() => {
  const mockState = {
    body: {
      centerX: 0, centerY: 0, heading: 0,
      velocityX: 0, velocityY: 0, angularVelocity: 0,
    },
    wheels: {
      frontLeft: { x: 0, y: 0 },
      frontRight: { x: 0, y: 0 },
      rearLeft: { x: 0, y: 0 },
      rearRight: { x: 0, y: 0 },
    },
    wheelOmega: { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 },
    wheelSlipRatio: { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 },
    wheelSlipAngle: { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 },
    debug: {
      metrics: {
        constraintMaxCorr: 0,
        prevConstraintMaxCorr: 0,
      },
      faults: {
        freezeOnError: false,
        isFrozen: false,
      },
    },
    loop: {
      droppedSubstepsLastFrame: 0,
    },
  };
  return { mockState };
});

vi.mock('../js/state.js', () => ({
  default: mockState,
  physicsState: mockState,
  renderState: mockState,
  uiState: mockState,
}));

import {
  checkWheelOmegaRunaway,
  checkConstraintHealth,
  markFreezeEntered,
  resetFaultState,
} from '../js/debug/faults.js';
import {
  initEvents,
  findEventsByType,
  getEventCount,
} from '../js/debug/events.js';

// ── Reset helpers ─────────────────────────────────────────────────────────────

function resetAll() {
  resetFaultState();
  initEvents(200);

  mockState.wheelOmega = { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 };
  mockState.debug.metrics.constraintMaxCorr = 0;
  mockState.debug.metrics.prevConstraintMaxCorr = 0;
  mockState.debug.faults.isFrozen = false;
  mockState.debug.faults.freezeOnError = false;
}

beforeEach(resetAll);

// ─────────────────────────────────────────────────────────────────────────────
// Fault timer independence (cross-suppression regression)
// ─────────────────────────────────────────────────────────────────────────────

describe('Fault timer independence', () => {
  it('omega runaway should not suppress a simultaneous constraint spike', () => {
    mockState.wheelOmega.frontLeft = 1500; // > MAX_OMEGA (1000)
    checkWheelOmegaRunaway();
    expect(findEventsByType('omega_runaway', 5).length).toBe(1);

    // Immediately — must NOT be suppressed by the omega timer
    mockState.debug.metrics.prevConstraintMaxCorr = 0.01;
    mockState.debug.metrics.constraintMaxCorr = 0.1; // 10× prev
    checkConstraintHealth();
    expect(findEventsByType('constraint_spike', 5).length).toBe(1);

    expect(getEventCount()).toBeGreaterThanOrEqual(2);
  });

  it('constraint spike should not suppress a simultaneous omega runaway', () => {
    mockState.debug.metrics.prevConstraintMaxCorr = 0.01;
    mockState.debug.metrics.constraintMaxCorr = 0.1;
    checkConstraintHealth();
    expect(findEventsByType('constraint_spike', 5).length).toBe(1);

    mockState.wheelOmega.rearLeft = 2000;
    checkWheelOmegaRunaway();
    expect(findEventsByType('omega_runaway', 5).length).toBe(1);
  });

  it('omega timer deduplicates its own events but does not affect constraint timer', () => {
    mockState.wheelOmega.frontLeft = 1500;
    checkWheelOmegaRunaway();
    expect(findEventsByType('omega_runaway', 5).length).toBe(1);

    // Second omega call within 1s — correctly suppressed by its own timer
    mockState.wheelOmega.frontRight = 1500;
    checkWheelOmegaRunaway();
    expect(findEventsByType('omega_runaway', 5).length).toBe(1);

    // Constraint spike must not be suppressed by the omega timer
    mockState.debug.metrics.prevConstraintMaxCorr = 0.01;
    mockState.debug.metrics.constraintMaxCorr = 0.1;
    checkConstraintHealth();
    expect(findEventsByType('constraint_spike', 5).length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Startup false-positive guard
// ─────────────────────────────────────────────────────────────────────────────

describe('Constraint spike startup guard', () => {
  it('should NOT fire when prevConstraintMaxCorr is exactly 0', () => {
    mockState.debug.metrics.prevConstraintMaxCorr = 0;
    mockState.debug.metrics.constraintMaxCorr = 0.0005;

    checkConstraintHealth();

    expect(findEventsByType('constraint_spike', 5).length).toBe(0);
  });

  it('should NOT fire when prev is below minimum threshold (0.001m)', () => {
    mockState.debug.metrics.prevConstraintMaxCorr = 0.0005; // below 0.001m guard
    mockState.debug.metrics.constraintMaxCorr = 0.01; // 20× — would trigger without guard

    checkConstraintHealth();

    expect(findEventsByType('constraint_spike', 5).length).toBe(0);
  });

  it('should fire when prev >= 0.001m AND current > 5× prev', () => {
    mockState.debug.metrics.prevConstraintMaxCorr = 0.01; // above threshold
    mockState.debug.metrics.constraintMaxCorr = 0.06; // 6× — above 5× threshold

    checkConstraintHealth();

    expect(findEventsByType('constraint_spike', 5).length).toBe(1);
  });

  it('should NOT fire when current is less than 5× prev (not a spike)', () => {
    mockState.debug.metrics.prevConstraintMaxCorr = 0.01;
    mockState.debug.metrics.constraintMaxCorr = 0.04; // 4× — below 5× threshold

    checkConstraintHealth();

    expect(findEventsByType('constraint_spike', 5).length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// One-shot freeze latch
// ─────────────────────────────────────────────────────────────────────────────

describe('sim_frozen one-shot latch', () => {
  it('should fire exactly one event on first call', () => {
    markFreezeEntered();

    expect(findEventsByType('sim_frozen', 10).length).toBe(1);
  });

  it('should NOT fire additional events on repeated calls', () => {
    markFreezeEntered();
    markFreezeEntered();
    markFreezeEntered();

    expect(findEventsByType('sim_frozen', 10).length).toBe(1);
  });

  it('should allow a new event after resetFaultState()', () => {
    markFreezeEntered();
    expect(findEventsByType('sim_frozen', 10).length).toBe(1);

    resetFaultState();
    initEvents(200); // clear buffer for clean count
    markFreezeEntered();
    expect(findEventsByType('sim_frozen', 10).length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resetFaultState completeness
// ─────────────────────────────────────────────────────────────────────────────

describe('resetFaultState', () => {
  it('should clear omega timer so next call fires immediately', () => {
    mockState.wheelOmega.frontLeft = 1500;
    checkWheelOmegaRunaway();
    expect(findEventsByType('omega_runaway', 5).length).toBe(1);

    // Within dedup window — suppressed
    checkWheelOmegaRunaway();
    expect(findEventsByType('omega_runaway', 5).length).toBe(1);

    // After reset (clears fault timer AND event buffer dedup window), fires again
    resetFaultState();
    initEvents(200); // clear buffer dedup state so dedupeKey doesn't suppress
    checkWheelOmegaRunaway();
    expect(findEventsByType('omega_runaway', 5).length).toBe(1);
  });

  it('should clear constraint timer so next call fires immediately', () => {
    mockState.debug.metrics.prevConstraintMaxCorr = 0.01;
    mockState.debug.metrics.constraintMaxCorr = 0.1;
    checkConstraintHealth();
    expect(findEventsByType('constraint_spike', 5).length).toBe(1);

    // Suppressed
    checkConstraintHealth();
    expect(findEventsByType('constraint_spike', 5).length).toBe(1);

    // After reset (clears fault timer AND event buffer dedup window), fires again
    resetFaultState();
    initEvents(200); // clear buffer dedup state so dedupeKey doesn't suppress
    checkConstraintHealth();
    expect(findEventsByType('constraint_spike', 5).length).toBe(1);
  });
});
