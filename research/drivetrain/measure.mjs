// node research/drivetrain/measure.mjs [--benchmark]
import { performance } from 'node:perf_hooks';
import { createCoupledSolver } from './coupled-solver.mjs';
import { fixture, parameters } from './fixtures.mjs';
import { splitReference } from './split-reference.mjs';

function trace(hz, profile, duration) {
  const setup = fixture(profile), solver = createCoupledSolver(setup.parameters);
  let state = setup.state, heat = 0, energy = 0, external = 0, balanceMax = 0, firstActive = null;
  let maxIterations = 0, maxEvaluations = 0, minClutchHeat = 0;
  for (let tick = 0; tick < Math.round(duration * hz); tick++) {
    const r = solver.step(state, setup.forces, 1 / hz, setup.contacts);
    heat += r.work.clutchHeat + r.work.brakeHeat + r.work.contactHeat;
    energy += r.work.energyChange;
    external += r.work.combustionWork + r.work.starterWork + r.work.dragWork - r.work.bodyPortWork;
    balanceMax = Math.max(balanceMax, Math.abs(r.work.balanceError));
    maxIterations = Math.max(maxIterations, r.counters.iterations);
    maxEvaluations = Math.max(maxEvaluations, r.counters.targetEvaluations);
    minClutchHeat = Math.min(minClutchHeat, r.work.clutchHeat);
    if (r.work.contactHeat < -1e-8 && !firstActive) firstActive = {
      time: (tick + 1) / hz, contactHeat: r.work.contactHeat, old: state, next: r.state,
      roadImpulses: r.roadImpulses, balanceError: r.work.balanceError,
    };
    state = r.state;
  }
  return { hz, profile, state, dissipated: heat, energyChange: energy, externalWork: external,
    balanceMax, firstActive, maxIterations, maxEvaluations, minClutchHeat };
}

if (!process.argv.includes('--benchmark')) {
  for (const hz of [50, 100, 200, 400]) {
    const s = { crank: 80, input: 80, left: 80, right: 80, forceLeft: 0, forceRight: 0 };
    const p = { ...parameters, gearRatio: 1 };
    const r = createCoupledSolver(p).step(s, { combustionTorque: 100, clutchCapacity: 350 }, 1 / hz);
    console.log(JSON.stringify({ type: 'static', hz, ...r }));
    const event = createCoupledSolver({ ...parameters, gearRatio: 0 }).step({
      crank: 0, input: 1, left: 0, right: 0, forceLeft: 0, forceRight: 0,
    }, { starterTorque: 40, clutchCapacity: 10 }, 1 / hz);
    console.log(JSON.stringify({ type: 'clutch-reversal', hz, ...event,
      physicalHeat: .5 * 10 / 700 }));
    for (const profile of ['convergence', 'reversal']) {
      try { console.log(JSON.stringify({ type: 'trace', ...trace(hz, profile, profile === 'convergence' ? .4 : .5) })); }
      catch (error) { console.log(JSON.stringify({ type: 'trace', hz, profile, error: error.message })); }
    }
  }
  console.log(JSON.stringify({ type: 'reference', ...trace(3200, 'convergence', .4) }));
  console.log(JSON.stringify({ type: 'reversal-reference', ...trace(3200, 'reversal', .5) }));
} else {
  // Same initial snapshot, torque, curves, force history, ratio and timestep.
  // Independent snapshots isolate integration cost; these are not driving traces.
  for (const profile of ['idle', 'acceleration', 'launch', 'wheelspin', 'asymmetric', 'braking', 'transition']) {
    const setup = fixture(profile), solver = createCoupledSolver(setup.parameters);
    for (const method of ['split', 'coupled']) {
      let evaluations = 0;
      const contacts = setup.contacts.map(c => ({ ...c, targetForce: omega => {
        evaluations++; return c.targetForce(omega);
      } }));
      const run = method === 'split'
        ? () => splitReference(setup.state, setup.forces, setup.parameters, contacts, .01)
        : () => solver.step(setup.state, setup.forces, .01, contacts);
      try {
        for (let i = 0; i < 1000; i++) run();
        evaluations = 0;
        const samples = new Float64Array(4000);
        let iterations = 0, maxIterations = 0, activeSets = 0, maxActiveSets = 0, nonpassive = 0, balanceMax = 0;
        for (let i = 0; i < samples.length; i++) {
          const start = performance.now(), r = run(); samples[i] = performance.now() - start;
          if (r.counters) {
            iterations += r.counters.iterations; maxIterations = Math.max(maxIterations, r.counters.iterations);
            activeSets += r.counters.activeSets; maxActiveSets = Math.max(maxActiveSets, r.counters.activeSets);
            if (!r.passive) nonpassive++;
            balanceMax = Math.max(balanceMax, Math.abs(r.work.balanceError));
          }
        }
        samples.sort();
        console.log(JSON.stringify({ profile, method, steps: samples.length,
          meanMs: samples.reduce((a, b) => a + b, 0) / samples.length,
          p95Ms: samples[Math.ceil(samples.length * .95) - 1], worstMs: samples.at(-1),
          evaluationsMean: evaluations / samples.length,
          iterationsMean: method === 'coupled' ? iterations / samples.length : null,
          maxIterations: method === 'coupled' ? maxIterations : null,
          activeSetsMean: method === 'coupled' ? activeSets / samples.length : null,
          maxActiveSets: method === 'coupled' ? maxActiveSets : null,
          nonpassive: method === 'coupled' ? nonpassive : null,
          balanceMax: method === 'coupled' ? balanceMax : null }));
      } catch (error) { console.log(JSON.stringify({ profile, method, error: error.message })); }
    }
  }
}
