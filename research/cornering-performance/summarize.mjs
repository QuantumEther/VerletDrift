// Compact reproducible evidence. Full raw captures remain at the runner's --out
// prefix; this bundle retains timings, counters, sparse telemetry and full-trace hashes.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const output=process.argv[2]||'docs/cornering-performance-data';
await mkdir(output,{recursive:true});
const dist=a=>{a=a.filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return null;
 const q=f=>a[Math.max(0,Math.ceil(a.length*f)-1)];return {samples:a.length,mean:a.reduce((s,v)=>s+v,0)/a.length,median:q(.5),p95:q(.95),p99:q(.99),worst:q(1)};};
const ms=v=>Math.round(v*1000)/1000,hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const bundle={series:{},live:{},traceDiagnostic:null},summary={series:{},live:{},checks:{}};
for(const [name,prefix]of Object.entries({branches:'/tmp/mission7-baseline',cache:'/tmp/mission7-cache',grid:'/tmp/mission7-grid',wheelProbe:'/tmp/mission7-wheel-probe',state:'/tmp/mission7-state'})){
 const report=JSON.parse(await readFile(`${prefix}.json`)),raw=JSON.parse(gunzipSync(await readFile(`${prefix}.json.gz`)));
 const checks={branchOrVariantParity:report.comparisons.every(c=>c.mismatches===0),instrumentationParity:report.instrumentationParity.every(c=>c.exact),
  finite:true,counterIdentities:true,noConvergenceFailures:true,maxDepth:0,noDroppedControlledSteps:true};
 const timingExcluded=r=>name==='branches'&&r.profile&&r.branch==='audit'&&r.repeat===1;
 if(name==='branches')report.metadata.timingExclusions='Fine-profiled audit repeat 1 is conservatively excluded from timing summaries because a discarded secondary diagnostic briefly overlapped; its counters and telemetry remain. Uninstrumented branch timing and all cache/grid comparisons were serial.';
 const compact=[];
 for(const r of raw.runs){
  checks.finite&&=r.traces.every(row=>row.every(v=>typeof v!=='number'||Number.isFinite(v)));
  checks.noDroppedControlledSteps&&=r.dropped===0;
  for(const tick of r.ticks)for(const w of Object.values(tick.wheels)){
   checks.counterIdentities&&=w.calls===1&&w.nodes===w.calls+2*w.subdivisions&&w.advances===3*w.nodes&&w.solves===w.advances&&w.bisections<=40*w.solves&&w.targets===w.longCallbacks+w.latCallbacks+w.calls;
   checks.noConvergenceFailures&&=w.failures===0;checks.maxDepth=Math.max(checks.maxDepth,w.depth);
  }
  compact.push({name:r.name,branch:r.branch,profile:r.profile,hz:r.hz,repeat:r.repeat,timingExcluded:timingExcluded(r),traceSHA256:hash(r.traces),
   sparseTrace:r.traces.filter((_,i)=>i%Math.max(1,Math.round(r.hz/20))===0||i===r.traces.length-1),
   frameMs:r.externalFrames.map(ms),frames:r.frames.map(f=>({...f,ms:ms(f.ms),renderMs:ms(f.renderMs),renderStages:Object.fromEntries(Object.entries(f.renderStages||{}).map(([k,v])=>[k,ms(v)]))})),
   ticks:r.ticks.map(t=>({...t,ms:ms(t.ms),stages:Object.fromEntries(Object.entries(t.stages).map(([k,v])=>[k,ms(v)])),wheels:Object.fromEntries(Object.entries(t.wheels).map(([k,v])=>[k,{...v,ms:ms(v.ms)}]))})),
   heap:r.heap,wallMs:r.wallMs,simTime:r.simTime,dropped:r.dropped,effects:r.effects,wheelProbe:r.wheelProbe});
 }
 const groups=[];
 for(const hz of [...new Set(raw.runs.map(r=>r.hz))])for(const scenario of [...new Set(raw.runs.map(r=>r.name))])for(const branch of ['audit','input']){
  const runs=raw.runs.filter(r=>r.hz===hz&&r.name===scenario&&r.branch===branch),plain=runs.filter(r=>!r.profile),profiled=runs.filter(r=>r.profile&&!timingExcluded(r)),ticks=profiled.flatMap(r=>r.ticks),frames=profiled.flatMap(r=>r.frames);
  const times=(rows,field)=>dist(rows.map(r=>r[field]));
  const stages={},renderStages={},wheels={};
  for(const stage of Object.keys(ticks[0]?.stages||{}))stages[stage]=dist(ticks.map(t=>t.stages[stage]));
  for(const stage of new Set(frames.flatMap(f=>Object.keys(f.renderStages||{}))))renderStages[stage]=dist(frames.map(f=>f.renderStages?.[stage]||0));
  for(const wheel of ['frontLeft','frontRight','rearLeft','rearRight']){
   const rows=ticks.map(t=>t.wheels[wheel]);if(!rows.length)continue;
   wheels[wheel]={};for(const key of Object.keys(rows[0]))wheels[wheel][key]=key==='depth'?Math.max(...rows.map(w=>w.depth)):rows.reduce((s,w)=>s+w[key],0)/rows.length;
  }
  groups.push({hz,scenario,branch,frameMs:dist(plain.flatMap(r=>r.externalFrames)),profiledFrameMs:times(frames,'ms'),renderMs:times(frames,'renderMs'),tickMs:times(ticks,'ms'),stages,renderStages,wheels,
   callbacksPerTick:dist(ticks.map(t=>Object.values(t.wheels).reduce((s,w)=>s+w.longCallbacks+w.latCallbacks,0))),
   bisectionsPerTick:dist(ticks.map(t=>Object.values(t.wheels).reduce((s,w)=>s+w.bisections,0))),
   stepsPerFrame:times(frames,'ticks'),artworkMisses:frames.reduce((s,f)=>s+(f.artMisses||0),0),dropped:runs.reduce((s,r)=>s+r.dropped,0)});
 }
 summary.series[name]={metadata:report.metadata,groups,comparisons:report.comparisons,instrumentationParity:report.instrumentationParity};
 summary.checks[name]=checks;bundle.series[name]={metadata:raw.metadata,runs:compact};
 assert(checks.branchOrVariantParity&&checks.instrumentationParity&&checks.finite&&checks.counterIdentities&&checks.noConvergenceFailures&&checks.noDroppedControlledSteps&&checks.maxDepth<=12,`${name} validation failed`);
}
for(const variant of ['before','after']){
 const data=JSON.parse(gunzipSync(await readFile(`/tmp/mission7-normal-${variant}.json.gz`)));
 bundle.live[variant]=data;
 summary.live[variant]=data.results.map(r=>{
  const frames=r.profile.frames,dt=frames.slice(1).map((f,i)=>f.timestamp-frames[i].timestamp),wall=(r.end.time-r.start.time)/1000;
  return {name:r.name,cadenceFps:1000/(dt.reduce((s,v)=>s+v,0)/dt.length),cadenceMs:dist(dt),cpuFrameMs:dist(frames.map(f=>f.ms)),renderMs:dist(frames.map(f=>f.renderMs)),tickMs:dist(r.profile.ticks.map(t=>t.ms)),
   stepsPerWallSecond:(r.end.sim-r.start.sim)*100/wall,dropped:r.end.dropped-r.start.dropped,eventRoundTripMs:dist(r.eventRoundTripMs),longTasks:r.longTasks,
   inputChecks:r.responses.map(p=>({roadError:Math.abs(p.road-p.expected),tickAdvanced:p.simTime>p.pending.time,throttle:p.held,brake:p.brake,clutch:p.clutch})),
   heap:r.end.heap-r.start.heap,errors:r.errors};
 });
 assert(summary.live[variant].every(r=>r.errors.length===0&&r.inputChecks.every(p=>p.roadError<1e-12&&p.tickAdvanced)),`Live input delivery ${variant}`);
}
const trace=JSON.parse(gunzipSync(await readFile('/tmp/mission7-interactive.json.gz')));
bundle.traceDiagnostic=trace.results.map(r=>({name:r.name,traceSummary:r.traceSummary,heap:{start:r.start.heap,end:r.end.heap},longTasks:r.longTasks}));
summary.traceDiagnostic=bundle.traceDiagnostic;
await writeFile(`${output}/summary.json`,JSON.stringify(summary));
await writeFile(`${output}/measurements.json.gz`,gzipSync(JSON.stringify(bundle)));
console.log(JSON.stringify(summary.checks,null,2));
