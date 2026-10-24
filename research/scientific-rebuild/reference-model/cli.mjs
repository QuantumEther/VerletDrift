import {readFileSync,writeFileSync} from 'node:fs';import {gzipSync,gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {performance} from 'node:perf_hooks';
import {parameters as p,units} from './parameters.mjs';import {derivative,energy,checkDomain} from './model.mjs';import {cases,allowances} from './cases.mjs';import {simulate,step} from './integrate.mjs';
const root=new URL('./results/',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,root))),write=(n,o)=>writeFileSync(new URL(n,root),JSON.stringify(o,null,2)+'\n');
const hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const provenance=()=>({branch:execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),configHash:hash(p),parameters:p,units,node:process.version});
const command=process.argv[2];
if(command==='plan'){
 const roots=read('equilibria.json');
 for(const r of Object.values(roots)){
  const z=derivative(r.state,p,{gamma:r.gamma,Md:r.Md});
  if(Math.max(...z.dx.map((v,i)=>Math.abs(v)/allowances[i]))>1e-3)throw new Error('Equilibrium cross-transcription gate failed');
 }
 write('plan.json',{provenance:provenance(),cases:cases(roots)});
}else if(command==='validate'){
 const plan=read('plan.json'),ref=JSON.parse(gunzipSync(readFileSync(new URL('references.json.gz',root))));
 if(ref.cases.length!==plan.cases.length||ref.cases.some(c=>c.status!=='PASS'))throw new Error('Stop: independent reference has not passed its own gate');
 const runs=[],traces=[],samples=[];
 for(const spec of plan.cases){
  const reference=ref.cases.find(c=>c.id===spec.id);let previousError=null;
  for(const hz of [100,200,400,800]){
   const r=simulate(spec,1/hz);if(r.status!=='PASS'){runs.push({...r,rows:undefined,hz});continue;}
   const max=Array(5).fill(0),E0=energy(spec.x);let ledger=0,workError=0,identityMax=0,forcePowerMax=-Infinity;const diagnosticCounts={rhs:0,tires:0};
   r.rows.forEach((row,j)=>{const b=reference.rows[j*800/hz];const diag=derivative(row.slice(1,6),p,spec.u,diagnosticCounts).diagnostics;identityMax=Math.max(identityMax,Math.abs(diag.identityResidual));forcePowerMax=Math.max(forcePowerMax,...diag.force);if(j%Math.round(hz/20)===0||j===r.rows.length-1)samples.push({id:spec.id,hz,time:row[0],state:row.slice(1,6),...diag});for(let i=0;i<5;i++)max[i]=Math.max(max[i],Math.abs(row[i+1]-b[i+1]));
    ledger=Math.max(ledger,Math.abs(energy(row.slice(1,6))-E0-row.slice(6).reduce((a,b)=>a+b,0)));
    workError=Math.max(workError,Math.abs(row.slice(6).reduce((a,b)=>a+b,0)-b.slice(6).reduce((a,b)=>a+b,0)));
   });
   const error=Math.max(...max.map((v,i)=>v/allowances[i]));
   runs.push({...r,rows:undefined,hz,stateErrorMax:max,normalizedError:error,diagnosticCounts,identityMax,forcePowerMax,workReferenceErrorMaxJ:workError,energyResidualMaxJ:ledger,numericalStatus:error<=1&&ledger<=.001?'PASS':'FAIL',observedOrder:previousError===null||error===0?null:Math.log2(previousError/error)});previousError=error;
   traces.push({id:spec.id,hz,rows:r.rows});
  }
 }
 write('validation.json',{provenance:provenance(),columns:['time_s','v_m_per_s','sigma_m_per_s','omega_rad_per_s','Omega_r_rad_per_s','Omega_f_rad_per_s','drive_J','rear_force_J','front_force_J','rear_moment_J','front_moment_J'],runs});
 writeFileSync(new URL('rk4-traces.json.gz',root),gzipSync(JSON.stringify(traces)));
 writeFileSync(new URL('diagnostic-samples.json.gz',root),gzipSync(JSON.stringify(samples)));
 if(runs.some(r=>r.status!=='PASS'||(r.hz===800&&r.numericalStatus!=='PASS')))process.exitCode=1;
 console.log('runs',runs.length,'numerical failures',runs.filter(r=>r.numericalStatus==='FAIL').length,'domain exits',runs.filter(r=>r.status!=='PASS').length);
}else if(command==='counterexample'){
 const x=[8.5723209223564647401,.455,.3,28.574403074521549134,28.685010796556446357],u={gamma:Math.PI/36,Md:0},z=derivative(x,p,u);
 write('counterexample.json',{provenance:provenance(),state:x,inputs:u,...z,reproduction:Math.abs(z.diagnostics.contact-.230852970243096)<1e-11?'PASS':'FAIL',globalContactPassivity:'FAIL (known source limitation)'});
 console.log(z.diagnostics);
}else throw new Error('Commands: plan | counterexample | validate');
