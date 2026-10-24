import test from 'node:test';
import assert from 'node:assert/strict';
import { createWheel, rotationalEnergy, stepWheel, totalKineticEnergy } from '../src/wheel.js';

test('constant torque produces expected angular acceleration, velocity, and energy', () => {
  const inertia = 2.4, torque = 7.2, dt = 0.001, duration = 3;
  const wheel = createWheel({ inertia, friction: 0 });
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

test('free rolling remains uniform with zero slip and zero torque', () => {
  const wheel = createWheel({ radius: 0.3, mass: 10 });
  wheel.omega = 10;
  wheel.velocity = 3;
  const result = stepWheel(wheel, {}, 0.001);
  assert.equal(result.contactForce, 0);
  assert.equal(wheel.velocity, 3);
  assert.equal(wheel.omega, 10);
  assert.ok(Math.abs(wheel.x - 0.003) < 1e-15);
});

test('positive drive accelerates wheel and translates it through road force', () => {
  const wheel = createWheel({ inertia: 1, mass: 10, radius: 0.5, friction: 1, slipStiffness: 100 });
  const result = stepWheel(wheel, { driveTorque: 10 }, 0.01);
  assert.ok(result.angularAcceleration > 0);
  assert.ok(result.contactForce > 0);
  assert.ok(wheel.velocity > 0);
  assert.ok(wheel.omega > 0);
});

test('contact force has equal translation force and opposing wheel torque', () => {
  const wheel = createWheel({ inertia: 2, mass: 4, radius: 0.25, friction: 100, slipStiffness: 10 });
  wheel.omega = 4;
  const beforeOmega = wheel.omega, beforeV = wheel.velocity;
  const result = stepWheel(wheel, { driveTorque: 0 }, 0.001);
  assert.ok(Math.abs((wheel.velocity - beforeV) / 0.001 - result.contactForce / wheel.mass) < 1e-10);
  assert.ok(Math.abs((wheel.omega - beforeOmega) / 0.001 + wheel.radius * result.contactForce / wheel.inertia) < 1e-10);
});

test('longitudinal force stays within friction bound', () => {
  const wheel = createWheel({ mass: 10, friction: 0.4, slipStiffness: 1e8 });
  wheel.omega = 100;
  const result = stepWheel(wheel, {}, 0.001);
  assert.ok(Math.abs(result.contactForce) <= wheel.friction * wheel.normalLoad);
});

test('zero friction allows wheel spin without horizontal acceleration', () => {
  const wheel = createWheel({ friction: 0 });
  stepWheel(wheel, { driveTorque: 10 }, 0.01);
  assert.equal(wheel.velocity, 0);
  assert.ok(wheel.omega > 0);
});

test('instantaneous kinetic energy balance matches port and slip power', () => {
  const wheel = createWheel({ inertia: 2, mass: 5, radius: 0.2, friction: 100, slipStiffness: 3 });
  wheel.omega = 2;
  wheel.velocity = 0.1;
  const omega0 = wheel.omega, velocity0 = wheel.velocity;
  const torque = 1.5, result = stepWheel(wheel, { driveTorque: torque }, 1e-7);
  const energyRate = wheel.inertia * omega0 * result.angularAcceleration + wheel.mass * velocity0 * result.acceleration;
  const expected = torque * omega0 - result.contactForce * result.slipVelocity;
  assert.ok(Math.abs(energyRate - expected) < 1e-12);
  assert.ok(Number.isFinite(totalKineticEnergy(wheel)));
});

test('step energy ledger accounts for implicit numerical dissipation and braking', () => {
  const wheel = createWheel({ slipStiffness: 100 });
  wheel.omega = 4; wheel.velocity = 0.5;
  const omega0 = wheel.omega, v0 = wheel.velocity, energy0 = totalKineticEnergy(wheel), dt = 0.001;
  const result = stepWheel(wheel, { brakeTorque: 2 }, dt);
  const endSlip = wheel.radius * wheel.omega - wheel.velocity;
  const power = -2 * wheel.omega - result.contactForce * endSlip;
  const numericalLoss = 0.5 * wheel.inertia * (wheel.omega - omega0) ** 2 + 0.5 * wheel.mass * (wheel.velocity - v0) ** 2;
  assert.ok(Math.abs(totalKineticEnergy(wheel) - energy0 - dt * power + numericalLoss) < 1e-12);
  assert.ok(totalKineticEnergy(wheel) < energy0);
});

test('default wheel accelerates and then brakes to rest without unstable reversal', () => {
  const wheel = createWheel();
  for (let i = 0; i < 2000; i++) stepWheel(wheel, { driveTorque: 20 });
  assert.ok(wheel.x > 0 && wheel.velocity > 0 && wheel.omega > 0);
  const drivenEnergy = totalKineticEnergy(wheel);
  for (let i = 0; i < 10000; i++) {
    stepWheel(wheel, { brakeTorque: 8 });
    assert.ok(wheel.omega >= -1e-12 && wheel.velocity >= -1e-12);
  }
  assert.ok(totalKineticEnergy(wheel) < drivenEnergy * 1e-8);
});
