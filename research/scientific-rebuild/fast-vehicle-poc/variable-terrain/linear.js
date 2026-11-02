// Private linear midpoint suspension operator; adapted unchanged from c493e4b.
function factor(A){const n=A.length,L=Array.from({length:n},()=>Array(n).fill(0));for(let i=0;i<n;i++)for(let j=0;j<=i;j++){let x=A[i][j];for(let k=0;k<j;k++)x-=L[i][k]*L[j][k];L[i][j]=i===j?Math.sqrt(x):x/L[j][j];}return L;}
export function solve(L,b,x=b.slice()){const n=b.length;for(let i=0;i<n;i++){for(let j=0;j<i;j++)x[i]-=L[i][j]*x[j];x[i]/=L[i][i];}for(let i=n-1;i>=0;i--){for(let j=i+1;j<n;j++)x[i]-=L[j][i]*x[j];x[i]/=L[i][i];}return x;}
// Factors depend only on these parameters and h, never on the mechanical state.
// Cache is private; Object.is invalidation preserves signed-zero/parameter changes.
const verticalFactors=new WeakMap();
export function verticalOperator(v,q,w,h){
 const values=[h,v.mass,v.pitchInertia,v.rollInertia,v.wheelMass,v.ks,v.damping,...v.corners.flat()];
 let cached=verticalFactors.get(v);
 if(!cached||!values.every((x,i)=>Object.is(x,cached.values[i]))){
  const mass=[v.mass,v.pitchInertia,v.rollInertia,...Array(4).fill(v.wheelMass)],A=mass.map((m,i)=>mass.map((_,j)=>i===j?m:0));
  const rows=v.corners.map(([x,y],i)=>{const b=[1,x,y,0,0,0,0];b[i+3]=-1;return b;});
  for(const b of rows)for(let j=0;j<7;j++)for(let k=0;k<7;k++)A[j][k]+=(h*v.damping/2+h*h*v.ks/4)*b[j]*b[k];
  cached={values,mass,rows,L:factor(A)};verticalFactors.set(v,cached);
 }
 const force=[-v.mass*v.g,0,0,...Array(4).fill(-v.wheelMass*v.g)];
 for(const b of cached.rows){const compression=v.length-b.reduce((a,t,k)=>a+t*q[k],0),rate=b.reduce((a,t,k)=>a+t*w[k],0);for(let j=0;j<7;j++)force[j]+=b[j]*(v.ks*compression-(v.damping/2+h*v.ks/4)*rate);}
 return {L:cached.L,rhs:w.map((x,i)=>cached.mass[i]*x+h*force[i])};
}
