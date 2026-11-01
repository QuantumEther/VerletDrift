// Independent mechanical-form objective/gradient and normal-cone certificate.
// No solver residual or projection implementation is imported here.
export function certify(problem,z,tolerance,L){
 const {rows,inverse,free,groups}=problem,n=rows.length,m=free.length;
 const impulse=Array(m).fill(0);for(let k=0;k<n;k++)for(let i=0;i<m;i++)impulse[i]+=rows[k].j[i]*z[k];
 const reaction=inverse.map(row=>row.reduce((s,v,i)=>s+v*impulse[i],0));
 const rhs=rows.map(row=>row.j.reduce((s,v,i)=>s+v*free[i],row.bias||0));
 const gradient=rows.map((row,k)=>row.j.reduce((s,v,i)=>s+v*reaction[i],0)+(row.compliance||0)*z[k]-rhs[k]);
 let objective=impulse.reduce((s,v,i)=>s+v*reaction[i],0)/2;
 for(let k=0;k<n;k++)objective+=(rows[k].compliance||0)*z[k]*z[k]/2-rhs[k]*z[k];
 let feasibility=0,kkt=0;const active=[];const boundary=1e-12+4*tolerance;
 for(const g of groups){
  const i=g.indices[0];
  if(g.fixed!==undefined){feasibility=Math.max(feasibility,Math.abs(z[i]-g.fixed));active.push('fixed');continue;}
  if(g.indices.length===1){
   const lo=g.lower??-g.limit,hi=g.upper??g.limit;feasibility=Math.max(feasibility,lo-z[i],z[i]-hi);
   if(lo===hi){active.push('zero');continue;}
   if(z[i]<=lo+boundary){kkt=Math.max(kkt,Math.max(0,-gradient[i]));active.push('lower');}
   else if(z[i]>=hi-boundary){kkt=Math.max(kkt,Math.max(0,gradient[i]));active.push('upper');}
   else{kkt=Math.max(kkt,Math.abs(gradient[i]));active.push('free');}
  }else{
   const j=g.indices[1],norm=Math.hypot(z[i],z[j]);feasibility=Math.max(feasibility,norm-g.limit);
   if(g.limit===0){active.push('zero-disc');continue;}
   if(norm>=g.limit-boundary){
    const lambda=Math.max(0,-(gradient[i]*z[i]+gradient[j]*z[j])/(norm*norm));kkt=Math.max(kkt,Math.abs(gradient[i]+lambda*z[i]),Math.abs(gradient[j]+lambda*z[j]));active.push('saturated');
   }else{kkt=Math.max(kkt,Math.abs(gradient[i]),Math.abs(gradient[j]));active.push('adhesion');}
  }
 }
 const scale=Math.max(1,...rhs.map(Math.abs)),feasibilityLimit=1e-12,kktLimit=Math.max(64*Number.EPSILON*scale,4*L*tolerance);
 const finite=[...z,...gradient,objective,feasibility,kkt].every(Number.isFinite);
 return {objective,feasibility,kkt,feasibilityLimit,kktLimit,finite,pass:finite&&feasibility<=feasibilityLimit&&kkt<=kktLimit,active,velocity:free.map((v,i)=>v-reaction[i])};
}
