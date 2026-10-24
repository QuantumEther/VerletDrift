import {readFileSync,writeFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';
const root='research/full-system-forensic/data/',read=p=>JSON.parse(readFileSync(root+p)),dist=a=>{a=a.filter(Number.isFinite).toSorted((a,b)=>a-b);let q=x=>a[Math.floor((a.length-1)*x)];return {n:a.length,mean:a.reduce((s,x)=>s+x,0)/a.length,median:q(.5),p95:q(.95),p99:q(.99),worst:a.at(-1)};};
const interactive=[];
for(const branch of ['realtime','steering-input-continuity','cornering-performance','engine-torque-model','highdpi']){
 const d=JSON.parse(gunzipSync(readFileSync(root+`interactive-${branch}.json.gz`)));
 for(const r of d.results){const f=r.profile.frames,t=r.profile.ticks;
 interactive.push({branch,scenario:r.name,frameCPU:dist(f.map(x=>x.ms)),render:dist(f.map(x=>x.renderMs)),raf:dist(f.slice(1).map((x,i)=>x.timestamp-f[i].timestamp)),tick:dist(t.map(x=>x.ms)),
 inputLatency:dist(r.inputEventToSteeringTickMs||[]),cdpDispatch:dist(r.eventRoundTripMs),stepsPerSecond:t.length/((r.end.time-r.start.time)/1000),dropped:r.end.dropped-r.start.dropped,
 heapDelta:r.end.heap-r.start.heap,longTasks:r.longTasks,trace:r.traceSummary,errors:r.errors});
 }
}
const schedules=read('schedules.json'),raw=JSON.parse(gunzipSync(readFileSync(root+'schedules.json.gz')));
const operations=raw.runs.map(r=>({branch:r.branch,name:r.name,hz:r.hz,bisections:dist(r.ticks.map(t=>Object.values(t.wheels).reduce((s,w)=>s+w.bisections,0))),targets:dist(r.ticks.map(t=>Object.values(t.wheels).reduce((s,w)=>s+w.targets,0))),depth:Math.max(...r.ticks.flatMap(t=>Object.values(t.wheels).map(w=>w.depth)))}));
const frameInvariance=[];for(const branch of ['audit','steering','cornering','input']){
 const runs=raw.runs.filter(r=>r.branch===branch&&r.name==='coast');
 frameInvariance.push({branch,runs:runs.map(r=>({hz:r.hz,simTime:r.simTime,last:r.traces.at(-1)})),note:'Frame-sampled final state; compare only equal simulated time. Driver commands are replayed at RAF boundaries.'});
}
const ledger=read('ledger.json'),energy={};for(const r of ledger.rows){const d=energy[r.scenario]??={};for(const s of r.stages){const a=d[s.name]??={sum:0,min:Infinity,max:-Infinity};a.sum+=s.deltaK;a.min=Math.min(a.min,s.deltaK);a.max=Math.max(a.max,s.deltaK);}}
const result={interactive,operations,energy,frameInvariance};writeFileSync(root+'analysis.json',JSON.stringify(result,null,2));
let md='|Branch / workload|CPU frame median / p95 / p99 / max ms|Render p95 ms|Tick mean / p95 / max ms|RAF p95 ms|Steps/s|Dropped|Input event→tick p95 ms|\n|---|---:|---:|---:|---:|---:|---:|---:|\n';
const f=x=>x===undefined?'n/a':x.toFixed(2);
for(const r of interactive.filter(r=>['straight','countersteer'].includes(r.scenario)))md+=`|${r.branch} / ${r.scenario}|${[r.frameCPU.median,r.frameCPU.p95,r.frameCPU.p99,r.frameCPU.worst].map(f).join(' / ')}|${f(r.render.p95)}|${[r.tick.mean,r.tick.p95,r.tick.worst].map(f).join(' / ')}|${f(r.raf.p95)}|${f(r.stepsPerSecond)}|${r.dropped}|${f(r.inputLatency.p95)}|\n`;
writeFileSync(root+'performance.md',md);
console.log(md);console.log('current120',operations.filter(r=>r.branch==='input'&&r.hz===120));
