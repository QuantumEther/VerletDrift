import {readFileSync,writeFileSync} from 'node:fs';import {performance} from 'node:perf_hooks';import {cpus,platform,release} from 'node:os';import {execFileSync} from 'node:child_process';import {parameters as p} from './parameters.mjs';import {tire} from './tire.mjs';import {derivative} from './model.mjs';import {step} from './integrate.mjs';
const roots=JSON.parse(readFileSync(new URL('./results/equilibria.json',import.meta.url))),validation=JSON.parse(readFileSync(new URL('./results/validation.json',import.meta.url)));
if(validation.runs.some(r=>r.status!=='PASS'||(r.hz===800&&r.numericalStatus!=='PASS')))throw new Error('Stop: validated finest-rate trajectories required before benchmark');
const dist=a=>{a.sort((a,b)=>a-b);const q=p=>a[Math.ceil(a.length*p)-1];return {samples:a.length,mean:a.reduce((a,b)=>a+b,0)/a.length,median:q(.5),p95:q(.95),p99:q(.99),worst:q(1)};};
const output={provenance:{commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,v8:process.versions.v8,cpu:cpus()[0].model,cores:cpus().length,OS:`${platform()} ${release()}`,precision:'IEEE binary64',flags:process.execArgv,powerMode:'not controlled/unknown cloud host'},method:'5 serial repetitions of 10000 samples per category; 10000 RHS warmup per family; 800 Hz RK segments reset to refined equilibrium every 80 steps (0.1s), resets outside sample; no event loop/app/renderer. Timers not subtracted.',results:[]};
let sink=0;
for(const [family,r]of Object.entries(roots)){
 const u={gamma:r.gamma,Md:r.Md};for(let i=0;i<10000;i++)derivative(r.state,p,u);
 const full=step(r.state,1/800,u);let x=[...r.state],operations={};
 const jobs={timer:()=>{sink++;},tire:()=>{sink+=tire(14,-.3,50,5000,p,operations).Fx;},rhsMechanics:()=>{sink+=derivative(r.state,p,u,operations,undefined,false).dx[0];},rhsDiagnostics:()=>{sink+=derivative(r.state,p,u,operations).diagnostics.energy;},rkMechanics:()=>{const z=step(x,1/800,u,p,operations,false);if(z.status!=='PASS')throw new Error('Invalid benchmark segment');x=z.state;sink+=x[0];},rkLedger:()=>{const z=step(x,1/800,u,p,operations);if(z.status!=='PASS')throw new Error('Invalid benchmark segment');x=z.state;sink+=x[0];},reportSerialization:()=>{sink+=JSON.stringify(full).length;}};
 for(const [category,job]of Object.entries(jobs)){
  operations={};const samples=[],repetitions=[];let heapPeak=process.memoryUsage().heapUsed;const heapStart=heapPeak;
  for(let repeat=0;repeat<5;repeat++){
   const own=[];
   for(let i=0;i<10000;i++){
    if(i%80===0)x=[...r.state];const start=performance.now();job();const elapsed=performance.now()-start;own.push(elapsed);samples.push(elapsed);
    if(i%1000===0)heapPeak=Math.max(heapPeak,process.memoryUsage().heapUsed);
   }
   repetitions.push(dist(own));
  }
  output.results.push({family,category,ms:dist(samples),repetitions,operationTotals:{...operations},heap:{start:heapStart,end:process.memoryUsage().heapUsed,observedPeak:heapPeak},countsPerSample:category==='tire'?{tires:1}:category.startsWith('rhs')?{rhs:1,tires:2}:category.startsWith('rk')?{rhs:4,tires:8}:null});
  console.log(family,category,output.results.at(-1).ms);
 }
}
output.sinkFinite=Number.isFinite(sink);output.allocationLimit='JS allocates state arrays/contact diagnostics per call; heap observations include sample collection/GC and are not allocation bytes per step or a leak test.';
writeFileSync(new URL('./results/benchmark.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
