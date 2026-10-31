import {gaussian} from '../../tire-road-observatory-prototype/src/clutch.js';
export {tireForce} from '../../tire-road-observatory-prototype/src/contact-solver.js';
// The inherited convex backward-Euler algorithm, with the same FISTA/KKT
// criteria and scalar polish. Form M^-1 J^T once instead of once per row pair;
// reuse iteration buffers. No persistent workspace is shared across candidates.
export function solveContacts(inverse,free,rows,groups,h,{maxIterations=2000,tolerance=1e-10,initial}={}){
 const n=rows.length,m=free.length;
 const support=rows.map(r=>r.j.flatMap((value,i)=>value===0?[]:[i]));
 const mapped=rows.map((b,k)=>inverse.map(r=>{let sum=0;for(const i of support[k])sum+=r[i]*b.j[i];return sum;}));
 const d=rows.map((a,k)=>mapped.map(b=>{let sum=0;for(const i of support[k])sum+=a.j[i]*b[i];return sum;}));
 rows.forEach((a,i)=>d[i][i]+=a.compliance||0);
 const variables=groups.filter(g=>g.fixed===undefined&&g.limit>0).flatMap(g=>g.indices);
 const rhs=rows.map(a=>a.j.reduce((sum,value,i)=>sum+value*free[i],a.bias||0));
 const L=variables.length?Math.max(...variables.map(i=>variables.reduce((sum,j)=>sum+Math.abs(d[i][j]),0))):1;
 if(!(L>0&&Number.isFinite(L)))throw Error('Invalid contact Hessian');
 const project=x=>{
  for(const g of groups){
   const first=g.indices[0];
   if(g.fixed!==undefined){x[first]=g.fixed;continue;}
   if(g.lower!==undefined){x[first]=Math.max(g.lower,Math.min(g.upper,x[first]));continue;}
   const norm=g.indices.length===1?Math.abs(x[first]):g.indices.length===2?Math.hypot(x[first],x[g.indices[1]]):Math.hypot(...g.indices.map(i=>x[i]));
   if(norm>g.limit)for(const i of g.indices)x[i]*=g.limit/norm;
  }
  return x;
 };
 const gradientStep=(input,output)=>{
  for(let i=0;i<n;i++){let sum=0;for(let j=0;j<n;j++)sum+=d[i][j]*input[j];output[i]=input[i]+(rhs[i]-sum)/L;}
  project(output);
 };
 let z=project(initial?.length===n?[...initial]:Array(n).fill(0));
 const y=[...z],check=Array(n).fill(0);let next=Array(n).fill(0),t=1,residual=Infinity,iterations=0;
 for(;iterations<maxIterations;iterations++){
  gradientStep(y,next);gradientStep(next,check);residual=0;
  for(let i=0;i<n;i++)residual=Math.max(residual,Math.abs(check[i]-next[i]));
  if(residual<tolerance){z=next;iterations++;break;}
  const nt=(1+Math.sqrt(1+4*t*t))/2;
  for(let i=0;i<n;i++)y[i]=next[i]+(t-1)/nt*(next[i]-z[i]);
  const old=z;z=next;next=old;t=nt;
 }
 if(residual>=tolerance)throw Object.assign(Error(`Contact solve did not converge: h=${h}, iterations=${iterations}, residual=${residual}`),{iterations,residual});
 const active=[];
 for(const group of groups)if(group.indices.length===1&&group.fixed===undefined&&group.limit>0&&Math.abs(z[group.indices[0]])<group.limit-1e-9&&(group.lower===undefined||(z[group.indices[0]]>group.lower+1e-9&&z[group.indices[0]]<group.upper-1e-9))){
  const candidate=[...active,group.indices[0]];
  try{gaussian(candidate.map(i=>candidate.map(j=>d[i][j])),candidate.map(()=>0));active.push(group.indices[0]);}catch{/* inherited redundant locked differential constraint */}
 }
 if(active.length){const correction=gaussian(active.map(i=>active.map(j=>d[i][j])),active.map(i=>rhs[i]-d[i].reduce((sum,value,j)=>sum+value*z[j],0)));for(let k=0;k<active.length;k++)z[active[k]]+=correction[k];}
 gradientStep(z,check);let postResidual=0;for(let i=0;i<n;i++)postResidual=Math.max(postResidual,Math.abs(check[i]-z[i]));
 const impulse=Array(m).fill(0);rows.forEach((r,k)=>r.j.forEach((value,i)=>impulse[i]-=value*z[k]));
 const velocity=free.map((value,i)=>value+inverse[i].reduce((sum,a,j)=>sum+a*impulse[j],0));
 return {z,velocity,iterations,residual:postResidual,prePolishResidual:residual,lipschitzBound:L};
}
