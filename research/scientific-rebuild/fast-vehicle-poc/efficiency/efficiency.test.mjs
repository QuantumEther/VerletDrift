import {test} from 'node:test';import assert from 'node:assert/strict';
import {baseline,cases,ports,init} from './fixtures.mjs';import {create,step,energy} from '../consistent-model.js';
const old=await baseline();
test('reuse is bit-exact against a8be5c9 at 1/.5/.25 ms, including all diagnostics',()=>{
 for(const name of cases)for(const h of [.001,.0005,.00025]){const a=init(name),b=init(name);for(let i=0;i<Math.round(.4/h);i++){const p=ports(name,i*h);old.step(a,p,h);step(b,p,h,{acceleration:'none'});assert.deepEqual(b,a);}}
});
test('factor cache invalidates for timestep, mass, stiffness, damping and geometry changes',()=>{
 const a=create({speed:1}),b=create({speed:1});
 for(let i=0;i<20;i++){for(const s of [a,b]){s.vertical.damping=i%2?80:120;s.vertical.ks=i%3?2000:1800;s.vertical.mass=i%4?80:85;s.vertical.pitchInertia=i%2?45:46;s.vertical.corners[0][0]=i%2?1:1.01;}
 const h=[.001,.0005,.00025][i%3];old.step(a,{clutch:1},h);step(b,{clutch:1},h,{acceleration:'none'});assert.deepEqual(b,a);}
});
test('Aitken preserves strict force/work checks, modes and tightly matching trajectories',()=>{
 let maxState=0,maxWork=0;for(const name of cases)for(const h of [.001,.0005,.00025]){const a=init(name),b=init(name),E=energy(b);for(let i=0;i<Math.round(1/h);i++){const p=ports(name,i*h);old.step(a,p,h);step(b,p,h,{acceleration:'aitken'});for(let k=0;k<30;k++)maxState=Math.max(maxState,Math.abs(a.y[k]-b.y[k]));maxWork=Math.max(maxWork,Math.abs(energy(b)-E-b.y.slice(25).reduce((x,y)=>x+y,0)));assert.ok(b.consistency.forceResidual<=1e-11);assert.ok(b.consistency.frictionExcess<=2e-11);assert.equal(b.constraints.clutchMode,a.constraints.clutchMode);assert.deepEqual(b.constraints.brakeModes,a.constraints.brakeModes);if(b.constraints.clutchMode==='locked')assert.equal(b.y[24],1.75*(b.y[22]+b.y[23]));}}
 console.log('Aitken maximum absolute difference, all 30 SI state/work fields:',maxState,'maximum work residual J:',maxWork);assert.ok(maxState<1e-10);assert.ok(maxWork<1e-9);
});
test('private scratch cannot mutate published diagnostics on success or rollback',()=>{
 const s=create({speed:5});step(s,{clutch:1});const prior=s.consistency,saved=structuredClone(prior);step(s,{steer:.03,clutch:1});assert.deepEqual(prior,saved);const state=structuredClone(s);assert.throws(()=>step(s,{steer:.1},.001,{maxIterations:1,acceleration:'aitken'}),/did not converge/);assert.deepEqual(s,state);assert.throws(()=>step(s,{},.001,{acceleration:'unknown'}));assert.deepEqual(s,state);
});
test('accelerated runs are deterministic, including hold/release and low speed',()=>{
 const a=create({engine:0}),b=create({engine:0});for(let i=0;i<1000;i++){const p={starter:true,clutch:1,serviceBrake:i<500?1:0};step(a,p,.001,{acceleration:'aitken'});step(b,p,.001,{acceleration:'aitken'});assert.deepEqual(a,b);if(i<500)assert.deepEqual(a.y.slice(20,25),[0,0,0,0,0]);}
});
