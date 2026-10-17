// CPU cache bookkeeping only: mocked writes exclude real driver/transfer cost.
// node scripts/benchmark-skid-cache.mjs --baseline /path/to/baseline/checkout
import { GPUSkidCache as Current } from '../js/renderer/gpu-skid-cache.js';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
const option=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const baseline=option('--baseline');
if (!baseline) throw Error('Provide --baseline /path/to/baseline/checkout');
const {GPUSkidCache:Baseline}=await import(pathToFileURL(join(resolve(baseline),'js/renderer/gpu-skid-cache.js')));
globalThis.GPUBufferUsage={STORAGE:1,COPY_DST:2};
const device={createBuffer:d=>({...d,destroy(){}}),createBindGroup:()=>({}),queue:{writeBuffer(){}}};
const source=Array.from({length:20000},(_,i)=>({x1:i,y1:0,x2:i+1,y2:1,width:.195,alpha:.7,hue:-1}));
const color=(s,out,i)=>{out[i]=.1;out[i+1]=.2;out[i+2]=.3;};
const caches=[new Baseline(device,{}, {getBindGroupLayout:()=>({})}),new Current(device,{}, {getBindGroupLayout:()=>({})})];
for(const cache of caches)for(let i=0;i<30;i++)cache.update(source,1,color);
const results=[];
for(const mode of ['static','fading']){
 const times=[[],[]],bytes=[[],[]];
 for(let iteration=0;iteration<150;iteration++){
  if(mode==='fading')for(const seg of source)seg.alpha-=.00001;
  for(const i of iteration%2?[1,0]:[0,1]){
   const t=performance.now(),r=caches[i].update(source,1,color);
   times[i].push(performance.now()-t);bytes[i].push(r.uploadedBytes);
  }
 }
 results.push({mode,beforeMs:times[0],afterMs:times[1],beforeUploadedBytes:bytes[0],afterUploadedBytes:bytes[1]});
}
const report={scope:'20k-event CPU cache bookkeeping, mocked GPU writes; not total frame time or actual transfer timing',results};
if(option('--output'))writeFileSync(option('--output'),JSON.stringify(report,null,2));
for(const r of results){const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;console.log(r.mode,'CPU means',mean(r.beforeMs),mean(r.afterMs),'bytes',r.beforeUploadedBytes.at(-1),r.afterUploadedBytes.at(-1));}
