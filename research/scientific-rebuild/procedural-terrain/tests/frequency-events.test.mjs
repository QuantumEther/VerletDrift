import {test} from 'node:test';import assert from 'node:assert/strict';
import {createTerrainVehicle,respawnTerrain,stepTerrainVehicle} from '../src/vehicle.js';
function start(hz){const v=createTerrainVehicle({preset:'road',seed:42,amplitude:.001,roughness:.1});assert.ok(respawnTerrain(v,v.terrainSettings).success);for(let i=0;i<4*hz;i++){stepTerrainVehicle(v,{starter:true},1/hz);assert.ok(Math.abs(v.state.terrainLedger.residual)<1e-7);if(v.state.engine.mode==='running')return {decision:i/hz,state:v.state};}assert.fail('engine failed to start');}
test('neutral starter transition has consistent physical outcome at 500 and 100 Hz',()=>{
 const fine=start(500),coarse=start(100);assert.ok(Math.abs(coarse.decision-fine.decision)<=.01);assert.ok(coarse.state.flywheel.omega>0&&fine.state.flywheel.omega>0);assert.equal(coarse.state.gearbox.selected,'N');assert.ok(Math.abs(coarse.state.time-(coarse.decision+.01))<1e-9);
});
