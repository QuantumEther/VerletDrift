// Same ordered arithmetic as the reference FISTA loop, isolated from matrix
// assembly, optional microtimers, capture, polish and reconstruction. Scratch
// arrays belong to one invocation. No workspace survives a failed candidate.
function project(x,groups){
 for(const g of groups){
  const first=g.indices[0];
  if(g.fixed!==undefined){x[first]=g.fixed;continue;}
  if(g.lower!==undefined){x[first]=Math.max(g.lower,Math.min(g.upper,x[first]));continue;}
  // max(|x|,|y|) <= limit/2 implies ||(x,y)|| <= limit/sqrt(2).
  // This strictly interior certificate skips hypot, not a force projection.
  // It has a large roundoff margin and changes no output arithmetic.
  if(g.indices.length===2&&Math.max(Math.abs(x[first]),Math.abs(x[g.indices[1]]))<=g.limit*.5)continue;
  const norm=g.indices.length===1?Math.abs(x[first]):g.indices.length===2?Math.hypot(x[first],x[g.indices[1]]):Math.hypot(...g.indices.map(i=>x[i]));
  if(norm>g.limit)for(const i of g.indices)x[i]*=g.limit/norm;
 }
}
function gradient(input,output,d,rhs,L){
 for(let i=0;i<d.length;i++){let sum=0;const row=d[i];for(let j=0;j<d.length;j++)sum+=row[j]*input[j];output[i]=input[i]+(rhs[i]-sum)/L;}
}
export function contactIterates(d,rhs,L,groups,z,maxIterations,tolerance,history,check){
 const n=d.length,y=[...z];let next=Array(n).fill(0),t=1,residual=Infinity,iterations=0;
 for(;iterations<maxIterations;iterations++){
  gradient(y,next,d,rhs,L);project(next,groups);gradient(next,check,d,rhs,L);project(check,groups);residual=0;
  for(let i=0;i<n;i++)residual=Math.max(residual,Math.abs(check[i]-next[i]));
  history?.push(residual);
  if(residual<tolerance){z=next;iterations++;break;}
  const nt=(1+Math.sqrt(1+4*t*t))/2;
  for(let i=0;i<n;i++)y[i]=next[i]+(t-1)/nt*(next[i]-z[i]);
  const old=z;z=next;next=old;t=nt;
 }
 return {z,residual,iterations};
}
