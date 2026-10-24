import test from 'node:test';import assert from 'node:assert/strict';import {step,simulate} from './integrate.mjs';
test('eight constitutive calls, four RHS, no hidden substeps; deterministic replay',()=>{
 const c={};const x=[14.96,-.84,.29,50.56,49.75],u={gamma:Math.PI/36,Md:200};
 const r=step(x,1/800,u,undefined,c);assert.equal(r.status,'PASS');assert.equal(c.tires,8);assert.equal(c.rhs,4);assert.equal(c.completed,1);
 const s={id:'repeat',x,u,duration:.1};assert.deepEqual(simulate(s,1/800),simulate(s,1/800));
});
test('invalid stage preserves last state and records stage/counts rather than clamping',()=>{
 const x=[15,0,0,20,50],saved=[...x],c={};const r=step(x,100,{gamma:0,Md:-500},undefined,c);
 assert.notEqual(r.status,'PASS');assert.deepEqual(r.state,saved);assert.deepEqual(x,saved);assert.ok(r.stage);assert.ok(r.violations.length);assert.equal(c.rejected,1);assert.ok(c.rhs<=4);
});
test('diagnostic-free benchmark path preserves exact mechanical result',()=>{
 const x=[14.96,-.84,.29,50.56,49.75],u={gamma:Math.PI/36,Md:200};
 assert.deepEqual(step(x,1/800,u).state,step(x,1/800,u,undefined,{},false).state);
});
