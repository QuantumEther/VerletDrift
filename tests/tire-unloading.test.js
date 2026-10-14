import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
});

import state from '../js/state.js';
import { initializeCarBody, computeBodyDerivedState } from '../js/physics/kinematics.js';
import { computeTireForces } from '../js/physics/tires.js';
import { GRAVITY } from '../js/constants.js';
import { tireGripLimit } from '../js/physics/tire-load.js';

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
  it('retains sliding friction at full slip when the rear wheel is handbrake-locked', () => {
    const name = 'rearLeft';
    state.body.velocityY = -12;
    state.body.speed = 12;
    state.engine.currentGear = 'N';
    state.engine.clutchEngagement = 0;
    state.wheelLoads[name] = quarterWeight();
    state.wheelOmega[name] = 0;
    state.input.handbrakeKeyHeld = true;
    state.input.handbrakeValue = 1;
    computeTireForces(0.1);
    const limit = tireGripLimit(state.wheelLoads[name], state.params.tireFrictionCoeff,
      quarterWeight(), state.params.tireLoadSensitivity);
    const force = state.wheelForces[name];
    expect(state.wheelOmega[name]).toBe(0);
    expect(Math.hypot(force.fx, force.fy)).toBeGreaterThan(limit * 0.8);
    expect(Math.hypot(force.fx, force.fy)).toBeLessThanOrEqual(limit + 1e-6);
  });

  it.each([0.25, 2])('uses the load-sensitive force limit at %s times reference load', ratio => {
    state.wheelLoads.frontLeft = quarterWeight() * ratio;
    state.wheelOmega.frontLeft = 120;
    state.prevTireForce.frontLeft.lon = 6000;
    state.prevTireForce.frontLeft.lat = 6000;
    computeTireForces(0.01);
    const limit = tireGripLimit(state.wheelLoads.frontLeft,
      state.params.tireFrictionCoeff, quarterWeight(), state.params.tireLoadSensitivity);
    expect(frontLeftForceMagnitude()).toBeGreaterThan(0);
    expect(frontLeftForceMagnitude()).toBeLessThanOrEqual(limit + 1e-6);
  });

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
