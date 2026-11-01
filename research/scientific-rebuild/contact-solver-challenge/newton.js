// Isolated semismooth Newton experiment for min .5 z'Dz - rhs'z over a
// product of scalar intervals/fixed values and Euclidean friction discs.
// No production imports, altered objective, penalty contact or FISTA fallback.
export function project(x,groups,derivative=false){
 const y=[...x],P=derivative?Array.from({length:x.length},()=>Array(x.length).fill(0)):null;
 for(const g of groups){
  const i=g.indices[0];
  if(g.fixed!==undefined){y[i]=g.fixed;continue;}
  if(g.indices.length===1){const lo=g.lower??-g.limit,hi=g.upper??g.limit;y[i]=Math.max(lo,Math.min(hi,x[i]));if(P&&x[i]>lo&&x[i]<hi)P[i][i]=1;continue;}
  if(g.indices.length!==2)throw Error('Only scalar constraints and two-dimensional friction discs supported');
  const j=g.indices[1],a=x[i],b=x[j],r=Math.hypot(a,b),R=g.limit;
  if(R===0){y[i]=y[j]=0;continue;}
  if(r<=R){if(P)P[i][i]=P[j][j]=1;continue;}
  const scale=R/r,u=a/r,v=b/r;y[i]=scale*a;y[j]=scale*b;
  if(P){P[i][i]=scale*(1-u*u);P[j][j]=scale*(1-v*v);P[i][j]=P[j][i]=-scale*u*v;}
 }
 return {y,P};
}
export function residualSystem(d,rhs,L,groups,z,jacobian=true){
 const n=z.length,u=Array(n),gradient=Array(n);
 for(let i=0;i<n;i++){let sum=0;for(let j=0;j<n;j++)sum+=d[i][j]*z[j];gradient[i]=sum-rhs[i];u[i]=z[i]-gradient[i]/L;}
 const {y,P}=project(u,groups,jacobian),F=z.map((v,i)=>v-y[i]);let J=null;
 if(jacobian){
  J=Array.from({length:n},()=>Array(n).fill(0));
  // Product constraints give at most two nonzero projection derivatives per
  // row. Exploit that exact block structure rather than dense cubic P*D.
  for(let i=0;i<n;i++){const support=[];for(let k=0;k<n;k++)if(P[i][k]!==0)support.push(k);
   for(let j=0;j<n;j++){let sum=0;for(const k of support)sum+=P[i][k]*d[k][j];J[i][j]=(i===j?1:0)-P[i][j]+sum/L;}
  }
 }
 return {F,J,projected:y,residual:Math.max(0,...F.map(Math.abs)),merit:F.reduce((s,v)=>s+v*v,0)/2};
}
function linearSolve(J,b){
 const n=b.length,a=J.map((row,i)=>[...row,b[i]]);
 // Search-direction regularization only. The objective and termination
 // certificate remain the original unregularized problem; no model penalty.
 for(let i=0;i<n;i++)a[i][i]+=1e-12;
 for(let k=0;k<n;k++){
  let p=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[p][k]))p=i;
  if(!(Math.abs(a[p][k])>1e-15))return null;
  [a[k],a[p]]=[a[p],a[k]];
  for(let i=k+1;i<n;i++){const f=a[i][k]/a[k][k];for(let j=k+1;j<=n;j++)a[i][j]-=f*a[k][j];a[i][k]=0;}
 }
 const x=Array(n);for(let i=n-1;i>=0;i--){let s=a[i][n];for(let j=i+1;j<n;j++)s-=a[i][j]*x[j];x[i]=s/a[i][i];}return x.every(Number.isFinite)?x:null;
}
export function solveNewton(d,rhs,L,groups,{initial,tolerance=1e-12,maxIterations=40}={}){
 let z=project(initial?.length===rhs.length?initial:Array(rhs.length).fill(0),groups).y,evaluations=0,lineSearches=0,fallbacks=0;
 for(let iterations=0;iterations<maxIterations;iterations++){
  const s=residualSystem(d,rhs,L,groups,z);evaluations++;
  if(s.residual<tolerance)return {z,iterations,residual:s.residual,evaluations,lineSearches,fallbacks,converged:true};
  const direction=linearSolve(s.J,s.F.map(v=>-v));let accepted=false;
  if(direction)for(let k=0;k<12;k++){
   const alpha=2**-k,trial=project(z.map((v,i)=>v+alpha*direction[i]),groups).y,t=residualSystem(d,rhs,L,groups,trial,false);evaluations++;lineSearches++;
   if(t.merit<=(1-1e-4*alpha)*s.merit){z=trial;accepted=true;break;}
  }
  if(!accepted){z=s.projected;fallbacks++;} // one bounded globalization step, no acceleration
 }
 const s=residualSystem(d,rhs,L,groups,z,false);evaluations++;
 return {z,iterations:maxIterations,residual:s.residual,evaluations,lineSearches,fallbacks,converged:s.residual<tolerance};
}
