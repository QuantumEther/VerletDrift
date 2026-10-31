import {createTerrainVehicle,respawnTerrain,stepTerrainVehicle} from '../src/vehicle.js';
import {engageDogs} from '../../tire-road-observatory-prototype/src/gearbox.js';
const report=[];
for(const hz of [2000,1000,500,250,200,100]){
 const v=createTerrainVehicle({preset:'road',seed:42,amplitude:.001,roughness:.1});if(!respawnTerrain(v,v.terrainSettings).success)throw Error('respawn');v.state.gearbox.q=.025;engageDogs(v.state,'1');v.state.flywheel.omega=40;v.state.engine.mode='running';v.state.flywheel.engagement=.3;
 let substeps=0,peakResidual=0,maxQ=0,fault=null;const trace=[],start=performance.now();
 for(let i=0;i<hz;i++){v.state.gearbox.driverForce=i<hz/2?120:0;try{stepTerrainVehicle(v,{throttle:.1,steer:.01},1/hz);}catch(e){fault={time:v.state.time,message:e.message,integration:e.integration};break;}substeps+=v.integration.substeps;peakResidual=Math.max(peakResidual,Math.abs(v.integration.energyResidual));maxQ=Math.max(maxQ,v.state.gearbox.q);if((i+1)%(hz/10)===0)trace.push({time:v.state.time,q:v.state.gearbox.q,velocity:v.state.gearbox.velocity,selected:v.state.gearbox.selected,speed:v.state.planar.u,clutch:v.state.flywheel.state,loads:v.state.wheels.map(w=>w.normal)});}
 report.push({hz,completed:!fault,simulated:v.state.time,internalSubsteps:substeps,peakResidual,maxQ,wallMs:performance.now()-start,fault,trace});
}
console.log(JSON.stringify(report,null,2));
