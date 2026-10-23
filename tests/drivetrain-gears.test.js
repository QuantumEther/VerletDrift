import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.hoisted(()=>{globalThis.localStorage={getItem:()=>null,setItem:()=>{}};});
import state from '../js/state.js';
import {updateEngine,synchronizeEngineWithWheels,handleGearChange} from '../js/physics/engine.js';
import {computeTireForces} from '../js/physics/tires.js';
const initial=structuredClone(state);
const step=()=>{updateEngine(.01);computeTireForces(.01);synchronizeEngineWithWheels(.01);};
beforeEach(()=>{Object.assign(state,structuredClone(initial));state.input.clutchKeyHeld=true;state.params.tireFrictionCoeff=0;});
describe('manual gearbox input shaft',()=>{
 it('rejects invalid requests and repeats do not change mechanical state',()=>{
  expect(handleGearChange('bogus')).toBe(false);handleGearChange('1');
  const old=structuredClone(state.engine);handleGearChange('1');expect(state.engine).toEqual(old);
  expect(state.engine.currentGear).toBe('N');step();expect(state.engine.currentGear).toBe('1');
 });
 it('synchronizes with bounded work and equal/opposite generalized impulses',()=>{
  Object.assign(state.engine,{mode:'stopped',omega:0,inputOmega:100});handleGearChange('1');
  const p=state.params,g=p.gearRatio1*p.finalDriveRatio, Ji=p.gearboxInputInertiaKgM2,Iw=p.wheelInertia;
  const before=.5*Ji*100**2;
  step();
  expect(state.engine.currentGear).toBe('N');expect(state.engine.shiftState).toBe('synchronizing');
  const w=state.wheelOmega;
  expect(Ji*state.engine.inputOmega+Iw*(w.rearLeft+w.rearRight)/g).toBeCloseTo(Ji*100,11);
  const after=.5*Ji*state.engine.inputOmega**2+.5*Iw*(w.rearLeft**2+w.rearRight**2);
  expect(after+state.engine.synchronizerHeatJ).toBeCloseTo(before,10);
  expect(Math.abs(state.engine.synchronizerTorqueNm)).toBeLessThanOrEqual(p.synchronizerCapacityNm);
  for(let i=0;i<100;i++)step();expect(state.engine.currentGear).toBe('1');
 });
 it('keeps a loaded dog engaged until the clutch unloads it',()=>{
  Object.assign(state.engine,{currentGear:'1',requestedGear:'1',transmittedTorqueNm:100,clutchPedalPosition:1});
  state.input.clutchKeyHeld=false;handleGearChange('2');updateEngine(.01);
  expect(state.engine.currentGear).toBe('1');expect(state.engine.shiftState).toBe('unloading');
  state.engine.clutchPedalPosition=0;state.input.clutchKeyHeld=true;updateEngine(.01);
  expect(state.engine.currentGear).not.toBe('1');
 });
 it('does not instantly connect reverse to a forward-spinning shaft',()=>{
  Object.assign(state.engine,{currentGear:'1',inputOmega:300});state.wheelOmega.rearLeft=state.wheelOmega.rearRight=20;
  handleGearChange('R');step();expect(state.engine.currentGear).not.toBe('R');
  expect(state.engine.requestedGear).toBe('R');expect(state.engine.synchronizerHeatJ).toBeGreaterThan(0);
 });
});
