import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { globalThis.localStorage = { getItem: () => null, setItem: () => {} }; });
import state from '../js/state.js';
import { GRAVITY, CAR_HALF_LENGTH as L, CAR_HALF_WIDTH as W } from '../js/constants.js';
import { updateSuspension, resetSuspension } from '../js/physics/suspension.js';
import { tireGripLimit } from '../js/physics/tire-load.js';

const initial = structuredClone(state);
const total = () => Object.values(state.wheelLoads).reduce((a, b) => a + b, 0);
const lateralDifference = () => state.wheelLoads.frontLeft + state.wheelLoads.rearLeft
  - state.wheelLoads.frontRight - state.wheelLoads.rearRight;
const axleDifference = () => state.wheelLoads.rearLeft + state.wheelLoads.rearRight
  - state.wheelLoads.frontLeft - state.wheelLoads.frontRight;
function advance(seconds, dt = 0.01) {
  for (let i = 0; i < Math.round(seconds / dt); i++) updateSuspension(dt);
}
beforeEach(() => {
  Object.assign(state, structuredClone(initial));
  resetSuspension();
});

describe('flat-road sprung chassis', () => {
  it('spawns in static equilibrium without a bounce', () => {
    advance(2);
    expect(state.suspension.heave).toBeCloseTo(0, 12);
    expect(state.suspension.roll).toBeCloseTo(0, 12);
    for (const n of Object.values(state.wheelLoads)) expect(n).toBeCloseTo(1200 * GRAVITY / 4, 8);
  });

  it.each([3, -3])('settles to the expected longitudinal transfer for acceleration %s', ax => {
    state.body.longitudinalAccel = ax;
    advance(4);
    const moment = ax * 1200 * 0.5;
    expect(axleDifference()).toBeCloseTo(moment / L, 3);
    expect(total()).toBeCloseTo(1200 * GRAVITY, 6);
    expect(Math.sign(state.suspension.pitch)).toBe(Math.sign(ax));
  });

  it.each([4, -4])('loads the outside wheels in a sustained turn with acceleration %s', ay => {
    state.body.lateralAccel = ay;
    advance(4);
    const moment = ay * 1200 * 0.5;
    expect(lateralDifference()).toBeCloseTo(moment / W, 3);
    expect(Math.sign(state.suspension.roll)).toBe(-Math.sign(ay));
  });

  it('damper changes affect the transition, while steady transfer remains the same', () => {
    const responses = [];
    for (const damping of [800, 4000]) {
      state.params.damperRateFront = state.params.damperRateRear = damping;
      resetSuspension();
      state.body.lateralAccel = 4;
      advance(0.15);
      const transient = state.suspension.roll;
      advance(6);
      responses.push({ transient, final: lateralDifference() });
    }
    expect(Math.abs(responses[0].transient - responses[1].transient)).toBeGreaterThan(0.002);
    expect(responses[0].final).toBeCloseTo(responses[1].final, 2);
  });

  it('a stiffer front bar shifts lateral transfer toward the front axle', () => {
    const results = [];
    for (const stiffness of [0, 30000]) {
      state.params.antiRollStiffnessFront = stiffness;
      resetSuspension();
      state.body.lateralAccel = 4;
      advance(4);
      results.push({ front: state.wheelLoads.frontLeft - state.wheelLoads.frontRight,
        total: lateralDifference() });
    }
    expect(results[1].front).toBeGreaterThan(results[0].front);
    expect(results[1].total).toBeCloseTo(results[0].total, 3);
  });

  it('vertical road force follows heave acceleration, rather than being normalized to weight', () => {
    state.suspension.heave = 0.01;
    const oldVelocity = state.suspension.heaveVelocity;
    updateSuspension(0.01);
    const sprungMass = 1200 - 4 * 35;
    expect(total()).toBeGreaterThan(1200 * GRAVITY);
    const acceleration = (state.suspension.heaveVelocity - oldVelocity) / 0.01;
    expect(total()).toBeCloseTo(1200 * GRAVITY - sprungMass * acceleration, 8);
    advance(3);
    expect(Math.abs(state.suspension.heave)).toBeLessThan(1e-5);
  });

  it('permits unloading and rebuilds contact after a large roll disturbance', () => {
    state.suspension.roll = 0.15;
    updateSuspension(0.001);
    expect(state.wheelLoads.frontLeft).toBe(0);
    expect(state.suspension.contact.frontLeft).toBe(false);
    advance(4);
    expect(Object.values(state.wheelLoads).every(n => Number.isFinite(n) && n > 0)).toBe(true);
    expect(Math.abs(state.suspension.roll)).toBeLessThan(1e-5);
  });

  it('converges as the chassis timestep is refined', () => {
    const results = [];
    for (const dt of [0.02, 0.01, 0.005]) {
      resetSuspension();
      state.body.longitudinalAccel = -4;
      state.body.lateralAccel = 5;
      advance(0.4, dt);
      results.push({ roll: state.suspension.roll, pitch: state.suspension.pitch, load: lateralDifference() });
    }
    for (const r of results) {
      expect(r.roll).toBeCloseTo(results[2].roll, 8);
      expect(r.pitch).toBeCloseTo(results[2].pitch, 8);
      // Tick averages cover different intervals, so compare loads with a tolerance.
      expect(Math.abs(r.load - results[2].load)).toBeLessThan(30);
    }
  });

  it('dissipates a small free roll disturbance without gaining mechanical energy', () => {
    state.suspension.roll = 0.02;
    const m = 1200 - 4 * 35;
    const inertia = m * (W * W + 0.25 ** 2) / 3;
    const stiffness = 4 * 35000 * W * W + 12000 + 8000;
    const energy = () => 0.5 * inertia * state.suspension.rollVelocity ** 2
      + 0.5 * stiffness * state.suspension.roll ** 2;
    let previous = energy();
    for (let i = 0; i < 1000; i++) {
      updateSuspension(0.001);
      expect(energy()).toBeLessThanOrEqual(previous + 1e-6);
      previous = energy();
    }
    expect(previous).toBeLessThan(0.001);
  });

  it('resets suspension history when toggled and supports the comparison model', () => {
    state.body.lateralAccel = 3;
    advance(0.2);
    state.params.suspensionEnabled = false;
    updateSuspension(0.01);
    expect(total()).toBeCloseTo(1200 * GRAVITY, 8);
    expect(lateralDifference()).toBeGreaterThan(0);
    state.params.suspensionEnabled = true;
    state.body.lateralAccel = 0;
    updateSuspension(0.01);
    expect(state.suspension.roll).toBe(0);
  });
});

describe('load-sensitive tire peaks', () => {
  it('preserves nominal grip and gives unevenly loaded tires less total peak grip', () => {
    const reference = 3000;
    expect(tireGripLimit(reference, 1, reference, 0.12)).toBe(reference);
    const uneven = tireGripLimit(1000, 1, reference, 0.12) + tireGripLimit(5000, 1, reference, 0.12);
    expect(uneven).toBeLessThan(6000);
    expect(tireGripLimit(0, 1, reference, 0.12)).toBe(0);
    expect(tireGripLimit(6000, 1, reference, 0)).toBe(6000);
  });
});
