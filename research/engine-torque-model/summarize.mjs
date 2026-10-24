import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
const read=async p=>JSON.parse(gunzipSync(await readFile(p)));
const summaries={};
for(const label of ['baseline','candidate']){
 const path=`docs/engine-torque-model-data/${label}.json.gz`,data=await read(path);
 if(data.storage)throw Error('Regenerate browser data before summarizing');
 const ix=k=>data.loaded.columns.indexOf(k),p=data.parameters;
 const governor=(omega,total,starter)=>total>0&&starter===0?Math.max(0,Math.min(.25*p.peakEngineTorqueNm,.035*p.peakEngineTorqueNm+.01*Math.abs(omega)+.05*(p.idleRpm-omega*30/Math.PI))):0;
 if(label==='baseline'){
  for(const run of data.isolated)for(const r of run.rows){const old=r.omega-r.alpha/run.hz,g=governor(old,r.combustion,r.starter),total=r.combustion;
   r.combustion=total-g;r.idle=g;r.friction=total+r.starter-p.engineInertiaKgM2*r.alpha;r.pumping=0;
   r.combustionWork=(total-g)*(old+r.omega)/2/run.hz;r.idleWork=g*(old+r.omega)/2/run.hz;
   r.frictionWork=r.dragWork;r.pumpingWork=0;
  }
  for(const run of data.loaded.runs)for(const r of run.rows){const total=r[ix('combustionTorque')],g=governor(r[ix('preEngine')],total,r[ix('starterTorque')]);
   r[ix('indicated')]=total-g;r[ix('idleTorque')]=g;r[ix('frictionTorque')]=total+r[ix('starterTorque')]-r[ix('engineImpulse')]*run.hz;r[ix('pumpingTorque')]=0;
  }
 }
 const isolated=data.isolated.map(run=>({name:run.name,hz:run.hz,final:run.rows.at(-1),to810:run.rows.find(r=>r.rpm<=810)?.t??null,toZero:run.rows.find(r=>r.rpm===0)?.t??null,
  maxRpm:Math.max(...run.rows.map(r=>r.rpm)),maxResidual:Math.max(...run.rows.map(r=>Math.abs(r.energyResidual))),
  minPassiveWork:Math.min(...run.rows.map(r=>r.dragWork)),snapshots:[.2,.5,1,2,4,8,12,16].filter(t=>t<=run.rows.at(-1).t).map(t=>run.rows[Math.round(t*run.hz)-1])}));
 const keep=['t','preEngine','freeCrank','crank','rpm','mode','enginePhaseMode','gear','requestedGear','clutchPedal','clutchEngagement','clutchTorque','clutchSlip','indicated','idleTorque','frictionTorque','pumpingTorque','starterTorque','preRearLeft','preRearRight','omega_rearLeft','omega_rearRight','longV','latV','yaw','engineImpulse'];
 const pick=r=>Object.fromEntries(keep.map(k=>[k,r[ix(k)]]));
 const loaded=data.loaded.runs.map(run=>{
  const stalled=run.rows.find(r=>r[ix('mode')]==='stalled'),costs=run.rows.map(r=>r[ix('tickMs')]).toSorted((a,b)=>a-b);
  let stall=null;
  if(stalled){const threshold=p.stallRpm*(1-p.stallResistance*.8)*Math.PI/30;
   stall={...pick(stalled),thresholdRadS:threshold,cause:stalled[ix('freeCrank')]<threshold?'engine free phase below stall threshold':'clutch/contact phase pulled crank below stall threshold'};}
  return {name:run.name,hz:run.hz,final:pick(run.rows.at(-1)),stall,transitions:run.transitions,anomalies:run.anomalies,
   tickMs:{mean:costs.reduce((a,b)=>a+b,0)/costs.length,p95:costs[Math.floor(costs.length*.95)],worst:costs.at(-1)},
   maxYaw:Math.max(...run.rows.map(r=>Math.abs(r[ix('yaw')]))),snapshots:[.5,1,2,4,6,8].filter(t=>t<=run.rows.at(-1)[0]).map(t=>pick(run.rows[Math.round(t*run.hz)-1]))};
 });
 summaries[label]={isolated,loaded,parameters:p,errors:data.errors};
 // Keep complete isolated torque/acceleration curves; loaded trajectories at 20 Hz
 // and every tick within 0.1 seconds of transitions. Metrics above use all ticks.
 for(const run of data.loaded.runs)run.rows=run.rows.filter((r,i,a)=>i%Math.max(1,Math.round(run.hz/20))===0||i===a.length-1||run.transitions.some(t=>Math.abs(t.time-r[0])<=.1+1e-10));
 data.storage='Full-resolution isolated curves. Loaded rows ~20 Hz plus ±0.1 s around transitions; summary computed from all ticks.';
 await writeFile(path,gzipSync(JSON.stringify(data),{level:9}));
}
const comparisons=summaries.candidate.loaded.map(c=>{
 const b=summaries.baseline.loaded.find(b=>b.name===c.name&&b.hz===c.hz);
 return {name:c.name,hz:c.hz,baselineStall:b.stall?.t??null,candidateStall:c.stall?.t??null,
  newStall:!b.stall&&Boolean(c.stall),baselineFinalSpeed:b.final.longV,candidateFinalSpeed:c.final.longV};
});
await writeFile('docs/engine-torque-model-data/summary.json',JSON.stringify({...summaries,comparisons},null,2)+'\n');
console.log('NEW STALLS',comparisons.filter(c=>c.newStall));
for(const hz of [50,100,200,400])console.log(hz,summaries.candidate.isolated.filter(r=>r.hz===hz&&['release-redline','release-4000','release-2000','full-throttle','shutdown'].includes(r.name)).map(r=>({name:r.name,to810:r.to810,zero:r.toZero,max:r.maxRpm,rpm4:r.snapshots.find(r=>r.t===4)?.rpm})));
console.log('LOADED100',JSON.stringify(comparisons.filter(c=>c.hz===100)));
if(comparisons.some(c=>c.newStall&&!['brake-stop','loaded-stall-restart'].includes(c.name)))throw Error('Blocking new stall; do not promote');
