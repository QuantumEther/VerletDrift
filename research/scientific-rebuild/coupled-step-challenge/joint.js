// One block semismooth Newton method: analytic impulse columns and centered
// finite-difference columns for the eleven endpoint-geometry velocities.
// Residuals always evaluate the original nonlinear stage, never a held model.
import {residualSystem,project} from '../contact-solver-challenge/newton.js';
import {certify} from '../contact-solver-challenge/check.js';
import {velocityConverged} from '../procedural-terrain/src/numerical-settings.js';
function linearSolve(J,b){
 const n=b.length,a=J.map((row,i)=>[...row,b[i]]);for(let i=0;i<n;i++)a[i][i]+=1e-12;
 for(let k=0;k<n;k++){let p=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[p][k]))p=i;if(!(Math.abs(a[p][k])>1e-15))return null;[a[k],a[p]]=[a[p],a[k]];
  for(let i=k+1;i<n;i++){const f=a[i][k]/a[k][k];for(let j=k+1;j<=n;j++)a[i][j]-=f*a[k][j];a[i][k]=0;}}
 const x=Array(n);for(let i=n-1;i>=0;i--){let s=a[i][n];for(let j=i+1;j<n;j++)s-=a[i][j]*x[j];x[i]=s/a[i][i];}return x.every(Number.isFinite)?x:null;
}
export function solveJointMode(model,mode,numerics,seed=null){
 const initialProblem=model.problem(model.firstEnvironment,mode),zScale=Array(initialProblem.rows.length).fill(1);for(const g of initialProblem.groups)for(const i of g.indices)zScale[i]=Math.min(1,Math.max(.001,g.limit));
 const stats={iterations:0,evaluations:0,jacobianBuilds:0,lineSearches:0};
 function evaluate(x,known=null,jacobian=false){
  stats.evaluations++;const geo=x.slice(0,11),env=known?.env||model.environment(geo),p=known?.p||model.problem(env,mode),z=x.slice(11).map((v,i)=>v*zScale[i]),v=model.reconstruct(p,z),c=residualSystem(p.assembly.d,p.assembly.rhs,p.assembly.L,p.groups,z,jacobian);
  const momentum=geo.map((a,i)=>a-v[7+i]),F=[...momentum,...c.F.map((a,i)=>a/zScale[i])],merit=F.reduce((s,a)=>s+a*a,0)/2;
  const guess=[...v];geo.forEach((a,i)=>guess[7+i]=a);const dv=Math.max(...momentum.map(Math.abs));
  const stationary=c.residual<numerics.contactTolerance&&velocityConverged(guess,v,dv,numerics),certificate=stationary?certify(p,z,numerics.contactTolerance,p.assembly.L):null;
  return {x,geo,env,p,z,v,c,F,merit,momentumError:dv,certificate,converged:stationary&&certificate.pass};
 }
 function feasible(x){const raw=evaluate(x),z=project(raw.z,raw.p.groups).y,y=[...x.slice(0,11),...z.map((v,i)=>v/zScale[i])];return evaluate(y,raw);}
 const warm=seed?.z||model.initial.planar.contactImpulse?.map(a=>a*model.initialStep/model.initial.planar.contactImpulseH)||Array(zScale.length).fill(0);
 let state=feasible([...(seed?.geo||model.entry.slice(7)),...warm.map((v,i)=>v/zScale[i])]);
 for(let iteration=0;iteration<20;iteration++){
  stats.iterations=iteration;
  if(state.converged)return {...state,stats};
  const base=evaluate(state.x,state,true),size=base.F.length,J=Array.from({length:size},()=>Array(size).fill(0));stats.jacobianBuilds++;
  // Seven rotor/selector velocities have been eliminated by momentum balance.
  // Geometry depends only on indices 7..17; no nested contact solve is called.
  for(let j=0;j<11;j++){
   const delta=Math.cbrt(Number.EPSILON)*Math.max(1,Math.abs(base.x[j])),plus=[...base.x],minus=[...base.x];plus[j]+=delta;minus[j]-=delta;
   const a=evaluate(plus),b=evaluate(minus);for(let i=0;i<size;i++)J[i][j]=(a.F[i]-b.F[i])/(2*delta);
  }
  for(let j=0;j<zScale.length;j++){
   for(let i=0;i<11;i++)J[i][11+j]=base.p.assembly.prepared.mapped[j][7+i]*zScale[j];
   for(let i=0;i<zScale.length;i++)J[11+i][11+j]=base.c.J[i][j]*zScale[j]/zScale[i];
  }
  const direction=linearSolve(J,base.F.map(v=>-v));if(!direction)throw Object.assign(Error('Joint Jacobian singular'),{joint:stats});let next=null;
  for(let line=0;line<12;line++){
   stats.lineSearches++;const alpha=2**-line;
   try{const trial=feasible(base.x.map((v,i)=>v+alpha*direction[i]));if(Number.isFinite(trial.merit)&&(trial.merit<=(1-1e-4*alpha)*base.merit||trial.converged)){next=trial;break;}}catch(e){if(line===11)throw Object.assign(e,{joint:stats});}
  }
  if(!next)throw Object.assign(Error('Joint line search failed'),{joint:{...stats,momentumError:base.momentumError,contactResidual:base.c.residual}});state=next;
 }
 throw Object.assign(Error('Joint nonlinear solver did not converge'),{joint:{...stats,momentumError:state.momentumError,contactResidual:state.c.residual}});
}
