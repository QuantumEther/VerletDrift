import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
const root='research/playable-baseline/data/';
const dist=a=>{a=a.filter(Number.isFinite).sort((a,b)=>a-b);const q=p=>a[Math.max(0,Math.ceil(a.length*p)-1)];return {mean:a.reduce((x,y)=>x+y,0)/a.length,median:q(.5),p95:q(.95),p99:q(.99),max:q(1)};};
const result={};
for(const name of ['before-serial','after','before-highdpi','after-highdpi','before-long','after-long']){
 if(!existsSync(root+name+'.json.gz'))continue;
 const data=JSON.parse(gunzipSync(readFileSync(root+name+'.json.gz')));
 result[name]=data.results.map(r=>({name:r.name,frame:dist(r.profile.frames.map(f=>f.ms)),render:dist(r.profile.frames.map(f=>f.renderMs)),tick:dist(r.profile.ticks.map(t=>t.ms)),raf:dist(r.profile.frames.slice(1).map((f,i)=>f.timestamp-r.profile.frames[i].timestamp)),stepsPerSecond:r.profile.ticks.length/((r.end.time-r.start.time)/1000),dropped:r.end.dropped-r.start.dropped,errors:r.errors,longTasks:r.longTasks.length,heapDelta:r.end.heap-r.start.heap,input:dist(r.inputEventToSteeringTickMs)}));
}
writeFileSync(root+'performance.json',JSON.stringify(result,null,2));
let md='|Run / workload|CPU frame median / p95 / p99 / max ms|Tick mean / p95 / max ms|Render p95 ms|Steps/s|Dropped|\n|---|---:|---:|---:|---:|---:|\n';
for(const [name,runs]of Object.entries(result))for(const r of runs){const f=x=>x.toFixed(2);md+=`|${name} / ${r.name}|${[r.frame.median,r.frame.p95,r.frame.p99,r.frame.max].map(f).join(' / ')}|${[r.tick.mean,r.tick.p95,r.tick.max].map(f).join(' / ')}|${f(r.render.p95)}|${f(r.stepsPerSecond)}|${r.dropped}|\n`;}
writeFileSync(root+'performance.md',md);
const s=JSON.parse(readFileSync(root+'driving/summary.json'));
const checks={browserErrorsAbsent:Object.values(result).flat().every(r=>r.errors.length===0),mechanicalParity:Object.values(s.comparison).every(r=>r.exactRepairInput),deterministic:Object.values(s.branches).every(b=>b.deterministicRepeat),finite:Object.values(s.scenarios).every(v=>Object.values(v).every(r=>r.anomalies.length===0))};
writeFileSync(root+'checks.json',JSON.stringify(checks,null,2));console.log(checks);if(Object.values(checks).some(x=>!x))process.exitCode=1;
