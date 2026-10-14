import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { globalThis.localStorage = { getItem: () => null, setItem: () => {} }; });
import state from '../js/state.js';
import { updateEngine, synchronizeEngineWithWheels } from '../js/physics/engine.js';
import { computeTireForces } from '../js/physics/tires.js';
import { initializeCarBody, computeBodyDerivedState } from '../js/physics/kinematics.js';
import { TAU } from '../js/constants.js';
const initial = structuredClone(state);
function tick(dt = 0.01) {
  updateEngine(dt);
  computeTireForces(dt);
  synchronizeEngineWithWheels();
}
beforeEach(() => {
  Object.assign(state, structuredClone(initial));
  initializeCarBody(100, 100);
  computeBodyDerivedState(0.01);
  state.engine.clutchPedalPosition = 1;
  state.engine.clutchEngagement = 1;
  for (const name in state.wheelLoads) state.wheelLoads[name] = 0;
});

describe('drivetrain overspeed audit', () => {
  it('idles in neutral with the clutch released instead of loading a stationary axle', () => {
    state.engine.currentGear = 'N';
    for (let i = 0; i < 300; i++) tick();
    expect(state.engine.isStalled).toBe(false);
    expect(state.engine.rpm).toBeCloseTo(state.params.idleRpm, 7);
    expect(state.engine.transmittedTorqueNm).toBe(0);
    state.input.throttleKeyHeld = true;
    for (let i = 0; i < 100; i++) tick();
    expect(state.engine.rpm).toBeGreaterThan(state.params.idleRpm);
    expect(state.wheelOmega.rearLeft).toBe(0);
  });

  it.each(['1', '2', '3', '4', '5', '6', 'R'].flatMap(gear => [[gear, 7000], [gear, 9000]]))
  ('unloaded wheels settle near the rev limiter in gear %s at %s RPM', (gear, redline) => {
    state.engine.currentGear = gear;
    state.params.redlineRpm = redline;
    state.input.throttleKeyHeld = true;
    const ratio = (gear === 'R' ? -state.params.gearRatio1 : state.params['gearRatio' + gear])
      * state.params.finalDriveRatio;
    state.wheelOmega.rearLeft = state.wheelOmega.rearRight = state.engine.rpm * TAU / (60 * ratio);
    let peakRpm = 0;
    for (let i = 0; i < 2000; i++) {
      tick();
      peakRpm = Math.max(peakRpm, state.engine.rpm);
      const actualRpm = Math.abs((state.wheelOmega.rearLeft + state.wheelOmega.rearRight)
        * 0.5 * ratio) * 60 / TAU;
      expect(state.engine.rpm).toBeCloseTo(actualRpm, 7);
    }
    expect(peakRpm).toBeLessThan(state.params.redlineRpm + 150);
    expect(state.engine.rpm).toBeGreaterThan(state.params.redlineRpm - 150);
    expect(Math.abs(state.wheelOmega.rearLeft)).toBeLessThan(500);
    expect(Math.sign(state.wheelOmega.rearLeft)).toBe(Math.sign(ratio));
  });

  it('shows mechanically imposed over-rev and cuts combustion torque', () => {
    state.engine.currentGear = '1';
    state.engine.drivetrainLocked = true;
    state.wheelOmega.rearLeft = state.wheelOmega.rearRight = 100;
    synchronizeEngineWithWheels();
    expect(state.engine.rpm).toBeGreaterThan(state.params.redlineRpm);
    state.input.throttleKeyHeld = true;
    updateEngine(0.01);
    expect(state.engine.transmittedTorqueNm).toBeLessThan(0);
  });

  it('closed throttle dissipates driven-wheel energy through engine friction', () => {
    state.engine.currentGear = '1';
    state.engine.drivetrainLocked = true;
    state.wheelOmega.rearLeft = state.wheelOmega.rearRight = 100;
    synchronizeEngineWithWheels();
    const before = state.wheelOmega.rearLeft;
    for (let i = 0; i < 100; i++) tick();
    expect(state.wheelOmega.rearLeft).toBeLessThan(before);
    expect(state.wheelOmega.rearLeft).toBeGreaterThan(0);
  });

  it.each([['1', -100], ['R', 100]])('engine drag remains passive when gear %s is back-driven', (gear, omega) => {
    state.engine.currentGear = gear;
    state.engine.drivetrainLocked = true;
    state.wheelOmega.rearLeft = state.wheelOmega.rearRight = omega;
    synchronizeEngineWithWheels();
    for (let i = 0; i < 100; i++) tick();
    expect(Math.abs(state.wheelOmega.rearLeft)).toBeLessThan(Math.abs(omega));
    expect(Math.sign(state.wheelOmega.rearLeft)).toBe(Math.sign(omega));
  });

  it('idle creep is crank torque rather than a second wheel motor', () => {
    state.engine.currentGear = '1';
    state.engine.rpm = state.params.idleRpm;
    state.engine.transmittedTorqueNm = 0;
    state.engine.drivetrainLocked = true;
    computeTireForces(0.01);
    expect(state.wheelOmega.rearLeft).toBe(0);
    state.engine.rpm = 500;
    state.body.speed = 1;
    updateEngine(0.01);
    expect(state.engine.transmittedTorqueNm).toBeGreaterThan(0);
    expect(state.engine.transmittedTorqueNm * state.params.gearRatio1 * state.params.finalDriveRatio
      / state.params.wheelRadius).toBeLessThanOrEqual(state.params.idleCreepForce + 1e-8);
  });

  it.each(['frontLeft', 'rearLeft'])('service brake stops a spinning %s even without road contact', name => {
    state.engine.currentGear = 'N';
    state.wheelOmega[name] = 100;
    state.input.brakeKeyHeld = true;
    for (let i = 0; i < 100; i++) tick();
    expect(state.wheelOmega[name]).toBe(0);
  });

  it('does not erase freely rotating wheel momentum at an arbitrary speed cap', () => {
    state.engine.currentGear = 'N';
    state.wheelOmega.frontLeft = 650;
    state.wheelOmega.rearLeft = -650;
    tick();
    expect(state.wheelOmega.frontLeft).toBe(650);
    expect(state.wheelOmega.rearLeft).toBe(-650);
  });
});
