import {createTerrainVehicle,respawnTerrain} from '../src/vehicle.js';
const report=[];
for(const preset of ['flat','hills','rough','road']){
 const settings={preset,seed:42,amplitude:.001,roughness:.1},v=createTerrainVehicle(settings),times=[];
 for(let i=0;i<10;i++){const before=performance.now(),r=respawnTerrain(v,settings);if(!r.success)throw Error(r.message);times.push(performance.now()-before);}
 times.sort((a,b)=>a-b);report.push({preset,medianMs:times[5],p95Ms:times[9],worstMs:times[9],times});
}
console.log(JSON.stringify(report,null,2));
