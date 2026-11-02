// Isolated constitutive experiment. Step skeleton adapted from 71cfb6c; historical source unchanged.
// Work-conjugate step: discrete-gradient support, midpoint body/suspension,
// exact rotor travel at one shared contact stage. Historical models are unchanged.
import {P,create as createBase,energy as bodyEnergy,evaluateVehicle} from '../model.js';
import {POLICY,bristleFlow} from './bristle.js';
import {brakeActuation} from '../../tire-road-observatory-prototype/src/brakes.js';
import {engineTorques} from '../../tire-road-observatory-prototype/src/engine.js';
import {rotorFlow} from '../constraints.js';
export {P,POLICY};
// Orthonormal constant-plane chart: x uphill, y cross-slope, z plane-normal.
// This does not implement spatially changing terrain normals.
export function create(options={}){
 const {angle=0,mu=P.mu,equilibrium=false}=options;
 if(!Number.isFinite(angle)||Math.abs(angle)>.2||!Number.isFinite(mu)||mu<0)throw Error('Invalid fixed-plane configuration');
 const s=createBase({...options,...(equilibrium?{speed:0,lateral:0,yaw:0,engine:0}:{})}),v=s.vertical;
 s.plane=Object.freeze({angle,gx:-9.81*Math.sin(angle),gy:0});v.g=9.81*Math.cos(angle);
 const hub=v.radius-(v.mass/4+v.wheelMass)*v.g/v.kt;v.q=[hub+v.length-v.mass*v.g/(4*v.ks),0,0,...Array(4).fill(hub)];s.y.splice(6,7,...v.q);
 s.contactMu=mu;s.bristles=Array.from({length:4},()=>[0,0]);s.tireLoss={viscous:0,plastic:0};
 if(equilibrium){
  const K=Array.from({length:7},()=>Array(7).fill(0)),rhs=[-v.mass*v.g,P.H*(-P.mass*s.plane.gx),0,...Array(4).fill(-v.wheelMass*v.g+v.kt*v.radius)];
  for(let i=0;i<4;i++){const [x,y]=v.corners[i],b=[1,x,y,0,0,0,0];b[i+3]=-1;for(let j=0;j<7;j++){rhs[j]+=v.ks*v.length*b[j];for(let k=0;k<7;k++)K[j][k]+=v.ks*b[j]*b[k];}K[3+i][3+i]+=v.kt;}
  const q=solve(factor(K),rhs),force=-P.mass*s.plane.gx/4;for(let i=0;i<4;i++){const n=v.kt*(v.radius-q[3+i]);if(!(n>0)||Math.abs(force)>mu*n)throw Error('Requested static equilibrium exceeds tire support/friction');s.bristles[i]=[-force/POLICY.stiffness,0];}s.y.splice(6,7,...q);
 }
 return s;
}
export function elasticEnergy(bristles){return bristles.reduce((E,z)=>E+.5*POLICY.stiffness*(z[0]**2+z[1]**2),0);}
export function energy(s,y=s.y,bristles=s.bristles){return bodyEnergy(s,y)-P.mass*(s.plane.gx*y[0]+s.plane.gy*y[1])+elasticEnergy(bristles);}
export function totalWork(s){return s.y[25]+s.y[27]+s.y[28]+s.y[29]-s.tireLoss.viscous-s.tireLoss.plastic;}

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
// Bristles are stored in the fixed plane chart, not in a rotating wheel frame.
function tireStage(s,normal,body,rotorAverage,heading,steer,h,attached,out){
 const c=Math.cos(heading),sn=Math.sin(heading),u=c*body[0]+sn*body[1],v=-sn*body[0]+c*body[1];
 for(let i=0;i<4;i++){
  const [x,y]=s.vertical.corners[i],a=i<2?steer:0,ca=Math.cos(a),sa=Math.sin(a),vx=u-y*body[2]+P.H*body[3],vy=v+x*body[2]+P.H*body[4];
  const sx=ca*vx+sa*vy-P.R*rotorAverage[i],sy=-sa*vx+ca*vy,beta=heading+a,cb=Math.cos(beta),sb=Math.sin(beta),z=s.bristles[i];
  const local=[cb*z[0]+sb*z[1],-sb*z[0]+cb*z[1]],flow=bristleFlow(local,[sx,sy],normal[i],s.contactMu,h,attached[i]);
  out[i]={fx:flow.force[0],fy:flow.force[1],sx,sy,N:normal[i],flow,next:[cb*flow.next[0]-sb*flow.next[1],sb*flow.next[0]+cb*flow.next[1]]};
 }
 return out;
}
export function step(s,input={},h=.001,{maxIterations=MAX_ITERATIONS,acceleration='aitken'}={}){
 if(!(h>0&&h<=.004))throw Error('Declared timestep domain (0, .004] s');
 if(!Number.isInteger(maxIterations)||maxIterations<0||maxIterations>MAX_ITERATIONS)throw Error('Invalid force iteration budget');
 if(!['none','aitken'].includes(acceleration))throw Error('Invalid force acceleration mode');
 const engagement=input.clutch??.3;if(!Number.isFinite(engagement)||engagement<0||engagement>1)throw Error('Invalid clutch engagement');
 for(const k of ['serviceBrake','handbrake','throttle'])if(input[k]!==undefined&&(!Number.isFinite(input[k])||input[k]<0||input[k]>1))throw Error('Invalid driver request');
 const steer=input.steer??0;if(!Number.isFinite(steer))throw Error('Invalid steering input');
 const y=s.y,v=s.vertical,q0=y.slice(6,13),w0=y.slice(13,20),B=brakeActuation(input.serviceBrake,input.handbrake).wheels.map(w=>w.serviceCapacity+w.handCapacity),C=P.clutch*engagement;
 const initial=evaluateVehicle(s,y,{...input,clutch:0},zeroBrakes);
 const first=tireStage(s,initial.tires.map(t=>t.N),[y[3],y[4],y[5],y[14],y[15]],y.slice(20,25),y[2],steer,h,Array(4).fill(true),[]);
 initial.tires=first;const tau0=[...first.map(t=>-P.R*t.fx),P.Ie*initial.d[24]];
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
  const vx1=y[3]+h*((c*fx-sn*fy)/P.mass+s.plane.gx),vy1=y[4]+h*((sn*fx+c*fy)/P.mass+s.plane.gy);
  for(let i=0;i<7;i++)rhs[i]=op.rhs[i];rhs[1]+=h*P.H*fx;rhs[2]+=h*P.H*fy;for(let i=0;i<4;i++)rhs[3+i]+=h*N[i];
  for(let i=0;i<7;i++)w1[i]=rhs[i];solve(op.L,rhs,w1);for(let i=0;i<7;i++){wm[i]=(w1[i]+w0[i])/2;q1[i]=q0[i]+h*wm[i];}
  for(let i=0;i<4;i++)torques[i]=-P.R*F[i][0];
  const rotors=rotorFlow(rotorInitial,torques,B,C,h,params);totalRotorSegments+=rotors.segments;
  for(let i=0;i<5;i++)average[i]=rotors.integral[i]/h;for(let i=0;i<4;i++)normal[i]=normalGradient(q0[3+i],q1[3+i],v.radius,v.kt);
  body[0]=(y[3]+vx1)/2;body[1]=(y[4]+vy1)/2;body[2]=rm;body[3]=wm[1];body[4]=wm[2];tireStage(s,normal,body,average,heading,steer,h,q1.slice(3).map(z=>z<v.radius),tires);
  let forceResidual=0;for(let i=0;i<4;i++)forceResidual=Math.max(forceResidual,Math.abs(N[i]-normal[i]),Math.abs(F[i][0]-tires[i].fx),Math.abs(F[i][1]-tires[i].fy));
  if(!Number.isFinite(forceResidual))throw Error('Invalid shared contact stage');
  if(forceResidual<=FORCE_TOLERANCE){
   const next=y.slice();next[0]+=h*(y[3]+vx1)/2;next[1]+=h*(y[4]+vy1)/2;next[2]+=h*rm;next[3]=vx1;next[4]=vy1;next[5]=r1;next.splice(6,7,...q1);next.splice(13,7,...w1);next.splice(20,5,...rotors.w);
   let contactWork=0,damping=0,velocityScale=0,frictionExcess=0;
   for(let i=0;i<4;i++){contactWork+=h*(F[i][0]*tires[i].sx+F[i][1]*tires[i].sy);const [x,z]=v.corners[i],rate=wm[0]+x*wm[1]+z*wm[2]-wm[3+i];damping+=h*v.damping*rate*rate;velocityScale+=Math.abs(tires[i].sx)+Math.abs(tires[i].sy);frictionExcess=Math.max(frictionExcess,Math.hypot(...F[i])-s.contactMu*normal[i]);}
   const nextBristles=tires.map(t=>t.next),loss=tires.reduce((a,t)=>{for(const k of ['viscous','plastic'])a[k]+=t.flow[k];return a;},{viscous:0,plastic:0});
   const work=[Te*rotors.integral[4],contactWork,-rotors.brakeHeat,-rotors.clutchHeat,-damping];for(let i=0;i<5;i++)next[25+i]+=work[i];
   const after=energy(s,next,nextBristles),irreversible=loss.viscous+loss.plastic,total=work[0]+work[2]+work[3]+work[4]-irreversible,residual=after-before-total-rotors.roundingEnergy;
   const elasticDelta=elasticEnergy(nextBristles)-elasticEnergy(s.bristles),contactResidual=contactWork+elasticDelta+irreversible;
   const tolerance=1024*Number.EPSILON*(1+Math.abs(before)+Math.abs(after)+work.reduce((a,x)=>a+Math.abs(x),0))+forceResidual*(q1.slice(3).reduce((a,x,i)=>a+Math.abs(x-q0[3+i]),0)+h*velocityScale);
   if(!next.every(Number.isFinite)||!Number.isFinite(after)||!Number.isFinite(residual)||!Number.isFinite(tolerance)||Math.abs(residual)>tolerance||Math.abs(contactResidual)>h*forceResidual*velocityScale+512*Number.EPSILON*(1+elasticEnergy(s.bristles)+elasticEnergy(nextBristles)+Math.abs(contactWork)+irreversible)||frictionExcess>2*FORCE_TOLERANCE)throw Object.assign(Error('Consistent step work/friction check failed'),{residual,tolerance,contactWork,frictionExcess});
   // No state, diagnostics or time publication before every guard passes.
   const nextLoss={viscous:s.tireLoss.viscous+loss.viscous,plastic:s.tireLoss.plastic+loss.plastic};
   if(!Object.values(nextLoss).every(Number.isFinite))throw Error('Nonfinite tire loss');
   s.y=next;s.time+=h;s.constraints=rotors;s.bristles=nextBristles;s.tireLoss=nextLoss;s.traction={contactResidual,elasticDelta,loss,airborneDissipation:tires.reduce((a,t)=>a+(t.flow.mode==='airborne'?t.flow.viscous:0),0),modes:tires.map(t=>t.flow.mode),storedEnergy:elasticEnergy(nextBristles)};s.consistency={iterations:iteration+1,totalRotorSegments,forceResidual,workResidual:residual,tolerance,contactWork,frictionExcess,normal,forces:F,rotorAverage:average,bodyAverage:[(y[3]+vx1)/2,(y[4]+vy1)/2,rm,...wm],heading,engineTorque:Te,predictorSegments:predict.segments};return;
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
