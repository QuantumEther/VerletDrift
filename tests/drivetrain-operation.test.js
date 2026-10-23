import { beforeEach, describe, it, expect, vi } from 'vitest';
vi.hoisted(()=>{globalThis.localStorage={getItem:()=>null,setItem:()=>{}};});
import state from '../js/state.js';
import { updateEngine, synchronizeEngineWithWheels, requestEngineToggle } from '../js/physics/engine.js';
import { computeTireForces } from '../js/physics/tires.js';
const initial=structuredClone(state);
const step=dt=>{updateEngine(dt);computeTireForces(dt);synchronizeEngineWithWheels(dt);};
beforeEach(()=>{Object.assign(state,structuredClone(initial));state.input.clutchKeyHeld=true;});
describe('starter and engine operation',()=>{
 it('accounts starter work and drag without a speed assignment',()=>{
  Object.assign(state.engine,{mode:'stopped',omega:0,rpm:0,isRunning:false});
  requestEngineToggle();expect(state.engine.omega).toBe(0);
  step(.01);
  expect(state.engine.mode).toBe('starting');
  expect(state.engine.omega).toBeGreaterThan(0);
  expect(state.engine.rpm).toBeLessThan(20);
  expect(.5*state.params.engineInertiaKgM2*state.engine.omega**2)
    .toBeCloseTo(state.engine.starterWorkJ-state.engine.dragWorkJ,12);
 });
 it('restarts by starter action and settles to idle',()=>{
  Object.assign(state.engine,{mode:'stalled',omega:0,rpm:0});requestEngineToggle();
  for(let i=0;i<500;i++)step(.01);
  expect(state.engine.mode).toBe('running');expect(state.engine.rpm).toBeCloseTo(800,0);
  expect(state.engine.starterWorkJ).toBeGreaterThan(200);
 });
 it('retains signed backwards rotation with the ignition off',()=>{
  Object.assign(state.engine,{mode:'stopped',omega:-100,rpm:100*60/(2*Math.PI)});
  step(.01);expect(state.engine.omega).toBeLessThan(0);
  expect(state.engine.omega).toBeGreaterThan(-100);
  expect(state.engine.combustionTorqueNm).toBe(0);
 });
 it('stalls under throttle without deleting mechanical crank momentum',()=>{
  Object.assign(state.engine,{mode:'running',omega:10});state.input.throttleKeyHeld=true;
  step(.01);expect(state.engine.mode).toBe('stalled');expect(state.engine.omega).toBeGreaterThan(0);
  const previous=state.engine.omega;step(.01);
  expect(state.engine.mode).toBe('stalled');expect(state.engine.omega).toBeLessThan(previous);
 });
});
