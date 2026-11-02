// Isolated continuous-terrain experiment. Historical implementations are untouched.
import {P,create as createBase,energy as baseEnergy} from '../model.js';
import {POLICY,bristleFlow} from '../static-contact/bristle.js';
import {rotorFlow,DEFAULTS} from '../coupled-drivetrain/rotors.js';
import {ratio,validateRatios,DEFAULT_RATIOS} from '../manual-transmission/shaft-flow.js';
import {brakeActuation} from '../../tire-road-observatory-prototype/src/brakes.js';
import {createEngine,torque,finish} from './engine.js';
import {verticalOperator,solve} from '../variable-terrain/linear.js';
import {dot,add,scale,point,sample,normalStage,jacobian,frame,transport} from '../variable-terrain/geometry.js';
export {P,POLICY};
const TOL=1e-11;
export const elasticEnergy=z=>.5*POLICY.stiffness*z.reduce((s,a)=>s+dot(a,a),0);
export const totalWork=s=>s.y[25]+s.y[27]+s.y[28]+s.y[29]+s.y[31]-s.tireLoss.viscous-s.tireLoss.plastic;
export function energy(s,terrain,y=s.y,z=s.bristles){
 const cfg=s.transmission;let E=baseEnergy(s,y)+elasticEnergy(z)+.5*cfg.Ii*y[30]**2+.5*cfg.Io*(cfg.ratios.finalDrive*(y[22]+y[23])/2)**2;
 for(let i=0;i<4;i++){const p=point(y,s.vertical.corners[i],i),a=sample(terrain,p[0],p[1]);E+=.5*s.vertical.kt*(Math.max(0,P.R+a.height-p[2])**2-Math.max(0,P.R-p[2])**2);}return E;
}
function gaussian(A,b){A=A.map((r,i)=>[...r,b[i]]);const n=b.length;for(let k=0;k<n;k++){let j=k;for(let i=k+1;i<n;i++)if(Math.abs(A[i][k])>Math.abs(A[j][k]))j=i;[A[k],A[j]]=[A[j],A[k]];if(Math.abs(A[k][k])<1e-12)throw Error('Singular initial equilibrium');for(let i=k+1;i<n;i++){const t=A[i][k]/A[k][k];for(let q=k;q<=n;q++)A[i][q]-=t*A[k][q];}}const x=Array(n);for(let i=n-1;i>=0;i--){let t=A[i][n];for(let j=i+1;j<n;j++)t-=A[i][j]*x[j];x[i]=t/A[i][i];}return x;}
export function create(terrain,options={}){
 const s=createBase(options),v=s.vertical,y=s.y; y[0]=options.x??0;y[1]=options.y??0;y[2]=options.heading??0;
 s.bristles=Array.from({length:4},()=>[0,0,0]);s.bristleNormals=[];s.tireLoss={viscous:0,plastic:0};
 const samples=v.corners.map((c,i)=>{const p=point(y,c,i);return sample(terrain,p[0],p[1]);});s.bristleNormals=samples.map(a=>a.normal);
 if(options.equilibrium){
  y.fill(0,3,6);y.fill(0,13,25);
  const A=Array.from({length:7},()=>Array(7).fill(0)),b=[-v.mass*v.g,0,0,...Array(4).fill(-v.wheelMass*v.g)];
  for(let i=0;i<4;i++){
   const [x,z]=v.corners[i],row=[1,x,z,0,0,0,0];row[3+i]=-1;
   for(let j=0;j<7;j++){b[j]+=v.ks*v.length*row[j];for(let k=0;k<7;k++)A[j][k]+=v.ks*row[j]*row[k];}
   const n=samples[i].normal,J=jacobian(y,y,v.corners[i],n,P.H),col=[0,J.pitch[2],J.roll[2],0,0,0,0];col[3+i]=1;const k=v.kt/(n[2]*n[2]);
   for(let j=0;j<7;j++){A[j][3+i]+=col[j]*k;b[j]+=col[j]*k*(P.R+samples[i].height);}
  }
  y.splice(6,7,...gaussian(A,b));
  for(let i=0;i<4;i++){
   const a=samples[i],n=a.normal,Q=v.kt*(P.R+a.height-y[9+i])/(n[2]*n[2]),N=Q*n[2],F=add([0,0,Q],scale(n,-N));
   if(!(N>0)||Math.hypot(...F)>a.friction*N)throw Error('Initial equilibrium exceeds support/friction');s.bristles[i]=scale(F,-1/POLICY.stiffness);
  }
 }else{
  // Terrain-following initial hub heights; a three-coordinate least-squares body
  // fit is initialization only, not a per-step stabilization or holding force.
  const A=Array.from({length:3},()=>Array(3).fill(0)),b=Array(3).fill(0);
  for(let i=0;i<4;i++){const [x,z]=v.corners[i],row=[1,x,z],hub=P.R+samples[i].height-(v.mass/4+v.wheelMass)*v.g/v.kt;y[9+i]=hub;const target=hub+v.length-v.mass*v.g/(4*v.ks);for(let j=0;j<3;j++){b[j]+=row[j]*target;for(let k=0;k<3;k++)A[j][k]+=row[j]*row[k];}}
  y.splice(6,3,...gaussian(A,b));
 }
 const ratios=structuredClone(options.ratios??DEFAULT_RATIOS);validateRatios(ratios);const Ii=options.inputInertia??DEFAULTS.Ii,Io=options.outputInertia??DEFAULTS.Io;if(!Number.isFinite(Ii)||!Number.isFinite(Io)||Ii<=0||Io<=0)throw Error('Invalid shaft inertias');s.transmission={ratios,Ii,Io,synchronizer:options.synchronizerCapacity??DEFAULTS.synchronizer};if(!Number.isFinite(s.transmission.synchronizer)||s.transmission.synchronizer<0)throw Error('Invalid synchronizer capacity');y[24]=options.engine??0;s.engine=createEngine();y.push(options.inputOmega??0,0);s.gearbox={gear:'N',mode:'neutral'};if(!y.every(Number.isFinite))throw Error('Invalid initial state');return s;
}
// Generalized contact loads: world Fx,Fy,yaw,pitch,roll, four hub Fz,
// four longitudinal tire forces (rotor torque = -R*Fx). Moments use a 1 m
// reference length in the force-equivalent convergence norm.
function stage(s,terrain,y1,wm,omega,steer,h){
 const y=s.y,v=s.vertical,g=Array(13).fill(0),tires=[],heading=(y[2]+y1[2])/2,body=[(y[3]+y1[3])/2,(y[4]+y1[4])/2,(y[5]+y1[5])/2];
 for(let i=0;i<4;i++){
  const p0=point(y,v.corners[i],i),p1=point(y1,v.corners[i],i),normal=normalStage(terrain,p0,p1,P.R,v.kt),n=normal.N>0?normal.normal:s.bristleNormals[i],J=jacobian(y,y1,v.corners[i],n,P.H);
  const velocity=add([body[0],body[1],wm[3+i]],add(scale(J.yaw,body[2]),add(scale(J.pitch,wm[1]),scale(J.roll,wm[2]))));
  const [t,l]=frame(n,heading+(i<2?steer:0)),z=transport(s.bristles[i],s.bristleNormals[i],n),slip=[dot(t,velocity)-P.R*omega[i],dot(l,velocity)],flow=bristleFlow([dot(z,t),dot(z,l)],slip,normal.N,normal.mu,h,normal.attached);
  const Ft=add(scale(t,flow.force[0]),scale(l,flow.force[1])),Q=add(normal.force,Ft),nextNormal=normal.N>0?(normal.attached?normal.endpoint:n):s.bristleNormals[i],next=transport(add(scale(t,flow.next[0]),scale(l,flow.next[1])),n,nextNormal);
  g[0]+=Q[0];g[1]+=Q[1];g[2]+=dot(J.yaw,Q);g[3]+=dot(J.pitch,Q);g[4]+=dot(J.roll,Q);g[5+i]=Q[2];g[9+i]=flow.force[0];
  tires.push({normal,J,velocity,slip,flow,Ft,Q,next,nextNormal});
 }
 return {g,tires};
}
function internalStep(s,terrain,input={},h=.001,{maxIterations=24,acceleration='aitken'}={}){
 const params={Iw:P.Iw,Ie:P.Ie,...s.transmission,gear:s.gearbox.gear,mode:s.gearbox.mode};
 if(!(h>0&&h<=.004)||!Number.isInteger(maxIterations)||maxIterations<0||maxIterations>24||!['aitken','none'].includes(acceleration))throw Error('Invalid step configuration');
 const C=P.clutch*(input.clutch??.3),steer=input.steer??0;
 for(const k of ['clutch','throttle','serviceBrake','handbrake'])if(input[k]!==undefined&&(!Number.isFinite(input[k])||input[k]<0||input[k]>1))throw Error('Invalid driver request');if(!Number.isFinite(steer))throw Error('Invalid steering');
 const y=s.y,v=s.vertical,q0=y.slice(6,13),w0=y.slice(13,20),omega0=[...y.slice(20,25),y[30]],B=brakeActuation(input.serviceBrake,input.handbrake).wheels.map(w=>w.serviceCapacity+w.handCapacity),before=energy(s,terrain);
 if(!Number.isFinite(before))throw Error('Nonfinite initial energy');
 const first=stage(s,terrain,y,w0,omega0,steer,h),external=torque(s.engine,y[24],input).netTorque,predict=rotorFlow(omega0,[...first.g.slice(9,13).map(f=>-P.R*f),external,0],B,C,h/2,params),predictedEngine=torque(s.engine,predict.w[4],input);
 const op=verticalOperator(v,q0,w0,h);let g=[...first.g,predictedEngine.netTorque],previous=null,priorNorm=Infinity,relaxation=1,segments=predict.segments,reactionCases=predict.cases,samples=24;
 for(let iteration=0;iteration<maxIterations;iteration++){
  const next=y.slice();next[3]=y[3]+h*g[0]/P.mass;next[4]=y[4]+h*g[1]/P.mass;next[5]=y[5]+h*g[2]/P.Iz;for(let i=0;i<3;i++)next[i]=y[i]+h*(y[i+3]+next[i+3])/2;
  const rhs=op.rhs.slice();rhs[1]+=h*g[3];rhs[2]+=h*g[4];for(let i=0;i<4;i++)rhs[3+i]+=h*g[5+i];const w1=solve(op.L,rhs),wm=w1.map((x,i)=>(x+w0[i])/2);next.splice(13,7,...w1);next.splice(6,7,...q0.map((x,i)=>x+h*wm[i]));
  const Te=g[13],rotors=rotorFlow(omega0,[...g.slice(9,13).map(f=>-P.R*f),Te,0],B,C,h,params);segments+=rotors.segments;reactionCases+=rotors.cases;next.splice(20,5,...rotors.w.slice(0,5));next[30]=rotors.w[5];next[31]-=rotors.syncHeat;
  const engineFlow=torque(s.engine,rotors.integral[4]/h,input),trial=stage(s,terrain,next,wm,rotors.integral.map(x=>x/h),steer,h);trial.g.push(engineFlow.netTorque);samples+=20;const residual=trial.g.map((x,i)=>x-g[i]),norm=Math.max(...residual.map(Math.abs));if(!Number.isFinite(norm))throw Error('Nonfinite contact closure');
  if(norm<=TOL){
   let damping=0,contactWork=0,viscous=0,plastic=0,frictionExcess=0,normalDefect=0;
   for(let i=0;i<4;i++){const t=trial.tires[i],[x,z]=v.corners[i],rate=wm[0]+x*wm[1]+z*wm[2]-wm[3+i];damping+=h*v.damping*rate*rate;contactWork+=t.flow.work;viscous+=t.flow.viscous;plastic+=t.flow.plastic;frictionExcess=Math.max(frictionExcess,Math.hypot(...t.flow.force)-t.normal.mu*t.normal.N);normalDefect+=t.normal.residual;}
   const work=[engineFlow.netTorque*rotors.integral[4],contactWork,-rotors.brakeHeat,-rotors.clutchHeat,-damping];for(let i=0;i<5;i++)next[25+i]+=work[i];const bristles=trial.tires.map(t=>t.next),after=energy(s,terrain,next,bristles),total=work[0]+work[2]+work[3]+work[4]-rotors.syncHeat-viscous-plastic,workResidual=after-before-total-rotors.roundingEnergy;
   const travel=Math.abs(next[0]-y[0])+Math.abs(next[1]-y[1])+Math.abs(next[2]-y[2])+Math.abs(next[7]-y[7])+Math.abs(next[8]-y[8])+next.slice(9,13).reduce((a,x,i)=>a+Math.abs(x-y[9+i]),0)+Math.abs(rotors.integral[4])+P.R*rotors.integral.slice(0,4).reduce((a,x)=>a+Math.abs(x),0),tolerance=1024*Number.EPSILON*(1+Math.abs(before)+Math.abs(after)+work.reduce((a,x)=>a+Math.abs(x),0))+norm*travel;
   if(!next.every(Number.isFinite)||!Number.isFinite(after)||!Number.isFinite(workResidual)||Math.abs(workResidual)>tolerance||frictionExcess>2*TOL)throw Object.assign(Error('Terrain work/friction check failed'),{workResidual,tolerance,normalDefect,frictionExcess});
   const loss={viscous:s.tireLoss.viscous+viscous,plastic:s.tireLoss.plastic+plastic};if(!Object.values(loss).every(Number.isFinite))throw Error('Nonfinite loss');
   finish(s.engine,next[24],input,h,engineFlow,rotors.integral[4]);s.y=next;s.time+=h;s.bristles=bristles;s.bristleNormals=trial.tires.map(t=>t.nextNormal);s.tireLoss=loss;s.constraints=rotors;s.consistency={iterations:iteration+1,forceResidual:norm,workResidual,tolerance,normalDefect,frictionExcess,totalRotorSegments:segments,totalReactionCases:reactionCases,terrainSamples:samples+4,tireEvaluations:4*(iteration+2),rotorCalls:iteration+2};s.contacts=trial.tires;return;
  }
  let a=1;if(acceleration==='aitken'&&previous&&norm<=priorNorm){let d=0,n=0;for(let i=0;i<13;i++){const delta=residual[i]-previous[i];d+=previous[i]*delta;n+=delta*delta;}const candidate=-relaxation*d/n;if(Number.isFinite(candidate)&&candidate>=.5&&candidate<=1.5)a=candidate;}
  g=g.map((x,i)=>a===1?trial.g[i]:x+a*residual[i]);previous=residual;relaxation=a;priorNorm=norm;
 }
 throw Error('Shared terrain contact did not converge within bounded budget');
}

// Transactional gear requests: disengagement removes a constraint without changing
// any rotor velocity/inertia. Synchronization must locate zero slip before dogs lock.
export function step(s,terrain,input={},h=.001,options={}){
 const candidate={...s,engine:structuredClone(s.engine),gearbox:{...s.gearbox}};if(input.gear!==undefined){ratio(input.gear,s.transmission.ratios);if(input.gear!==candidate.gearbox.gear)candidate.gearbox={gear:input.gear,mode:input.gear==='N'?'neutral':'synchronizing'};}
 internalStep(candidate,terrain,input,h,options);if(candidate.gearbox.mode==='synchronizing'&&candidate.constraints.synchronized)candidate.gearbox.mode='engaged';Object.assign(s,candidate);
}
