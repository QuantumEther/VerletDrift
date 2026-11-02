// Work-conjugate step: discrete-gradient support, midpoint body/suspension,
// exact rotor travel at one shared contact stage. Historical models are unchanged.
import {P,create,energy,evaluateVehicle} from './model.js';
import {brakeActuation} from '../tire-road-observatory-prototype/src/brakes.js';
import {engineTorques} from '../tire-road-observatory-prototype/src/engine.js';
import {rotorFlow} from './constraints.js';
export {P,create,energy};
const zeroBrakes={wheels:Array.from({length:4},()=>({serviceCapacity:0,handCapacity:0}))};
const params={Iw:P.Iw,Ie:P.Ie,G:P.gear};
const FORCE_TOLERANCE=1e-11,MAX_ITERATIONS=24;
export function normalGradient(z0,z1,radius,kt){
 const p0=radius-z0,p1=radius-z1;
 if(p0<=0&&p1<=0)return 0;
 if(p0>=0&&p1>=0)return kt*(p0+p1)/2;
 const positive=Math.max(p0,p1);return .5*kt*positive*positive/(Math.abs(p0)+Math.abs(p1));
}
function factor(A){const n=A.length,L=Array.from({length:n},()=>Array(n).fill(0));for(let i=0;i<n;i++)for(let j=0;j<=i;j++){let x=A[i][j];for(let k=0;k<j;k++)x-=L[i][k]*L[j][k];L[i][j]=i===j?Math.sqrt(x):x/L[j][j];}return L;}
function solve(L,b){const n=b.length,x=b.slice();for(let i=0;i<n;i++){for(let j=0;j<i;j++)x[i]-=L[i][j]*x[j];x[i]/=L[i][i];}for(let i=n-1;i>=0;i--){for(let j=i+1;j<n;j++)x[i]-=L[j][i]*x[j];x[i]/=L[i][i];}return x;}
function verticalOperator(v,q,w,h){
 const mass=[v.mass,v.pitchInertia,v.rollInertia,...Array(4).fill(v.wheelMass)],A=mass.map((m,i)=>mass.map((_,j)=>i===j?m:0));
 const force=[-v.mass*v.g,0,0,...Array(4).fill(-v.wheelMass*v.g)];
 for(let i=0;i<4;i++){
  const [x,y]=v.corners[i],b=[1,x,y,0,0,0,0];b[i+3]=-1;
  const compression=v.length-b.reduce((a,t,k)=>a+t*q[k],0),rate=b.reduce((a,t,k)=>a+t*w[k],0);
  for(let j=0;j<7;j++){force[j]+=b[j]*(v.ks*compression-(v.damping/2+h*v.ks/4)*rate);for(let k=0;k<7;k++)A[j][k]+=(h*v.damping/2+h*h*v.ks/4)*b[j]*b[k];}
 }
 return {L:factor(A),rhs:w.map((x,i)=>mass[i]*x+h*force[i])};
}
// Identical velocity-based, radially limited tire law, evaluated at shared averages.
export function contactForces(corners,normal,body,rotorAverage,heading,steer){
 const c=Math.cos(heading),s=Math.sin(heading),u=c*body[0]+s*body[1],v=-s*body[0]+c*body[1];
 return corners.map(([x,y],i)=>{
  const a=i<2?steer:0,ca=Math.cos(a),sa=Math.sin(a),vx=u-y*body[2]+P.H*body[3],vy=v+x*body[2]+P.H*body[4];
  const sx=ca*vx+sa*vy-P.R*rotorAverage[i],sy=-sa*vx+ca*vy;
  const rawX=-P.k*sx,rawY=-P.k*sy,limit=P.mu*normal[i],scale=Math.min(1,limit/(Math.hypot(rawX,rawY)||1));
  return {fx:rawX*scale,fy:rawY*scale,sx,sy,N:normal[i]};
 });
}
export function step(s,input={},h=.001,{maxIterations=MAX_ITERATIONS}={}){
 if(!(h>0&&h<=.004))throw Error('Declared timestep domain (0, .004] s');
 if(!Number.isInteger(maxIterations)||maxIterations<0||maxIterations>MAX_ITERATIONS)throw Error('Invalid force iteration budget');
 const engagement=input.clutch??.3;if(!Number.isFinite(engagement)||engagement<0||engagement>1)throw Error('Invalid clutch engagement');
 for(const k of ['serviceBrake','handbrake','throttle'])if(input[k]!==undefined&&(!Number.isFinite(input[k])||input[k]<0||input[k]>1))throw Error('Invalid driver request');
 const steer=input.steer??0;if(!Number.isFinite(steer))throw Error('Invalid steering input');
 const y=s.y,v=s.vertical,q0=y.slice(6,13),w0=y.slice(13,20),B=brakeActuation(input.serviceBrake,input.handbrake).wheels.map(w=>w.serviceCapacity+w.handCapacity),C=P.clutch*engagement;
 const initial=evaluateVehicle(s,y,{...input,clutch:0},zeroBrakes),tau0=[...initial.d.slice(20,24).map(x=>P.Iw*x),P.Ie*initial.d[24]];
 // Keep the previous engine's predicted-midpoint external torque sample.
 const predict=rotorFlow(y.slice(20,25),tau0,B,C,h/2,params);
 const Te=engineTorques(predict.w[4],input.throttle??0,input.ignition!==false,input.starter??false,input.ignition!==false).netTorque;
 const op=verticalOperator(v,q0,w0,h),before=energy(s),co=Math.cos(steer),si=Math.sin(steer);
 if(!Number.isFinite(before))throw Error('Nonfinite mechanical energy');
 let F=initial.tires.map(t=>[t.fx,t.fy]),N=initial.tires.map(t=>t.N),totalRotorSegments=predict.segments;
 for(let iteration=0;iteration<maxIterations;iteration++){
  let fx=0,fy=0,mz=0;for(let i=0;i<4;i++){const [x,z]=v.corners[i],X=F[i][0],Y=F[i][1],a=i<2?co:1,b=i<2?si:0,bx=a*X-b*Y,by=b*X+a*Y;fx+=bx;fy+=by;mz+=x*by-z*bx;}
  const r1=y[5]+h*mz/P.Iz,rm=(y[5]+r1)/2,heading=y[2]+h*rm/2,c=Math.cos(heading),sn=Math.sin(heading);
  const vx1=y[3]+h*(c*fx-sn*fy)/P.mass,vy1=y[4]+h*(sn*fx+c*fy)/P.mass;
  const rhs=op.rhs.slice();rhs[1]+=h*P.H*fx;rhs[2]+=h*P.H*fy;for(let i=0;i<4;i++)rhs[3+i]+=h*N[i];
  const w1=solve(op.L,rhs),wm=w1.map((x,i)=>(x+w0[i])/2),q1=q0.map((x,i)=>x+h*wm[i]);
  const rotors=rotorFlow(y.slice(20,25),[...F.map(t=>-P.R*t[0]),Te],B,C,h,params);totalRotorSegments+=rotors.segments;
  const average=rotors.integral.map(x=>x/h),normal=q1.slice(3).map((z,i)=>normalGradient(q0[3+i],z,v.radius,v.kt));
  const tires=contactForces(v.corners,normal,[(y[3]+vx1)/2,(y[4]+vy1)/2,rm,wm[1],wm[2]],average,heading,steer);
  const forceResidual=Math.max(...N.map((x,i)=>Math.abs(x-normal[i])),...F.flatMap((f,i)=>[Math.abs(f[0]-tires[i].fx),Math.abs(f[1]-tires[i].fy)]));
  if(!Number.isFinite(forceResidual))throw Error('Invalid shared contact stage');
  if(forceResidual<=FORCE_TOLERANCE){
   const next=y.slice();next[0]+=h*(y[3]+vx1)/2;next[1]+=h*(y[4]+vy1)/2;next[2]+=h*rm;next[3]=vx1;next[4]=vy1;next[5]=r1;next.splice(6,7,...q1);next.splice(13,7,...w1);next.splice(20,5,...rotors.w);
   let contactWork=0,damping=0,velocityScale=0,frictionExcess=0;
   for(let i=0;i<4;i++){contactWork+=h*(F[i][0]*tires[i].sx+F[i][1]*tires[i].sy);const [x,z]=v.corners[i],rate=wm[0]+x*wm[1]+z*wm[2]-wm[3+i];damping+=h*v.damping*rate*rate;velocityScale+=Math.abs(tires[i].sx)+Math.abs(tires[i].sy);frictionExcess=Math.max(frictionExcess,Math.hypot(...F[i])-P.mu*normal[i]);}
   const work=[Te*rotors.integral[4],contactWork,-rotors.brakeHeat,-rotors.clutchHeat,-damping];for(let i=0;i<5;i++)next[25+i]+=work[i];
   const after=energy(s,next),residual=after-before-work.reduce((a,x)=>a+x,0)-rotors.roundingEnergy;
   const tolerance=1024*Number.EPSILON*(1+Math.abs(before)+Math.abs(after)+work.reduce((a,x)=>a+Math.abs(x),0))+forceResidual*q1.slice(3).reduce((a,x,i)=>a+Math.abs(x-q0[3+i]),0);
   if(!next.every(Number.isFinite)||!Number.isFinite(after)||!Number.isFinite(residual)||!Number.isFinite(tolerance)||Math.abs(residual)>tolerance||contactWork>h*forceResidual*velocityScale+128*Number.EPSILON*(1+Math.abs(contactWork))||frictionExcess>2*FORCE_TOLERANCE)throw Object.assign(Error('Consistent step work/friction check failed'),{residual,tolerance,contactWork,frictionExcess});
   // No state, diagnostics or time publication before every guard passes.
   s.y=next;s.time+=h;s.constraints=rotors;s.consistency={iterations:iteration+1,totalRotorSegments,forceResidual,workResidual:residual,tolerance,contactWork,frictionExcess,normal,forces:F,rotorAverage:average,bodyAverage:[(y[3]+vx1)/2,(y[4]+vy1)/2,rm,...wm],heading,engineTorque:Te,predictorSegments:predict.segments};return;
  }
  F=tires.map(t=>[t.fx,t.fy]);N=normal;
 }
 throw Error('Shared contact stage did not converge within bounded budget');
}
