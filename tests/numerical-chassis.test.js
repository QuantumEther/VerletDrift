import { describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { globalThis.localStorage = { getItem: () => null, setItem: () => {} }; });
import { reset, step, observe, inertia, wrap, state } from './helpers/numerical-chassis.js';
import { computeBodyDerivedState } from '../js/physics/kinematics.js';
import { verletIntegrateAllPoints } from '../js/physics/integrator.js';
import { mechanicalStep } from './helpers/mechanical-step.js';
import { solveRigidBodyConstraints } from '../js/physics/constraints.js';

const steps = [0.02, 0.01, 0.005, 0.0025];
// Free SE(2) drift is exact in real arithmetic. These bounds cover accumulated
// double-precision coordinate subtraction, not truncation or physical damping.
const velocityTolerance = 1e-7;
const relativeInvariantTolerance = 1e-7;
function close(actual, expected, tolerance = velocityTolerance) {
  expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
}

describe('chassis numerical foundation', () => {
  it.each(steps)('preserves force-free translation at dt=%s', dt => {
    const start = reset({ dt, vx: 12, vy: -7 });
    let end;
    for (let i = 0; i < 5 / dt; i++) end = step(dt);
    close(end.vx, start.vx); close(end.vy, start.vy);
    close(end.x, start.x + start.vx * 5); close(end.y, start.y + start.vy * 5);
    close(end.energy / start.energy, 1, relativeInvariantTolerance);
  });

  for (const omega of [-20, -2, -0.01, 0.01, 2, 20]) {
    it.each(steps)(`preserves free rotation, angular momentum and energy (${omega} rad/s) at dt=%s`, dt => {
      const start = reset({ dt, omega });
      for (let i = 0; i < 5 / dt; i++) {
        const end = step(dt);
        close(end.omega, omega);
        close(end.angularMomentum / start.angularMomentum, 1, relativeInvariantTolerance);
        close(end.rotationalEnergy / start.rotationalEnergy, 1, relativeInvariantTolerance);
        close(wrap(end.heading - omega * (i + 1) * dt), 0);
        close(end.x, start.x); close(end.y, start.y);
        end.distances.forEach((d, j) => close(d, start.distances[j], 1e-9));
      }
    });
  }

  it.each(steps)('balances applied force and torque impulses at dt=%s', dt => {
    const start = reset({ dt, vx: 3, vy: -2, omega: -1 });
    const load = { fx: 1200, fy: -600, torque: 300 };
    let end;
    for (let i = 0; i < 2 / dt; i++) end = step(dt, load);
    close(end.px - start.px, load.fx * 2, 1e-5);
    close(end.py - start.py, load.fy * 2, 1e-5);
    close(end.angularMomentum - start.angularMomentum, load.torque * 2, 1e-5);
    // Discrete work identity for kick-drift: impulse times mean endpoint velocity.
    const work = load.fx * 2 * (start.vx + end.vx) / 2
      + load.fy * 2 * (start.vy + end.vy) / 2
      + load.torque * 2 * (start.omega + end.omega) / 2;
    close(end.energy - start.energy, work, 1e-4);
  });

  it('converges at first order in forced position and angle, without hidden damping', () => {
    const errors = steps.map(dt => {
      reset({ dt });
      let end;
      const mass = state.params.carMassKg, I = inertia();
      for (let i = 0; i < 2 / dt; i++) end = step(dt, { fx: mass, torque: I * 0.5 });
      close(end.vx, 2); close(end.omega, 1);
      return { x: Math.abs(end.x - 102), angle: Math.abs(wrap(end.heading - 1)) };
    });
    errors.slice(1).forEach((e, i) => {
      close(e.x / errors[i].x, 0.5, 1e-5);
      close(e.angle / errors[i].angle, 0.5, 1e-5);
    });
    expect(errors[3].x).toBeLessThan(0.00251);
    expect(errors[3].angle).toBeLessThan(0.001251);
  });

  it('converges under time-varying external torque', () => {
    const errors = steps.map(dt => {
      reset({ dt });
      for (let i = 0; i < 2 / dt; i++) step(dt, { torque: inertia() * Math.cos(i * dt) });
      return Math.abs(state.body.angularVelocity - Math.sin(2));
    });
    errors.slice(1).forEach((e, i) => expect(e / errors[i]).toBeLessThan(0.51));
    expect(errors[3]).toBeLessThan(0.0018);
  });

  it('preserves velocity and momentum across repeated Physics Hz and Time Scale changes', () => {
    const start = reset({ dt: 0.01, vx: 6, vy: -3, omega: 2 });
    let elapsed = 0;
    for (const dt of [0.005, 0.02, 0.0025, 0.001, 0.01, 0.05, 0.0005]) {
      for (let i = 0; i < 10; i++) { step(dt); elapsed += dt; }
      const end = observe();
      close(end.vx, start.vx); close(end.vy, start.vy); close(end.omega, start.omega);
      close(end.energy / start.energy, 1, relativeInvariantTolerance);
      close(end.x, start.x + elapsed * start.vx);
      close(wrap(end.heading - elapsed * start.omega), 0);
    }
  });

  it('does not reinterpret history or manufacture derivatives when dt changes', () => {
    reset({ dt: 0.01, vx: 20, omega: 2 });
    step(0.01);
    computeBodyDerivedState(0.005);
    close(state.body.velocityX, 20); close(state.body.angularVelocity, 2);
    close(state.body.accelX, 0); close(state.body.jerkX, 0, 1e-5);
    step(0.01, { fx: state.params.carMassKg * 2 }); // physical force onset
    for (const dt of [0.005, 0.02, 0.0025, 0.01]) {
      step(dt, { fx: state.params.carMassKg * 2 });
      close(state.body.accelX, 2); close(state.body.jerkX, 0, 1e-4);
    }
  });

  it('balances impulses and cached acceleration across variable timesteps under load', () => {
    const start = reset({ dt: 0.01, vx: 1, vy: -2, omega: -1 });
    const mass = state.params.carMassKg, I = inertia();
    let time = 0;
    for (const dt of [0.01, 0.005, 0.02, 0.001, 0.0025, 0.01]) {
      const end = step(dt, { fx: mass * 2, fy: mass * -3, torque: I * 4 });
      time += dt;
      close(end.vx, start.vx + 2 * time);
      close(end.vy, start.vy - 3 * time);
      close(end.angularMomentum - start.angularMomentum, I * 4 * time, 1e-5);
      close(end.accelX, 2); close(end.accelY, -3);
    }
  });

  it.each([0.1, 0.05])('preserves free motion in the production step at coarse dt=%s', dt => {
    const initial = reset({ dt, vx: 20, omega: 2, params: {
      tireFrictionCoeff: 0, rollingResistanceCoeff: 0, aeroDragCoeff: 0, yawDamping: 0,
    } });
    for (const nextDt of [dt, 0.0025, 0.1, 0.01]) {
      mechanicalStep(nextDt);
      close(state.body.velocityX, 20); close(state.body.angularVelocity, 2);
      close(observe().energy / initial.energy, 1, relativeInvariantTolerance);
    }
  });

  it('rejects angular aliasing before mutation instead of silently reversing spin', () => {
    reset({ omega: 40 });
    const before = structuredClone(state.wheels);
    expect(() => verletIntegrateAllPoints(0.1, 0, 0, 0)).toThrow(/subdivide/);
    expect(state.wheels).toEqual(before);
    // The same elapsed time is representable with two resolved angular steps.
    const params = { tireFrictionCoeff: 0, rollingResistanceCoeff: 0, aeroDragCoeff: 0, yawDamping: 0 };
    reset({ omega: 40, params });
    mechanicalStep(0.05); mechanicalStep(0.05);
    close(state.body.angularVelocity, 40);
  });

  it('resets the history interval when the chassis is reinitialized', () => {
    reset({ dt: 0.02, vx: 20, omega: 2 }); step(0.02);
    reset({ dt: 0.0025, vx: 3, omega: -1 });
    close(step(0.0025).vx, 3); close(state.body.angularVelocity, -1);
  });

  it('derives the same angular velocity when the same history is read again', () => {
    reset({ dt: 0.01, omega: 2 });
    computeBodyDerivedState(0.01);
    close(state.body.angularVelocity, 2);
  });

  it.each([1, 4, 12])('makes rigid free motion independent of constraint tuning (%s iterations)', iterations => {
    for (const damping of [0.05, 0.8, 1]) {
      const start = reset({ omega: 2, vx: 3, params: { constraintIterations: iterations, constraintDamping: damping } });
      for (let i = 0; i < 500; i++) step(0.01);
      close(state.body.angularVelocity, 2);
      close(observe().energy / start.energy, 1, relativeInvariantTolerance);
    }
  });

  it('still repairs a distorted configuration while preserving its center', () => {
    reset({ params: { constraintIterations: 12 } });
    state.wheels.frontLeft.x -= 0.1;
    const before = Object.values(state.wheels).reduce((s, w) => s + w.x, 0) / 4;
    solveRigidBodyConstraints();
    const after = Object.values(state.wheels).reduce((s, w) => s + w.x, 0) / 4;
    close(after, before, 1e-12);
    const distances = observe().distances;
    reset();
    distances.forEach((d, i) => close(d, observe().distances[i], 1e-5));
  });
});
