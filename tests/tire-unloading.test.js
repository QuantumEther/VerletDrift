import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
});

import state from '../js/state.js';
import { initializeCarBody, computeBodyDerivedState } from '../js/physics/kinematics.js';
import { computeTireForces } from '../js/physics/tires.js';
import { GRAVITY } from '../js/constants.js';

const initial = structuredClone(state);
const quarterWeight = () => state.params.carMassKg * GRAVITY / 4;

beforeEach(() => {
  Object.assign(state, structuredClone(initial));
  initializeCarBody(100, 100);
  computeBodyDerivedState(0.01);
  state.engine.currentGear = 'N';
  state.params.idleCreepForce = 0;
  state.body.velocityX = 4;
  state.body.velocityY = -10;
  state.body.speed = Math.hypot(state.body.velocityX, state.body.velocityY);
  for (const name of Object.keys(state.wheelLoads)) state.wheelLoads[name] = quarterWeight();
  for (const name of Object.keys(state.wheelOmega)) {
    state.wheelOmega[name] = 10 / state.params.wheelRadius;
  }
});

function frontLeftForceMagnitude() {
  const force = state.wheelForces.frontLeft;
  return Math.hypot(force.fx, force.fy);
}

describe('tire force during wheel unloading and recontact', () => {
  it('removes stale tire force as soon as normal load reaches zero', () => {
    state.prevTireForce.frontLeft.lon = 1200;
    state.prevTireForce.frontLeft.lat = 900;
    state.wheelLoads.frontLeft = 0;

    computeTireForces(0.01);

    expect(frontLeftForceMagnitude()).toBeLessThan(1e-8);
    expect(state.prevTireForce.frontLeft.lon).toBe(0);
    expect(state.prevTireForce.frontLeft.lat).toBe(0);
    expect(state.wheelFrictionUtil.frontLeft).toBe(0);
  });

  it('rebuilds force through tire relaxation when normal load returns', () => {
    state.prevTireForce.frontLeft.lon = 1200;
    state.prevTireForce.frontLeft.lat = 900;
    state.wheelLoads.frontLeft = 0;
    computeTireForces(0.01);

    state.wheelLoads.frontLeft = quarterWeight();
    computeTireForces(0.01);

    const frictionLimit = quarterWeight() * state.params.tireFrictionCoeff;
    expect(frontLeftForceMagnitude()).toBeGreaterThan(0);
    expect(frontLeftForceMagnitude()).toBeLessThan(frictionLimit * 0.75);
    expect(frontLeftForceMagnitude()).toBeLessThanOrEqual(frictionLimit + 1e-6);
  });
});
