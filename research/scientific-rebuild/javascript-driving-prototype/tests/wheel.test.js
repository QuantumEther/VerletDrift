import test from 'node:test';
import assert from 'node:assert/strict';
import { createWheel, rotationalEnergy, stepWheel } from '../src/wheel.js';

test('constant torque produces expected angular acceleration, velocity, and energy', () => {
  const inertia = 2.4, torque = 7.2, dt = 0.001, duration = 3;
  const wheel = createWheel({ inertia });
  const expectedAcceleration = torque / inertia;
  for (let i = 0; i < duration / dt; i++) stepWheel(wheel, { driveTorque: torque }, dt);
  const expectedOmega = expectedAcceleration * duration;
  const expectedEnergy = 0.5 * inertia * expectedOmega ** 2;
  assert.ok(Math.abs(wheel.omega / duration - expectedAcceleration) < 1e-10, `angular acceleration error: ${wheel.omega / duration - expectedAcceleration}`);
  assert.ok(Math.abs(wheel.omega - expectedOmega) < 1e-10, `angular velocity error: ${wheel.omega - expectedOmega}`);
  assert.ok(Math.abs(rotationalEnergy(wheel) - expectedEnergy) < 1e-9, `energy error: ${rotationalEnergy(wheel) - expectedEnergy}`);
});

test('braking at rest and through zero never reverses the wheel', () => {
  const wheel = createWheel();
  stepWheel(wheel, { brakeTorque: 100 }, 0.01);
  assert.equal(wheel.omega, 0);
  wheel.omega = 0.1;
  stepWheel(wheel, { brakeTorque: 100 }, 0.01);
  assert.equal(wheel.omega, 0);
});
