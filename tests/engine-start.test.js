import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { globalThis.localStorage = { getItem: () => null, setItem: () => {} }; });
import state from '../js/state.js';
import { requestEngineStart, requestEngineToggle, updateEngine } from '../js/physics/engine.js';

const initial = structuredClone(state);
beforeEach(() => Object.assign(state, structuredClone(initial)));

describe('explicit engine start request', () => {
  it.each(['stopped', 'stalled'])('%s engine starts through the finite starter model', mode => {
    Object.assign(state.engine, { mode, omega: 0, rpm: 0, isRunning: false, isStalled: mode === 'stalled' });
    expect(requestEngineStart()).toBe(true);
    expect(state.engine.omega).toBe(0);
    expect(state.engine.mode).toBe(mode);
    updateEngine(.01);
    expect(state.engine.mode).toBe('starting');
    expect(state.engine.omega).toBeGreaterThan(0);
    expect(state.engine.starterWorkJ).toBeGreaterThan(0);
  });

  it('does not reinitialize a start already in progress or stop a running engine', () => {
    Object.assign(state.engine, { mode: 'starting', omega: 12, command: null });
    expect(requestEngineStart()).toBe(false);
    expect(state.engine.command).toBeNull();
    expect(state.engine.omega).toBe(12);
    Object.assign(state.engine, { mode: 'running', omega: 120, command: null });
    expect(requestEngineStart()).toBe(false);
    expect(state.engine.command).toBeNull();
  });

  it('keeps the engine button toggle routed through the same start request', () => {
    Object.assign(state.engine, { mode: 'stopped', omega: 0, command: null });
    requestEngineToggle();
    expect(state.engine.command).toBe('start');
    updateEngine(.01);
    expect(state.engine.mode).toBe('starting');
    requestEngineToggle();
    expect(state.engine.command).toBe('stop');
  });
});
