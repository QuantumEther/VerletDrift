import {describe,it,expect,vi} from 'vitest';
vi.hoisted(()=>{globalThis.localStorage={getItem:()=>null,setItem:()=>{}};});
import {reset,step,run,scenarios} from '../research/engine-free-rev/harness.mjs';
import capture from '../docs/engine-free-rev-data/parameters.json';
const p=capture.parameters;
const rates=[50,100,200,400];
describe('isolated production engine using captured browser defaults',()=>{
 it.each(rates)('holds neutral idle without wheel access at %i Hz',hz=>{
   reset(p);for(let i=0;i<hz*5;i++){const r=step(1/hz);expect(r.rpm).toBeCloseTo(800,8);expect(r.clutchTorque).toBe(0);}
 });
 it.each(rates)('matches analytic no-governor rundown and converges at %i Hz',hz=>{
   reset(p,{rpm:7000});let r;const dt=1/hz,I=p.engineInertiaKgM2,T=.035*p.peakEngineTorqueNm,b=.01;
   for(let i=0;i<hz*4;i++)r=step(dt);
   const w0=7000*Math.PI/30;
   const discrete=(w0+T/b)*(1+b*dt/I)**(-hz*4)-T/b;
   const exact=(w0+T/b)*Math.exp(-b*4/I)-T/b;
   expect(r.omega).toBeCloseTo(discrete,8);
   // First-order BE error: <1.9 RPM even at 50 Hz; scales linearly with dt.
   expect(Math.abs(r.omega-exact)*30/Math.PI).toBeLessThan(95/hz);
   expect(r.governor).toBe(0);
 });
 it.each(rates)('accounts for all torque-port work at %i Hz',hz=>{
   reset(p,{rpm:4000});let total=0,last;
   const initial=.5*p.engineInertiaKgM2*(4000*Math.PI/30)**2;
   let previous=4000*Math.PI/30;
   for(let i=0;i<hz*2;i++){
     const r=step(1/hz,.2,-10);last=r;
     const free=r.omega-(-10/hz/p.engineInertiaKgM2);
     const torqueBalance=p.engineInertiaKgM2*(free-previous)*hz-
       (r.combustion+r.governor+r.starter-.035*p.peakEngineTorqueNm-.01*free);
     expect(Math.abs(torqueBalance)).toBeLessThan(1e-8);
     previous=r.omega;
     total+=r.combustionWork+r.governorWork+r.starterWork+r.loadWork-r.dragWork;
     expect(Math.abs(r.energyResidual)).toBeLessThan(1e-9);
     expect(r.dragWork).toBeGreaterThanOrEqual(-1e-10);
   }
   expect(Math.abs(last.kinetic-initial-total)).toBeLessThan(1e-7);
 });
 it.each(rates)('recovers monotonically to idle without undershoot at %i Hz',hz=>{
   const rows=run(p,scenarios.find(s=>s.name==='idle-recovery'),hz).rows;
   let last=1200;for(const r of rows){expect(r.rpm).toBeLessThanOrEqual(last+1e-9);expect(r.rpm).toBeGreaterThanOrEqual(800-1e-9);last=r.rpm;}
   expect(last).toBeCloseTo(800,5);
 });
 it.each(rates)('stops passively with either crank sign at %i Hz',hz=>{
   for(const sign of [-1,1]){
     reset(p,{rpm:sign*2000,mode:'stopped'});let old=sign*2000,last;
     for(let i=0;i<hz*8;i++){
       last=step(1/hz);expect(Math.abs(last.rpm)).toBeLessThanOrEqual(Math.abs(old)+1e-9);
       expect(sign*last.omega).toBeGreaterThanOrEqual(0);expect(last.combustion+last.governor+last.starter).toBe(0);old=last.rpm;
     }
     expect(last.omega).toBe(0);
   }
 });
 it.each(rates)('uses finite starter and explicit restart after actuator-induced stall at %i Hz',hz=>{
   const rows=run(p,scenarios.find(s=>s.name==='loaded-stall'),hz).rows;
   expect(rows.some(r=>r.mode==='stalled')).toBe(true);
   expect(rows.at(-1).mode).toBe('stalled');
   reset(p,{rpm:0,mode:'stalled'});let r=step(1/hz,0,0,'start');
   expect(r.mode).toBe('starting');expect(r.rpm).toBeGreaterThan(0);expect(r.rpm).toBeLessThan(p.starterFiringRpm);
   for(let i=1;i<hz*5;i++)r=step(1/hz);
   expect(r.mode).toBe('running');expect(Math.abs(r.rpm-800)).toBeLessThan(.2);
 });
 it('has deterministic throttle pulses and bounded first-order limiter overshoot',()=>{
   const spec=scenarios.find(s=>s.name==='pulses');expect(run(p,spec,100)).toEqual(run(p,spec,100));
   for(const hz of rates){
     const r=run(p,scenarios.find(s=>s.name==='full-throttle'),hz);
     const max=Math.max(...r.rows.map(r=>r.rpm));
     expect(max).toBeGreaterThanOrEqual(p.redlineRpm);
     // Measured relay limiter is not a strict RPM clamp. Physical one-step torque bound.
     expect(max-p.redlineRpm).toBeLessThan(p.peakEngineTorqueNm/p.engineInertiaKgM2*30/Math.PI/hz);
   }
 });
});
