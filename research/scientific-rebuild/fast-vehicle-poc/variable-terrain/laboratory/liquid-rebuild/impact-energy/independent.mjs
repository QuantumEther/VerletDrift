// Independent all-pairs double-precision transcription: no WGSL, GPU grid,
// instrumentation or recovery kernel helper. Validation only, four markers.
export function correction(p,m,rho,h=.05){
 const N=p.length/4,C=[],lambda=[];
 const W=d=>{const s=d.reduce((a,b)=>a+b*b,0);return s<h*h?315/(64*Math.PI*h**9)*(h*h-s)**3:0;};
 const grad=d=>{const s=d.reduce((a,b)=>a+b*b,0),scale=s<h*h?-945/(32*Math.PI*h**9)*(h*h-s)**2:0;return d.map(x=>m/rho*scale*x);};
 const difference=(i,j)=>[0,1,2].map(k=>p[4*i+k]-p[4*j+k]);
 for(let i=0;i<N;i++){let density=0,diagonal=1e-6;const total=[0,0,0];for(let j=0;j<N;j++){density+=m*W(difference(i,j));if(i!==j){const g=grad(difference(i,j));diagonal+=g.reduce((s,x)=>s+x*x,0);g.forEach((x,k)=>total[k]+=x);}}diagonal+=total.reduce((s,x)=>s+x*x,0);C[i]=Math.max(0,density/rho-1);lambda[i]=-C[i]/diagonal;}
 return {C,lambda,delta:Array.from({length:N},(_,i)=>{const d=[0,0,0];for(let j=0;j<N;j++)if(i!==j)grad(difference(i,j)).forEach((g,k)=>d[k]+=(lambda[i]+lambda[j])*g);return d;})};
}
