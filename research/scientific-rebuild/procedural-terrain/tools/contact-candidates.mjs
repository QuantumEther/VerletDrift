// Rotated variant order within repeat; initialization excluded from all timings.
import {cpuUsage} from 'node:process';import {cpus} from 'node:os';
import {fixture} from './tire-ab-fixtures.mjs';import {stepTerrainVehicle} from '../src/vehicle.js';
const runs=[],variants=[{id:'reference',variant:'reference'},{id:'reference',variant:'matrix'},...['reference','diagnostic','warm','matrix','warm-matrix','all'].map(variant=>({id:'speed-normalized-anisotropic',variant}))],duration=.3,h=.001;
for(const floor of [.25,.5])for(let repeat=0;repeat<9;repeat++){
 const order=variants.slice(repeat%variants.length).concat(variants.slice(0,repeat%variants.length));if(repeat%2)order.reverse();
 for(const {id,variant} of order){
  const {v,inputs}=fixture(id,floor,'recovery',duration);v.contactOptimization=variant;
  const cpu=cpuUsage(),wall=performance.now();let iterations=0,outer=0,fault=null,energy=0,constituent=0;const times=[];
  for(let i=0;i<300;i++){const stamp=performance.now();try{stepTerrainVehicle(v,inputs(i*h),h);}catch(e){fault={step:i,message:e.message};break;}times.push(performance.now()-stamp);iterations+=v.state.terrainLedger.contactIterations;outer+=v.state.terrainLedger.iterations;energy=Math.max(energy,Math.abs(v.state.terrainLedger.residual));constituent=Math.max(constituent,v.state.planar.contact.constitutiveImpulseResidual);}
  const used=cpuUsage(cpu);times.sort((a,b)=>a-b);runs.push({id,variant,floor,h,repeat,warmup:repeat===0,simulated:v.state.time,cpuMs:(used.user+used.system)/1000,wallMs:performance.now()-wall,medianMs:times[150],p95Ms:times[284],p99Ms:times[296],worstMs:times.at(-1),iterations,outer,energy,constitutive:constituent,fault});console.error(floor,repeat,id,variant,fault?.message||'pass');
 }
}
console.log(JSON.stringify({runtime:process.version,cpu:cpus()[0].model,protocol:{duration,h,repeats:9,warmups:1,order:'rotated/reversed by repeat',variants},runs}));
