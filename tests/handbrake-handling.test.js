import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
});

import state from '../js/state.js';
import { CAR_HALF_LENGTH, CAR_HALF_WIDTH } from '../js/constants.js';
import { initializeCarBody, computeBodyDerivedState } from '../js/physics/kinematics.js';
import { updateSuspension } from '../js/physics/suspension.js';
import { computeTireForces, computeDragForces } from '../js/physics/tires.js';
import { verletIntegrateAllPoints } from '../js/physics/integrator.js';
import { solveRigidBodyConstraints } from '../js/physics/constraints.js';

const initial = structuredClone(state);

// A fixed simulated-time maneuver through the production mechanical modules.
// Steering is held at a specified road-wheel angle; engine is in neutral.
function runTurn({ handbrake, steering = 0.22, dt = 0.01 }) {
  Object.assign(state, structuredClone(initial));
  initializeCarBody(100, 100);
  for (const [name, wheel] of Object.entries(state.wheels)) {
    wheel.prevY = wheel.y + 18 * dt;
    state.wheelOmega[name] = 18 / state.params.wheelRadius;
  }
  computeBodyDerivedState(dt);
  state.engine.currentGear = 'N';
  state.engine.clutchEngagement = 0;
  state.steering.frontWheelAngle = steering;
  const mass = state.params.carMassKg;
  const inertia = mass * (CAR_HALF_LENGTH ** 2 + CAR_HALF_WIDTH ** 2) / 3;
  for (let i = 0; i < Math.round(1 / dt); i++) {
    state.input.handbrakeKeyHeld = handbrake && i * dt >= 0.25;
    state.input.handbrakeValue = state.input.handbrakeKeyHeld
      ? Math.min(1, state.input.handbrakeValue + dt / 0.25)
      : Math.max(0, state.input.handbrakeValue - dt / 0.15);
    updateSuspension(dt);
    const tire = computeTireForces(dt);
    const drag = computeDragForces();
    verletIntegrateAllPoints(dt, (tire.forceX + drag.forceX) / mass,
      (tire.forceY + drag.forceY) / mass,
      tire.torque / inertia - state.params.yawDamping * state.body.angularVelocity);
    solveRigidBodyConstraints();
    solveRigidBodyConstraints();
    computeBodyDerivedState(dt);
  }
  const b = state.body;
  return {
    speed: b.speed,
    yaw: b.angularVelocity,
    sideslip: Math.atan2(
      b.velocityX * Math.cos(b.heading) + b.velocityY * Math.sin(b.heading),
      b.velocityX * Math.sin(b.heading) - b.velocityY * Math.cos(b.heading),
    ) * 180 / Math.PI,
    rearOmega: Math.max(Math.abs(state.wheelOmega.rearLeft), Math.abs(state.wheelOmega.rearRight)),
  };
}

describe('handbrake handling through tire, suspension and chassis dynamics', () => {
  it.each([0.02, 0.01, 0.005])('rear lock produces oversteer during a turn at dt=%s', dt => {
    const coast = runTurn({ handbrake: false, dt });
    const locked = runTurn({ handbrake: true, dt });
    expect(locked.rearOmega).toBe(0);
    expect(Math.abs(locked.sideslip)).toBeGreaterThan(Math.abs(coast.sideslip) + 10);
    expect(locked.speed).toBeLessThan(coast.speed);
  });

  it('slows a symmetric straight run without creating yaw or sideways motion', () => {
    const coast = runTurn({ handbrake: false, steering: 0 });
    const locked = runTurn({ handbrake: true, steering: 0 });
    expect(locked.rearOmega).toBe(0);
    expect(locked.speed).toBeLessThan(coast.speed);
    expect(locked.sideslip).toBeCloseTo(0, 7);
    expect(locked.yaw).toBeCloseTo(0, 7);
  });
});
