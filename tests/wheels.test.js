import { beforeEach, describe, expect, it, vi } from 'vitest';

// The real state module reads browser storage during import. Mechanics are not mocked.
vi.hoisted(() => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
});

import state from '../js/state.js';
import { computeTireForces } from '../js/physics/tires.js';
import { initializeCarBody, computeBodyDerivedState } from '../js/physics/kinematics.js';
import { verletIntegrateAllPoints } from '../js/physics/integrator.js';
import { solveRigidBodyConstraints } from '../js/physics/constraints.js';

const initial = structuredClone(state);
const wheelNames = Object.keys(state.wheels);

beforeEach(() => {
  Object.assign(state, structuredClone(initial));
  initializeCarBody(100, 100);
  computeBodyDerivedState(0.01);
  state.engine.currentGear = 'N';
  state.params.idleCreepForce = 0;
});

function setRollingSpeed(speed) {
  state.body.velocityY = -speed;
  state.body.speed = Math.abs(speed);
  for (const name of wheelNames) {
    state.wheelOmega[name] = speed / state.params.wheelRadius;
    state.wheelLoads[name] = state.params.carMassKg * 9.81 / 4;
  }
}

function stepChassis(dt) {
  const force = computeTireForces(dt);
  verletIntegrateAllPoints(dt, force.forceX / state.params.carMassKg,
    force.forceY / state.params.carMassKg, 0);
  solveRigidBodyConstraints();
  computeBodyDerivedState(dt);
}

function kineticEnergy() {
  return 0.5 * state.params.carMassKg * state.body.speed ** 2
    + wheelNames.reduce((sum, name) => sum + 0.5 * state.params.wheelInertia * state.wheelOmega[name] ** 2, 0);
}

describe('persistent wheel inertia', () => {
  it('preserves a free wheel angular momentum without contact or drive torque', () => {
    state.params.tireFrictionCoeff = 0;
    state.wheelOmega.frontLeft = 100;
    for (let i = 0; i < 100; i++) computeTireForces(0.01);
    expect(state.wheelOmega.frontLeft).toBeCloseTo(100, 10);
  });

  it('accumulates constant drive torque according to wheel inertia', () => {
    state.params.tireFrictionCoeff = 0;
    state.params.peakEngineTorqueNm = 12;
    state.params.gearRatio1 = 1;
    state.params.finalDriveRatio = 1;
    state.engine.currentGear = '1';
    state.engine.rpm = 4000;
    state.engine.clutchEngagement = 1;
    state.engine.transmittedTorqueNm = 12;
    state.input.throttleKeyHeld = true;
    for (let i = 0; i < 100; i++) computeTireForces(0.01);
    // 12 N m axle torque, shared by two rear wheels, for one second.
    expect(state.wheelOmega.rearLeft).toBeCloseTo(6 / state.params.wheelInertia, 9);
    expect(state.wheelOmega.frontLeft).toBe(0);
  });
});

describe('passive wheel brakes', () => {
  it.each([10, -10])('slows rolling wheels travelling at %s m/s', (speed) => {
    setRollingSpeed(speed);
    state.input.brakeKeyHeld = true;
    const omega = state.wheelOmega.frontLeft;
    computeTireForces(0.01);
    expect(Math.abs(state.wheelOmega.frontLeft)).toBeLessThan(Math.abs(omega));
    expect(state.wheelBrakeTorque.frontLeft * omega).toBeLessThan(0);
  });

  it.each([30, -30])('brakes a spinning wheel at %s rad/s even without ground contact', (omega) => {
    state.params.tireFrictionCoeff = 0;
    state.params.brakeForce = 12 / (0.4 * state.params.wheelRadius);
    state.input.brakeKeyHeld = true;
    state.wheelOmega.frontLeft = omega;
    computeTireForces(0.01);
    expect(state.wheelOmega.frontLeft).toBeCloseTo(omega - Math.sign(omega) * 0.1, 9);
  });

  it.each([0.01, -0.01])('stops a nearly stationary rotor without reversing it (%s rad/s)', (omega) => {
    state.params.tireFrictionCoeff = 0;
    state.input.brakeKeyHeld = true;
    state.wheelOmega.frontLeft = omega;
    computeTireForces(0.01);
    expect(state.wheelOmega.frontLeft).toBe(0);
    computeTireForces(0.01);
    expect(state.wheelOmega.frontLeft).toBe(0);
  });

  it('does not inject a chassis braking force on frictionless ground', () => {
    setRollingSpeed(10);
    state.params.tireFrictionCoeff = 0;
    state.input.brakeKeyHeld = true;
    const force = computeTireForces(0.01);
    expect(force.forceY).toBe(0);
    expect(state.wheelOmega.frontLeft).toBeLessThan(10 / state.params.wheelRadius);
  });

  it('holds rear drive torque with the handbrake, then spins up when released', () => {
    state.params.tireFrictionCoeff = 0;
    state.params.peakEngineTorqueNm = 12;
    state.params.gearRatio1 = 1;
    state.params.finalDriveRatio = 1;
    state.engine.currentGear = '1';
    state.engine.rpm = 4000;
    state.engine.clutchEngagement = 1;
    state.engine.transmittedTorqueNm = 12;
    state.input.throttleKeyHeld = true;
    state.input.handbrakeKeyHeld = true;
    state.input.handbrakeValue = 1;
    computeTireForces(0.01);
    expect(state.wheelOmega.rearLeft).toBe(0);
    expect(state.wheelBrakeTorque.rearLeft).toBeCloseTo(-6, 10);
    state.input.handbrakeKeyHeld = false;
    state.input.handbrakeValue = 0;
    computeTireForces(0.01);
    expect(state.wheelOmega.rearLeft).toBeCloseTo(6 * 0.01 / state.params.wheelInertia, 10);
  });

  it('continues applying rear brake pressure while the handbrake release ramp decays', () => {
    state.params.tireFrictionCoeff = 0;
    state.params.brakeForce = 1000;
    state.input.handbrakeKeyHeld = false;
    state.input.handbrakeValue = 0.5;
    state.wheelOmega.rearLeft = 10;

    computeTireForces(0.01);

    expect(state.wheelBrakeTorque.rearLeft).toBeCloseTo(-0.5 * 1000 * 0.5 * state.params.wheelRadius, 8);
    expect(state.wheelOmega.rearLeft).toBeLessThan(10);
  });
});

describe('wheel/contact/chassis exchange', () => {
  it('balances contact impulse against rotor angular momentum', () => {
    setRollingSpeed(10);
    state.wheelOmega.frontLeft += 1;
    const old = state.wheelOmega.frontLeft;
    const dt = 0.01;
    computeTireForces(dt);
    const groundImpulse = -state.wheelForces.frontLeft.fy * dt;
    expect(state.params.wheelInertia * (state.wheelOmega.frontLeft - old))
      .toBeCloseTo(-state.params.wheelRadius * groundImpulse, 6);
  });

  it('settles excess wheel spin while transferring impulse and dissipating energy', () => {
    const dt = 0.01;
    setRollingSpeed(10);
    for (const name of wheelNames) {
      state.wheels[name].prevY = state.wheels[name].y + 10 * dt;
      state.wheelOmega[name] += 1;
    }
    computeBodyDerivedState(dt);
    const radius = state.params.wheelRadius;
    const inertia = state.params.wheelInertia;
    const mass = state.params.carMassKg;
    const startEnergy = kineticEnergy();
    const expectedSpeed = (mass * 10 + 4 * inertia * (10 / radius + 1) / radius)
      / (mass + 4 * inertia / radius ** 2);
    for (let i = 0; i < 100; i++) stepChassis(dt);
    expect(-state.body.velocityY).toBeCloseTo(expectedSpeed, 6);
    expect(state.wheelOmega.frontLeft * radius).toBeCloseTo(expectedSpeed, 5);
    expect(kineticEnergy()).toBeLessThan(startEnergy);
  });

  it('converges under constant drive torque as the chassis timestep is refined', () => {
    const speeds = [];
    for (const dt of [0.02, 0.01, 0.005, 0.0025]) {
      Object.assign(state, structuredClone(initial));
      initializeCarBody(100, 100);
      computeBodyDerivedState(dt);
      setRollingSpeed(0);
      state.params.idleCreepForce = 0;
      state.params.gearRatio1 = 1;
      state.params.finalDriveRatio = 1;
      state.params.peakEngineTorqueNm = 200;
      state.engine.currentGear = '1';
      state.engine.rpm = 4000;
      state.engine.clutchEngagement = 1;
      state.engine.transmittedTorqueNm = 200;
      state.input.throttleKeyHeld = true;
      for (let i = 0; i < Math.round(2 / dt); i++) stepChassis(dt);
      speeds.push(-state.body.velocityY);
      expect(Math.max(...Object.values(state.wheelOmega).map(Math.abs))).toBeLessThan(500);
    }
    // Late-time force/mass response with all four rolling wheel inertias included.
    const reference = 2 * (200 / state.params.wheelRadius)
      / (state.params.carMassKg + 4 * state.params.wheelInertia / state.params.wheelRadius ** 2);
    expect(Math.abs(speeds[3] - reference) / reference).toBeLessThan(0.02);
    // An implicit coupled impulse solve can reach this momentum-determined
    // endpoint to the coordinate/root roundoff floor on every grid.
    expect(Math.abs(speeds[2] - speeds[3])).toBeLessThan(Math.max(1e-9, Math.abs(speeds[0] - speeds[1])));
    expect(Math.abs(speeds[1] - speeds[3]) / speeds[3]).toBeLessThan(0.01);
  });
});
