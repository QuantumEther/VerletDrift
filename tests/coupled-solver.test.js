import { describe, it, expect } from 'vitest';
import { createCoupledSolver, rotationalEnergy } from '../research/drivetrain/coupled-solver.mjs';
import { productionContact, constantContact } from '../research/drivetrain/production-contact.mjs';
import { fixture } from '../research/drivetrain/fixtures.mjs';

const params = { engineInertia: .25, inputInertia: .02, leftInertia: 1.2, rightInertia: 1.2, gearRatio: 1 };
const state = (crank = 80, left = 80, right = left, gear = 1) => ({
  crank, input: gear * (left + right) / 2, left, right, forceLeft: 0, forceRight: 0,
});
const balance = r => expect(Math.abs(r.work.balanceError)).toBeLessThan(2e-9);

describe.each([50, 100, 200, 400])('coupled rotational research at %s Hz', hz => {
  const dt = 1 / hz;
  it('transmits static clutch torque with zero heat and correct coupled work', () => {
    const s = state(), result = createCoupledSolver(params).step(s, { combustionTorque: 100, clutchCapacity: 350 }, dt);
    const expected = 80 + 100 * dt / (.25 + .02 + 2.4);
    expect(result.clutchState).toBe('locked');
    expect(result.state.crank).toBeCloseTo(expected, 12);
    expect(result.state.input).toBeCloseTo(expected, 12);
    expect(Math.abs(result.work.clutchHeat)).toBeLessThan(1e-10);
    expect(result.work.energyChange).toBeCloseTo(100 * dt * (80 + expected) / 2, 10);
    balance(result);
  });
  it('accounts starter and signed drag work at coupled midpoint speeds', () => {
    const result = createCoupledSolver(params).step(state(0, 0),
      { starterTorque: 40, viscousDrag: .01, clutchCapacity: 350 }, dt);
    expect(result.state.crank).toBeGreaterThan(0);
    expect(result.work.starterWork).toBeGreaterThan(0);
    expect(result.work.dragWork).toBeLessThan(0);
    expect(Math.abs(result.work.clutchHeat)).toBeLessThan(1e-10);
    balance(result);
  });
  it.each([-1, 1])('accounts opposing drag for rotation sign %s', sign => {
    const r = createCoupledSolver(params).step(state(sign * 80, sign * 80),
      { dragTorque: -sign * 10, viscousDrag: .01, clutchCapacity: 350 }, dt);
    expect(r.work.dragWork).toBeLessThan(0); expect(r.work.energyChange).toBeLessThan(0);
    expect(Math.abs(r.work.clutchHeat)).toBeLessThan(1e-10); balance(r);
  });
  it.each([-1, 1])('keeps slipping clutch friction bounded and passive for sign %s', sign => {
    const s = state(sign * 100, 0), result = createCoupledSolver(params).step(s, { clutchCapacity: 20 }, dt);
    expect(result.clutchState).toBe('slipping');
    expect(result.clutchImpulse).toBeCloseTo(sign * 20 * dt, 13);
    expect(result.work.clutchHeat).toBeGreaterThan(0);
    expect(rotationalEnergy(result.state, params)).toBeLessThan(rotationalEnergy(s, params));
    balance(result);
  });
  it('locks after finite slip without increasing energy', () => {
    const solver = createCoupledSolver(params);
    let s = state(30, 0), lockedAt = null;
    for (let tick = 0; tick < hz; tick++) {
      const r = solver.step(s, { clutchCapacity: 20 }, dt);
      expect(r.work.clutchHeat).toBeGreaterThanOrEqual(-1e-10);
      balance(r); s = r.state;
      if (r.clutchState === 'locked' && lockedAt === null) lockedAt = (tick + 1) * dt;
    }
    expect(lockedAt).toBeGreaterThan(0);
    expect(lockedAt).toBeLessThan(.4);
    expect(s.crank).toBeCloseTo(s.input, 12);
  });
  it('preserves neutral input inertia and disconnects the rear wheels', () => {
    const p = { ...params, gearRatio: 0 }, s = { ...state(80, 10), input: 50 };
    const r = createCoupledSolver(p).step(s, { clutchCapacity: 10 }, dt);
    expect(r.state.left).toBe(10); expect(r.state.right).toBe(10);
    expect(.25 * r.state.crank + .02 * r.state.input).toBeCloseTo(.25 * 80 + .02 * 50, 12);
    balance(r);
  });
  it('gives the exact off-diagonal shared-inertia response to one road impulse', () => {
    const p = { ...params, gearRatio: 4 }, s = state(80, 20, 20, 4);
    const contacts = [constantContact(100), constantContact(0)];
    s.forceLeft = 100;
    const r = createCoupledSolver(p).step(s, { clutchCapacity: 350 }, dt, contacts);
    const a = 1.2 + (.25 + .02) * 4, b = (.25 + .02) * 4, determinant = a * a - b * b;
    const impulse = -.3 * 100 * dt;
    expect(r.state.left - 20).toBeCloseTo(a / determinant * impulse, 11);
    expect(r.state.right - 20).toBeCloseTo(-b / determinant * impulse, 11);
    expect(r.roadImpulses[0]).toBeCloseTo(100 * dt, 12);
    expect(r.roadImpulses[1]).toBe(0);
    expect(r.work.contactHeat).toBeGreaterThan(0); balance(r);
  });
  it.each([0, 350])('brakes oppose rotation with clutch capacity %s', capacity => {
    const s = state(), r = createCoupledSolver(params).step(s,
      { clutchCapacity: capacity, brakeLeft: 100, brakeRight: 100 }, dt);
    expect(r.state.left).toBeLessThan(s.left);
    if (capacity > 0) expect(r.state.crank).toBeLessThan(s.crank);
    else expect(r.state.crank).toBe(s.crank);
    expect(r.work.brakeHeat).toBeGreaterThan(0);
    expect(r.work.clutchHeat).toBeGreaterThanOrEqual(-1e-10); balance(r);
  });
  it('handles simultaneous clutch slip and brake load', () => {
    const r = createCoupledSolver(params).step(state(100, 20),
      { clutchCapacity: 20, brakeLeft: 100, brakeRight: 100 }, dt);
    expect(r.clutchState).toBe('slipping');
    expect(r.work.clutchHeat).toBeGreaterThan(0); expect(r.work.brakeHeat).toBeGreaterThan(0);
    balance(r);
  });
  it('holds at rest under engine torque without creep or friction heat', () => {
    const r = createCoupledSolver(params).step(state(0, 0),
      { combustionTorque: 50, clutchCapacity: 350, brakeLeft: 100, brakeRight: 100 }, dt);
    for (const key of ['crank', 'input', 'left', 'right']) expect(Math.abs(r.state[key])).toBeLessThan(1e-12);
    expect(Math.abs(r.work.clutchHeat) + Math.abs(r.work.brakeHeat)).toBeLessThan(1e-10); balance(r);
  });
  it('BLOCKER: nonlinear production contacts must remain passive through slip reversal', () => {
    const p = { ...params, gearRatio: 4 }, solver = createCoupledSolver(p);
    const contacts = [productionContact({ speed: 5 }), productionContact({ speed: 5, friction: .5 })];
    let s = state(160, 40, 40, 4);
    for (let tick = 0; tick < hz / 2; tick++) {
      const r = solver.step(s, { combustionTorque: 50, clutchCapacity: 350 }, dt, contacts);
      expect(r.residualForce).toBeLessThan(4e-6);
      expect(r.work.contactHeat).toBeGreaterThanOrEqual(-1e-8);
      expect(r.work.clutchHeat).toBeGreaterThanOrEqual(-1e-8);
      expect(r.counters.iterations).toBeLessThanOrEqual(24);
      balance(r); s = r.state;
    }
  });
  it('accounts the complete contact/body-port budget even at slip reversal', () => {
    const setup = fixture('acceleration'), solver = createCoupledSolver(setup.parameters);
    let s = setup.state, energy = 0, external = 0, dissipated = 0;
    for (let tick = 0; tick < hz / 2; tick++) {
      const r = solver.step(s, setup.forces, dt, setup.contacts);
      balance(r);
      expect(r.residualForce).toBeLessThan(4e-6);
      energy += r.work.energyChange;
      external += r.work.combustionWork + r.work.starterWork + r.work.dragWork - r.work.bodyPortWork;
      dissipated += r.work.clutchHeat + r.work.brakeHeat + r.work.contactHeat;
      s = r.state;
    }
    expect(Math.abs(energy - external + dissipated)).toBeLessThan(1e-8);
  });
  it('decelerates a connected unpowered crank through stall-relevant speeds to rest', () => {
    const p = { ...params, gearRatio: 4 }, solver = createCoupledSolver(p);
    let s = state(80, 20, 20, 4);
    const before = rotationalEnergy(s, p);
    let heat = 0;
    for (let tick = 0; tick < hz / 2; tick++) {
      const r = solver.step(s, { clutchCapacity: 350, brakeLeft: 1000, brakeRight: 1000 }, dt);
      expect(Math.abs(r.work.clutchHeat)).toBeLessThan(1e-10);
      expect(r.work.brakeHeat).toBeGreaterThanOrEqual(-1e-10);
      balance(r); heat += r.work.brakeHeat; s = r.state;
    }
    expect(Math.abs(s.crank)).toBeLessThan(1e-10);
    expect(heat).toBeCloseTo(before, 9);
  });
});

describe('research interface and signed motion', () => {
  it.each([-4, 4])('preserves the signed locked constraint for ratio %s', g => {
    const p = { ...params, gearRatio: g }, s = state(-80, -80 / g, -80 / g, g);
    const r = createCoupledSolver(p).step(s, { clutchCapacity: 350, combustionTorque: -50 }, .01);
    expect(r.state.crank).toBeLessThan(0);
    expect(r.state.input).toBeCloseTo(r.state.crank, 12); balance(r);
  });
  it.each([-4, 1, 4])('conserves generalized momentum with unequal wheels at ratio %s', g => {
    const p = { ...params, gearRatio: g, leftInertia: .9, rightInertia: 1.5 };
    const s = state(80, 5, 10, g);
    const momentum = s => p.engineInertia * s.crank + p.inputInertia * s.input
      + (p.leftInertia * s.left + p.rightInertia * s.right) / g;
    const r = createCoupledSolver(p).step(s, { clutchCapacity: 10 }, .01);
    expect(momentum(r.state)).toBeCloseTo(momentum(s), 12); balance(r);
  });
  it('does not mutate caller state and rejects inconsistent gearbox history', () => {
    const s = state(), before = structuredClone(s), solver = createCoupledSolver(params);
    solver.step(s, { clutchCapacity: 350 }, .01);
    expect(s).toEqual(before);
    expect(() => solver.step({ ...s, input: 10 }, {}, .01)).toThrow(/incompatible/);
  });
  it('shows why the unchanged force-relaxation ODE cannot guarantee instantaneous port passivity', () => {
    const c = productionContact({ speed: 10 }), omega = 10, previous = 2500;
    const target = c.targetForce(omega), dt = .01;
    const meanForce = target + (previous - target) * (-Math.expm1(-dt / c.relaxationTime)) / (dt / c.relaxationTime);
    expect(target).toBeLessThan(0); expect(meanForce).toBeGreaterThan(0);
    // Exact frozen-speed ODE integration, no rotational solver involved.
    expect(dt * meanForce * (c.radius * omega - c.speed)).toBeLessThan(-1);
  });
  it.each([50, 100, 200, 400])('BLOCKER: within-tick slip reversal needs physical event work at %s Hz', hz => {
    const p = { ...params, gearRatio: 0 };
    const s = { crank: 0, input: 1, left: 0, right: 0, forceLeft: 0, forceRight: 0 };
    const r = createCoupledSolver(p).step(s, { starterTorque: 40, clutchCapacity: 10 }, 1 / hz);
    balance(r);
    // The true within-tick event occurs at 1/700 s. Sliding friction first
    // helps the crank, then changes to a static holding reaction.
    const lockTime = 1 / ((40 + 10) / .25 + 10 / .02);
    const physicalHeat = .5 * 10 * lockTime;
    expect(physicalHeat).toBeCloseTo(.007142857142857143, 14);
    expect(r.work.clutchHeat).toBeCloseTo(physicalHeat, 10);
  });
  it('observes second-order convergence on a smooth nonlinear-contact interval', () => {
    function run(hz) {
      const setup = fixture('convergence'), solver = createCoupledSolver(setup.parameters);
      let s = setup.state;
      for (let tick = 0; tick < hz * .4; tick++) {
        const r = solver.step(s, setup.forces, 1 / hz, setup.contacts);
        expect(r.passive).toBe(true); balance(r); s = r.state;
      }
      return s;
    }
    const reference = run(3200);
    const errors = [50, 100, 200, 400].map(hz => {
      const s = run(hz);
      return Math.hypot(s.crank - reference.crank, s.left - reference.left, s.right - reference.right);
    });
    for (let i = 1; i < errors.length; i++) expect(errors[i]).toBeLessThan(errors[i - 1] * .35);
  });
});
