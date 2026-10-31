// Exploratory follow-up of the largest broad-sweep p99 increases, not exclusions.
import {readFile} from 'node:fs/promises';import {cpuUsage} from 'node:process';import {cpus} from 'node:os';
import {fixture} from './tire-ab-fixtures.mjs';import {stepTerrainVehicle} from '../src/vehicle.js';
const cases=JSON.parse(await readFile(new URL('../results/contact-optimization/tail-cases.json',import.meta.url))),runs=[];
for(const c of cases)for(let repeat=0;repeat<9;repeat++)for(const variant of repeat%2?['selected','reference']:['reference','selected']){
 const h=+c.h,floor=+c.floor,{v,inputs}=fixture(c.id,floor,c.scenario,1);v.contactOptimization=variant==='reference'?'reference':c.id==='reference'?'matrix':'warm-matrix';
 const cpu=cpuUsage(),wall=performance.now(),times=[];let fault=null;
 for(let i=0;i<Math.round(1/h);i++){const stamp=performance.now();try{stepTerrainVehicle(v,inputs(i*h),h);}catch(e){fault={step:i,message:e.message};break;}times.push(performance.now()-stamp);}
 const used=cpuUsage(cpu);times.sort((a,b)=>a-b);const q=p=>times[Math.min(times.length-1,Math.ceil(times.length*p)-1)];runs.push({scenario:c.scenario,h,floor,id:c.id,variant,repeat,warmup:repeat===0,simulated:v.state.time,cpuMs:(used.user+used.system)/1000,wallMs:performance.now()-wall,medianMs:q(.5),p95Ms:q(.95),p99Ms:q(.99),worstMs:times.at(-1),fault});console.error(c.id,repeat,variant,fault?.message||'pass');
}
console.log(JSON.stringify({runtime:process.version,cpu:cpus()[0].model,protocol:{duration:1,repeats:9,warmups:1,order:'alternating selected/reference',selection:'largest observed per-strategy broad-sweep p99 ratio; all original cases retained',reviewRatio:1.1},cases,runs}));
