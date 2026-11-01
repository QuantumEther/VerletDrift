// Paired production benchmarks. No profiling microtimers in throughput runs.
import {cpuUsage,version,memoryUsage} from 'node:process';
import {cpus,platform,arch} from 'node:os';
import {PerformanceObserver} from 'node:perf_hooks';
import {fixture} from './tire-ab-fixtures.mjs';
import {cloneMechanical,stepTerrainVehicle} from '../src/vehicle.js';
const runs=[],gc=[],templates=new Map();
const observer=new PerformanceObserver(list=>{for(const e of list.getEntries())gc.push({startTime:e.startTime,duration:e.duration,kind:e.detail.kind});});observer.observe({entryTypes:['gc']});
const duration=+(process.env.DURATION||.3),repeats=+(process.env.REPEATS||5);
const ids=['reference','speed-normalized-anisotropic'];
const blocks=process.env.PAIRED_AB==='1'?Array.from({length:repeats},(_,repeat)=>(repeat%2?[...ids].reverse():ids).map(id=>({id,repeat}))).flat():ids.flatMap(id=>Array.from({length:repeats},(_,repeat)=>({id,repeat})));
const cases=(process.env.CASES||'acceleration,braking,steering,combined,recovery,drift-recovery,recontact').split(',');
for(const floor of (process.env.FLOORS||'.5').split(',').map(Number))for(const scenario of cases)for(const h of (process.env.STEPS||'.001,.002,.004').split(',').map(Number))for(const {id,repeat} of blocks)for(const kernel of (repeat%2?(process.env.KERNELS||'dense,isolated').split(',').reverse():(process.env.KERNELS||'dense,isolated').split(','))){
 const key=id+':'+scenario+':'+floor;
 if(!templates.has(key))templates.set(key,fixture(id,floor,scenario,duration));
 const template=templates.get(key),inputs=template.inputs,v={...template.v,state:cloneMechanical(template.v.state),contacts:structuredClone(template.v.contacts)};v.contactKernel=kernel==='cache'?'dense':kernel==='interior'?'isolated':kernel;v.disableOperatorCache=['dense','interior'].includes(kernel);
 const times=[];let outer=0,inner=0,substeps=0,energy=0,constitutive=0,fault=null;
 const mem0=memoryUsage().heapUsed,cpu0=cpuUsage(),wall0=performance.now();
 for(let i=0;i<Math.round(duration/h);i++){
  const t=performance.now();try{stepTerrainVehicle(v,inputs(i*h),h);}catch(e){fault={step:i,message:e.message};break;}
  times.push(performance.now()-t);outer+=v.state.terrainLedger.iterations;inner+=v.state.terrainLedger.contactIterations;substeps+=v.integration.substeps;energy=Math.max(energy,Math.abs(v.state.terrainLedger.residual));constitutive=Math.max(constitutive,v.state.planar.contact.constitutiveImpulseResidual);
 }
 const cpu=cpuUsage(cpu0),wallMs=performance.now()-wall0,heapDelta=memoryUsage().heapUsed-mem0;times.sort((a,b)=>a-b);const q=p=>times[Math.min(times.length-1,Math.ceil(times.length*p)-1)];
 await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));const events=gc.splice(0).filter(e=>e.startTime>=wall0&&e.startTime<wall0+wallMs);
 runs.push({scenario,h,floor,id,repeat,warmup:repeat===0,kernel,simulated:v.state.time,cpuMs:(cpu.user+cpu.system)/1000,wallMs,cpuMsPerSimSecond:(cpu.user+cpu.system)/1000/v.state.time,medianMs:q(.5),p95Ms:q(.95),p99Ms:q(.99),worstMs:times.at(-1),accepted:times.length,outer,inner,substeps,energy,constitutive,heapDelta,gc:events,fault});
 console.error(scenario,h,id,repeat,kernel,fault?.message||'pass');
}
observer.disconnect();console.log(JSON.stringify({runtime:version,cpu:cpus()[0].model,logicalCPUs:cpus().length,platform:platform(),arch:arch(),protocol:{duration,repeats,warmups:1,order:'alternating supplied kernel order / reverse; dense=uncached original, cache=cached original, interior=uncached shortcut, isolated=cached shortcut',floors:(process.env.FLOORS||'.5').split(',').map(Number),gcDrainTurns:2,initialization:'one validated fixture per scenario and strategy; privately clone identical start outside timers',gc:'asynchronously delivered Node GC events include initialization; heap delta includes uncollected garbage, not an allocation counter'},runs}));
