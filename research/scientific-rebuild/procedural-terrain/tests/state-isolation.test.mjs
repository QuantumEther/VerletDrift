import {test} from 'node:test';import assert from 'node:assert/strict';
import {createTerrainVehicle,respawnTerrain,stepTerrainVehicle,cloneMechanical} from '../src/vehicle.js';
import {engageDogs} from '../../tire-road-observatory-prototype/src/gearbox.js';
test('record copier preserves native snapshot values, cycles, aliases and isolated kinematic getters',()=>{
 const v=createTerrainVehicle(),s=v.state;s.extra={value:[1,2],date:new Date(0)};s.extra.self=s.extra;s.extra.shared=s.gearbox;
 const c=cloneMechanical(s);assert.deepEqual(structuredClone(c),structuredClone(s));assert.equal(c.extra.self,c.extra);assert.equal(c.extra.shared,c.gearbox);assert.equal(c.flywheel.gearbox,c.gearbox);c.v=1;assert.equal(c.planar.u,1);assert.equal(s.planar.u,0);c.extra.value[0]=2;assert.equal(s.extra.value[0],1);
});
test('endpoint trials operate with a deeply frozen private basis in all differential modes',()=>{
 for(const mode of ['independent','open','locked']){
  const v=createTerrainVehicle({preset:'road',seed:42,amplitude:.001,roughness:.1});assert.ok(respawnTerrain(v,v.terrainSettings).success);v.verifyIsolation=true;v.state.drivetrain.mode=mode;v.state.drivetrain.carrierInertia=mode==='independent'?0:.4;v.state.gearbox.q=.025;engageDogs(v.state,'1');v.state.flywheel.omega=40;v.state.engine.mode='running';v.state.flywheel.engagement=.3;
  for(let i=0;i<100;i++){const original=v.state,before=structuredClone(original);stepTerrainVehicle(v,{throttle:.1,steer:.01,serviceBrake:.05,handbrake:.01});assert.deepEqual(structuredClone(original),before);assert.ok(Math.abs(v.state.terrainLedger.residual)<1e-7);assert.equal(v.state.gearbox.lastStepCases,v.state.terrainLedger.contactIterations);assert.ok(v.state.terrainLedger.contactIterations>=v.state.planar.contact.iterations);}
 }
});
test('ordinary first-selector force reproduces an explicit rollback-safe gear limitation at 6 ms',()=>{
 const v=createTerrainVehicle({preset:'road',seed:42,amplitude:.001,roughness:.1});assert.ok(respawnTerrain(v,v.terrainSettings).success);let rejected=false;
 for(let i=0;i<20;i++){
  v.state.gearbox.driverForce=120;const before=structuredClone(v.state),samples=[];
  try{stepTerrainVehicle(v,{starter:true},.001,{capture:s=>s.time,accept:a=>samples.push(...a)});}catch(e){assert.match(e.message,/gear event/);assert.deepEqual(structuredClone(v.state),before);assert.equal(samples.length,0);assert.ok(Math.abs(v.state.time-.006)<1e-12);rejected=true;break;}
 }
 assert.ok(rejected);
});
