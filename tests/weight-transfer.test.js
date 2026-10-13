import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
});

import state from '../js/state.js';
import { GRAVITY } from '../js/constants.js';
import { computeWeightTransfer } from '../js/physics/weight.js';

const initial = structuredClone(state);
const wheelNames = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'];

beforeEach(() => {
  Object.assign(state, structuredClone(initial));
  state.body.longitudinalAccel = 0;
  state.body.lateralAccel = 0;
});

function loads() {
  computeWeightTransfer();
  return state.wheelLoads;
}

function totalLoad(result) {
  return wheelNames.reduce((total, name) => total + result[name], 0);
}

describe('conserved four-wheel load transfer', () => {
  it('splits static vehicle weight evenly across the four wheels', () => {
    const result = loads();
    const quarterWeight = state.params.carMassKg * GRAVITY / 4;

    for (const name of wheelNames) expect(result[name]).toBeCloseTo(quarterWeight, 10);
    expect(totalLoad(result)).toBeCloseTo(state.params.carMassKg * GRAVITY, 10);
  });

  it('moves load rearward under forward acceleration and forward under braking', () => {
    state.body.longitudinalAccel = 3;
    let result = loads();
    expect(result.rearLeft + result.rearRight).toBeGreaterThan(result.frontLeft + result.frontRight);
    expect(totalLoad(result)).toBeCloseTo(state.params.carMassKg * GRAVITY, 10);

    state.body.longitudinalAccel = -3;
    result = loads();
    expect(result.frontLeft + result.frontRight).toBeGreaterThan(result.rearLeft + result.rearRight);
    expect(totalLoad(result)).toBeCloseTo(state.params.carMassKg * GRAVITY, 10);
  });

  it('splits lateral transfer between axles and shifts load toward the outside wheels', () => {
    state.body.lateralAccel = 3;
    const result = loads();
    const sideLoadDifference = result.frontRight + result.rearRight
      - result.frontLeft - result.rearLeft;
    const expectedSideDifference = state.params.carMassKg * 3 * state.params.cogHeight / 0.8;

    expect(result.frontRight).toBeGreaterThan(result.frontLeft);
    expect(result.rearRight).toBeGreaterThan(result.rearLeft);
    expect(sideLoadDifference).toBeCloseTo(expectedSideDifference, 10);
    expect(totalLoad(result)).toBeCloseTo(state.params.carMassKg * GRAVITY, 10);
  });

  it('preserves total load and nonnegative wheel loads under combined transfer', () => {
    state.body.longitudinalAccel = -7;
    state.body.lateralAccel = -6;
    const result = loads();

    expect(Math.min(...wheelNames.map((name) => result[name]))).toBeGreaterThanOrEqual(0);
    expect(totalLoad(result)).toBeCloseTo(state.params.carMassKg * GRAVITY, 10);
  });

  it('handles wheel lift-off without losing total normal load', () => {
    state.params.cogHeight = 4;
    state.body.longitudinalAccel = 100;
    state.body.lateralAccel = 100;
    const result = loads();

    expect(result.frontLeft).toBe(0);
    expect(result.frontRight).toBe(0);
    expect(result.rearLeft).toBeCloseTo(state.params.carMassKg * GRAVITY / 2, 10);
    expect(result.rearRight).toBeCloseTo(state.params.carMassKg * GRAVITY / 2, 10);
    expect(totalLoad(result)).toBeCloseTo(state.params.carMassKg * GRAVITY, 10);
  });
});
