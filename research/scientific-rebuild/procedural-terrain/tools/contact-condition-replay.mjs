import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';
import {solveContacts} from '../src/contact-solver.js';
const data=JSON.parse(gunzipSync(await readFile(new URL('../results/contact-optimization/baseline-profile.json.gz',import.meta.url)))),cases=[];
for(const run of data.runs.filter(r=>r.id==='speed-normalized-anisotropic'&&r.scenario==='recovery')){
 let previous=null;
 for(const trace of run.traces){
  for(const variant of ['original','isotropic-compliance','zero-seed',...(trace.mode===1&&previous?['preceding-mode-seed']:[])]){
   const rows=structuredClone(trace.rows),groups=structuredClone(trace.groups);
   if(variant==='isotropic-compliance')for(let i=0;i<8;i++)rows[i].compliance=1/(trace.h*800);
   let diagnostics;const initial=variant==='zero-seed'?undefined:variant==='preceding-mode-seed'?previous.z:trace.warm;
   const result=solveContacts(trace.inverse,trace.free,rows,groups,trace.h,{initial,maxIterations:20000,tolerance:1e-12,capture:d=>diagnostics=d});
   cases.push({floor:run.floor,h:run.h,mode:trace.mode,variant,iterations:result.iterations,residual:result.residual,L:result.lipschitzBound,history:diagnostics.history,z:result.z,velocity:result.velocity});
  }
  previous=trace;
 }
}
console.log(JSON.stringify({method:'Isolated replay of captured production problems: identical inverse inertia, free velocity and constraint bounds. One controlled change per case. Not new vehicle advancement.',runtime:process.version,cases}));
