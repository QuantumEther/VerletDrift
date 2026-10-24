import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
const {reset,run,scenarios}=await import('./harness.mjs');
const {updateEngine,synchronizeEngineWithWheels}=await import('../../js/physics/engine.js');
const state=(await import('../../js/state.js')).default;
const {parameters}=JSON.parse(await readFile('docs/engine-free-rev-data/parameters.json'));
const browser=JSON.parse(gunzipSync(await readFile('docs/engine-free-rev-data/browser.json.gz')));
let comparisons=0,maxDifference=0;
for(const b of browser.isolated){
 const n=run(parameters,scenarios.find(s=>s.name===b.name),b.hz);
 for(const row of b.rows){const actual=n.rows[Math.round(row.t*b.hz)-1];
   for(const [key,value] of Object.entries(row)){
     if(typeof value==='number'){
       const error=Math.abs(value-actual[key]);maxDifference=Math.max(error,maxDifference);
       if(error>1e-8*Math.max(1,Math.abs(value)))throw Error(`Browser/Node mismatch ${b.name}/${b.hz}/${key}: ${error}`);
     }else if(value!==actual[key])throw Error(`Browser/Node mode mismatch ${b.name}`);
     comparisons++;
   }
 }
}
// Performance measures only the production functions, excluding observer objects,
// profiles, JSON, rendering, wheels and diagnostics in the measurement adapter.
reset(parameters);
const core=()=>{updateEngine(.01);synchronizeEngineWithWheels(.01);};
for(let i=0;i<20000;i++)core();
const batches=[];
for(let j=0;j<100;j++){
 const start=performance.now();for(let i=0;i<5000;i++)core();
 batches.push((performance.now()-start)/5000);
}
const sorted=batches.toSorted((a,b)=>a-b),mean=batches.reduce((a,b)=>a+b,0)/batches.length;
const productionFiles=execFileSync('git',['ls-tree','-r','--name-only','52c6385','js']).toString().trim().split('\n');
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const file of productionFiles){
 if(hash(await readFile(file))!==hash(execFileSync('git',['show',`52c6385:${file}`])))throw Error(`Production changed: ${file}`);
}
const result={comparisons,maxBrowserNodeDifference:maxDifference,productionFilesIdenticalToBase:productionFiles.length,
 base:'52c6385',runtime:process.version,cpu:(await import('node:os')).cpus()[0].model,
 engineCore:{dt:.01,warmup:20000,batches:100,stepsPerBatch:5000,meanUs:mean*1000,p95BatchMeanUs:sorted[95]*1000,worstBatchMeanUs:sorted.at(-1)*1000,stepsPerWallSecond:1000/mean},
 note:'Batch averages, not individual-tick percentiles. Steady running neutral idle, clutch open. Production unchanged; before/after are the same implementation.'};
await writeFile('docs/engine-free-rev-data/verification.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
