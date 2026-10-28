import {performance} from 'node:perf_hooks';import {writeFile} from 'node:fs/promises';import os from 'node:os';import * as THREE from '../vendor/three.module.js';
import {createVehicle,stepVehicle} from '../src/vehicle.js';import {TireObservatory} from '../src/tracks.js';import {createTrackView} from '../src/track-view.js';import {stressSample} from './track-stress.mjs';
const stats=v=>{const a=[...v].sort((a,b)=>a-b);return {count:a.length,meanMs:a.reduce((x,y)=>x+y,0)/a.length,medianMs:a[Math.floor(a.length/2)],p95Ms:a[Math.floor(a.length*.95)],p99Ms:a[Math.floor(a.length*.99)],worstMs:a.at(-1)};};
const report={sourceCommit:'d419189dda7fc698d5364e0a1f91d2c9718c9113',node:process.version,cpu:os.cpus()[0].model,logicalCPUs:os.cpus().length,method:'Each work unit stated separately. Physics: 500 warm-up + 2000 timed 1 ms master steps. Telemetry stress and CPU geometry packing are NOT ODE steps and do NOT measure GPU execution. Timing is host/JIT/GC dependent; no speedup claim.',physics:[],telemetry:[]};
for(const observed of [false,true]){const s=createVehicle({automobile:true,mode:'open'}),o=observed?new TireObservatory():null;s.v=8;s.wheels.forEach(w=>w.omega=25);for(let i=0;i<500;i++)stepVehicle(s,{steer:.2},.001,o);const times=[];for(let i=0;i<2000;i++){const t=performance.now();stepVehicle(s,{steer:.2,handbrake:1},.001,o);times.push(performance.now()-t);}report.physics.push({observer:observed,h:.001,...stats(times),tracks:o?.stats()||null});}
for(const mode of ['rolling','sliding','stationary']){
 const o=new TireObservatory(),view=createTrackView(new THREE.Scene()),s=createVehicle(),times=[],packing=[];let start=stressSample(0,{rolling:mode==='rolling',stationary:mode==='stationary'});
 for(let i=1;i<=30000;i++){const end=stressSample(i*.001,{rolling:mode==='rolling',stationary:mode==='stationary'});o.record({start,end,h:.001});start=end;}global.gc?.();const heapBefore=process.memoryUsage().heapUsed;
 for(let i=30001;i<=230000;i++){const end=stressSample(i*.001,{rolling:mode==='rolling',stationary:mode==='stationary'}),t=performance.now();o.record({start,end,h:.001});times.push(performance.now()-t);start=end;
  if(i%16===0){s.planar.x=end.center.x;const a=performance.now();view.draw(s,o,true);packing.push(performance.now()-a);}
 }
 const recordStats=stats(times),packingStats=stats(packing);times.length=packing.length=0;global.gc?.();const heapAfter=process.memoryUsage().heapUsed;
 report.telemetry.push({mode,synthetic:true,warmupStages:30000,measuredStages:200000,record:recordStats,geometryPacking:packingStats,gcAvailable:!!global.gc,heapBefore,heapAfter,heapDelta:heapAfter-heapBefore,history:o.stats(),renderer:view.info(),sceneGeometryCount:1,sceneMaterialCount:1});view.geometry.dispose();view.material.dispose();
}
await writeFile(new URL('../results/mission40-performance-node.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
