import {cpuUsage,version} from 'node:process';
import {cpus,platform,arch} from 'node:os';
import {fixture} from './tire-ab-fixtures.mjs';
import {stepTerrainVehicle} from '../src/vehicle.js';
const duration=+(process.env.DURATION||'.12'),repeats=+(process.env.REPEATS||5),cases=(process.env.CASES||'acceleration,braking,steering,combined,recovery,drift-recovery,recontact').split(','),floors=(process.env.FLOORS||'.25,.5,1,2').split(',').map(Number),steps=(process.env.STEPS||'.001,.002,.004').split(',').map(Number),runs=[];
for(const scenario of cases)for(const h of steps)for(const floor of floors)for(let repeat=0;repeat<repeats;repeat++)for(const id of repeat%2?['speed-normalized-anisotropic','reference']:['reference','speed-normalized-anisotropic']){
 const {v,inputs}=fixture(id,floor,scenario,duration),times=[],stages={},detail=[],traces=[];
 if(process.env.PROFILE==='1'){
  v.profile=(key,ms)=>{const a=stages[key]??={ms:0,count:0};a.ms+=ms;a.count++;};
  const buckets=new Map();v.contactProfile=e=>{
   const key=e.stage+':'+String(e.mode??'');let a=buckets.get(key);
   if(!a){a={stage:e.stage,mode:e.mode,count:0,ms:0,iterations:0,projectionMs:0,residualMs:0,gradientMs:0,projections:0,saturated:0,bracketSteps:0,reused:0,failed:0,maxResidual:0};buckets.set(key,a);detail.push(a);}
   a.count++;for(const k of ['ms','iterations','projectionMs','residualMs','gradientMs','projections','bracketSteps'])a[k]+=e[k]||0;
   for(const k of ['saturated','reused','failed'])a[k]+=Number(!!e[k]);a.maxResidual=Math.max(a.maxResidual,e.residual||0);
  };
 }
 const capture=e=>{traces.push({...e,time:v.state.time});if(traces.length>=3)v.contactCapture=null;};
 if(process.env.VARIANT)v.contactOptimization=process.env.VARIANT;
 const cpu=cpuUsage(),wall=performance.now();let fault=null,outer=0,inner=0,substeps=0,energy=0,constitutive=0,grip=0,finite=true;
 for(let i=0;i<Math.round(duration/h);i++){
  if(process.env.TRACE==='1'&&!traces.length&&i*h>=Math.min(.05,duration/2))v.contactCapture=capture;
  const start=performance.now();try{stepTerrainVehicle(v,inputs(i*h),h);}catch(e){fault={message:e.message,step:i,time:v.state.time,ports:inputs(i*h),candidate:e.candidate};break;}
  times.push(performance.now()-start);outer+=v.state.terrainLedger.iterations;inner+=v.state.terrainLedger.contactIterations;substeps+=v.integration.substeps;
  energy=Math.max(energy,Math.abs(v.state.terrainLedger.residual));constitutive=Math.max(constitutive,v.state.planar.contact.constitutiveImpulseResidual);
  for(const w of v.state.wheels){grip=Math.max(grip,Math.hypot(w.fx,w.fy)-w.mu*Math.max(0,w.normal));finite&&=[w.fx,w.fy,w.omega,w.normal,w.slipX,w.slipY].every(Number.isFinite);}
 }
 const used=cpuUsage(cpu),wallMs=performance.now()-wall;times.sort((a,b)=>a-b);const q=p=>times[Math.min(times.length-1,Math.ceil(times.length*p)-1)];
 runs.push({scenario,h,floor,id,repeat,warmup:repeats>1&&repeat===0,variant:process.env.VARIANT||'production-default',profile:process.env.PROFILE==='1',simulated:v.state.time,cpuMs:(used.user+used.system)/1000,wallMs,medianMs:q(.5),p95Ms:q(.95),p99Ms:q(.99),worstMs:times.at(-1),accepted:times.length,attempts:times.length+(fault?1:0),outer,inner,substeps,energy,constitutive,gripExcess:grip,finite,stages,detail,traces,fault});
 console.error(scenario,h,floor,id,repeat,fault?.message||'pass');
}
console.log(JSON.stringify({runtime:version,source:process.env.SOURCE||'working-tree',environment:{cpu:cpus()[0].model,arch:arch(),platform:platform()},protocol:{duration,repeats,warmups:repeats>1?1:0,order:'alternating AB/BA',cpuGate:1.1,variant:process.env.VARIANT||'production-default'},runs}));
