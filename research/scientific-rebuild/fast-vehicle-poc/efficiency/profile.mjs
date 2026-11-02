import {cases,ports,init,baseline} from './fixtures.mjs';
import {step} from '../consistent-model.js';
import {Session} from 'node:inspector';import {writeFile,mkdir} from 'node:fs/promises';import {cpuUsage} from 'node:process';
await mkdir('/tmp/vehicle-efficiency-profile',{recursive:true});
const runStep=process.env.PROFILE_BASELINE==='1'?(await baseline()).step:step;
const session=new Session();session.connect();const send=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(e,r)=>e?reject(e):resolve(r)));
for(const name of cases){const s=init(name);for(let i=0;i<1000;i++)runStep(s,ports(name,i*.001));}
await send('Profiler.enable');await send('Profiler.setSamplingInterval',{interval:100});await send('Profiler.start');await send('HeapProfiler.enable');await send('HeapProfiler.startSampling',{samplingInterval:16384,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
const start=cpuUsage();let iterations=0,rotorSegments=0;
for(let repeat=0;repeat<5;repeat++)for(const name of cases){const s=init(name);for(let i=0;i<1000;i++){runStep(s,ports(name,i*.001));iterations+=s.consistency.iterations;rotorSegments+=s.consistency.totalRotorSegments;}}
const cpu=cpuUsage(start),{profile}=await send('Profiler.stop'),heap=await send('HeapProfiler.stopSampling');session.disconnect();
await writeFile('/tmp/vehicle-efficiency-profile/cpu.json',JSON.stringify(profile));await writeFile('/tmp/vehicle-efficiency-profile/heap.json',JSON.stringify(heap));
console.log(JSON.stringify({steps:35000,simulatedSeconds:35,cpuMs:(cpu.user+cpu.system)/1000,iterations,rotorSegments}));
