import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
});

import state from '../js/state.js';
import { handleGearChange, updateEngine, synchronizeEngineWithWheels } from '../js/physics/engine.js';

const initial = structuredClone(state);
const gears = ['N', 'R', '1', '2', '3', '4', '5', '6'];

beforeEach(() => {
  Object.assign(state, structuredClone(initial));
  state.engine.currentGear = 'N';
  state.engine.previousGear = 'N';
  state.engine.isRunning = true;
  state.engine.isStalled = false;
  state.engine.rpm = state.params.idleRpm;
  state.engine.clutchPedalPosition = 0;
  state.engine.clutchEngagement = 0;
  state.engine.drivetrainLocked = false;
  state.input.clutchKeyHeld = true;
  state.input.throttleKeyHeld = false;
  state.input.mouseThrottleActive = false;
  state.body.speed = 0;
  state.wheelOmega.rearLeft = 0;
  state.wheelOmega.rearRight = 0;
});

describe('authoritative transmission selection', () => {
  it('repeatedly selects every supported gear while the engine is running', () => {
    for (const gear of [...gears, ...gears.slice().reverse()]) {
      expect(handleGearChange(gear)).toBe(true);
      expect(state.engine.currentGear).toBe(gear);
    }
  });

  it('selects gears with the engine off and keeps them through restart', () => {
    state.engine.isRunning = false;
    handleGearChange('3');
    updateEngine(0.01);
    expect(state.engine.currentGear).toBe('3');
    expect(state.engine.rpm).toBe(0);
    expect(state.engine.transmittedTorqueNm).toBe(0);

    state.engine.isRunning = true;
    state.engine.isStalled = false;
    state.engine.rpm = state.params.idleRpm;
    updateEngine(0.01);
    expect(state.engine.currentGear).toBe('3');
    expect(state.engine.isRunning).toBe(true);
  });

  it('rejects unknown gears without leaving a contradictory transmission state', () => {
    state.engine.currentGear = '2';
    expect(handleGearChange('7')).toBe(false);
    expect(handleGearChange('bogus')).toBe(false);
    expect(state.engine.currentGear).toBe('2');
  });

  it.each([
    ['disengaged', 0, false],
    ['transitioning', 0.5, false],
    ['engaged', 1, true],
  ])('preserves gear selection with clutch %s', (_name, pedalPosition, locked) => {
    state.engine.clutchPedalPosition = pedalPosition;
    state.input.clutchKeyHeld = pedalPosition === 0;
    state.engine.currentGear = '1';
    state.engine.rpm = 3000;
    state.input.throttleKeyHeld = true;
    handleGearChange('2');
    updateEngine(0.01);
    expect(state.engine.currentGear).toBe('2');
    expect(state.engine.drivetrainLocked).toBe(locked);
  });

  it('recovers from a stall by disengaging the clutch and applying throttle', () => {
    state.engine.currentGear = '1';
    state.engine.isStalled = true;
    state.engine.rpm = 0;
    state.engine.clutchPedalPosition = 1;
    state.engine.clutchEngagement = 1;
    state.input.clutchKeyHeld = true;
    state.input.throttleKeyHeld = true;
    handleGearChange('2');
    for (let i = 0; i < Math.ceil(state.params.clutchEngageTime / 0.01) + 2; i++) updateEngine(0.01);
    expect(state.engine.currentGear).toBe('2');
    expect(state.engine.isStalled).toBe(false);
    expect(state.engine.rpm).toBeGreaterThan(state.params.idleRpm);
  });

  it.each(gears.filter(gear => gear !== 'N'))('delivers engine torque in selected gear %s when engaged', gear => {
    state.engine.currentGear = 'N';
    handleGearChange(gear);
    state.engine.clutchPedalPosition = 1;
    state.engine.clutchEngagement = 1;
    state.input.clutchKeyHeld = false;
    state.input.throttleKeyHeld = true;
    state.engine.rpm = 3000;
    updateEngine(0.01);
    expect(state.engine.currentGear).toBe(gear);
    expect(state.engine.drivetrainLocked).toBe(true);
    expect(state.engine.transmittedTorqueNm).toBeGreaterThan(0);
    state.wheelOmega.rearLeft = state.wheelOmega.rearRight = 10;
    synchronizeEngineWithWheels();
    expect(state.engine.rpm).toBeGreaterThan(0);
  });
});
