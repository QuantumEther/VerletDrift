import { describe, expect, it } from 'vitest';
import { integrateWheelContact } from '../js/physics/wheel.js';

const rotor = {
  omega: 30, inertia: 1.2, radius: 0.35, driveTorque: 0, brakeCapacity: 0,
  previousForce: 0, targetForce: () => 0, frictionLimit: 0, relaxationTime: 0.03,
};

describe('wheel torque and contact integration', () => {
  it.each([1 / 30, 0.1])('keeps averaged contact force inside the friction circle during direction changes at dt=%s', dt => {
    const limit = 100;
    const result = integrateWheelContact({
      ...rotor, omega: 0, dt, brakeCapacity: 1000,
      previousForce: -limit, previousLateralForce: 0,
      targetForce: () => -0.8 * limit, targetLateralForce: () => 0.6 * limit,
      frictionLimit: limit,
    });
    const appliedMagnitude = Math.hypot(result.contactImpulse, result.lateralImpulse) / dt;
    expect(appliedMagnitude).toBeLessThanOrEqual(limit + 1e-8);
    expect(Math.hypot(result.force, result.lateralForce)).toBeLessThanOrEqual(limit + 1e-8);
    expect(rotor.inertia * (result.omega - 0))
      .toBeCloseTo(result.brakeImpulse - rotor.radius * result.contactImpulse, 8);
  });
  it.each([0.02, 0.01, 0.005])('integrates flywheel work independently of timestep %s', (dt) => {
    let omega = 0;
    for (let i = 0; i < Math.round(1 / dt); i++) {
      omega = integrateWheelContact({ ...rotor, omega, dt, driveTorque: 12 }).omega;
    }
    expect(omega).toBeCloseTo(10, 9);
    expect(0.5 * rotor.inertia * omega ** 2).toBeCloseTo(60, 8);
  });

  it('uses the same contact impulse for body force and wheel reaction', () => {
    const result = integrateWheelContact({
      ...rotor, dt: 0.01, driveTorque: 50,
      previousForce: 100, targetForce: () => 100, frictionLimit: 100,
    });
    expect(result.contactImpulse).toBeCloseTo(1, 10);
    expect(rotor.inertia * (result.omega - rotor.omega))
      .toBeCloseTo(50 * 0.01 - rotor.radius * result.contactImpulse, 8);
  });

  it.each([1, -1])('brakes passively through stop and holds without reversal, direction %s', (sign) => {
    let omega = sign;
    let energy = 0.5 * rotor.inertia * omega ** 2;
    for (let i = 0; i < 30; i++) {
      const result = integrateWheelContact({ ...rotor, omega, dt: 0.01, brakeCapacity: 12 });
      const nextEnergy = 0.5 * rotor.inertia * result.omega ** 2;
      expect(nextEnergy).toBeLessThanOrEqual(energy + 1e-12);
      expect(result.omega * sign).toBeGreaterThanOrEqual(0);
      omega = result.omega;
      energy = nextEnergy;
    }
    expect(omega).toBe(0);
  });

  it('resolves stiff tire feedback against an analytical linear-contact response', () => {
    // I dω/dt = -R*k*R*ω; a fast relaxation approximates this exponential.
    // Use a smooth linear tire to test integration accuracy independently of Pacejka calibration.
    const k = 1000;
    const time = 0.02;
    const rate = rotor.radius ** 2 * k / rotor.inertia;
    const reference = Math.exp(-rate * time);
    const endpoints = [];
    for (const dt of [0.02, 0.01, 0.005]) {
      let omega = 1;
      let force = k * rotor.radius;
      for (let i = 0; i < Math.round(time / dt); i++) {
        const result = integrateWheelContact({
          ...rotor, omega, dt, previousForce: force,
          targetForce: (speed) => k * rotor.radius * speed,
          frictionLimit: k * rotor.radius, relaxationTime: 1e-6,
        });
        omega = result.omega;
        force = result.force;
      }
      endpoints.push(omega);
      expect(Math.abs(omega - reference)).toBeLessThan(0.005);
    }
    expect(Math.abs(endpoints[0] - endpoints[2])).toBeLessThan(0.001);
  });
});
