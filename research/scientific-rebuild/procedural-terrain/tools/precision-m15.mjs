// Deterministic tolerance screen and matched physical-error comparisons.
import {cpuUsage,version} from 'node:process';import {cpus} from 'node:os';
import {readFile,writeFile} from 'node:fs/promises';import {gzipSync} from 'node:zlib';
import {NUMERICAL_EXPERIMENTS} from '../src/numerical-settings.js';
import {fixture} from './tire-ab-fixtures.mjs';import {cloneMechanical,stepTerrainVehicle,sampleWheelTerrain} from '../src/vehicle.js';
const duration=+(process.env.DURATION||'.2'),repeats=+(process.env.REPEATS||'1'),h=+(process.env.H||'.001');
export const settings=[{id:'strict',p:{}},...[-11,-10,-9,-8,-7].map(e=>({id:'contact'+e,p:{contactTolerance:10**e}})),...[-10,-9,-8].map(e=>({id:'position'+e,p:{positionTolerance:10**e}})),...[-9,-8,-7].map(e=>({id:'velocity'+e,p:{velocityTolerance:10**e}})),...[-10,-9,-8].map(e=>({id:'scaled'+e,p:{velocityMode:'scaled',velocityTolerance:10**e,velocityRelative:10**e}})),{id:'reuse',p:{},reuse:true},{id:'balanced',p:{contactTolerance:1e-11,positionTolerance:1e-9,velocityTolerance:1e-9},reuse:true},{id:'fast',p:{contactTolerance:1e-9,positionTolerance:1e-10,velocityMode:'scaled',velocityTolerance:1e-9,velocityRelative:1e-9}},{id:'fast-position-strict',p:{contactTolerance:1e-9,velocityMode:'scaled',velocityTolerance:1e-9,velocityRelative:1e-9}},{id:'moderate',p:NUMERICAL_EXPERIMENTS.balanced}];
const wanted=(process.env.CONFIGS||settings.filter(s=>!s.reuse).map(s=>s.id).join(',')).split(',');const configs=wanted.map(id=>{const c=settings.find(c=>c.id===id);if(!c)throw Error('Unknown config '+id);return c;});
if(configs.some(c=>c.reuse)&&!(await readFile(new URL('../src/vehicle.js',import.meta.url),'utf8')).includes('preparedInputs'))throw Error('Rejected reuse candidate is not active: apply results/precision-m15/rejected-input-reuse.patch in an isolated archive to reproduce it');
const cases=(process.env.CASES||'acceleration,braking,steering,drift-recovery,recontact').split(','),ids=(process.env.TIRES||'reference,speed-normalized-anisotropic').split(','),templates=new Map(),runs=[],references=new Map();
function setup(id,scenario){
 const k=id+':'+scenario;if(!templates.has(k)){
  const base=['hard-braking','countersteer','large-slip','heave','stall'].includes(scenario)?scenario==='large-slip'?'drift-recovery':'acceleration':scenario;
  const t=fixture(id,.5,base,duration),s=t.v.state;
  if(scenario==='hard-braking'||scenario==='countersteer'){s.v=5;s.wheels.forEach(w=>w.omega=5/w.radius);s.flywheel.omega=5/s.wheels[2].radius*s.flywheel.ratio;s.engine.ignition=false;}
  if(scenario==='large-slip'){s.planar.v=1;s.planar.r=-.1;s.wheels.forEach(w=>w.omega=(w.axle===1?7:5)/w.radius);s.engine.ignition=false;}
  if(scenario==='heave'){s.vertical.q[0]+=.015;s.z=s.vertical.q[0];s.v=0;s.planar.v=0;s.wheels.forEach(w=>w.omega=0);s.flywheel.omega=0;s.flywheel.engagement=0;s.engine.ignition=false;s.engine.mode='stopped';}
  if(scenario==='stall'){s.v=0;s.wheels.forEach(w=>w.omega=0);s.flywheel.omega=30;s.flywheel.engagement=1;}
  const inputs= t=>scenario==='hard-braking'?{serviceBrake:1}:scenario==='countersteer'?{steer:t<.25?.04:-.04}:scenario==='large-slip'?{steer:t<.2?.03:-.03,handbrake:t>=.1&&t<.2?.3:0}:scenario==='heave'?{}:scenario==='stall'?{throttle:0}:templates.get(k).originalInputs(t);
  templates.set(k,{...t,inputs,originalInputs:t.inputs});
 }
 const t=templates.get(k);return {v:{...t.v,state:cloneMechanical(t.v.state),contacts:structuredClone(t.v.contacts)},inputs:t.inputs};
}
function sample(s){return [s.planar.x,s.planar.y,s.planar.heading,s.planar.u,s.planar.v,s.planar.r,s.flywheel.omega,s.steering.wheelAngle,...s.wheels.map(w=>w.omega),...s.wheels.map(w=>w.fx??null),...s.wheels.map(w=>w.fy??null),...s.wheels.map(w=>w.normal??null),...s.vertical.q,...s.vertical.v];}
export const fields=['x_m','y_m','heading_rad','u_m_s','v_m_s','yaw_rad_s','engine_rad_s','column_rad',...['fl','fr','rl','rr'].map(k=>k+'_omega_rad_s'),...['fl','fr','rl','rr'].map(k=>k+'_fx_N'),...['fl','fr','rl','rr'].map(k=>k+'_fy_N'),...['fl','fr','rl','rr'].map(k=>k+'_normal_N'),...Array.from({length:7},(_,i)=>'vertical_q'+i+'_SI'),...Array.from({length:7},(_,i)=>'vertical_v'+i+'_SI')];
function comparison(trace,ref){const max=Array(fields.length).fill(0);for(let i=0;i<Math.min(trace.length,ref.length);i++)for(let j=0;j<max.length;j++)if(Number.isFinite(trace[i][j])&&Number.isFinite(ref[i][j]))max[j]=Math.max(max[j],Math.abs(trace[i][j]-ref[i][j]));return {matchedSamples:Math.min(trace.length,ref.length),maxErrors:Object.fromEntries(fields.map((f,i)=>[f,max[i]])),initialForceFields:'uncomputed force/load values at time zero are null and excluded; all accepted force stages compared'};}
for(const id of ids)for(const scenario of cases){
 const run=(config,step=h,profile=false)=>{
  const {v,inputs}=setup(id,scenario);v.numerics=config.p;v.reuseCandidateInputs=!!config.reuse;
  const trace=[sample(v.state)],times=[],events=[],profiles={},initialX=v.state.planar.x;let inner=0,outer=0,energy=0,constitutive=0,gripExcess=0,fault=null,stop=null,minLoads=Array(4).fill(Infinity),peakHeave=0;
  if(profile)v.profile=(name,ms)=>{const r=profiles[name]??={count:0,ms:0};r.count++;r.ms+=ms;};
  let oldMode=v.state.engine.mode,oldClutch=v.state.flywheel.state,oldContact=sampleWheelTerrain(v).map((c,i)=>v.state.wheels[i].radius+c.height>v.state.vertical.q[3+i]),previousSpeed=Math.hypot(v.state.planar.u,v.state.planar.v),previousX=initialX;
  const cpu0=cpuUsage(),begin=performance.now();
  for(let i=0;i<Math.round(duration/step);i++){
   const t=performance.now();try{stepTerrainVehicle(v,inputs(i*step),step);}catch(e){fault={step:i,time:v.state.time,message:e.message,candidate:e.candidate};break;}times.push(performance.now()-t);
   inner+=v.state.terrainLedger.contactIterations;outer+=v.state.terrainLedger.iterations;energy=Math.max(energy,Math.abs(v.state.terrainLedger.residual));constitutive=Math.max(constitutive,v.state.planar.contact.constitutiveImpulseResidual);
   const s=v.state,speed=Math.hypot(s.planar.u,s.planar.v);if(stop===null&&previousSpeed>.01&&speed<=.01){const f=(previousSpeed-.01)/(previousSpeed-speed);stop={time:(i+f)*step,distance:previousX+f*(s.planar.x-previousX)-initialX,definition:'linearly interpolated body speed crosses 0.01 m/s'};}previousSpeed=speed;previousX=s.planar.x;
   for(let k=0;k<4;k++){const w=s.wheels[k];minLoads[k]=Math.min(minLoads[k],w.normal);gripExcess=Math.max(gripExcess,Math.hypot(w.fx,w.fy)-w.mu*w.normal);if((w.normal>0)!==oldContact[k])events.push({type:'contact-'+k,value:w.normal>0,time:s.time});oldContact[k]=w.normal>0;}
   if(s.engine.mode!==oldMode)events.push({type:'engine',value:s.engine.mode,time:s.time});oldMode=s.engine.mode;
   if(s.flywheel.state!==oldClutch)events.push({type:'clutch',value:s.flywheel.state,time:s.time});oldClutch=s.flywheel.state;
   peakHeave=Math.max(peakHeave,Math.abs(s.vertical.q[0]-trace[0][24]));
   if((i+1)%Math.round(h/step)===0)trace.push(sample(s));
  }
  const cpu=cpuUsage(cpu0),wallMs=performance.now()-begin;times.sort((a,b)=>a-b);const q=p=>times[Math.min(times.length-1,Math.ceil(times.length*p)-1)]??null;
  let failedStepIterations=null;if(fault){const p={...v,state:cloneMechanical(v.state)},stats={inner:0,solves:0,outer:0};p.profile=name=>{if(name==='trial-copy')stats.outer++;};p.contactProfile=e=>{if(e.stage==='optimization'){stats.inner+=e.iterations;stats.solves++;}};try{stepTerrainVehicle(p,inputs(fault.step*step),step);}catch{}failedStepIterations=stats;}
  return {config:config.id,numerics:config.p,reuse:!!config.reuse,h:step,accepted:times.length,simulated:v.state.time,cpuMs:(cpu.user+cpu.system)/1000,wallMs,cpuMsPerSimSecond:v.state.time?(cpu.user+cpu.system)/1000/v.state.time:null,medianMs:q(.5),p95Ms:q(.95),p99Ms:q(.99),worstMs:times.at(-1)??null,inner,outer,energy,constitutive,gripExcess,minLoads,stop,events,peakHeave,trace,profiles,failedStepIterations,fault};
 };
 const strict=run(settings[0],h,process.env.PROFILE==='1');references.set(id+':'+scenario,strict);let fine=null,finer=null;if(process.env.FINE==='1'){fine=run(settings[0],h/2);finer=run(settings[0],h/4);}
 for(let repeat=0;repeat<repeats;repeat++){
  const order=configs.length===2?[...configs]:configs.slice(repeat%configs.length).concat(configs.slice(0,repeat%configs.length));if(repeat%2)order.reverse();
  for(const c of order){const r=run(c);r.errorsToStrict=comparison(r.trace,strict.trace);if(fine)r.errorsToFine=comparison(r.trace,fine.trace);r.id=id;r.scenario=scenario;r.repeat=repeat;
   r.warmup=repeats>1&&repeat===0;r.complete=r.accepted===Math.round(duration/h);runs.push(r);console.error(id,scenario,c.id,repeat,r.fault?.message||'pass');}
 }
 if(fine){runs.push({...fine,id,scenario,config:'fine',comparisonToStrict:comparison(fine.trace,strict.trace),comparisonToFiner:comparison(fine.trace,finer.trace)});runs.push({...finer,id,scenario,config:'finer'});}
 if(process.env.PROFILE==='1')runs.push({...strict,id,scenario,config:'strict-profile'});
}
const stride=+(process.env.TRACE_STRIDE||10);
const traces=runs.map(({trace,...r})=>{const sampleIndices=trace.map((_,i)=>i).filter(i=>i%stride===0||i===trace.length-1);return {id:r.id,scenario:r.scenario,config:r.config,repeat:r.repeat,h:r.h,sampleGridH:h,sampleIndices,trace:sampleIndices.map(i=>trace[i])};});
if(process.env.SAVE_TRACES)await writeFile(new URL('../results/precision-m15/'+process.env.SAVE_TRACES,import.meta.url),gzipSync(JSON.stringify({fields,h,storedSampleStride:stride,comparisonGridH:h,units:'field suffixes; vertical q/v use m,rad,m/s,rad/s by coordinate',runs:traces})));
console.log(JSON.stringify({base:'2caf5f45f989b04f6de282b880837b1a29069622',runtime:version,cpu:cpus()[0].model,logicalCPUs:cpus().length,protocol:{duration,repeats,h,configs,cases,ids,traceOverhead:'common sample/event extraction inside whole-run CPU/wall; per-step quantiles time only physical stepping',fineReference:process.env.FINE==='1'?'strict h/2 and h/4, matched h-grid samples':'none',safety:'unchanged 1e-7 J energy, 2e-8 Ns constitutive, friction, finite and 80 endpoint/20000 convex bounds'},runs:runs.map(({trace,...r})=>r)}));
