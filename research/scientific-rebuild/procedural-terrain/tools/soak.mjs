import {performance} from 'node:perf_hooks';
import {createTerrainVehicle,respawnTerrain,stepTerrainVehicle} from '../src/vehicle.js';
import {engageDogs} from '../../tire-road-observatory-prototype/src/gearbox.js';
const duration=Number(process.env.SOAK_SECONDS||180),v=createTerrainVehicle({preset:'road',seed:42,amplitude:.001,roughness:.1});
const reset=respawnTerrain(v,v.terrainSettings);if(!reset.success)throw Error(reset.message);
v.state.gearbox.q=.025;engageDogs(v.state,'1');v.state.flywheel.engagement=.3;v.state.flywheel.omega=40;v.state.engine.mode='running';
let fault=null,energy=0,maxResidual=0,maxSpeed=0,maxPitch=0,maxRoll=0,totalIterations=0,contactIterations=0,worstStepMs=0;const trace=[],begin=performance.now();
for(let i=0;i<Math.round(duration/.001);i++){
 const t=v.state.time,cycle=t%20,ports={throttle:cycle<10?.12:0,steer:Math.sin(t*.5)*.01,serviceBrake:cycle>=10&&cycle<12?.1:0,handbrake:cycle>=18&&cycle<18.2?.05:0};
 const start=performance.now();try{stepTerrainVehicle(v,ports);}catch(e){fault={time:t,message:e.message,candidate:e.candidate,ports,state:v.state,settings:v.terrainSettings};break;}
 worstStepMs=Math.max(worstStepMs,performance.now()-start);const s=v.state;energy+=Math.abs(s.terrainLedger.residual);maxResidual=Math.max(maxResidual,Math.abs(s.terrainLedger.residual));maxSpeed=Math.max(maxSpeed,Math.abs(s.planar.u));maxPitch=Math.max(maxPitch,Math.abs(s.pitch));maxRoll=Math.max(maxRoll,Math.abs(s.roll));totalIterations+=s.terrainLedger.iterations;contactIterations+=s.planar.contact.iterations;
 if(i%1000===0)trace.push({time:s.time,speed:s.planar.u,engine:s.engine.mode,loads:s.wheels.map(w=>w.normal),pitch:s.pitch,roll:s.roll,residual:s.terrainLedger.residual});
}
console.log(JSON.stringify({requested:duration,completed:!fault,simulated:v.state.time,wallMs:performance.now()-begin,maxResidual,absoluteResidualSum:energy,accumulatedResidual:v.state.terrainLedger.accumulatedResidual,maxSpeed,maxPitch,maxRoll,worstStepMs,totalIterations,contactIterations,clutchHeat:v.state.flywheel.heat,fault,trace},null,2));
