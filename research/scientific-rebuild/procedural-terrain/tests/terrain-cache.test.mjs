import {test} from 'node:test';import assert from 'node:assert/strict';
import {createTerrain} from '../src/terrain.js';import {createTerrainVehicle,respawnTerrain,stepTerrainVehicle} from '../src/vehicle.js';
import {engageDogs} from '../../tire-road-observatory-prototype/src/gearbox.js';
const settings={preset:'road',seed:42,amplitude:.001,roughness:.1};
function setup(disabled){let samples=0;const base=createTerrain(settings),terrain={sample:(x,y)=>{samples++;return base.sample(x,y);}},v=createTerrainVehicle(settings);assert.ok(respawnTerrain(v,settings,null,terrain).success);v.disableTerrainCache=disabled;v.state.gearbox.q=.025;engageDogs(v.state,'1');v.state.flywheel.engagement=.3;v.state.engine.mode='running';v.state.flywheel.omega=40;samples=0;return {v,count:()=>samples};}
test('same-endpoint terrain samples reduce queries with bit-identical coupled results at every rate',()=>{
 for(const hz of [1000,500,250,200,100]){const a=setup(false),b=setup(true);for(let i=0;i<Math.round(.1*hz);i++){const ports={throttle:.2,steer:.01,serviceBrake:.05};stepTerrainVehicle(a.v,ports,1/hz);stepTerrainVehicle(b.v,ports,1/hz);assert.deepEqual(structuredClone(a.v.state),structuredClone(b.v.state));assert.deepEqual(a.v.contacts,b.v.contacts);}assert.ok(a.count()<b.count());console.log({hz,cachedSamples:a.count(),uncachedSamples:b.count()});}
});
