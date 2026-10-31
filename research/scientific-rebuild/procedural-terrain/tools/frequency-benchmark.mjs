import {createTerrainVehicle,respawnTerrain,stepTerrainVehicle} from '../src/vehicle.js';
const report=[];
for(const preset of ['flat','road'])for(const hz of [2000,1000,500,250,200,100]){
 const v=createTerrainVehicle({preset,seed:42,amplitude:.001,roughness:.1});const reset=respawnTerrain(v,v.terrainSettings);if(!reset.success)throw Error(reset.message);
 const start=performance.now();let fault=null,peakResidual=0;
 for(let i=0;i<Math.round(.1*hz);i++)try{stepTerrainVehicle(v,{},1/hz);peakResidual=Math.max(peakResidual,Math.abs(v.state.terrainLedger?.residual||v.state.planar.contact.energyResidual));}catch(e){fault={time:v.state.time,message:e.message,candidate:e.candidate};break;}
 report.push({preset,hz,simulated:v.state.time,wallMs:performance.now()-start,peakResidual,fault,state:v.state});
}
console.log(JSON.stringify(report,null,2));
