// Isolated Node VM DSP throughput, NOT a measurement of browser audio-thread CPU.
import {readFile,writeFile} from 'node:fs/promises';import os from 'node:os';import {performance} from 'node:perf_hooks';import {processor} from './audio-test-harness.mjs';import {recordings,prepareLoop} from './audio-samples.js';
const meta=JSON.parse(await readFile(process.argv[2]??'/tmp/schweinemotorwerke-audio-bench/recordings.json','utf8')),anchors=[];
for(const m of meta){const raw=await readFile(m.path),x=new Float32Array(raw.buffer,raw.byteOffset,raw.length/4),channels=Array.from({length:m.channels},(_,c)=>Float32Array.from({length:x.length/m.channels},(_,i)=>x[i*m.channels+c]));const spec=recordings.find(r=>r.file===m.file);const loop=prepareLoop(channels,m.rate,spec);loop.gain=spec.rpm<1000?4:1;anchors.push(loop);}
const results=[];
for(const mode of ['recorded','hybrid','procedural','muted']){
 const {p}=await processor();p.receive({type:'samples',anchors});p.receive({type:'options',value:{mode}});const out=[[new Float32Array(128),new Float32Array(128)]],times=[];let frames=0;
 const telemetry={engineRPM:3500,engineMode:'running',combustionTorque:220,effectiveOpening:.5,throttle:.5,loadProxy:.5,simulationTime:0,epoch:1};
 for(let block=0;block<2250;block++){if(block%7===0)p.receive({type:'telemetry',value:telemetry,sequence:block});const begin=performance.now();p.process([],out);const ms=performance.now()-begin;if(block>=375){times.push(ms);frames+=128;}}
 const sorted=times.toSorted((a,b)=>a-b),sum=times.reduce((a,x)=>a+x,0),q=f=>sorted[Math.ceil(sorted.length*f)-1];results.push({mode,simulatedAudioSeconds:frames/48000,cpuMsPerAudioSecond:sum/(frames/48000),meanBlockMs:sum/times.length,medianBlockMs:q(.5),p95BlockMs:q(.95),p99BlockMs:q(.99),worstBlockMs:sorted.at(-1),safetyLimitSamples:p.clipped});
}
const result={node:process.version,cpu:os.cpus()[0].model,method:'48 kHz stereo, seven actual decoded recordings, fixed accepted telemetry at 3500 RPM, 1s warmup + 5s measured per mode. Includes VM overhead; no browser scheduling/decode/network cost. Not audio-thread realtime deadline proof.',results};await writeFile(new URL('results/engine-audio-benchmark.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
