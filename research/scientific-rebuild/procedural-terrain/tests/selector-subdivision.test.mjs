import {test} from 'node:test';import assert from 'node:assert/strict';
import {createTerrainVehicle,respawnTerrain,stepTerrainVehicle,candidateTerrainStep,selectorSubsteps,cloneMechanical} from '../src/vehicle.js';
import {engageDogs} from '../../tire-road-observatory-prototype/src/gearbox.js';
function setup(){const v=createTerrainVehicle({preset:'road',seed:42,amplitude:.001,roughness:.1});assert.ok(respawnTerrain(v,v.terrainSettings).success);v.state.gearbox.q=.025;engageDogs(v.state,'1');v.state.gearbox.driverForce=120;return v;}
test('selector stop uses bounded stable substeps without changing the requested duration',()=>{
 for(const hz of [1000,500,250,200,100]){const v=setup(),h=1/hz;let substeps=0,maxQ=0;for(let i=0;i<hz/2;i++){stepTerrainVehicle(v,{},h);substeps+=v.integration.substeps;maxQ=Math.max(maxQ,v.state.gearbox.q);assert.equal(v.state.gearbox.selected,'1');assert.ok(Math.abs(v.integration.energyResidual)<1e-7);}assert.ok(Math.abs(v.state.time-.5)<1e-10);assert.ok(maxQ<.0369);assert.ok(v.state.gearbox.q>.03&&v.state.gearbox.q<.034);assert.ok(Math.abs(v.state.gearbox.q-1960/61600)<1e-6);if(hz<1000)assert.ok(substeps>hz/2);console.log({hz,substeps,maxQ,finalQ:v.state.gearbox.q});}
});
test('coarse unsafe candidate rejects and later failed substep publishes neither state nor observations',()=>{
 const v=setup(),before=structuredClone(v.state);assert.ok(selectorSubsteps(v.state,.01)>1);assert.throws(()=>candidateTerrainStep(v,{},.01),/subdivision/);assert.deepEqual(structuredClone(v.state),before);
 const neutral=createTerrainVehicle({preset:'road',seed:42,amplitude:.001,roughness:.1});assert.ok(respawnTerrain(neutral,neutral.terrainSettings).success);neutral.state.gearbox.driverForce=120;const initial=structuredClone(neutral.state),samples=[];assert.throws(()=>stepTerrainVehicle(neutral,{},.01,{capture:s=>s.time,accept:a=>samples.push(...a)}),/gear event/);assert.deepEqual(structuredClone(neutral.state),initial);assert.equal(samples.length,0);assert.equal(neutral.integration,undefined);
});
test('accepted substep observations cover the nominal interval exactly once',()=>{
 const v=setup(),records=[];stepTerrainVehicle(v,{},.01,{capture:s=>s.time,accept:a=>records.push(...a)});assert.equal(records.length,v.integration.substeps);assert.ok(Math.abs(records.reduce((n,r)=>n+r.h,0)-.01)<1e-14);for(let i=1;i<records.length;i++)assert.equal(records[i].start,records[i-1].end);
});
test('selected dogs cannot jump across the entire release interval unnoticed',()=>{
 const v=setup();v.state.gearbox.driverForce=0;v.state.gearbox.velocity=-50;const before=structuredClone(v.state);assert.throws(()=>candidateTerrainStep(v,{},.001),/gear event/);assert.deepEqual(structuredClone(v.state),before);
});
test('subdivision matches sequential coupled reference steps and sums work in every differential mode',()=>{
 for(const mode of ['independent','open','locked']){
  const a=setup();a.state.drivetrain.mode=mode;a.state.drivetrain.carrierInertia=mode==='independent'?0:.4;a.state.flywheel.omega=40;a.state.engine.mode='running';a.state.flywheel.engagement=.3;
  const b={...a,state:cloneMechanical(a.state)},n=selectorSubsteps(a.state,.01),ports={throttle:.2,steer:.01};let work=0;stepTerrainVehicle(a,ports,.01);
  for(let i=0;i<n;i++){stepTerrainVehicle(b,ports,.01/n);work+=b.state.terrainLedger.forceWork;}
  for(const key of ['planar','vertical','wheels','engine','steering','drivetrain'])assert.deepEqual(a.state[key],b.state[key]);
  for(const key of ['omega','angle','heat','slip','capacity'])assert.equal(a.state.flywheel[key],b.state.flywheel[key]);
  assert.equal(a.state.gearbox.q,b.state.gearbox.q);assert.equal(a.state.gearbox.velocity,b.state.gearbox.velocity);assert.equal(a.state.terrainLedger.forceWork,work);assert.equal(a.state.terrainLedger.accumulatedResidual,b.state.terrainLedger.accumulatedResidual);
 }
});
