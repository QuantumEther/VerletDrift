import {performance} from 'node:perf_hooks';
import {createTerrainVehicle,stepTerrainVehicle,respawnTerrain} from '../src/vehicle.js';
import {createVehicle,stepVehicle} from '../../four-corner-load-transfer/src/combined-vehicle.js';
import {engageDogs} from '../../tire-road-observatory-prototype/src/gearbox.js';
const count=Number(process.env.STEPS||1000), report=[];
const quantile=(a,p)=>[...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(p*a.length))];
for(const model of (process.env.BENCH_MODELS||'e10,flat,road').split(','))for(const mode of (process.env.BENCH_MODES||'stationary,idle,accelerate,steer,accelerate-steer,brake').split(',')){
 const v=model==='e10'?{state:createVehicle()}:createTerrainVehicle({preset:model==='flat'?'flat':'road',seed:42,amplitude:.001,roughness:.1});
 if(model==='road'){const r=respawnTerrain(v,v.terrainSettings);if(!r.success)throw Error(r.message);}
 const s=v.state;
 if(mode!=='stationary'){s.engine.mode='running';s.flywheel.omega=40;}
 if(['accelerate','accelerate-steer','brake'].includes(mode)){s.gearbox.q=.025;engageDogs(s,'1');s.flywheel.engagement=.3;}
 if(mode==='brake'){s.v=.5;s.wheels.forEach(w=>w.omega=.5/w.radius);}
 const stages={};if(process.env.PROFILE==='1')v.profile=(name,ms)=>{const stage=stages[name]??={totalMs:0,maxMs:0,count:0};stage.totalMs+=ms;stage.maxMs=Math.max(stage.maxMs,ms);stage.count++;};
 const times=[];let fault=null,maxResidual=0,iterations=0,contactIterations=0,allEndpointContactIterations=0;
 const begin=performance.now(),memory=process.memoryUsage().heapUsed;
 for(let i=0;i<count;i++){const t=performance.now();try{const p={throttle:mode.startsWith('accelerate')?.2:0,steer:mode.includes('steer')?.01:0,serviceBrake:mode==='brake'?.1:0};if(model==='e10')stepVehicle(v.state,p);else stepTerrainVehicle(v,p);times.push(performance.now()-t);iterations+=v.state.terrainLedger?.iterations||1;contactIterations+=v.state.planar.contact.iterations;allEndpointContactIterations+=v.state.terrainLedger?.contactIterations||v.state.planar.contact.iterations;maxResidual=Math.max(maxResidual,Math.abs(v.state.terrainLedger?.residual||v.state.planar.contact.energyResidual));}catch(e){fault={at:v.state.time,message:e.message,candidate:e.candidate};break;}}
 report.push({model,mode,stages,steps:times.length,simulated:v.state.time,wallMs:performance.now()-begin,medianMs:quantile(times,.5),p95Ms:quantile(times,.95),worstMs:Math.max(...times),meanMs:times.reduce((a,b)=>a+b,0)/times.length,endpointIterations:iterations/times.length,contactIterations:contactIterations/times.length,allEndpointContactIterations:allEndpointContactIterations/times.length,heapDelta:process.memoryUsage().heapUsed-memory,maxResidual,fault});console.error(model,mode,times.length,fault?.message||'ok');
}
console.log(JSON.stringify({count,report},null,2));
