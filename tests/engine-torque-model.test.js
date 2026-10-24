import {describe,it,expect,vi} from 'vitest';
vi.hoisted(()=>{globalThis.localStorage={getItem:()=>null,setItem:()=>{}};});
import state from '../js/state.js';
import {engineTorques,ENGINE_TORQUE_DEFAULTS,validateEngineTorqueParameters} from '../js/physics/engine-torque.js';
import {updateEngine,synchronizeEngineWithWheels} from '../js/physics/engine.js';
import {reset,run,scenarios} from '../research/engine-torque-model/harness.mjs';
import capture from '../docs/engine-free-rev-data/parameters.json';
const p={...capture.parameters,...ENGINE_TORQUE_DEFAULTS},rates=[50,100,200,400];
const w=n=>n*Math.PI/30;
const profile=(name,hz)=>run(p,scenarios.find(s=>s.name===name),hz);
describe('provisional physical engine torque model',()=>{
 it('rejects invalid calibration inputs without clamping them silently',()=>{
  expect(()=>validateEngineTorqueParameters(p)).not.toThrow();
  for(const key of ['engineDisplacementM3','enginePumpingSpeedRpm','engineIdleFadeRpm','engineLimiterBandRpm'])expect(()=>validateEngineTorqueParameters({...p,[key]:0})).toThrow();
  expect(()=>validateEngineTorqueParameters({...p,enginePumpingPressurePa:120000})).toThrow();
 });
 it('interprets full-load curve as brake torque without double subtracting friction',()=>{
  const t=engineTorques(w(4500),1,'running',p);
  expect(t.combustion-t.friction).toBeCloseTo(350,10);expect(t.pumping).toBe(0);expect(t.idle).toBe(0);
 });
 it('uses pressure, displacement and speed to determine passive losses',()=>{
  const closed=engineTorques(w(4000),0,'stopped',p),open=engineTorques(w(4000),1,'stopped',p);
  expect(closed.pumping).toBeGreaterThan(0);expect(open.pumping).toBe(0);
  expect(closed.friction).toBe(open.friction);expect(closed.combustion+closed.idle+closed.starter).toBe(0);
  const doubled=engineTorques(w(4000),0,'stopped',{...p,engineDisplacementM3:2*p.engineDisplacementM3});
  expect(doubled.pumping).toBeCloseTo(2*closed.pumping,10);expect(doubled.friction).toBeCloseTo(2*closed.friction,10);
 });
 it('has no combustion beyond operating range or with backwards crank rotation',()=>{
  for(const n of [-5000,0,7000,9000]){const t=engineTorques(w(n),1,'running',p);expect(t.combustion+t.idle).toBe(0);}
  for(const n of [2000,4000,6500])expect(engineTorques(w(n),0,'running',p).idle).toBe(0);
 });
 it('uses caller-owned output with bounded and continuous limiter torque',()=>{
  const out={};expect(engineTorques(w(6800),1,'running',p,out)).toBe(out);
  let last=Infinity;
  for(let n=6700;n<=7010;n+=.1){const t=engineTorques(w(n),1,'running',p);expect(t.combustion).toBeLessThanOrEqual(last+1e-8);expect(t.combustion).toBeGreaterThanOrEqual(0);last=t.combustion;}
 });
 it.each(rates)('preserves idle, finite work and passive signed shutdown at %i Hz',hz=>{
  reset(p);for(let i=0;i<hz*5;i++){updateEngine(1/hz);synchronizeEngineWithWheels(1/hz);expect(state.engine.rpm).toBeCloseTo(800,8);}
  for(const sign of [-1,1]){
   reset(p,{rpm:sign*4000,mode:'stopped'});let last=state.engine.omega;
   for(let i=0;i<hz*12;i++){
    updateEngine(1/hz);const e=state.engine,energy=.5*p.engineInertiaKgM2*(e.omega**2-last**2);
    expect(Math.abs(e.omega)).toBeLessThanOrEqual(Math.abs(last)+1e-10);expect(sign*e.omega).toBeGreaterThanOrEqual(0);
    expect(e.frictionWorkJ).toBeGreaterThanOrEqual(-1e-12);expect(e.pumpingWorkJ).toBeGreaterThanOrEqual(-1e-12);
    expect(Math.abs(energy-e.externalWorkJ+e.dragWorkJ)).toBeLessThan(1e-8);last=e.omega;
   }
   expect(last).toBe(0);
  }
 });
 it.each(rates)('keeps an open clutch independent of engaged gear at %i Hz',hz=>{
  reset(p);Object.assign(state.engine,{currentGear:'3',requestedGear:'3'});
  state.wheelOmega={rearLeft:35,rearRight:37};
  for(let i=0;i<hz*3;i++){updateEngine(1/hz);synchronizeEngineWithWheels(1/hz);expect(state.engine.rpm).toBeCloseTo(800,8);expect(state.engine.transmittedTorqueNm).toBe(0);}
  expect(state.wheelOmega).toEqual({rearLeft:35,rearRight:37});
 });
 it.each(rates)('recovers from a low running idle without stalling or hunting at %i Hz',hz=>{
  reset(p,{rpm:650});let last=650;
  for(let i=0;i<hz*6;i++){updateEngine(1/hz);synchronizeEngineWithWheels(1/hz);
   expect(state.engine.mode).toBe('running');expect(state.engine.rpm).toBeGreaterThanOrEqual(last-1e-9);expect(state.engine.rpm).toBeLessThanOrEqual(800+1e-9);last=state.engine.rpm;}
  expect(Math.abs(last-800)).toBeLessThan(.01);
 });
 it.each(rates)('has finite start, passive reversal losses and stable restart at %i Hz',hz=>{
  const rows=profile('negative-start',hz).rows;
  expect(rows.some(r=>r.mode==='starting')).toBe(true);expect(rows.at(-1).mode).toBe('running');expect(Math.abs(rows.at(-1).rpm-800)).toBeLessThan(.2);
  for(const r of rows){expect(r.dragWork).toBeGreaterThanOrEqual(-1e-12);expect(Math.abs(r.energyResidual)).toBeLessThan(1e-8);}
 });
 it.each(rates)('balances shaft torque impulses and operator work at %i Hz',hz=>{
  for(const initial of [-100,0,800,4000,7200])for(const mode of ['stopped','starting','running']){
   reset(p,{rpm:initial,mode});const old=state.engine.omega;state.input.mouseThrottleAmount=.5;
   updateEngine(1/hz);const e=state.engine;
   const J=(e.combustionTorqueNm+e.starterTorqueNm-e.frictionTorqueNm-e.pumpingTorqueNm)/hz;
   expect(Math.abs(p.engineInertiaKgM2*(e.omega-old)-J)).toBeLessThan(1e-9);
   expect(Math.abs(.5*p.engineInertiaKgM2*(e.omega**2-old**2)-e.externalWorkJ+e.dragWorkJ)).toBeLessThan(1e-8);
   expect(e.dragWorkJ).toBeGreaterThanOrEqual(-1e-10);
  }
 });
 it.each(rates)('recovers to idle monotonically and avoids limiter overshoot at %i Hz',hz=>{
  const recovery=profile('idle-recovery',hz).rows;let last=1200;
  for(const r of recovery){expect(r.rpm).toBeGreaterThanOrEqual(800-1e-8);expect(r.rpm).toBeLessThanOrEqual(last+1e-8);last=r.rpm;}
  expect(last).toBeCloseTo(800,4);
  const rows=profile('full-throttle',hz).rows;
  expect(Math.max(...rows.map(r=>r.rpm))).toBeLessThanOrEqual(7000+1e-8);expect(rows.at(-1).rpm).toBeGreaterThan(6800);
 });
 it.each(rates)('cuts and progressively restores combustion after imposed over-rev at %i Hz',hz=>{
  reset(p,{rpm:7200});state.input.mouseThrottleAmount=1;
  let cut=false,restored=false;
  for(let i=0;i<hz*2;i++){
   const oldRpm=state.engine.rpm;updateEngine(1/hz);synchronizeEngineWithWheels(1/hz);
   if(oldRpm>=7000){expect(state.engine.indicatedTorqueNm).toBe(0);expect(state.engine.fuelCut).toBe(true);cut=true;}
   if(state.engine.indicatedTorqueNm>0)restored=true;
   expect(state.engine.mode).toBe('running');
  }
  expect(cut&&restored).toBe(true);expect(state.engine.rpm).toBeLessThan(7000);
 });
 it('converges on the complete free-rundown curve',()=>{
  const ref=profile('release-redline',1600),errors=[];
  for(const hz of rates){const actual=profile('release-redline',hz);
   errors.push(Math.max(...actual.rows.map((r,i)=>Math.abs(r.rpm-ref.rows[Math.round((i+1)*1600/hz)-1].rpm))));}
  for(let i=1;i<errors.length;i++)expect(errors[i]).toBeLessThan(errors[i-1]*.6);
  expect(errors[0]).toBeLessThan(12); // Full trajectory, including idle-controller transition.
 });
 it('separates closed-throttle pumping from off-engine open-throttle rundown',()=>{
  const closed=profile('shutdown',100),open=profile('off-open-throttle',100);
  expect(closed.rows[199].rpm).toBeLessThan(open.rows[199].rpm);
  expect(open.rows.every(r=>r.pumping===0)).toBe(true);
 });
 it('repeats throttle pulses deterministically',()=>expect(profile('pulses',100)).toEqual(profile('pulses',100)));
});
