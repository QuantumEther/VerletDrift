import { beforeEach, describe, expect, it } from 'vitest';
import state from '../js/state.js';
import { initializeCarBody, computeBodyDerivedState } from '../js/physics/kinematics.js';
import { readPlanarMotion } from '../js/physics/planar-motion.js';
import { verletIntegrateAllPoints } from '../js/physics/integrator.js';
import { solveRigidBodyConstraints } from '../js/physics/constraints.js';
import { computeWeightTransfer } from '../js/physics/weight.js';
import { resetSuspension, updateSuspension } from '../js/physics/suspension.js';
import { physicalGeometry } from '../js/physics/vehicle-geometry.js';

const asymmetric = Object.freeze({
  wheelbase: 2.7,
  frontTrack: 1.55,
  rearTrack: 1.62,
  centerOfMassOffset: 0.25,
});

describe('physical vehicle geometry', () => {
  beforeEach(() => {
    state.physicalGeometry = asymmetric;
    state.params.carMassKg = 1320;
    state.params.cogHeight = 0.52;
    state.body.longitudinalAccel = 0;
    state.body.lateralAccel = 0;
    initializeCarBody(50, 60);
  });

  it('places wheel points relative to the specified center of mass', () => {
    const g = physicalGeometry(asymmetric);
    for (const [name, p] of Object.entries(g.coordinates)) {
      expect(state.wheels[name].x).toBeCloseTo(50 + p.x, 12);
      expect(state.wheels[name].y).toBeCloseTo(60 + p.y, 12);
    }
    expect(readPlanarMotion(0.01).centerX).toBeCloseTo(50, 12);
    expect(readPlanarMotion(0.01).centerY).toBeCloseTo(60, 12);
  });

  it('uses the offset center of mass for static axle loads and yaw inertia', () => {
    computeWeightTransfer();
    const total = state.params.carMassKg * 9.81;
    const front = state.wheelLoads.frontLeft + state.wheelLoads.frontRight;
    const rear = state.wheelLoads.rearLeft + state.wheelLoads.rearRight;
    expect(front).toBeCloseTo(total * (0.5 - asymmetric.centerOfMassOffset / asymmetric.wheelbase), 10);
    expect(rear).toBeCloseTo(total - front, 10);
    expect(physicalGeometry(asymmetric).yawInertia(1320)).toBeCloseTo(
      1320 * ((2.7 ** 2 + ((1.55 + 1.62) / 2) ** 2) / 12 - 0.25 ** 2), 10,
    );
  });

  it('initializes suspension support to the asymmetric static axle loads', () => {
    resetSuspension();
    updateSuspension(0.01);
    const expectedFront = 1320 * 9.81 * (0.5 - 0.25 / 2.7) / 2;
    const expectedRear = 1320 * 9.81 - 2 * expectedFront;
    expect(state.wheelLoads.frontLeft).toBeCloseTo(expectedFront, 6);
    expect(state.wheelLoads.frontRight).toBeCloseTo(expectedFront, 6);
    expect(state.wheelLoads.rearLeft).toBeCloseTo(expectedRear / 2, 6);
    expect(state.wheelLoads.rearRight).toBeCloseTo(expectedRear / 2, 6);
  });

  it('keeps offset-COM free rotation rigid and independent of timestep changes', () => {
    const dt = 0.01, omega = 0.8;
    const g = physicalGeometry(asymmetric);
    const center = { x: 50, y: 60 };
    const initialAngle = -omega * dt;
    for (const [name, p] of Object.entries(g.coordinates)) {
      const x = p.x, y = p.y;
      const c = Math.cos(initialAngle), s = Math.sin(initialAngle);
      state.wheels[name].prevX = center.x + c * x - s * y;
      state.wheels[name].prevY = center.y + s * x + c * y;
    }
    state.body.historyDt = dt;
    computeBodyDerivedState(dt);
    for (const stepDt of [0.01, 0.02, 0.005, 0.01]) {
      verletIntegrateAllPoints(stepDt, 0, 0, 0);
      solveRigidBodyConstraints();
      computeBodyDerivedState(stepDt);
      expect(state.body.angularVelocity).toBeCloseTo(omega, 8);
      expect(state.body.centerX).toBeCloseTo(center.x, 8);
      expect(state.body.centerY).toBeCloseTo(center.y, 8);
      expect(state.debug.metrics.constraintMaxCorr).toBeLessThan(1e-9);
    }
  });
});
