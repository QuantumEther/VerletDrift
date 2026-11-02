import {baseline,BASE,cases,ports,init} from './fixtures.mjs';import {step,energy} from '../consistent-model.js';import {cpuUsage,version,memoryUsage} from 'node:process';import {cpus} from 'node:os';import {PerformanceObserver} from 'node:perf_hooks';import {setImmediate} from 'node:timers/promises';import {writeFile} from 'node:fs/promises';
const old=await baseline(),methods=['baseline','reuse','optimized'],runs=[],gcs=[],observer=new PerformanceObserver(list=>gcs.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));observer.observe({entryTypes:['gc']});
function advance(method,s,p,h){if(method==='baseline')old.step(s,p,h);else if(method==='reuse')step(s,p,h,{acceleration:'none'});else step(s,p,h);}
for(const method of methods)for(const name of cases){const s=init(name);for(let i=0;i<1000;i++)advance(method,s,ports(name,i*.001),.001);}
await setImmediate();
for(const name of cases)for(let repeat=0;repeat<5;repeat++)for(const method of methods.slice(repeat%3).concat(methods.slice(0,repeat%3))){
 const s=init(name),times=[],heapBefore=memoryUsage().heapUsed;let iterations=0,rotorSegments=0,failed=null;const wallStart=performance.now(),cpuStart=cpuUsage();
 for(let i=0;i<1000;i++){const input=ports(name,i*.001),t=performance.now();try{advance(method,s,input,.001);}catch(e){failed={step:i,message:e.message};break;}times.push(performance.now()-t);iterations+=s.consistency.iterations;rotorSegments+=s.consistency.totalRotorSegments;}
 const cpu=cpuUsage(cpuStart),wallEnd=performance.now(),heapDelta=memoryUsage().heapUsed-heapBefore;await setImmediate();
 const gcMs=gcs.reduce((a,e)=>a+Math.max(0,Math.min(wallEnd,e.start+e.duration)-Math.max(wallStart,e.start)),0),gcCount=gcs.filter(e=>e.start>=wallStart&&e.start<wallEnd).length;
 const sorted=times.slice().sort((a,b)=>a-b),q=p=>sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)],row={case:name,method,repeat,warmup:repeat===0,completed:times.length,failed,cpuMsPerSimSecond:times.length?(cpu.user+cpu.system)/times.length:null,meanMs:times.reduce((a,x)=>a+x,0)/times.length,medianMs:q(.5),p95Ms:q(.95),p99Ms:q(.99),worstMs:sorted.at(-1),iterations,rotorSegments,gcMs,gcCount,heapDelta,wallStart,wallEnd};runs.push(row);console.error('timing',name,method,repeat,row.completed,failed?.message||'PASS');
}
// GC callbacks are asynchronous: attribute only after all timing windows drain.
await setImmediate();await setImmediate();observer.disconnect();
for(const row of runs){row.gcMs=gcs.reduce((a,e)=>a+Math.max(0,Math.min(row.wallEnd,e.start+e.duration)-Math.max(row.wallStart,e.start)),0);row.gcCount=gcs.filter(e=>e.start>=row.wallStart&&e.start<row.wallEnd).length;}
const validation=[];
for(const name of cases)for(const h of [.001,.0005,.00025]){
 const states=methods.map(()=>init(name)),initial=states.map(s=>energy(s)),maxFieldDiff=Array(30).fill(0);let reuseExact=true,maxEnergy=0,maxLock=0,maxForce=0,maxFriction=0,maxContactWork=-Infinity,modesIdentical=true,failed=null;const iterations={baseline:0,reuse:0,optimized:0};
 for(let i=0;i<Math.round(1/h);i++){
  const p=ports(name,i*h);try{for(let j=0;j<3;j++)advance(methods[j],states[j],p,h);}catch(e){failed={step:i,message:e.message};break;}
  const [a,b,c]=states;for(let j=0;j<30;j++){reuseExact&&=Object.is(a.y[j],b.y[j]);maxFieldDiff[j]=Math.max(maxFieldDiff[j],Math.abs(a.y[j]-c.y[j]));}
  for(let j=0;j<3;j++)iterations[methods[j]]+=states[j].consistency.iterations;
  maxEnergy=Math.max(maxEnergy,Math.abs(energy(c)-initial[2]-c.y.slice(25).reduce((a,x)=>a+x,0)));maxForce=Math.max(maxForce,c.consistency.forceResidual);maxFriction=Math.max(maxFriction,c.consistency.frictionExcess);maxContactWork=Math.max(maxContactWork,c.consistency.contactWork);
  if(c.constraints.clutchMode==='locked')maxLock=Math.max(maxLock,Math.abs(c.y[24]-1.75*(c.y[22]+c.y[23])));
  modesIdentical&&=a.constraints.clutchMode===c.constraints.clutchMode&&JSON.stringify(a.constraints.brakeModes)===JSON.stringify(c.constraints.brakeModes);
 }
 validation.push({case:name,h,failed,reuseExact,maxFieldDiff,maxEnergyResidualJ:maxEnergy,maxLockedResidualRadS:maxLock,maxForceResidualN:maxForce,maxFrictionExcessN:maxFriction,maxContactWorkJ:maxContactWork,modesIdentical,iterations,finalStates:states.map(s=>s.y)});console.error('validation',name,h,failed?.message||'PASS');
}
await writeFile(new URL('results/benchmark.json',import.meta.url),JSON.stringify({baseline:BASE,runtime:version,cpu:cpus()[0].model,logicalCPUs:cpus().length,protocol:{duration:1,h:.001,measuredRepeats:4,discardFirstCaseRepeat:true,warmup:'one full seven-case pass per method before paired timing',order:'rotated by repetition',scope:'whole CPU step+common timer/counter collection; per-step wall just step; profiling/validation excluded; GC events asynchronous, no forced collections; heap delta is live-heap change, not allocation volume'},runs,validation},null,2));
