export function createFlywheel(){return {inertia:.3,omega:0,angle:0,ratio:4,ratedTorque:30,engagement:0,heat:0,state:'disengaged',torque:0,slip:0,heatingPower:0};}
export function gaussian(a,b){const m=a.map((row,i)=>[...row,b[i]]),n=b.length;for(let j=0;j<n;j++){let pivot=j;for(let i=j+1;i<n;i++)if(Math.abs(m[i][j])>Math.abs(m[pivot][j]))pivot=i;[m[j],m[pivot]]=[m[pivot],m[j]];const d=m[j][j];if(Math.abs(d)<1e-14)throw new Error('Singular clutch system');for(let k=j;k<=n;k++)m[j][k]/=d;for(let i=0;i<n;i++)if(i!==j){const f=m[i][j];for(let k=j;k<=n;k++)m[i][k]-=f*m[j][k];}}return m.map(row=>row[n]);}
export function solveCoupled(A,rhs,limits,B,wheels,p,motor,ports,h){
 if(!(p.engagement>=0&&p.engagement<=1&&Number.isFinite(p.engagement)))throw new RangeError('Clutch engagement must be in [0,1]');
 p.motorTorque=motor;
 const G=p.ratio,g=[0,0,G/2,G/2],d=B.map(row=>row.reduce((sum,b,j)=>sum+b*g[j],0));
 const compliance=1/p.inertia+g.reduce((sum,v,i)=>sum+v*d[i],0);
 const slip0=p.omega-G*(wheels[2].omega+wheels[3].omega)/2;
 const loadAcc=B.map(row=>row.reduce((sum,b,j)=>sum+b*ports[j],0));
 const slipFree=slip0+h*(motor/p.inertia-g.reduce((sum,v,i)=>sum+v*loadAcc[i],0));
 const capacity=p.engagement*p.ratedTorque;
 const candidates=capacity>0?['locked',1,-1]:[0];
 let result;
 for(const clutchMode of candidates){
  for(let code=0;code<81;code++){
   let remaining=code;const modes=wheels.map(()=>{const mode=[0,1,-1][remaining%3];remaining=Math.floor(remaining/3);return mode;});
   const m=A.map((row,i)=>[...row,-h*wheels[i].radius*d[i]]),r=[...rhs];
   modes.forEach((mode,i)=>{if(mode){m[i]=[0,0,0,0,0];m[i][i]=1;r[i]=mode*limits[i];}});
   if(clutchMode==='locked'){m.push(wheels.map((w,j)=>h*g.reduce((sum,v,i)=>sum+v*B[i][j],0)*w.radius).concat(-h*compliance));r.push(-slipFree);}
   else{m.push([0,0,0,0,1]);r.push(clutchMode*capacity);}
   const solved=gaussian(m,r),force=solved.slice(0,4),torque=solved[4];
   const acc=B.map((row,i)=>row.reduce((sum,b,j)=>sum+b*(ports[j]-wheels[j].radius*force[j]),0)+d[i]*torque);
   const engineAcc=(motor-torque)/p.inertia;
   const slipEnd=slip0+h*(engineAcc-g.reduce((sum,v,i)=>sum+v*acc[i],0));
   const heat=torque*h*(slip0+slipEnd)/2;
   const forceValid=modes.every((mode,i)=>{const residual=rhs[i]+h*wheels[i].radius*d[i]*torque-A[i].reduce((sum,v,j)=>sum+v*force[j],0);return mode===0?Math.abs(force[i])<=limits[i]+1e-8:mode*residual>=-1e-8;});
   const clutchValid=clutchMode==='locked'?Math.abs(torque)<=capacity+1e-9:clutchMode===0||clutchMode*(slip0+slipEnd)>=-1e-9;
   if(forceValid&&clutchValid&&heat>=-1e-10){result={force,acc,torque,engineAcc,slipEnd,heat:Math.max(0,heat),state:capacity===0?'disengaged':clutchMode==='locked'?'locked':'slipping'};break;}
  }
  if(result)break;
 }
 if(!result)throw new Error('Clutch/contact active set unresolved');
 p.omega+=h*result.engineAcc;p.angle+=h*p.omega;p.torque=result.torque;p.slip=result.slipEnd;p.capacity=capacity;p.state=result.state;
 // Midpoint friction work: static reactions at zero slip produce zero heat.
 p.heatingPower=result.heat/h;p.heat+=result.heat;
 p.transmissionSpeed=p.omega-p.slip;p.gearHousingTorque=(1-G)*p.torque;
 return result;
}
