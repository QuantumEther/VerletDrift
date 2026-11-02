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
function solve(L,b,x=b.slice()){const n=b.length;for(let i=0;i<n;i++){for(let j=0;j<i;j++)x[i]-=L[i][j]*x[j];x[i]/=L[i][i];}for(let i=n-1;i>=0;i--){for(let j=i+1;j<n;j++)x[i]-=L[j][i]*x[j];x[i]/=L[i][i];}return x;}
// Factors depend only on these parameters and h, never on the mechanical state.
// Cache is private; Object.is invalidation preserves signed-zero/parameter changes.
const verticalFactors=new WeakMap();
function verticalOperator(v,q,w,h){
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
// Identical velocity-based, radially limited tire law, evaluated at shared averages.
export function contactForces(corners,normal,body,rotorAverage,heading,steer,out=corners.map(()=>({})),co=Math.cos(steer),si=Math.sin(steer),c=Math.cos(heading),s=Math.sin(heading)){
 const u=c*body[0]+s*body[1],v=-s*body[0]+c*body[1];
 for(let i=0;i<corners.length;i++){const [x,y]=corners[i];
  const ca=i<2?co:1,sa=i<2?si:0,vx=u-y*body[2]+P.H*body[3],vy=v+x*body[2]+P.H*body[4];
  const sx=ca*vx+sa*vy-P.R*rotorAverage[i],sy=-sa*vx+ca*vy;
  const rawX=-P.k*sx,rawY=-P.k*sy,limit=P.mu*normal[i],scale=Math.min(1,limit/(Math.hypot(rawX,rawY)||1));
  const t=out[i];t.fx=rawX*scale;t.fy=rawY*scale;t.sx=sx;t.sy=sy;t.N=normal[i];
 }return out;
}
export function step(s,input={},h=.001,{maxIterations=MAX_ITERATIONS,acceleration='aitken'}={}){
 if(!(h>0&&h<=.004))throw Error('Declared timestep domain (0, .004] s');
 if(!Number.isInteger(maxIterations)||maxIterations<0||maxIterations>MAX_ITERATIONS)throw Error('Invalid force iteration budget');
 if(!['none','aitken'].includes(acceleration))throw Error('Invalid force acceleration mode');
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
 // Scratch lives for this call only. Published diagnostics never alias a later call.
 const rhs=Array(7),w1=Array(7),wm=Array(7),q1=Array(7),rotorInitial=y.slice(20,25),torques=Array(5),average=Array(5),normal=Array(4),body=Array(5),tires=Array.from({length:4},()=>({}));torques[4]=Te;
 const previousResidual=Array(12),currentResidual=Array(12);let relaxation=1,previousNorm=Infinity;
 for(let iteration=0;iteration<maxIterations;iteration++){
  let fx=0,fy=0,mz=0;for(let i=0;i<4;i++){const [x,z]=v.corners[i],X=F[i][0],Y=F[i][1],a=i<2?co:1,b=i<2?si:0,bx=a*X-b*Y,by=b*X+a*Y;fx+=bx;fy+=by;mz+=x*by-z*bx;}
  const r1=y[5]+h*mz/P.Iz,rm=(y[5]+r1)/2,heading=y[2]+h*rm/2,c=Math.cos(heading),sn=Math.sin(heading);
  const vx1=y[3]+h*(c*fx-sn*fy)/P.mass,vy1=y[4]+h*(sn*fx+c*fy)/P.mass;
  for(let i=0;i<7;i++)rhs[i]=op.rhs[i];rhs[1]+=h*P.H*fx;rhs[2]+=h*P.H*fy;for(let i=0;i<4;i++)rhs[3+i]+=h*N[i];
  for(let i=0;i<7;i++)w1[i]=rhs[i];solve(op.L,rhs,w1);for(let i=0;i<7;i++){wm[i]=(w1[i]+w0[i])/2;q1[i]=q0[i]+h*wm[i];}
  for(let i=0;i<4;i++)torques[i]=-P.R*F[i][0];
  const rotors=rotorFlow(rotorInitial,torques,B,C,h,params);totalRotorSegments+=rotors.segments;
  for(let i=0;i<5;i++)average[i]=rotors.integral[i]/h;for(let i=0;i<4;i++)normal[i]=normalGradient(q0[3+i],q1[3+i],v.radius,v.kt);
  body[0]=(y[3]+vx1)/2;body[1]=(y[4]+vy1)/2;body[2]=rm;body[3]=wm[1];body[4]=wm[2];contactForces(v.corners,normal,body,average,heading,steer,tires,co,si,c,sn);
  let forceResidual=0;for(let i=0;i<4;i++)forceResidual=Math.max(forceResidual,Math.abs(N[i]-normal[i]),Math.abs(F[i][0]-tires[i].fx),Math.abs(F[i][1]-tires[i].fy));
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
  if(acceleration==='aitken'){
   for(let i=0;i<4;i++){currentResidual[i]=normal[i]-N[i];currentResidual[4+2*i]=tires[i].fx-F[i][0];currentResidual[5+2*i]=tires[i].fy-F[i][1];}
   let omega=1;
   if(iteration>0&&forceResidual<=previousNorm){let dot=0,norm=0;for(let i=0;i<12;i++){const delta=currentResidual[i]-previousResidual[i];dot+=previousResidual[i]*delta;norm+=delta*delta;}const candidate=-relaxation*dot/norm;if(Number.isFinite(candidate)&&candidate>=.5&&candidate<=1.5)omega=candidate;}
   // Aitken changes only the next trial. Original residual/energy checks decide acceptance.
   for(let i=0;i<4;i++)if(N[i]+omega*currentResidual[i]<0)omega=1;
   for(let i=0;i<4;i++){F[i][0]=omega===1?tires[i].fx:F[i][0]+omega*currentResidual[4+2*i];F[i][1]=omega===1?tires[i].fy:F[i][1]+omega*currentResidual[5+2*i];N[i]=omega===1?normal[i]:N[i]+omega*currentResidual[i];}
   for(let i=0;i<12;i++)previousResidual[i]=currentResidual[i];relaxation=omega;previousNorm=forceResidual;
  }else for(let i=0;i<4;i++){F[i][0]=tires[i].fx;F[i][1]=tires[i].fy;N[i]=normal[i];}
 }
 throw Error('Shared contact stage did not converge within bounded budget');
}
