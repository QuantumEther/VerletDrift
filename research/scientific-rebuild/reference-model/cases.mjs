export const allowances=[1e-4,1e-4,1e-6,1e-3,1e-3];
export function cases(roots){
 const out=[];
 for(const name of ['cornering','drifting']){
  const r=roots[name],u={gamma:r.gamma,Md:r.Md};out.push({id:`${name}-equilibrium`,family:name,x:r.state,u,duration:name==='cornering'?5:1});
  for(let i=0;i<5;i++)for(const sign of [-1,1]){
   const x=[...r.state];x[i]+=sign*[.01,.01,.001,.01,.01][i];
   out.push({id:`${name}-perturb-${i}-${sign<0?'minus':'plus'}`,family:name,x,u,duration:name==='cornering'?2:.25});
  }
 }
 return out;
}
