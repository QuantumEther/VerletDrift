import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../tools/tire-ab-fixtures.mjs';
import {createTerrainVehicle,respawnTerrain,stepTerrainVehicle} from '../src/vehicle.js';
import {createTerrain} from '../src/terrain.js';
import {createTireStrategy} from '../src/tire-strategy.js';

test('contact profiling and matrix capture do not change accepted A or reference B state',()=>{
 for(const id of ['reference','speed-normalized-anisotropic']){
  const a=fixture(id,.5,'recovery',1).v,b=fixture(id,.5,'recovery',1).v,events=[],captures=[];
  a.contactOptimization=b.contactOptimization='reference';b.contactProfile=e=>events.push(e);b.contactCapture=e=>captures.push(e);
  for(let i=0;i<4;i++){
   events.length=0;stepTerrainVehicle(a,{steer:.01},.001);stepTerrainVehicle(b,{steer:.01},.001);
   assert.deepEqual(structuredClone(b.state),structuredClone(a.state));
   const solves=events.filter(e=>e.stage==='optimization');assert.equal(solves.reduce((n,e)=>n+e.iterations,0),b.state.terrainLedger.contactIterations);
   assert.equal(events.filter(e=>e.stage==='rows').length,b.state.terrainLedger.iterations);
  }
  assert.ok(captures.length);assert.ok(captures.every(e=>e.history.length===e.iterations&&e.L>0));
 }
});

test('B private mode seeds and matrix reuse preserve solutions through h, stiffness, grip and capacity changes',()=>{
 const a=fixture('speed-normalized-anisotropic',.5,'recontact',1).v,b=fixture('speed-normalized-anisotropic',.5,'recontact',1).v;
 a.contactOptimization='reference';b.contactOptimization='all';const terrain=createTerrain(a.terrainSettings),events=[];b.contactProfile=e=>events.push(e);
 for(let i=0;i<30;i++){
  const h=[.001,.002,.004][i%3],floor=[.25,.5,1,2][i%4],mu=i<10?.9:i<20?.45:0;
  for(const v of [a,b]){
   v.tireStrategy=createTireStrategy({id:'speed-normalized-anisotropic',minSpeed:floor});v.state.flywheel.engagement=i<10?.3:i<20?0:.8;
   v.terrain={settings:terrain.settings,sample:(x,y)=>({...terrain.sample(x,y),friction:mu})};
  }
  const ports={throttle:.1,serviceBrake:i<15?.1:0,steer:i<15?.01:-.01};
  stepTerrainVehicle(a,ports,h);stepTerrainVehicle(b,ports,h);
  for(const key of ['u','v','r','x','y','heading'])assert.ok(Math.abs(a.state.planar[key]-b.state.planar[key])<1e-7,key);
  for(let k=0;k<7;k++){assert.ok(Math.abs(a.state.vertical.q[k]-b.state.vertical.q[k])<1e-7);assert.ok(Math.abs(a.state.vertical.v[k]-b.state.vertical.v[k])<1e-7);}
  for(let k=0;k<4;k++){assert.ok(Math.abs(a.state.wheels[k].omega-b.state.wheels[k].omega)<1e-7);assert.ok(Math.hypot(b.state.wheels[k].fx,b.state.wheels[k].fy)<=b.state.wheels[k].mu*b.state.wheels[k].normal+1e-7);}
  assert.ok(Math.abs(b.state.terrainLedger.residual)<1e-7);assert.ok(b.state.planar.contact.constitutiveImpulseResidual<=2e-8);
 }
 assert.ok(events.some(e=>e.stage==='matrix'&&e.reused));
 assert.ok(events.some(e=>e.stage==='mode-warm'));
});

test('optimized non-flat gear-event rejection preserves physical state and accepted observer history',()=>{
 const settings={preset:'road',seed:42,amplitude:.001,roughness:.1},v=createTerrainVehicle(settings);
 v.tireStrategy=createTireStrategy({id:'speed-normalized-anisotropic'});v.contactOptimization='all';assert.ok(respawnTerrain(v,settings).success);v.state.gearbox.driverForce=120;
 let accepted=0,rejected=false;const observer={capture:s=>s.time,accept:stages=>accepted+=stages.length};
 for(let i=0;i<10;i++){
  const before=structuredClone({state:v.state,contacts:v.contacts,integration:v.integration}),history=accepted;
  try{stepTerrainVehicle(v,{},.001,observer);}catch(e){assert.match(e.message,/gear event/);assert.deepEqual(structuredClone({state:v.state,contacts:v.contacts,integration:v.integration}),before);assert.equal(accepted,history);rejected=true;break;}
 }
 assert.ok(rejected);
});

test('hybrid diagnostic matches the 80-bisection control at saturation boundaries and extreme tested loads',async()=>{
 const {anisotropicForce,anisotropicForceReference}=await import('../src/tire-strategy.js');let saturated=0,rootIterations=0;
 for(const ky of [190,760,1900,7600,15200])for(const normal of [0,1e-6,250,1000,1e6])for(const sx of [-10,0,1])for(const sy of [-10,-.1,0,.1,10]){
  const p={kx:800,ky},a=anisotropicForceReference(sx,sy,normal,.9,p),b=anisotropicForce(sx,sy,normal,.9,p,e=>{if(e.saturated){saturated++;rootIterations+=e.iterations;}});
  assert.ok(Math.hypot(a.fx-b.fx,a.fy-b.fy)<=1e-10*Math.max(1,.9*normal));assert.ok(Math.hypot(b.fx,b.fy)<=.9*normal*(1+1e-13));assert.ok(b.fx*sx+b.fy*sy<=1e-9);
 }
 for(const factor of [1-1e-12,1,1+1e-12]){
  const b=anisotropicForce(0,factor*900/7600,1000,.9,{kx:800,ky:7600});assert.ok(Math.abs(b.fy+Math.min(900,factor*900))<1e-9);
 }
 assert.ok(saturated>0);assert.ok(rootIterations/saturated<20);
});

test('matrix reuse is bit-exact and rejects a different matrix scope',async()=>{
 const {solveContacts}=await import('../src/contact-solver.js');const inverse=[[2,.25],[.25,1]],free=[1,-.2],rows=[{j:[1,0],compliance:.5},{j:[0,1],compliance:.1}],prepared={};
 const options={maxIterations:20000,tolerance:1e-12},groups=[{indices:[0,1],limit:.2}];
 const a=solveContacts(inverse,free,rows,groups,.001,options),b=solveContacts(inverse,free,rows,groups,.001,{...options,prepared});assert.deepEqual(b,a);
 const c=solveContacts(inverse,[.5,.2],rows,groups,.001,{...options,prepared}),d=solveContacts(inverse,[.5,.2],rows,groups,.001,options);assert.deepEqual(c,d);
 assert.throws(()=>solveContacts([[2,0],[0,1]],free,rows,groups,.001,{...options,prepared}),/scope changed/);
});

test('captured matrix snapshots cannot mutate private cached operators or trial velocities',()=>{
 const a=fixture('speed-normalized-anisotropic',.5,'recovery',1).v,b=fixture('speed-normalized-anisotropic',.5,'recovery',1).v;
 a.contactOptimization=b.contactOptimization='warm-matrix';
 b.contactCapture=e=>{e.d[0][0]=1e20;e.inverse[0][0]=1e20;e.free[0]=1e20;e.z[0]=1e20;e.rows[0].j[0]=1e20;};
 stepTerrainVehicle(a,{steer:.01},.001);stepTerrainVehicle(b,{steer:.01},.001);assert.deepEqual(structuredClone(b.state),structuredClone(a.state));
});

test('B mode reuse preserves near-zero capture, torque reversal and overloaded clutch transitions',async()=>{
 const {shaftState}=await import('../../tire-road-observatory-prototype/src/gearbox.js');const modes=new Set();
 for(const slip of [-1,-1e-7,0,1e-7,1])for(const brake of [0,.5]){
  const a=fixture('speed-normalized-anisotropic',.5,'near-steady',1).v,b=fixture('speed-normalized-anisotropic',.5,'near-steady',1).v;
  a.contactOptimization='reference';b.contactOptimization='warm-matrix';
  for(const v of [a,b])v.state.flywheel.omega=shaftState(v.state).omega+slip;
  for(let i=0;i<12;i++){
   const h=[.001,.002,.004][i%3],ports={throttle:i<6?0:1,serviceBrake:brake,steer:i<6?.01:-.01};
   stepTerrainVehicle(a,ports,h);stepTerrainVehicle(b,ports,h);modes.add(b.state.flywheel.state);
   assert.ok(Math.abs(b.state.flywheel.torque)<=b.state.flywheel.capacity+1e-9);
   assert.ok(Math.abs(a.state.flywheel.omega-b.state.flywheel.omega)<1e-7);
   for(let k=0;k<4;k++)assert.ok(Math.abs(a.state.wheels[k].omega-b.state.wheels[k].omega)<1e-7);
   assert.ok(Math.abs(b.state.terrainLedger.residual)<1e-7);assert.ok(b.state.planar.contact.constitutiveImpulseResidual<=2e-8);
  }
 }
 assert.ok(modes.has('locked'));assert.ok(modes.has('slipping'));
});
