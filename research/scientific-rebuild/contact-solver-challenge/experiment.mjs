import {readFile,writeFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {cpuUsage,version} from 'node:process';import {cpus} from 'node:os';import assert from 'node:assert/strict';
import {solveContacts} from '../procedural-terrain/src/contact-solver.js';
import {contactIterates} from '../procedural-terrain/src/contact-iteration.js';
import {solveNewton,project} from './newton.js';import {prepare,reconstruct} from './prepare.js';import {certify} from './check.js';
const dataset=JSON.parse(gunzipSync(await readFile(new URL('results/problems.json.gz',import.meta.url)))),problems=dataset.problems;
// Frozen decision protocol: no threshold or solver-parameter tuning after results.
const protocol={repeats:9,warmups:2,passesPerBatch:3,tolerances:{strict:1e-12,balanced:1e-10},newton:{maxIterations:40,lineSearchLimit:12,directionRegularization:1e-12},equivalence:{strict:{objectiveJ:1e-10,velocity:1e-8},balanced:{objectiveJ:1e-8,velocity:1e-6}},gate:'All full-solve solutions must converge and pass independent feasibility/KKT/equivalence. At least 5x aggregate full-contact CPU speedup at BOTH accuracies and no worse observed full-solve worst latency. Core timings alone cannot pass.'};
await writeFile(new URL('results/protocol.json',import.meta.url),JSON.stringify(protocol,null,2));
const originalProblemBytes=JSON.stringify(problems);
const prepared=problems.map(p=>prepare(p)),verification=[];
for(let i=0;i<problems.length;i++){
 const p=problems[i],a=prepared[i];if(p.historical){assert.deepEqual(a.d,p.historical.d);assert.deepEqual(a.rhs,p.historical.rhs);assert.equal(a.L,p.historical.L);}
 for(const [accuracy,tolerance] of Object.entries(protocol.tolerances)){
  const f=solveContacts(p.inverse,p.free,p.rows,p.groups,p.h,{initial:p.warm,tolerance,maxIterations:20000}),n=solveNewton(a.d,a.rhs,a.L,p.groups,{initial:p.warm,tolerance});
  const fc=certify(p,f.z,tolerance,a.L),nc=certify(p,n.z,tolerance,a.L),objectiveGap=Math.abs(nc.objective-fc.objective),velocityError=Math.max(...nc.velocity.map((v,j)=>Math.abs(v-fc.velocity[j])));
  const limits=protocol.equivalence[accuracy];verification.push({id:p.id,scenario:p.scenario,strategy:p.strategy,h:p.h,mode:p.mode,accuracy,fista:{iterations:f.iterations,residual:f.residual,...fc},newton:{iterations:n.iterations,residual:n.residual,evaluations:n.evaluations,lineSearches:n.lineSearches,fallbacks:n.fallbacks,converged:n.converged,...nc},objectiveGap,velocityError,equivalent:objectiveGap<=limits.objectiveJ&&velocityError<=limits.velocity,pass:n.converged&&fc.pass&&nc.pass&&objectiveGap<=limits.objectiveJ&&velocityError<=limits.velocity});
 }
}
await writeFile(new URL('results/verification.json',import.meta.url),JSON.stringify({protocol,problems:problems.length,results:verification},null,2));
console.error('certificates',verification.filter(r=>r.pass).length,'/',verification.length,'Newton nonconvergence',verification.filter(r=>!r.newton.converged).length);
const runs=[],sum=a=>a.reduce((s,v)=>s+v,0),quantile=(a,p)=>a[Math.min(a.length-1,Math.ceil(a.length*p)-1)];
// Both orders use exactly the same physical problems and captured warm seeds.
// Rotating/reversing problem order exercises changing active sets without
// granting either method a cross-problem warm start or a hidden cached solution.
for(const [accuracy,tolerance] of Object.entries(protocol.tolerances))for(const unit of ['full-contact','prepared-optimizer'])for(let repeat=0;repeat<protocol.repeats;repeat++){
 let order=problems.map((_,i)=>(i+repeat*17)%problems.length);if(repeat%2)order.reverse();
 for(const solver of repeat%2?['newton','fista']:['fista','newton']){
  const times=[],byScenario={},iterations=[],startCpu=cpuUsage(),startWall=performance.now();let failures=0;
  for(let pass=0;pass<protocol.passesPerBatch;pass++)for(const i of order){
   const p=problems[i],before=performance.now();let r;
   if(unit==='full-contact'){
    if(solver==='fista')r=solveContacts(p.inverse,p.free,p.rows,p.groups,p.h,{initial:p.warm,tolerance,maxIterations:20000});
    else{const a=prepare(p);r=solveNewton(a.d,a.rhs,a.L,p.groups,{initial:p.warm,tolerance});r.velocity=reconstruct(p,r.z);}
   }else{
    const a=prepared[i];if(solver==='newton')r=solveNewton(a.d,a.rhs,a.L,p.groups,{initial:p.warm,tolerance});
    else r=contactIterates(a.d,a.rhs,a.L,p.groups,project(p.warm,p.groups).y,20000,tolerance,null,Array(p.rows.length).fill(0));
   }
   const ms=performance.now()-before;times.push(ms);(byScenario[p.scenario]??=[]).push(ms);iterations.push(r.iterations);if(r.converged===false)failures++;
  }
  const cpu=cpuUsage(startCpu),wallMs=performance.now()-startWall;times.sort((a,b)=>a-b);
  runs.push({accuracy,unit,repeat,warmup:repeat<protocol.warmups,solver,solves:times.length,cpuMs:(cpu.user+cpu.system)/1000,wallMs,meanMs:sum(times)/times.length,medianMs:quantile(times,.5),p95Ms:quantile(times,.95),p99Ms:quantile(times,.99),worstMs:times.at(-1),iterations:sum(iterations),failures,byScenario:Object.fromEntries(Object.entries(byScenario).map(([k,v])=>[k,{solves:v.length,totalMs:sum(v),worstMs:Math.max(...v)}]))});
 }
 await new Promise(r=>setImmediate(r));
}
const summaries=[];
for(const accuracy of Object.keys(protocol.tolerances))for(const unit of ['full-contact','prepared-optimizer']){
 const a=runs.filter(r=>!r.warmup&&r.accuracy===accuracy&&r.unit===unit),f=a.filter(r=>r.solver==='fista'),n=a.filter(r=>r.solver==='newton');
 summaries.push({accuracy,unit,cpuSpeedup:sum(f.map(r=>r.cpuMs))/sum(n.map(r=>r.cpuMs)),fistaCpuMs:sum(f.map(r=>r.cpuMs)),newtonCpuMs:sum(n.map(r=>r.cpuMs)),fistaWorstMs:Math.max(...f.map(r=>r.worstMs)),newtonWorstMs:Math.max(...n.map(r=>r.worstMs)),newtonFailedCalls:sum(n.map(r=>r.failures)),solvesPerSolver:sum(f.map(r=>r.solves))});
}
assert.equal(JSON.stringify(problems),originalProblemBytes,'Problem mutated');
const full=summaries.filter(s=>s.unit==='full-contact'),pass=verification.every(r=>r.pass)&&full.every(s=>s.cpuSpeedup>=5&&s.newtonWorstMs<=s.fistaWorstMs&&s.newtonFailedCalls===0);
const changing=verification.filter(r=>r.accuracy==='strict').map(r=>r.fista.active.join(','));const transitions=changing.reduce((s,v,i)=>s+Number(i>0&&v!==changing[i-1]),0);
await writeFile(new URL('results/benchmark.json',import.meta.url),JSON.stringify({runtime:version,cpu:cpus()[0].model,logicalCPUs:cpus().length,protocol,notes:'CPU includes common scalar bookkeeping; per-call wall timings include allocation/GC. Pure optimizer omits reconstruction and original scalar polish; do not mix work units. No hardware GPU involved.',activeSignatures:new Set(changing).size,activeSetTransitionsInCaptureOrder:transitions,certified:verification.filter(r=>r.pass).length,totalCertificates:verification.length,summaries,decision:pass?'CONTINUE — gate met; production integration still unauthorized':'STOP — gate failed; no further rescue or production integration',runs},null,2));
console.log(JSON.stringify({summaries,certified:verification.filter(r=>r.pass).length,totalCertificates:verification.length,decision:pass?'CONTINUE':'STOP'},null,2));
