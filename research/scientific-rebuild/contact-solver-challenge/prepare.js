// Identical assembly order to the immutable production FISTA path. Shared
// preparation is timed equally, not credited as a Newton-only precomputation.
export function prepare(p){
 const {rows,inverse,free,groups}=p;
 const support=rows.map(r=>r.j.flatMap((v,i)=>v===0?[]:[i]));
 const mapped=rows.map((b,k)=>inverse.map(r=>{let sum=0;for(const i of support[k])sum+=r[i]*b.j[i];return sum;}));
 const d=rows.map(a=>mapped.map(b=>{let sum=0;for(let i=0;i<a.j.length;i++)if(a.j[i]!==0)sum+=a.j[i]*b[i];return sum;}));
 rows.forEach((a,i)=>d[i][i]+=a.compliance||0);
 const variables=groups.filter(g=>g.fixed===undefined&&g.limit>0).flatMap(g=>g.indices),rhs=rows.map(a=>a.j.reduce((s,v,i)=>s+v*free[i],a.bias||0));
 const L=variables.length?Math.max(...variables.map(i=>variables.reduce((s,j)=>s+Math.abs(d[i][j]),0))):1;
 return {d,rhs,L,prepared:{inverse,rows,support,mapped,d}};
}
export function reconstruct(p,z){
 const impulse=Array(p.free.length).fill(0);p.rows.forEach((r,k)=>r.j.forEach((v,i)=>impulse[i]-=v*z[k]));
 return p.free.map((v,i)=>v+p.inverse[i].reduce((s,a,j)=>s+a*impulse[j],0));
}
