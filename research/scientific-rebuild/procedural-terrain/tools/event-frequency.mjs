import {createTerrainVehicle,respawnTerrain,stepTerrainVehicle} from '../src/vehicle.js';
const reports=[];
for(const hz of [4000,2000,1000,500,250,200,100]){
 const v=createTerrainVehicle({preset:'road',seed:42,amplitude:.001,roughness:.1});if(!respawnTerrain(v,v.terrainSettings).success)throw Error('respawn');let previous=v.state.engine.mode,fault=null;const events=[];
 for(let i=0;i<4*hz;i++)try{stepTerrainVehicle(v,{starter:true},1/hz);const mode=v.state.engine.mode;if(mode!==previous){events.push({from:previous,to:mode,decisionTime:i/hz,observedStateTime:(i+1)/hz,thresholdCrossingBracket:mode==='running'?[(i-1)/hz,i/hz]:[i/hz,i/hz],omega:v.state.flywheel.omega});previous=mode;}}catch(e){fault={time:v.state.time,message:e.message};break;}
 reports.push({hz,events,fault,finalRPM:v.state.flywheel.omega*60/(2*Math.PI)});
}
console.log(JSON.stringify(reports,null,2));
