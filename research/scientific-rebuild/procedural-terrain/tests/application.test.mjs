import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createVehicle,stepVehicle,regenerate,terrainSampler,setEnvironment} from '../src/application-vehicle.js';
import {createTerrainVehicle,stepTerrainVehicle} from '../src/vehicle.js';
const settings={preset:'flat',seed:42,amplitude:.001,roughness:.1};
test('application facade retains mature flat trajectory and state aliases',()=>{
 setEnvironment(settings);const actual=createVehicle({automobile:true}),reference=createTerrainVehicle(settings,{automobile:true});
 for(let i=0;i<10;i++){stepVehicle(actual,{starter:true,steer:.02},.001);stepTerrainVehicle(reference,{starter:true,steer:.02},.001);}
 assert.deepEqual(structuredClone(actual),structuredClone(reference.state));actual.v=.01;assert.equal(actual.planar.u,.01);assert.equal(actual.flywheel.gearbox,actual.gearbox);
});
test('application regeneration retains failed terrain and advances accepted terrain',()=>{
 setEnvironment(settings);const original=createVehicle({automobile:true}),before=structuredClone(original);let clears=0;const history={clear(){clears++;}};
 const bad=regenerate(original,{...settings,amplitude:2},history);assert.equal(bad.status.success,false);assert.equal(bad.state,original);assert.deepEqual(structuredClone(original),before);assert.equal(clears,0);assert.equal(terrainSampler().settings.preset,'flat');
 const good=regenerate(original,{...settings,preset:'road'},history,{mode:'open'});assert.equal(good.status.success,true);assert.equal(clears,1);assert.equal(terrainSampler().settings.preset,'road');
 for(let i=0;i<10;i++)stepVehicle(good.state,{},.001);assert.ok(good.state.time>0);assert.ok(good.state.wheels.every(w=>w.normal>=0));assert.ok(Math.abs(good.state.terrainLedger.residual)<1e-7);setEnvironment(settings);
});
