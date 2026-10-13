import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
});

import state from '../js/state.js';
import {
  handleGearChange,
  updateEngine,
  synchronizeEngineWithWheels,
} from '../js/physics/engine.js';
import { TAU } from '../js/constants.js';

const initial = structuredClone(state);

beforeEach(() => {
  Object.assign(state, structuredClone(initial));
  state.engine.currentGear = 'N';
  state.engine.rpm = state.params.idleRpm;
  state.engine.clutchPedalPosition = 0;
  state.engine.clutchEngagement = 0;
  state.input.clutchKeyHeld = true;
  state.input.throttleKeyHeld = false;
  state.input.mouseThrottleActive = false;
  state.body.speed = 0;
  state.wheelOmega.rearLeft = 0;
  state.wheelOmega.rearRight = 0;
});

describe('engine and clutch rotational inertia', () => {
  it('free-revs by integrating combustion torque over engine inertia', () => {
    state.input.throttleKeyHeld = true;
    const idleRpm = state.engine.rpm;

    updateEngine(0.01);
    const firstStepRpm = state.engine.rpm;
    for (let i = 0; i < 49; i++) updateEngine(0.01);

    expect(firstStepRpm).toBeGreaterThan(idleRpm);
    expect(firstStepRpm - idleRpm).toBeLessThan(100);
    expect(state.engine.rpm).toBeGreaterThan(idleRpm + 500);
    expect(state.engine.rpm).toBeLessThan(state.params.redlineRpm);
  });

  it('loads the crankshaft through a slipping clutch', () => {
    state.engine.currentGear = '1';
    state.engine.rpm = 3000;
    state.engine.clutchPedalPosition = 0.45;
    state.input.clutchKeyHeld = false;
    updateEngine(0.01);
    const loadedRpm = state.engine.rpm;

    state.engine.currentGear = 'N';
    state.engine.rpm = 3000;
    state.engine.clutchPedalPosition = 0;
    state.engine.clutchEngagement = 0;
    state.input.clutchKeyHeld = true;
    updateEngine(0.01);

    expect(loadedRpm).toBeLessThan(3000);
    expect(loadedRpm).toBeLessThan(state.engine.rpm);
    expect(state.engine.transmittedTorqueNm).toBe(0);
  });

  it('stalls at rest when the clutch loads the engine below its stall speed', () => {
    state.engine.currentGear = '1';
    state.engine.rpm = 250;
    state.engine.clutchPedalPosition = 0.5;
    state.input.clutchKeyHeld = false;

    updateEngine(0.01);

    expect(state.engine.isStalled).toBe(true);
    expect(state.engine.rpm).toBe(0);
    expect(state.engine.transmittedTorqueNm).toBe(0);
  });

  it('synchronizes locked engine RPM to the driven axle after the wheel solve', () => {
    state.engine.currentGear = '1';
    state.engine.clutchPedalPosition = 1;
    state.input.clutchKeyHeld = false;
    state.wheelOmega.rearLeft = 20;
    state.wheelOmega.rearRight = 20;
    updateEngine(0.01);
    expect(state.engine.drivetrainLocked).toBe(true);

    state.wheelOmega.rearLeft = 24;
    state.wheelOmega.rearRight = 24;
    synchronizeEngineWithWheels();
    const expectedRpm = 24 * state.params.gearRatio1 * state.params.finalDriveRatio * 60 / TAU;
    expect(state.engine.rpm).toBeCloseTo(expectedRpm, 10);
  });

  it('keeps engine RPM independent while shifting with the clutch disengaged', () => {
    state.engine.currentGear = '1';
    state.engine.rpm = 4000;
    state.engine.clutchPedalPosition = 0;
    state.engine.clutchEngagement = 0;
    state.input.clutchKeyHeld = true;
    state.body.speed = 12;

    handleGearChange('2');
    updateEngine(0.01);

    expect(state.engine.currentGear).toBe('2');
    expect(state.engine.drivetrainLocked).toBe(false);
    expect(state.engine.rpm).toBeLessThan(4000);
    expect(state.engine.rpm).toBeGreaterThan(3900);
  });

  it('classifies reverse gear changes by ratio magnitude for rev matching', () => {
    state.engine.currentGear = '2';
    state.engine.rpm = 1000;
    state.body.speed = 10;

    handleGearChange('R');

    const expectedTarget = state.body.speed * 60 / (TAU * state.params.wheelRadius)
      * Math.abs(state.params.gearRatio1) * state.params.finalDriveRatio;
    expect(state.engine.currentGear).toBe('R');
    expect(state.engine.revMatchTimer).toBeGreaterThan(0);
    expect(state.engine.revMatchTargetRpm).toBeCloseTo(expectedTarget, 8);
  });
});
