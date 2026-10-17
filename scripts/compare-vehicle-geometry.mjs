// Fixed-time geometry regression using production mechanical functions in main.js order.
// Run before/after a geometry change; this does not alter production stepping.
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
const { default: state } = await import('../js/state.js');
const c = await import('../js/constants.js');
const p = await import('../js/physics/index.js');
const initial = structuredClone(state);
const names = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'];
const pairs = [[0, 1, c.CONSTRAINT_AXLE_WIDTH], [2, 3, c.CONSTRAINT_AXLE_WIDTH],
  [0, 2, c.CONSTRAINT_SIDE_LENGTH], [1, 3, c.CONSTRAINT_SIDE_LENGTH],
  [0, 3, c.CONSTRAINT_DIAGONAL], [1, 2, c.CONSTRAINT_DIAGONAL]];

function constraintError() {
  return Math.max(...pairs.map(([a, b, rest]) => {
    const wa = state.wheels[names[a]], wb = state.wheels[names[b]];
    return Math.abs(Math.hypot(wa.x - wb.x, wa.y - wb.y) - rest);
  }));
}

function energy() {
  const s = state, b = s.body, mass = s.params.carMassKg;
  const inertia = mass * (c.CAR_HALF_LENGTH ** 2 + c.CAR_HALF_WIDTH ** 2) / 3;
  return .5 * mass * b.speed ** 2 + .5 * inertia * b.angularVelocity ** 2
    + Object.values(s.wheelOmega).reduce((sum, w) => sum + .5 * s.params.wheelInertia * w * w, 0);
}

function step(dt) {
  const s = state;
  s.input.handbrakeValue = s.input.handbrakeKeyHeld
    ? Math.min(1, s.input.handbrakeValue + dt / .25) : Math.max(0, s.input.handbrakeValue - dt / .15);
  p.updateSteering(dt);
  p.updateEngine(dt);
  p.updateSuspension(dt);
  const tires = p.computeTireForces(dt);
  p.synchronizeEngineWithWheels();
  const drag = p.computeDragForces();
  const mass = s.params.carMassKg;
  const inertia = mass * (c.CAR_HALF_LENGTH ** 2 + c.CAR_HALF_WIDTH ** 2) / 3;
  const torque = tires.torque - s.params.yawDamping * inertia * s.body.angularVelocity;
  p.verletIntegrateAllPoints(dt, (tires.forceX + drag.forceX) / mass,
    (tires.forceY + drag.forceY) / mass, torque / inertia);
  p.solveRigidBodyConstraints();
  p.clampParticleDisplacements();
  p.handleBoundaryCollisions();
  p.solveRigidBodyConstraints();
  p.computeBodyDerivedState(dt);
  p.applySleepIfNeeded();
  p.updateCamera(dt);
}

export const scenarios = [
  { name: 'rest', seconds: 120 },
  { name: 'launch', seconds: 6 },
  { name: 'braking', seconds: 5, speed: 20 },
  { name: 'cornering', seconds: 4, speed: 18 },
  { name: 'handbrake', seconds: 4, speed: 18 },
  { name: 'transition', seconds: 4, speed: 20 },
  { name: 'gear_clutch', seconds: 6 },
  { name: 'stall', seconds: 2 },
  { name: 'reverse', seconds: 5 },
  { name: 'collision', seconds: 2, speed: 12 },
  { name: 'high_speed', seconds: 4, speed: 60 },
  { name: 'extreme_speed_clamp', seconds: 2, speed: 100 },
  { name: 'low_speed', seconds: 15, speed: .05 },
  { name: 'long_drive', seconds: 120 },
];

export function runScenario(spec, { dt = .01 } = {}) {
  Object.assign(state, structuredClone(initial));
  // Large benchmark arena isolates long-run mechanics from repeated map impacts.
  // Collision scenario retains the production arena and starts near its top edge.
  if (spec.name !== 'collision') Object.assign(state.params, { mapWidth: 10000, mapHeight: 10000 });
  const centre = spec.name === 'collision' ? [100, 2] : [100, 100];
  p.initializeCarBody(...centre);
  state.engine.currentGear = 'N';
  for (const [name, wheel] of Object.entries(state.wheels)) {
    wheel.prevY = wheel.y + (spec.speed ?? 0) * dt;
    state.wheelOmega[name] = (spec.speed ?? 0) / state.params.wheelRadius;
  }
  p.computeBodyDerivedState(dt);
  Object.assign(state.body, { accelX: 0, accelY: 0, prevAccelX: 0, prevAccelY: 0,
    jerkX: 0, jerkY: 0, jerkMagnitude: 0, longitudinalAccel: 0, lateralAccel: 0 });
  const startEnergy = energy();
  let maxError = 0, maxYaw = 0, maxSpeed = 0, maxSlip = 0, minLoad = Infinity;
  let maxCameraLag = 0, maxBoundaryOvershoot = 0, maxRoll = 0;
  let minClutch = 1, maxClutch = 0, stalled = false;
  const gears = new Set(['N']), samples = [];
  const started = performance.now();
  for (let i = 0; i < Math.round(spec.seconds / dt); i++) {
    const t = i * dt, name = spec.name, s = state;
    const drive = ['launch', 'gear_clutch', 'reverse', 'long_drive'].includes(name);
    s.input.throttleKeyHeld = drive;
    s.input.clutchKeyHeld = drive && (t < .6 || (name === 'gear_clutch' && t >= 3 && t < 3.4));
    if (drive && i === Math.round(.2 / dt)) p.handleGearChange(name === 'reverse' ? 'R' : '1');
    if (name === 'gear_clutch' && i === Math.round(3.2 / dt)) p.handleGearChange('2');
    if (name === 'stall' && i === 0) {
      s.engine.currentGear = '1'; s.engine.clutchEngagement = 1; s.engine.clutchPedalPosition = 1;
    }
    s.input.brakeKeyHeld = name === 'braking' && t >= .3;
    s.input.handbrakeKeyHeld = name === 'handbrake' && t >= .5 && t < 1.2;
    s.steering.isDragging = true;
    const steering = ['cornering', 'handbrake', 'transition'].includes(name) && t >= .5
      ? (name === 'transition' && t >= 1.75 ? -.16 : .16)
      : name === 'long_drive' && t >= 2 ? .08 * Math.sin(t * .2) : 0;
    s.steering.wheelAngle = steering / s.params.maxFrontWheelAngle * Math.PI * 2.5;
    step(dt);
    s.loop.simulationTime += dt;
    const b = s.body;
    const values = [b.centerX, b.centerY, b.speed, b.angularVelocity, s.engine.rpm,
      s.camera.x, s.camera.y, ...Object.values(s.wheelOmega), ...Object.values(s.wheelLoads),
      ...Object.values(s.wheels).flatMap(w => [w.x, w.y, w.prevX, w.prevY])];
    if (!values.every(Number.isFinite)) throw Error(`${name}: non-finite state at ${t}s`);
    maxError = Math.max(maxError, constraintError());
    maxYaw = Math.max(maxYaw, Math.abs(b.angularVelocity));
    maxSpeed = Math.max(maxSpeed, b.speed);
    maxSlip = Math.max(maxSlip, ...Object.values(s.wheelSlipRatio).map(Math.abs));
    minLoad = Math.min(minLoad, ...Object.values(s.wheelLoads));
    maxCameraLag = Math.max(maxCameraLag, Math.hypot(s.camera.x - b.centerX, s.camera.y - b.centerY));
    maxRoll = Math.max(maxRoll, Math.abs(s.suspension.roll));
    for (const w of Object.values(s.wheels)) maxBoundaryOvershoot = Math.max(maxBoundaryOvershoot,
      -w.x, -w.y, w.x - s.params.mapWidth, w.y - s.params.mapHeight);
    minClutch = Math.min(minClutch, s.engine.clutchEngagement);
    maxClutch = Math.max(maxClutch, s.engine.clutchEngagement);
    stalled ||= s.engine.isStalled;
    gears.add(s.engine.currentGear);
    if ((i + 1) % Math.round(1 / dt) === 0) samples.push({ time: +(t + dt).toFixed(3),
      speed: b.speed, yaw: b.angularVelocity, heading: b.heading, rpm: s.engine.rpm, gear: s.engine.currentGear });
  }
  return { name: spec.name, seconds: spec.seconds, steps: Math.round(spec.seconds / dt),
    elapsedMs: performance.now() - started, maxConstraintErrorM: maxError,
    finalConstraintErrorM: constraintError(), maxYawRadS: maxYaw, maxSpeedMps: maxSpeed,
    finalSpeedMps: state.body.speed, finalHeadingRad: state.body.heading,
    displacementM: [state.body.centerX - centre[0], state.body.centerY - centre[1]],
    maxSlipRatio: maxSlip, minLoadN: minLoad, maxRollRad: maxRoll, maxCameraLagM: maxCameraLag,
    maxBoundaryOvershootM: maxBoundaryOvershoot, initialEnergyJ: startEnergy, finalEnergyJ: energy(),
    minClutch, maxClutch, stalled, gears: [...gears], samples };
}

export function measureGeometry() {
  Object.assign(state, structuredClone(initial));
  p.initializeCarBody(100, 100);
  const initializationError = constraintError();
  state.wheels.frontLeft.x += .2; state.wheels.frontLeft.y += .1;
  state.wheels.frontLeft.prevX = state.wheels.frontLeft.x;
  state.wheels.frontLeft.prevY = state.wheels.frontLeft.y;
  const perturbedError = constraintError();
  p.solveRigidBodyConstraints();
  return { trackM: c.CONSTRAINT_AXLE_WIDTH, wheelbaseM: c.CONSTRAINT_SIDE_LENGTH,
    diagonalM: c.CONSTRAINT_DIAGONAL, yawInertiaKgM2: c.MOMENT_OF_INERTIA,
    displacementClampM: c.MAX_DISPLACEMENT_PER_STEP, initializationErrorM: initializationError,
    perturbedErrorM: perturbedError, solvedErrorM: constraintError() };
}

export function measureAll() {
  const mechanicalFiles = ['physics/constraints.js', 'physics/kinematics.js', 'physics/weight.js',
    'physics/suspension.js', 'physics/tires.js', 'physics/wheel.js', 'physics/integrator.js',
    'physics/engine.js', 'physics/steering.js', 'physics/camera.js', 'input.js'];
  return { dt: .01, settingsSha256: createHash('sha256').update(JSON.stringify(initial.params)).digest('hex'),
    mechanicalSha256: Object.fromEntries(mechanicalFiles.map(name => [name,
      createHash('sha256').update(readFileSync(new URL('../js/' + name, import.meta.url))).digest('hex')])),
    geometry: measureGeometry(), scenarios: scenarios.map(spec => runScenario(spec)) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(JSON.stringify(measureAll(), null, 2) + '\n');
}
