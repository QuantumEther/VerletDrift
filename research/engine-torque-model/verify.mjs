import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';
globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
const {run,reset,scenarios}=await import('./harness.mjs');
const current=await import('../../js/physics/engine.js'),legacy=await import('./legacy-engine.mjs');
const {engineTorques}=await import('../../js/physics/engine-torque.js');
const state=(await import('../../js/state.js')).default;
const archived=execFileSync('git',['show','ae87786:js/physics/engine.js']).toString();
let relocated=archived;
for(const [old,next] of [['../state.js','../../js/state.js'],['../sound.js','../../js/sound.js'],['../constants.js','../../js/constants.js'],['./drivetrain-rotation.js','../../js/physics/drivetrain-rotation.js'],['./wheel.js','../../js/physics/wheel.js'],['../debug/','../../js/debug/']])relocated=relocated.replaceAll("'"+old,"'"+next);
const fixture=(await readFile(new URL('./legacy-engine.mjs',import.meta.url),'utf8')).split('\n').slice(1).join('\n');
if(fixture!==relocated)throw Error('Frozen legacy engine differs from original beyond import paths');

const data=JSON.parse(gunzipSync(await readFile('docs/engine-torque-model-data/candidate.json.gz')));
const summary=JSON.parse(await readFile('docs/engine-torque-model-data/summary.json'));
const p=data.parameters;
let maxDifference=0,comparisons=0;
for(const b of data.isolated){const n=run(p,scenarios.find(s=>s.name===b.name),b.hz);
 for(let i=0;i<b.rows.length;i++)for(const [k,v] of Object.entries(b.rows[i])){
  const actual=n.rows[i][k];
  if(typeof v==='number'){const d=Math.abs(v-actual);maxDifference=Math.max(d,maxDifference);if(d>1e-9*Math.max(1,Math.abs(v)))throw Error(`Browser parity ${b.name}/${b.hz}/${i}/${k}`);}
  else if(v!==actual)throw Error('State parity failed');comparisons++;
 }}
let openClutchComparisons=0;
for(const loaded of data.loaded.runs.filter(r=>r.name==='clutch-open-moving')){
 const reference=data.isolated.find(r=>r.name==='release-4000'&&r.hz===loaded.hz);
 const ix=k=>data.loaded.columns.indexOf(k);
 for(const row of loaded.rows){
  const expected=reference.rows[Math.round(row[0]*loaded.hz)-1];
  if(row[ix('clutchTorque')]!==0||Math.abs(row[ix('rpm')]-expected.rpm)>1e-8)throw Error('Engaged gear/open clutch influenced crank');
  openClutchComparisons++;
 }
}
const candidates=[];
for(const pressure of [40000,65000,85000])for(const hz of [50,100,200,400]){
 const rows=run({...p,enginePumpingPressurePa:pressure},scenarios.find(s=>s.name==='release-redline'),hz).rows;
 candidates.push({pressurePa:pressure,hz,to810:rows.find(r=>r.rpm<=810)?.t??null,maxResidual:Math.max(...rows.map(r=>Math.abs(r.energyResidual)))});
}
const reference=run(p,scenarios.find(s=>s.name==='release-redline'),1600);
const convergence=[50,100,200,400].map(hz=>{
 const rows=run(p,scenarios.find(s=>s.name==='release-redline'),hz).rows;
 return {hz,maxCurveErrorRpm:Math.max(...rows.map((r,i)=>Math.abs(r.rpm-reference.rows[Math.round((i+1)*1600/hz)-1].rpm)))};
});
const statistics=a=>{const s=a.toSorted((a,b)=>a-b);return {meanUs:a.reduce((a,b)=>a+b,0)/a.length*1000,p95Us:s[Math.floor(s.length*.95)]*1000,worstUs:s.at(-1)*1000};};
// Isolated, warmed production engine+open neutral sync. No observer allocations.
const core=[];
for(const [name,engine] of [['legacy',legacy],['candidate',current]]){
 reset(p);const tick=()=>{engine.updateEngine(.01);engine.synchronizeEngineWithWheels(.01);};
 for(let i=0;i<20000;i++)tick();
 const individual=[],batches=[];
 for(let i=0;i<10000;i++){const t=performance.now();tick();individual.push(performance.now()-t);}
 for(let j=0;j<100;j++){const t=performance.now();for(let i=0;i<5000;i++)tick();batches.push((performance.now()-t)/5000);}
 core.push({name,individual:statistics(individual),batchMean:statistics(batches),stepsPerWallSecond:1e6/statistics(batches).meanUs});
}
const out={},evaluation=[];let checksum=0;
function legacyTorque(omega,u,mode,p,o){const n=omega*30/Math.PI,D=.035*p.peakEngineTorqueNm+.01*Math.abs(omega),G=Math.max(0,Math.min(.25*p.peakEngineTorqueNm,D+.05*(p.idleRpm-n)));
 o.combustion=mode==='running'&&omega>0&&n<p.redlineRpm?p.peakEngineTorqueNm*Math.max(0,1-2.5*((n-4500)/(p.redlineRpm-p.idleRpm))**2)*u+G:0;return o;}
for(const [name,fn] of [['legacy',legacyTorque],['candidate',engineTorques]]){
 for(let i=0;i<20000;i++)checksum+=fn((800+i%6500)*Math.PI/30,(i%101)/100,'running',p,out).combustion;
 const times=[];for(let i=0;i<50000;i++){const omega=(800+i%6500)*Math.PI/30,u=(i%101)/100,t=performance.now();fn(omega,u,'running',p,out);times.push(performance.now()-t);checksum+=out.combustion;}
 evaluation.push({name,...statistics(times)});
}
const allowed=new Set(['js/physics/engine.js','js/state.js','js/ui/controls.js']);let untouched=0;
for(const file of execFileSync('git',['ls-tree','-r','--name-only','ae87786','js']).toString().trim().split('\n')){
 if(!allowed.has(file)){if(!(await readFile(file)).equals(execFileSync('git',['show',`ae87786:${file}`])))throw Error(`Out-of-scope source edit ${file}`);untouched++;}}
const result={comparisons,openClutchComparisons,maxBrowserNodeDifference:maxDifference,candidates,convergence,core,evaluation,checksum,untouchedProductionFiles:untouched,
 runtime:process.version,cpu:(await import('node:os')).cpus()[0].model,
 notes:['Individual timings include timer overhead and scheduling outliers. Batch means amortize timer cost.','Evaluator receives reusable output: no source-level per-evaluation allocation. Engine sync retains existing impulse-object allocations.','Microbenchmark is not full simulator FPS. No heavy browser/test job runs concurrently.']};
if(summary.comparisons.some(c=>c.newStall&&!['brake-stop','loaded-stall-restart'].includes(c.name)))throw Error('New unaccepted stall');
await writeFile('docs/engine-torque-model-data/verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
