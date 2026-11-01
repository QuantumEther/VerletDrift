// Separate allocation-sampling run; never mixed into throughput measurements.
import {Session} from 'node:inspector';
import {writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {fixture} from './tire-ab-fixtures.mjs';
import {stepTerrainVehicle} from '../src/vehicle.js';
const session=new Session();session.connect();const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(e,r)=>e?reject(e):resolve(r)));
const results=[];
for(const kernel of ['dense','isolated']){
 const {v,inputs}=fixture('reference',.5,'recovery',1);v.contactKernel=kernel;v.disableOperatorCache=kernel==='dense';
 for(let i=0;i<100;i++)stepTerrainVehicle(v,inputs(i*.001),.001);
 global.gc?.();const before=process.memoryUsage().heapUsed;
 await post('HeapProfiler.startSampling',{samplingInterval:32768,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
 for(let i=100;i<1100;i++)stepTerrainVehicle(v,inputs(i*.001),.001);
 const {profile}=await post('HeapProfiler.stopSampling');const after=process.memoryUsage().heapUsed;global.gc?.();const retained=process.memoryUsage().heapUsed;
 let sampledBytes=0;const walk=n=>{sampledBytes+=n.selfSize;for(const c of n.children)walk(c);};walk(profile.head);
 await writeFile(new URL(`../results/performance-m14/allocations-${kernel}.json.gz`,import.meta.url),gzipSync(JSON.stringify(profile)));
 results.push({kernel,steps:1000,simulatedSeconds:1,sampledBytes,heapBefore:before,heapAfter:after,heapAfterGC:retained,retainedDelta:retained-before});
}
session.disconnect();console.log(JSON.stringify({runtime:process.version,method:'V8 statistical allocation sampling, 32768-byte interval, includes collected objects; sampledBytes is an estimate, not exact allocated bytes; post-GC deltas include profiler records',results}));
