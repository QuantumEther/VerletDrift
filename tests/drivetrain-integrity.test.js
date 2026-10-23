import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => { globalThis.localStorage = { getItem: () => null, setItem: () => {} }; });
import state from '../js/state.js';
import { updateEngine, synchronizeEngineWithWheels, handleGearChange, requestEngineToggle } from '../js/physics/engine.js';
import { computeTireForces } from '../js/physics/tires.js';
import { initializeCarBody, computeBodyDerivedState } from '../js/physics/kinematics.js';
import { mechanicalStep } from './helpers/mechanical-step.js';
import { TAU } from '../js/constants.js';

// Baseline expectations corrected only where finite capacity/input inertia require it;
// see docs/drivetrain-repair.md. All cases are ordinary assertions after repair.
const initial = structuredClone(state);
const dt = .01;
const crank = () => state.engine.omega ?? state.engine.rpm * TAU / 60;
const axle = () => (state.wheelOmega.rearLeft + state.wheelOmega.rearRight) / 2;
const ratio = () => (state.engine.currentGear === 'N' ? 0
  : state.engine.currentGear === 'R' ? -state.params.gearRatio1
  : state.params[`gearRatio${state.engine.currentGear}`]) * state.params.finalDriveRatio;
const shaft = () => state.engine.inputOmega ?? ratio() * axle();
const rotationalEnergy = () => .5 * state.params.gearboxInputInertiaKgM2 * shaft() ** 2
  + .5 * state.params.engineInertiaKgM2 * crank() ** 2
  + .5 * state.params.wheelInertia * (state.wheelOmega.rearLeft ** 2 + state.wheelOmega.rearRight ** 2);
// Generalized momentum at the crank, for a fixed, signed, ideal gear ratio.
// It is not the spatial angular momentum of the gear housing plus rotors.
const momentum = () => state.params.gearboxInputInertiaKgM2 * shaft()
  + state.params.engineInertiaKgM2 * crank()
  + state.params.wheelInertia * (state.wheelOmega.rearLeft + state.wheelOmega.rearRight) / ratio();
const measure = (name, data = {}) => {
  if (process.env.DRIVETRAIN_MEASURE === '1') console.info(JSON.stringify({ name,
    rpm: state.engine.rpm, wheelOmega: axle(), slip: crank() - ratio() * axle(),
    torque: state.engine.transmittedTorqueNm, speed: state.body.speed,
    running: state.engine.isRunning, stalled: state.engine.isStalled,
    locked: state.engine.drivetrainLocked, ...data }));
};
function rotationalStep(h = dt) {
  updateEngine(h); computeTireForces(h); synchronizeEngineWithWheels(h);
}
function connect(gear = '1') {
  state.engine.currentGear = gear;
  state.engine.clutchPedalPosition = 1;
  state.engine.clutchEngagement = 1;
  state.input.clutchKeyHeld = false;
}
function isolated() {
  // No external tire/brake work; a 1:1 ratio makes momentum accounting direct.
  state.params.tireFrictionCoeff = 0;
  state.params.gearRatio1 = state.params.finalDriveRatio = 1;
  state.params.idleCreepForce = 0;
}

// Execute the real button handler without importing the DOM-wide controls module.
// Like mechanical-step.js, fail loudly if its production boundary changes.
const controls = fs.readFileSync(new URL('../js/ui/controls.js', import.meta.url), 'utf8');
const toggleBody = controls.match(/getElementById\('engineToggle'\)\.addEventListener\('click',\(\)=>\{([\s\S]*?)\n \}\);/);
if (!toggleBody) throw Error('Engine button handler boundary changed');
const engineButton = new Function('requestEngineToggle', toggleBody[1]).bind(null, requestEngineToggle);

beforeEach(() => {
  Object.assign(state, structuredClone(initial));
  initializeCarBody(100, 100); computeBodyDerivedState(dt);
  state.engine.currentGear = 'N';
  state.engine.rpm = state.params.idleRpm;
  state.engine.clutchPedalPosition = state.engine.clutchEngagement = 0;
  state.input.clutchKeyHeld = true;
});

describe('drivetrain behavioral baseline — production mechanics at 100 Hz', () => {
  it('maintains stable neutral idle with the pedal released', () => {
    state.input.clutchKeyHeld = false;
    state.engine.rpm = state.params.idleRpm + 200;
    for (let i = 0; i < 500; i++) mechanicalStep(dt);
    measure('neutral idle, 5 s');
    // The existing governor has a ~0.524 s small-signal time constant.
    expect(Math.abs(state.engine.rpm - state.params.idleRpm)).toBeLessThan(.05);
    expect(state.engine.isStalled).toBe(false);
    expect(axle()).toBe(0);
    expect(state.body.speed).toBeLessThan(1e-9);
  });

  it('idles independently of first gear with the clutch open', () => {
    state.engine.currentGear = '1';
    for (let i = 0; i < 300; i++) mechanicalStep(dt);
    measure('first gear, clutch open, 3 s');
    expect(state.engine.rpm).toBeCloseTo(state.params.idleRpm, 9);
    expect(state.engine.transmittedTorqueNm).toBe(0);
    expect(axle()).toBe(0);
    expect(state.body.speed).toBeLessThan(1e-9);
  });

  it('records gentle no-throttle takeoff without requiring uncalibrated engine performance', () => {
    state.engine.currentGear = '1';
    state.params.clutchEngageTime = 2; // Slower driver pedal motion, not an engine/grip tune.
    state.input.clutchKeyHeld = false;
    let maxSpeed = 0, minRpm = Infinity, maxTorque = 0, stallAt = null, firstLock = null;
    for (let i = 0; i < 300; i++) {
      const wasLocked = state.engine.drivetrainLocked;
      const previous = { rpm: state.engine.rpm, torque: state.engine.transmittedTorqueNm, slip: crank() - ratio() * axle() };
      mechanicalStep(dt);
      if (!wasLocked && state.engine.drivetrainLocked && firstLock === null) firstLock = {
        time: (i + 1) * dt, previous, rpm: state.engine.rpm,
        torque: state.engine.transmittedTorqueNm, slip: crank() - ratio() * axle(),
      };
      maxSpeed = Math.max(maxSpeed, state.body.speed);
      minRpm = Math.min(minRpm, state.engine.rpm);
      maxTorque = Math.max(maxTorque, Math.abs(state.engine.transmittedTorqueNm));
      if (state.engine.isStalled && stallAt === null) stallAt = (i + 1) * dt;
      expect(Number.isFinite(state.engine.rpm)).toBe(true);
      expect(state.engine.rpm).toBeGreaterThanOrEqual(0);
      if (state.engine.isStalled) expect(state.engine.mode).toBe('stalled');
    }
    measure('gentle takeoff, 3 s', { maxSpeed, minRpm, maxTorque, stallAt, firstLock });
  });

  it('eventually stalls after abrupt clutch release against the brakes without throttle', () => {
    connect(); state.input.brakeKeyHeld = true;
    for (let i = 0; i < 100; i++) mechanicalStep(dt);
    measure('abrupt release, brakes, 1 s');
    expect(state.engine.isStalled).toBe(true);
    expect(state.engine.combustionTorqueNm).toBe(0);
  });

  it('does not finish a locked tick running at zero crank speed', () => {
    connect(); state.input.brakeKeyHeld = true;
    mechanicalStep(dt);
    measure('first locked tick at rest');
    expect(state.engine.isStalled || !state.engine.isRunning || state.engine.rpm > 0).toBe(true);
  });

  it('cannot sustain combustion at zero RPM just because accelerator is held', () => {
    connect(); state.input.throttleKeyHeld = true; state.input.brakeKeyHeld = true;
    state.input.handbrakeKeyHeld = true;
    for (let i = 0; i < 100; i++) mechanicalStep(dt);
    measure('held brake and accelerator, 1 s');
    expect(state.engine.isStalled).toBe(true);
  });

  it('does not waive its own low-RPM stall criterion because the chassis is moving', () => {
    connect(); state.engine.rpm = 100; state.body.speed = 1;
    state.wheelOmega.rearLeft = state.wheelOmega.rearRight = crank() / ratio();
    updateEngine(dt); measure('100 RPM, chassis moving at 1 m/s');
    expect(state.engine.isStalled).toBe(true);
  });

  it('requires a starting action rather than throttle alone to restart a stationary stalled crank', () => {
    state.engine.isStalled = true; state.engine.rpm = 0;
    state.input.throttleKeyHeld = true;
    updateEngine(dt);
    measure('throttle-only restart');
    expect(state.engine.isStalled).toBe(true);
  });

  it('recovers from stall only by a finite starter action', () => {
    state.engine.isStalled = true; state.engine.rpm = 0;
    engineButton(); updateEngine(dt);
    measure('starter recovery first tick');
    expect(state.engine.mode).toBe('starting');
    expect(state.engine.rpm).toBeGreaterThan(0);
    expect(state.engine.rpm).toBeLessThan(20);
    expect(state.engine.starterWorkJ).toBeGreaterThan(0);
  });

  it('does not create crank energy instantaneously when the engine button is pressed', () => {
    state.engine.isRunning = false; state.engine.rpm = 0;
    engineButton();
    measure('engine ON, no elapsed time', { energyCreatedJ: .5 * state.params.engineInertiaKgM2 * crank() ** 2 });
    expect(crank()).toBe(0); // Starter torque must act over time before speed rises.
  });

  it('updates the clutch pedal even with the ignition off', () => {
    connect(); state.engine.isRunning = false; state.input.clutchKeyHeld = true;
    for (let i = 0; i < 100; i++) updateEngine(dt);
    measure('engine OFF, depress clutch, 1 s', { pedal: state.engine.clutchPedalPosition });
    expect(state.engine.clutchPedalPosition).toBe(0);
  });

  it('does not instantly engage an unsynchronized upshift without depressing the clutch', () => {
    connect(); state.engine.rpm = 3000; state.wheelOmega.rearLeft = state.wheelOmega.rearRight = crank() / ratio();
    handleGearChange('2');
    measure('unsynchronized clutchless upshift', { gear: state.engine.currentGear });
    expect(state.engine.currentGear).not.toBe('2');
  });

  it('keeps crank speed independent during an open-clutch upshift', () => {
    state.engine.currentGear = '1'; state.engine.rpm = 3000;
    handleGearChange('2'); rotationalStep();
    measure('open-clutch upshift');
    expect(state.engine.drivetrainLocked).toBe(false);
    expect(state.engine.rpm).toBeGreaterThan(2900);
    expect(state.engine.rpm).toBeLessThan(3000);
    expect(state.engine.transmittedTorqueNm).toBe(0);
  });

  it('does not request an unenabled automatic rev-match on downshift', () => {
    state.engine.currentGear = '3'; state.body.speed = 15;
    handleGearChange('1');
    measure('downshift, no assistance requested', { blipSeconds: state.engine.revMatchTimer, targetRpm: state.engine.revMatchTargetRpm });
    expect(state.engine.revMatchTimer).toBe(0);
  });

  it('does not connect reverse instantly to a forward-spinning driveline', () => {
    connect(); state.body.speed = 10;
    state.wheelOmega.rearLeft = state.wheelOmega.rearRight = 10 / state.params.wheelRadius;
    handleGearChange('R');
    measure('forward-to-reverse request', { gear: state.engine.currentGear });
    expect(state.engine.currentGear).not.toBe('R');
  });

  it('matches the driven axle at lock when the crank direction is valid', () => {
    connect(); state.wheelOmega.rearLeft = state.wheelOmega.rearRight = 20;
    state.engine.rpm=20*ratio()*60/TAU;
    rotationalStep(); measure('already locked, forward');
    expect(crank()).toBeCloseTo(ratio() * axle(), 10);
  });

  it('preserves signed shaft agreement instead of hiding backwards crank rotation with abs', () => {
    connect('R'); state.body.speed = 10;
    state.wheelOmega.rearLeft = state.wheelOmega.rearRight = 20;
    state.engine.omega=ratio()*20; state.engine.mode='stopped';
    rotationalStep(); measure('reverse gear, forward axle');
    expect(crank()).toBeCloseTo(ratio() * axle(), 10);
  });

  it('accounts for equal/opposite slipping-clutch impulses and dissipated work', () => {
    isolated(); state.engine.currentGear = '1';
    state.engine.clutchPedalPosition = .4; state.input.clutchKeyHeld = false;
    const p0 = momentum(), e0 = rotationalEnergy(), slip0 = crank() - ratio() * axle();
    rotationalStep();
    const heat = state.engine.transmittedTorqueNm * .5 * (slip0 + crank() - ratio() * axle()) * dt;
    measure('isolated slipping clutch', { momentumErrorNms: momentum() - p0, energyChangeJ: rotationalEnergy() - e0, clutchHeatJ: heat });
    expect(state.engine.drivetrainLocked).toBe(false);
    expect(heat).toBeGreaterThan(0);
    expect(momentum()).toBeCloseTo(p0, 9);
    expect(rotationalEnergy() - e0).toBeCloseTo(-heat, 9);
  });

  it('opposes forward wheel rotation through a slipping reverse clutch', () => {
    isolated(); state.engine.currentGear = 'R';
    state.engine.clutchPedalPosition = .4; state.input.clutchKeyHeld = false;
    state.wheelOmega.rearLeft = state.wheelOmega.rearRight = 20;
    const p0 = momentum(), e0 = rotationalEnergy();
    rotationalStep();
    measure('slipping reverse, forward axle', { momentumErrorNms: momentum() - p0, energyChangeJ: rotationalEnergy() - e0 });
    expect(state.engine.transmittedTorqueNm).toBeGreaterThan(0);
    expect(axle()).toBeLessThan(20);
    expect(momentum()).toBeCloseTo(p0, 9);
    expect(rotationalEnergy()).toBeLessThan(e0);
  });

  it('includes the correct common-mode engine inertia for equal rear-wheel accelerations', () => {
    isolated(); connect(); state.input.throttleKeyHeld = true;
    state.wheelOmega.rearLeft = state.wheelOmega.rearRight = crank();
    const w0 = axle();
    rotationalStep();
    const expectedDelta = state.engine.netEngineImpulse
      / (state.params.engineInertiaKgM2 + state.params.gearboxInputInertiaKgM2 + 2 * state.params.wheelInertia);
    measure('locked common-mode torque response', { expectedDelta, actualDelta: axle() - w0 });
    expect(axle() - w0).toBeCloseTo(expectedDelta, 10);
  });

  it('shares angular momentum when a spinning crank locks to stationary wheels', () => {
    isolated(); connect();
    const p0 = momentum(), expectedOmega = p0 / (state.params.engineInertiaKgM2 + state.params.gearboxInputInertiaKgM2 + 2 * state.params.wheelInertia);
    rotationalStep();
    measure('isolated lock, stationary wheels', { momentumErrorNms: momentum() - p0, expectedOmega });
    expect(momentum()).toBeCloseTo(p0, 9);
    expect(Math.abs(state.engine.transmittedTorqueNm)).toBeLessThanOrEqual(state.params.clutchCapacityNm);
    expect(axle()).toBeGreaterThan(0);
  });

  it('never injects kinetic energy when a passive clutch locks to faster wheels', () => {
    isolated(); connect(); state.wheelOmega.rearLeft = state.wheelOmega.rearRight = 100;
    const e0 = rotationalEnergy(), p0 = momentum();
    rotationalStep();
    measure('isolated lock, faster wheels', { energyCreatedJ: rotationalEnergy() - e0, momentumErrorNms: momentum() - p0 });
    expect(rotationalEnergy()).toBeLessThanOrEqual(e0 + 1e-9);
  });

  it('uses the shared crank inertia rather than two independent reflected half-inertias', () => {
    isolated(); connect();
    state.wheelOmega.rearLeft = state.wheelOmega.rearRight = crank();
    updateEngine(dt);
    // One-sided road reaction excites both common and differential axle modes.
    state.params.tireFrictionCoeff = initial.params.tireFrictionCoeff;
    for (const name of Object.keys(state.wheels)) state.wheelLoads[name] = name === 'rearLeft' ? 3000 : 0;
    const left0 = state.wheelOmega.rearLeft, right0 = state.wheelOmega.rearRight;
    computeTireForces(dt); synchronizeEngineWithWheels(dt);
    const dl = state.wheelOmega.rearLeft - left0, dr = state.wheelOmega.rearRight - right0;
    const impulseRight = -state.params.wheelRadius * -state.wheelForces.rearRight.fy * dt;
    const actualRightMomentumChange = state.params.wheelInertia * dr + (state.params.engineInertiaKgM2+state.params.gearboxInputInertiaKgM2) * ratio() ** 2 / 4 * (dl + dr);
    measure('locked axle, one-sided contact', { dl, dr, impulseRight, actualRightMomentumChange });
    expect(actualRightMomentumChange).toBeCloseTo(impulseRight, 9);
  });

  it('coasts without drivetrain torque with engine off and clutch open', () => {
    isolated(); state.engine.isRunning = false;
    state.wheelOmega.rearLeft = state.wheelOmega.rearRight = 20;
    rotationalStep(); measure('OFF, open clutch, free rotors');
    expect(axle()).toBe(20);
    expect(state.engine.transmittedTorqueNm).toBe(0);
  });

  it('back-drives a connected crank when ignition is off', () => {
    isolated(); connect(); state.engine.isRunning = false; state.engine.rpm = 20 * 60 / TAU;
    state.wheelOmega.rearLeft = state.wheelOmega.rearRight = 20;
    rotationalStep(); measure('OFF, engaged clutch, rolling wheels');
    expect(crank()).toBeGreaterThan(0);
    expect(crank()).toBeCloseTo(ratio() * axle(), 9);
  });

  it('does not reflect stalled engine inertia while pinning its connected crank at zero', () => {
    isolated(); connect(); state.engine.isStalled = true; state.engine.rpm = 0;
    state.wheelOmega.rearLeft = state.wheelOmega.rearRight = 20;
    rotationalStep(); measure('stalled, engaged clutch, rolling wheels');
    expect(crank()).toBeGreaterThan(0);
    expect(Math.abs(crank()-ratio()*axle())).toBeLessThan(20);
  });
});
