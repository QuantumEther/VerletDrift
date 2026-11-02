import {stationaryBalance,creepRun,geometryWitness,plane,closedLoop,point,createTerrain} from './probe.mjs';
import {create,step} from '../consistent-model.js';import {cases,ports,init} from '../efficiency/fixtures.mjs';
import {evaluateTerrainNormal} from '../../procedural-terrain/src/normal-contact.js';import {makeFixture} from '../../coupled-step-challenge/fixtures.mjs';import {stepTerrainVehicle} from '../../procedural-terrain/src/vehicle.js';
import {cpuUsage,version} from 'node:process';import {cpus} from 'node:os';import {writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';
const s=create({engine:0});s.y[2]=.3;s.y[5]=.2;s.y[7]=.02;s.y[8]=-.01;const t=plane(.05,.08),p=point(s,0);s.y[9]=.32+t.sample(...p).height-.012;
const witness={status:'BLOCKED: current velocity-slip law cannot meet stationary braked-slope requirement',stationary:stationaryBalance(),creep:[.001,.0005,.00025].map(h=>creepRun(h)),geometry:{...geometryWitness(s,t),interpretation:'Failure of naive point/Jacobian pairing, not proof that consistent terrain extension is impossible. Non-holonomic tangent velocity fields are allowed; a separate terrain-normal work mapping must be derived.'},closedLoop:closedLoop()};
const runs=[];
// Warm both identical physics paths before observing small sampling overhead.
for(const name of ['acceleration','drift-recovery'])for(const mode of ['flat','flat+observations'])for(let repeat=0;repeat<2;repeat++){
 const state=init(name),terrain=createTerrain({preset:'rough',seed:42,amplitude:.15,roughness:.4});for(let i=0;i<1000;i++){step(state,ports(name,i*.001),.001);if(mode==='flat+observations')for(let j=0;j<4;j++)evaluateTerrainNormal(terrain,point(state,j),.32,state.vertical.kt);}
}
for(const name of ['acceleration','drift-recovery'])for(let repeat=0;repeat<4;repeat++)for(const mode of repeat%2?['flat+observations','flat']:['flat','flat+observations']){
 const state=init(name),terrain=createTerrain({preset:'rough',seed:42,amplitude:.15,roughness:.4}),times=[];let iterations=0,samples=0;const start=cpuUsage();
 for(let i=0;i<1000;i++){const tick=performance.now();step(state,ports(name,i*.001),.001);if(mode==='flat+observations')for(let j=0;j<4;j++){const xyz=point(state,j);evaluateTerrainNormal(terrain,xyz,.32,state.vertical.kt);samples++;}times.push(performance.now()-tick);iterations+=state.consistency.iterations;}
 const cpu=cpuUsage(start);times.sort((a,b)=>a-b);const q=x=>times[Math.min(times.length-1,Math.ceil(times.length*x)-1)];runs.push({name,mode,repeat,warmup:repeat===0,duration:1,completed:1000,cpuMsPerSimSecond:(cpu.user+cpu.system)/1000,medianMs:q(.5),p95Ms:q(.95),p99Ms:q(.99),worstMs:times.at(-1),iterations,samples,meaning:mode==='flat'?'Complete unchanged flat step':'Complete flat step plus read-only terrain observations; NO terrain forces applied'});
}
const legacy=[];
for(let repeat=0;repeat<3;repeat++){
 const f=makeFixture('reference','acceleration'),terrain=createTerrain(f.v.terrainSettings);let samples=0;f.v.terrain={sample:(...xy)=>{samples++;return terrain.sample(...xy);}};const profile={};f.v.profile=(name,ms)=>profile[name]=(profile[name]||0)+ms;
 const times=[];let inner=0,outer=0,completed=0,failure=null;const begin=cpuUsage();
 for(let i=0;i<100;i++){const start=performance.now();try{stepTerrainVehicle(f.v,f.inputs(i*.001),.001);}catch(e){times.push(performance.now()-start);failure={attempt:i,message:e.message};break;}times.push(performance.now()-start);inner+=f.v.state.terrainLedger.contactIterations;outer+=f.v.state.terrainLedger.iterations;completed++;}
 const cpu=cpuUsage(begin);times.sort((a,b)=>a-b);const q=x=>times[Math.min(times.length-1,Math.ceil(times.length*x)-1)];legacy.push({repeat,warmup:repeat===0,requested:100,completed,failure,cpuMs:(cpu.user+cpu.system)/1000,innerIterations:inner,endpointIterations:outer,samples,profileMs:profile,p95Ms:q(.95),p99Ms:q(.99),worstMs:times.at(-1),meaning:'Existing strict nonflat adapter, short path-cost diagnostic only; not an equivalent model or full new-terrain benchmark'});
}
await writeFile(new URL('results/probe.json',import.meta.url),JSON.stringify({branch:'PERFORMANCE',base:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),runtime:version,cpu:cpus()[0].model,logicalCPUs:cpus().length,witness,runs,legacy,notExecuted:['New full-vehicle terrain trajectories','New-terrain whole-step CPU/iterations/convergence or overhead','Full-vehicle stationary slopes/uphill/downhill/bumps/crests/drifting/braking/recontact on terrain'],protocol:'Flat/observation timings: two full warmup passes per mode/case, paired four timed passes, discard first; legacy diagnostic three short passes, discard first. All headless. Observation timings measure sampling/normal math only, never actual terrain dynamics.'},null,2));
console.log(JSON.stringify(witness,null,2));
