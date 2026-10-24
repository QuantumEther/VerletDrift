import {derivative,checkDomain,ExperimentError,energy} from './model.mjs';import {parameters} from './parameters.mjs';
// Explicit four stages; no hidden substeps. Five signed work ports use same stages.
export function step(x,h,u,p=parameters,counter={},ledger=true){
 if(!(h>0)||!Number.isFinite(h))throw new RangeError('Positive finite timestep required');
 counter.attempted=(counter.attempted||0)+1;
 let stage='initial',stageTime=0;
 try{
  stage='k1';const a=derivative(x,p,u,counter,undefined,ledger);stage='k2';stageTime=h/2;const b=derivative(x.map((v,i)=>v+h*a.dx[i]/2),p,u,counter,undefined,ledger);
  stage='k3';const c=derivative(x.map((v,i)=>v+h*b.dx[i]/2),p,u,counter,undefined,ledger);
  stage='k4';stageTime=h;const d=derivative(x.map((v,i)=>v+h*c.dx[i]),p,u,counter,undefined,ledger);
  const next=x.map((v,i)=>v+h*(a.dx[i]+2*b.dx[i]+2*c.dx[i]+d.dx[i])/6);
  stage='endpoint';checkDomain(next,u,p); // kinematics/slip validation: no extra constitutive evaluations
  if(!ledger){counter.completed=(counter.completed||0)+1;return {status:'PASS',state:next};}
  const ports=z=>[z.drive,...z.force,...z.moment];
  const samples=[a,b,c,d].map(z=>ports(z.diagnostics));
  const work=samples[0].map((_,i)=>h*(samples[0][i]+2*samples[1][i]+2*samples[2][i]+samples[3][i])/6);
  const positiveContactWork=h*[a,b,c,d].reduce((z,k,i)=>z+[1,2,2,1][i]*Math.max(0,k.diagnostics.contact),0)/6;
  const negativeContactWork=h*[a,b,c,d].reduce((z,k,i)=>z+[1,2,2,1][i]*Math.min(0,k.diagnostics.contact),0)/6;
  counter.completed=(counter.completed||0)+1;
  return {status:'PASS',state:next,work,positiveContactWork,negativeContactWork,branches:[a,b,c,d].map(k=>[k.diagnostics.contacts.rear.branch,k.diagnostics.contacts.front.branch])};
 }catch(e){if(!(e instanceof ExperimentError))throw e;counter.rejected=(counter.rejected||0)+1;return {status:e.status,state:[...x],stage,stageTime,violations:e.violations};}
}
// Compensated summation per signed port; never infer work from energy difference.
export function simulate(spec,h,p=parameters){
 const count={rhs:0,tires:0,attempted:0,completed:0,rejected:0};let x=[...spec.x],positive=0,negative=0;
 const E0=energy(x,p),work=Array(5).fill(0),comp=Array(5).fill(0),rows=[[0,...x,...work]],branches={};let crossings=0,last=null;
 const n=Math.round(spec.duration/h);if(Math.abs(n*h-spec.duration)>1e-12)throw new Error('Horizon must align with fixed steps');
 for(let i=0;i<n;i++){
  const result=step(x,h,spec.u,p,count);
  if(result.status!=='PASS')return {id:spec.id,h,status:result.status,lastAccepted:{time:i*h,state:x},attemptedStep:i,...result,count,rows};
  x=result.state;positive+=result.positiveContactWork;negative+=result.negativeContactWork;
  result.work.forEach((v,j)=>{const y=v-comp[j],t=work[j]+y;comp[j]=(t-work[j])-y;work[j]=t;});
  for(const b of result.branches){const key=b.join('/');branches[key]=(branches[key]||0)+1;if(last!==null&&last!==key)crossings++;last=key;}
  rows.push([(i+1)*h,...x,...work]);
 }
 return {id:spec.id,h,status:'PASS',count,rows,branches,crossings,positiveContactWork:positive,negativeContactWork:negative,work,energyResidual:energy(x,p)-E0-work.reduce((a,b)=>a+b,0)};
}
