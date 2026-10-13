import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
});

import state from '../js/state.js';
import { updateEngine, synchronizeEngineWithWheels } from '../js/physics/engine.js';
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
});
