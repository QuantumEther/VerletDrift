import {cpuUsage,version} from 'node:process';import {cpus} from 'node:os';import {writeFile,mkdir} from 'node:fs/promises';import {execFileSync} from 'node:child_process';
import {create,step,energy,evaluateVehicle,P} from './model.js';
import {makeFixture} from '../coupled-step-challenge/fixtures.mjs';
import {stepTerrainVehicle} from '../procedural-terrain/src/vehicle.js';
const cases=['acceleration','steering','braking','drift-recovery','recontact','clutch-transition'],duration=1;
const inputs=(name,t)=>({throttle:name==='acceleration'||name==='steering'?.2:0,ignition:['acceleration','steering','clutch-transition'].includes(name),steer:name==='steering'?.03:name==='drift-recovery'?(t<.4?.05:-.03):0,serviceBrake:name==='braking'?1:0,handbrake:name==='drift-recovery'&&t>.2&&t<.4?.3:0,clutch:name==='clutch-transition'?(t<.2?0:.6):.3});
function init(name,method){
 const moving=!['acceleration','recontact'].includes(name),p=create({speed:moving?5:0,lateral:name==='drift-recovery'?1:0,yaw:name==='drift-recovery'?-.1:0,engine:moving?P.gear*5/P.R:40});
 if(name==='recontact')p.y[9]=.35;if(name==='drift-recovery'){p.y[22]=p.y[23]=7/P.R;}
 if(method==='poc')return p;
 const {v}=makeFixture('reference','acceleration');v.terrain={sample:()=>({height:.001,gradient:[0,0],normal:[0,0,1],friction:.9,surface:'asphalt'})};
 const s=v.state;s.vertical.q=p.y.slice(6,13).map((x,i)=>i===0||i>=3?x+.001:x);s.vertical.v=p.y.slice(13,20);s.planar.u=p.y[3];s.planar.v=p.y[4];s.planar.r=p.y[5];s.wheels.forEach((w,i)=>w.omega=p.y[20+i]);s.flywheel.omega=p.y[24];s.engine.throttle=0;s.engine.ignition=inputs(name,0).ignition;return v;
}
const sample=(s,method)=>method==='poc'?[...s.y.slice(0,6),...s.y.slice(20,25),...s.y.slice(6,20)]:[s.state.planar.x,s.state.planar.y,s.state.planar.heading,Math.cos(s.state.planar.heading)*s.state.planar.u-Math.sin(s.state.planar.heading)*s.state.planar.v,Math.sin(s.state.planar.heading)*s.state.planar.u+Math.cos(s.state.planar.heading)*s.state.planar.v,s.state.planar.r,...s.state.wheels.map(w=>w.omega),s.state.flywheel.omega,...s.state.vertical.q.map((x,i)=>i===0||i>=3?x-.001:x),...s.state.vertical.v];
const runs=[];
for(const name of cases)for(let repeat=0;repeat<4;repeat++)for(const method of repeat%2?['poc','strict']:['strict','poc']){
 const h=.001,s=init(name,method),times=[],initial=method==='poc'?energy(s):null;let failed=null,trace=[],iterations=0,outer=0,positiveContact=0,grip=0;
 const start=cpuUsage();for(let i=0;i<duration/h;i++){
 const input=inputs(name,i*h),t=performance.now();try{if(method==='poc')step(s,input,h);else{s.state.flywheel.engagement=input.clutch;s.state.engine.ignition=input.ignition;stepTerrainVehicle(s,input,h);}}catch(e){failed={step:i,message:e.message};break;}times.push(performance.now()-t);
 if(method==='strict'){if(!s.state.terrainLedger)throw Error('Nested terrain path not exercised');iterations+=s.state.terrainLedger.contactIterations;outer+=s.state.terrainLedger.iterations;}
 // Identical sample extraction included in both whole-run CPU costs.
 trace.push(sample(s,method));
 }
 const cpu=cpuUsage(start);times.sort((a,b)=>a-b);const q=p=>times[Math.min(times.length-1,Math.ceil(times.length*p)-1)];
 const row={name,method,repeat,warmup:repeat===0,h,completed:times.length,failed,cpuMsPerSimSecond:times.length?(cpu.user+cpu.system)/times.length: null,medianMs:q(.5),p95Ms:q(.95),p99Ms:q(.99),worstMs:times.at(-1),iterations,outer,final:sample(s,method),trace};
 if(method==='poc'){row.workResidualJ=energy(s)-initial-s.y.slice(25).reduce((a,x)=>a+x,0);const d=evaluateVehicle(s,s.y,inputs(name,duration));row.finalPowersW=d.power;row.finalTires=d.tires;}
 console.error(name,method,repeat,row.completed,failed?.message||'PASS');runs.push(row);
}
const refinements=[];
if(process.env.TIMING_ONLY!=='1')for(const name of cases)for(const method of ['poc','strict'])for(const h of [.001,.0005,.00025]){
 const s=init(name,method),initial=method==='poc'?energy(s):null;let failed=null,completed=0,maxPower=-Infinity,grip=0,unloaded=0,maxEnergyResidual=0;
 for(let i=0;i<duration/h;i++){const input=inputs(name,i*h);try{if(method==='poc')step(s,input,h);else{s.state.flywheel.engagement=input.clutch;s.state.engine.ignition=input.ignition;stepTerrainVehicle(s,input,h);}}catch(e){failed={step:i,message:e.message};break;}completed++;
 if(method==='poc'){const d=evaluateVehicle(s,s.y,input);maxPower=Math.max(maxPower,d.power[1]);for(const t of d.tires){grip=Math.max(grip,t.utilization-1);unloaded+=Number(t.N===0);}maxEnergyResidual=Math.max(maxEnergyResidual,Math.abs(energy(s)-initial-s.y.slice(25).reduce((a,x)=>a+x,0)));}
 }
 refinements.push({name,method,h,completed,failed,final:sample(s,method),workResidualJ:method==='poc'?energy(s)-initial-s.y.slice(25).reduce((a,x)=>a+x,0):null,maxEnergyResidualJ:method==='poc'?maxEnergyResidual:null,maxContactPowerW:method==='poc'?maxPower:null,frictionExcess:method==='poc'?grip:null,unloadedSamples:unloaded});console.error('refine',name,method,h,completed,failed?.message||'PASS');
}
await mkdir(new URL('results',import.meta.url),{recursive:true});
await writeFile(new URL(process.env.TIMING_ONLY==='1'?'results/timing.json':'results/comparison.json',import.meta.url),JSON.stringify({base:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),runtime:version,hardware:cpus()[0].model,logicalCPUs:cpus().length,protocol:{duration,repeats:4,firstRepeatWarmup:true,clock:'CPU user+system for stepping+common trace extraction; per-step wall excludes trace extraction; no browser or GPU work',surface:'common flat plane up to vertical translation; strict plane at +1mm selects actual nested terrain endpoint path, sample heights translated back to ground-relative coordinates',sampleFields:['worldX','worldY','heading','worldVX','worldVY','yawRate','omegaFL','omegaFR','omegaRL','omegaRR','engineOmega','verticalQ7','verticalV7']},runs:runs.map(({trace,...r})=>r),refinements},null,2));
