// Run from any directory: node scripts/mission01-compare.mjs OUTPUT.json
// Uses the real mechanical prefix of runPhysicsStep, excluding camera/render/audio.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as physics from '../js/physics/index.js';
import { mechanicalStep as vehicleStep } from '../tests/helpers/mechanical-step.js';
import { reset, step, observe, state, inertia, wrap } from '../tests/helpers/numerical-chassis.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const report = { sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceFiles: Object.fromEntries(['js/main.js', 'js/state.js', 'js/constants.js', ...fs.readdirSync(new URL('../js/physics/', import.meta.url)).filter(f => f.endsWith('.js')).map(f => 'js/physics/' + f)].map(f => [f, createHash('sha256').update(fs.readFileSync(new URL('../' + f, import.meta.url))).digest('hex')])),
  model: 'uniform rectangular planar chassis; I = m*(halfLength^2 + halfWidth^2)/3', free: [], forced: [], variableTorque: [], liveChanges: [], handling: [] };
for (const dt of [.02, .01, .005, .0025]) {
  for (const omega of [-20, -2, -.01, .01, 2, 20]) {
    const initial = reset({ dt, omega, center: 50000 });
    let maxEnergyError = 0, maxMomentumError = 0, maxShapeError = 0;
    for (let i = 0; i < 5 / dt; i++) {
      const r = step(dt);
      maxEnergyError = Math.max(maxEnergyError, Math.abs(r.rotationalEnergy / initial.rotationalEnergy - 1));
      maxMomentumError = Math.max(maxMomentumError, Math.abs(r.angularMomentum / initial.angularMomentum - 1));
      maxShapeError = Math.max(maxShapeError, ...r.distances.map((d, j) => Math.abs(d - initial.distances[j])));
    }
    report.free.push({ hz: 1 / dt, omega, initial, final: observe(), maxEnergyError, maxMomentumError, maxShapeError });
  }
  const initial = reset({ dt, vx: 20 });
  for (let i = 0; i < 5 / dt; i++) step(dt);
  report.free.push({ hz: 1 / dt, translation: true, initial, final: observe() });
  reset({ dt });
  const fx = state.params.carMassKg, torque = inertia() * .5;
  for (let i = 0; i < 2 / dt; i++) step(dt, { fx, torque });
  const final = observe();
  report.forced.push({ hz: 1 / dt, fx, torque, final, xError: final.x - 102, angleError: wrap(final.heading - 1),
    momentumResidual: final.px - 2 * fx, angularMomentumResidual: final.angularMomentum - 2 * torque });
  reset({ dt });
  for (let i = 0; i < 2 / dt; i++) step(dt, { torque: inertia() * Math.cos(i * dt) });
  report.variableTorque.push({ hz: 1 / dt, final: observe(), omegaError: state.body.angularVelocity - Math.sin(2) });
}
for (const newDt of [.02, .005, .0025, .001]) {
  const initial = reset({ dt: .01, vx: 20, omega: 2 });
  report.liveChanges.push({ oldDt: .01, newDt, initial, final: step(newDt) });
}
report.coarseProduction = [];
for (const dt of [.05, .1]) {
  const initial = reset({ dt, vx: 20, omega: 2, params: {
    tireFrictionCoeff: 0, rollingResistanceCoeff: 0, aeroDragCoeff: 0, yawDamping: 0 } });
  vehicleStep(dt);
  report.coarseProduction.push({ dt, initial, final: observe() });
}
// Recorded live UI controls from the baseline audit; experiment inputs only.
const liveParams = JSON.parse(fs.readFileSync(new URL('../docs/physics-recovery/mission-01/audited-controls.json', import.meta.url), 'utf8'));
for (const dt of [.02, .01, .005, .0025]) {
  // Audit F1 through the exact production force/sleep/clamp stages.
  const initial = reset({ dt, omega: 2, center: 50000, params: { ...liveParams,
    tireFrictionCoeff: 0, rollingResistanceCoeff: 0, aeroDragCoeff: 0, yawDamping: 0 } });
  for (let i = 0; i < 5 / dt; i++) vehicleStep(dt);
  report.free.push({ hz: 1 / dt, production: true, omega: 2, initial, final: observe() });
  for (const maneuver of ['cornering', 'handbrake', 'steering-free', 'rest-steering']) {
    const speed = maneuver === 'steering-free' ? 1 : maneuver === 'rest-steering' ? 0 : 18;
    reset({ dt, vy: -speed, center: 10000, params: liveParams });
    state.engine.currentGear = 'N'; state.engine.clutchEngagement = 0;
    state.steering.frontWheelAngle = maneuver === 'rest-steering' ? .3 : maneuver === 'steering-free' ? .01 : .22;
    state.steering.wheelAngle = state.steering.frontWheelAngle / state.params.maxFrontWheelAngle * Math.PI * 2.5;
    for (const n of Object.keys(state.wheelOmega)) state.wheelOmega[n] = speed / state.params.wheelRadius;
    let maxYaw = 0, maxDelta = 0, maxSpeed = 0, minLoad = Infinity, flips = 0, sign = 1;
    const duration = ['steering-free', 'rest-steering'].includes(maneuver) ? 10 : 3;
    for (let i = 0; i < duration / dt; i++) {
      state.steering.isDragging = !['steering-free', 'rest-steering'].includes(maneuver);
      state.input.handbrakeKeyHeld = maneuver === 'handbrake' && i * dt >= .5 && i * dt < .8;
      vehicleStep(dt);
      maxYaw = Math.max(maxYaw, Math.abs(state.body.angularVelocity));
      maxDelta = Math.max(maxDelta, Math.abs(state.steering.frontWheelAngle));
      maxSpeed = Math.max(maxSpeed, state.body.speed);
      minLoad = Math.min(minLoad, ...Object.values(state.wheelLoads));
      const delta = state.steering.frontWheelAngle;
      if (Math.abs(delta) > 1e-6) { if (Math.sign(delta) !== sign) flips++; sign = Math.sign(delta); }
      if (![state.body.speed, state.body.angularVelocity, delta, ...Object.values(state.wheelLoads)].every(Number.isFinite)) throw Error('Nonfinite handling: ' + maneuver);
    }
    report.handling.push({ hz: 1 / dt, maneuver, final: observe(), maxYaw, maxDelta, maxSpeed, minLoad, flips });
  }
}
// Removing the history cap also restores speeds above the old 100 Hz cap.
// Probe those downstream conditions explicitly without changing vehicle tuning.
report.highSpeed = [];
for (const dt of [.02, .01, .005, .0025, .1]) for (const angle of [0, .22]) {
  const initial = reset({ dt, vy: -90, center: 10000, params: liveParams });
  state.engine.currentGear = 'N'; state.engine.clutchEngagement = 0;
  state.steering.isDragging = true;
  state.steering.wheelAngle = angle / state.params.maxFrontWheelAngle * Math.PI * 2.5;
  for (const n of Object.keys(state.wheelOmega)) state.wheelOmega[n] = 90 / state.params.wheelRadius;
  let maxYaw = 0, minLoad = Infinity;
  for (let i = 0; i < 1 / dt; i++) {
    vehicleStep(dt);
    maxYaw = Math.max(maxYaw, Math.abs(state.body.angularVelocity));
    minLoad = Math.min(minLoad, ...Object.values(state.wheelLoads));
    if (![state.body.speed, state.body.angularVelocity, ...Object.values(state.wheelLoads)].every(Number.isFinite)) throw Error('Nonfinite high-speed state');
  }
  report.highSpeed.push({ hz: 1 / dt, angle, initial, final: observe(), maxYaw, minLoad });
}
// Sensitivity to numerical constraint controls; no physical force or sleep.
report.constraintSweep = [];
for (const iterations of [1, 4, 12]) for (const damping of [.05, .8, 1]) {
  const initial = reset({ omega: 2, params: { constraintIterations: iterations, constraintDamping: damping } });
  for (let i = 0; i < 500; i++) step(.01);
  report.constraintSweep.push({ iterations, damping, initial, final: observe() });
}
// Independent coordinate-level stage probe: distinguish geometric heading
// increments from the angular rate encoded by solver-modified previous poses.
reset({ omega: 2, params: { constraintIterations: 6, constraintDamping: .8 } });
const distances = observe().distances;
function coordinateProbe() {
  const w = state.wheels;
  const heading = (prev = false) => {
    const x = prev ? 'prevX' : 'x', y = prev ? 'prevY' : 'y';
    return Math.atan2(w.frontLeft[y] + w.frontRight[y] - w.rearLeft[y] - w.rearRight[y],
      w.frontLeft[x] + w.frontRight[x] - w.rearLeft[x] - w.rearRight[x]) + Math.PI / 2;
  };
  return { heading: heading(), stepYaw: wrap(heading()) / .01,
    historyYaw: wrap(heading() - heading(true)) / .01,
    maxShapeError: Math.max(...observe().distances.map((d, j) => Math.abs(d - distances[j]))) };
}
report.stages = { initial: coordinateProbe() };
physics.verletIntegrateAllPoints(.01, 0, 0, 0);
report.stages.integrated = coordinateProbe();
physics.solveRigidBodyConstraints();
report.stages.projected = coordinateProbe();
physics.solveRigidBodyConstraints();
report.stages.projectedTwice = coordinateProbe();
physics.computeBodyDerivedState(.01);
report.stages.cachedYaw = state.body.angularVelocity;
fs.writeFileSync(process.argv[2] || new URL('../docs/physics-recovery/mission-01/measurements.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
