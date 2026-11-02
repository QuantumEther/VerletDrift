import {test} from 'node:test';import assert from 'node:assert/strict';
import {makeFixture} from './fixtures.mjs';import {createModel} from './model.js';import {stepJointVehicle} from './step.js';
import {stepTerrainVehicle,cloneMechanical} from '../procedural-terrain/src/vehicle.js';import {NUMERICAL_EXPERIMENTS} from '../procedural-terrain/src/numerical-settings.js';import {certify} from '../contact-solver-challenge/check.js';
test('reduced assembly equals original source adapter for perturbed endpoints and modes',()=>{
 for(const strategy of ['reference','speed-normalized-anisotropic']){
  const {v,inputs}=makeFixture(strategy,'saturated'),m=createModel(v,inputs(0),.001),geo=m.entry.slice(7).map((a,i)=>a+(i%2?-.001:.001)),env=m.environment(geo);
  for(const mode of ['locked',1,-1]){const p=m.problem(env,mode),q=m.probe(env,mode);assert.deepEqual(p.free,q.free);assert.deepEqual(p.rows,q.rows);assert.deepEqual(p.groups,q.groups);assert.deepEqual(p.inverse,q.inverse);}
 }
});
test('one coupled step agrees physically, saturates friction, and closes unchanged guards',()=>{
 for(const strategy of ['reference','speed-normalized-anisotropic'])for(const accuracy of ['strict','balanced']){
  const a=makeFixture(strategy,'saturated'),b=makeFixture(strategy,'saturated');if(accuracy==='balanced')a.v.numerics=b.v.numerics=NUMERICAL_EXPERIMENTS.balanced;
  let capture;b.v.captureJoint=c=>capture=c;stepTerrainVehicle(a.v,a.inputs(0),.001);stepJointVehicle(b.v,b.inputs(0),.001);
  for(const key of ['u','v','r','x','y','heading'])assert.ok(Math.abs(a.v.state.planar[key]-b.v.state.planar[key])<1e-7,key);
  assert.ok(b.v.state.wheels.some(w=>w.utilization>1-1e-6));assert.ok(Math.abs(b.v.state.terrainLedger.residual)<1e-7);
  assert.ok(certify(capture.problem,capture.z,accuracy==='strict'?1e-12:1e-10,capture.problem.assembly.L).pass);
 }
});
test('contact and state records remain unchanged when an invalid numerical setting rejects',()=>{
 const {v}=makeFixture('reference','recontact');v.numerics={contactTolerance:1};const before=structuredClone({state:v.state,contacts:v.contacts});let accepted=0;
 assert.throws(()=>stepJointVehicle(v,{},.001,{capture:s=>s.time,accept:a=>accepted+=a.length}),/Invalid contactTolerance/);assert.equal(accepted,0);assert.deepEqual(structuredClone({state:v.state,contacts:v.contacts}),before);
});
test('flat gear transition delegation is bit-exact and does not advance a second physics model',()=>{
 const a=makeFixture('reference','flat-shift'),b=makeFixture('reference','flat-shift');
 for(let i=0;i<15;i++){stepTerrainVehicle(a.v,{},.001);stepJointVehicle(b.v,{},.001);assert.deepEqual(structuredClone(b.v.state),structuredClone(a.v.state));}
 assert.equal(b.v.jointStats.delegatedFlat,true);
});
test('late non-flat selector rejection preserves state and observer history',()=>{
 const {v}=makeFixture('reference','selector');let accepted=0,rejected=false;const observer={capture:s=>s.time,accept:a=>accepted+=a.length};
 for(let i=0;i<15;i++){const before=structuredClone({state:v.state,contacts:v.contacts,integration:v.integration}),n=accepted;try{stepJointVehicle(v,{},.001,observer);}catch(e){assert.match(e.message,/gear event/);assert.deepEqual(structuredClone({state:v.state,contacts:v.contacts,integration:v.integration}),before);assert.equal(accepted,n);rejected=true;break;}}assert.ok(rejected);
});
test('accepted subdivisions cover exactly the requested duration; later rejection is atomic',()=>{
 const {v}=makeFixture('reference','clutch-lock');v.state.gearbox.driverForce=120;const records=[];stepJointVehicle(v,{},.01,{capture:s=>s.time,accept:a=>records.push(...a)});assert.ok(v.integration.substeps>1);assert.ok(Math.abs(records.reduce((s,a)=>s+a.h,0)-.01)<1e-14);
 const n=makeFixture('reference','selector').v,before=structuredClone(n.state),history=[];assert.throws(()=>stepJointVehicle(n,{},.01,{capture:s=>s.time,accept:a=>history.push(...a)}),/gear event/);assert.deepEqual(structuredClone(n.state),before);assert.equal(history.length,0);
});
