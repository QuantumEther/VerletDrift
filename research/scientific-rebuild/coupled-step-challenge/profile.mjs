import {cpuUsage,version} from 'node:process';import {cpus} from 'node:os';import {writeFile} from 'node:fs/promises';
import {makeFixture} from './fixtures.mjs';import {stepTerrainVehicle} from '../procedural-terrain/src/vehicle.js';import {NUMERICAL_EXPERIMENTS} from '../procedural-terrain/src/numerical-settings.js';
const runs=[];
for(const strategy of ['reference','speed-normalized-anisotropic'])for(const scenario of ['acceleration','saturated','drift-recovery','braking','recontact','clutch-lock','stall','selector'])for(const accuracy of ['strict','balanced']){
 const {v,inputs}=makeFixture(strategy,scenario),stages={};if(accuracy==='balanced')v.numerics=NUMERICAL_EXPERIMENTS.balanced;
 v.profile=(name,ms)=>{const a=stages[name]??={count:0,ms:0};a.count++;a.ms+=ms;};
 let inner=0,outer=0,saturated=0,fault=null;const cpu0=cpuUsage(),begin=performance.now();
 for(let i=0;i<50;i++){try{stepTerrainVehicle(v,inputs(i*.001),.001);}catch(e){fault={time:v.state.time,message:e.message};break;}inner+=v.state.terrainLedger?.contactIterations||0;outer+=v.state.terrainLedger?.iterations||0;saturated+=v.state.wheels.filter(w=>w.normal>0&&w.utilization>=1-1e-6).length;}
 const cpu=cpuUsage(cpu0);runs.push({strategy,scenario,accuracy,simulated:v.state.time,cpuMs:(cpu.user+cpu.system)/1000,wallMs:performance.now()-begin,inner,outer,saturatedForceStages:saturated,stages,fault});
}
await writeFile(new URL('results/baseline-profile.json',import.meta.url),JSON.stringify({base:'8cb9413e3936e51502f6ac53d036a769ad8846e2',runtime:version,cpu:cpus()[0].model,logicalCPUs:cpus().length,note:'Coarse stage profiling of complete production steps; timers included; not the uninstrumented throughput denominator.',runs},null,2));console.log('Profiled',runs.length,'runs; saturated force stages',runs.reduce((s,r)=>s+r.saturatedForceStages,0));
