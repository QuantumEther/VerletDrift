import {gaussian} from './clutch.js';
// Convex backward-Euler contact solve. Dual variables are opposing impulses.
// Tire potential: viscous traction near zero slip, isotropic Coulomb saturation.
export function solveContacts(inverse,free,rows,groups,h,{maxIterations=2000,tolerance=1e-10,initial}={}){
 const n=rows.length,d=rows.map(a=>rows.map(b=>a.j.reduce((s,v,i)=>s+v*inverse[i].reduce((q,m,k)=>q+m*b.j[k],0),0)));
 rows.forEach((a,i)=>d[i][i]+=a.compliance||0);
 const variables=groups.filter(g=>g.fixed===undefined&&g.limit>0).flatMap(g=>g.indices);
 const rhs=rows.map(a=>a.j.reduce((s,v,i)=>s+v*free[i],0)),L=variables.length?Math.max(...variables.map(i=>variables.reduce((s,j)=>s+Math.abs(d[i][j]),0))):1;
 if(!(L>0&&Number.isFinite(L)))throw Error('Invalid contact Hessian');
 const project=x=>{for(const g of groups){if(g.fixed!==undefined){x[g.indices[0]]=g.fixed;continue;}const norm=Math.hypot(...g.indices.map(i=>x[i]));if(norm>g.limit)for(const i of g.indices)x[i]*=g.limit/norm;}return x;};
 let z=project(initial?.length===n?[...initial]:Array(n).fill(0)),y=[...z],t=1,residual=Infinity,iterations=0;
 for(;iterations<maxIterations;iterations++){
  const next=project(y.map((v,i)=>v+(rhs[i]-d[i].reduce((s,a,j)=>s+a*y[j],0))/L));
  // Projected-gradient KKT residual, in impulse units (not iterate motion).
  const check=project(next.map((v,i)=>v+(rhs[i]-d[i].reduce((s,a,j)=>s+a*next[j],0))/L));
  residual=Math.max(...check.map((v,i)=>Math.abs(v-next[i])));
  if(residual<tolerance){z=next;iterations++;break;}
  const nt=(1+Math.sqrt(1+4*t*t))/2;y=next.map((v,i)=>v+(t-1)/nt*(v-z[i]));z=next;t=nt;
 }
 if(residual>=tolerance)throw Object.assign(Error(`Contact solve did not converge: h=${h}, iterations=${iterations}, residual=${residual}`),{iterations,residual});
 // Resolve interior scalar friction constraints with a small linear KKT
 // polish. Corrections are reaction impulses, not assigned wheel velocities.
 const active=[];
 for(const group of groups)if(group.indices.length===1&&group.fixed===undefined&&group.limit>0&&Math.abs(z[group.indices[0]])<group.limit-1e-9){
  const candidate=[...active,group.indices[0]];
  try{gaussian(candidate.map(i=>candidate.map(j=>d[i][j])),candidate.map(()=>0));active.push(group.indices[0]);}catch{/* redundant locked-differential constraint */}
 }
 if(active.length){const correction=gaussian(active.map(i=>active.map(j=>d[i][j])),active.map(i=>rhs[i]-d[i].reduce((s,a,j)=>s+a*z[j],0)));for(let k=0;k<active.length;k++)z[active[k]]+=correction[k];}
 const polishedCheck=project(z.map((v,i)=>v+(rhs[i]-d[i].reduce((s,a,j)=>s+a*z[j],0))/L));
 const postResidual=Math.max(...polishedCheck.map((v,i)=>Math.abs(v-z[i])));
 const impulse=Array(free.length).fill(0);rows.forEach((r,k)=>r.j.forEach((v,i)=>impulse[i]-=v*z[k]));
 const velocity=free.map((v,i)=>v+inverse[i].reduce((s,a,j)=>s+a*impulse[j],0));
 return {z,velocity,iterations,residual:postResidual,prePolishResidual:residual,lipschitzBound:L};
}
export function tireForce(sx,sy,normal,mu=.9,stiffness=800){const limit=mu*Math.max(0,normal),speed=Math.hypot(sx,sy),scale=speed?Math.min(stiffness,limit/speed):0;return {fx:-scale*sx,fy:-scale*sy,dissipation:scale*speed*speed};}
