import {trailContactJacobian} from './steering-contact-foundation.js';
import {steeringJacobian,finishSteering} from './steering.js';
import {rotorSystem,selectorForces,gradient,dogState,shaftState} from './gearbox.js';
import {createDifferential,recordDifferential,rotorEnergy} from './differential.js';
import {advancePressurePlate} from './pressure-plate.js';
import {solveContacts,tireForce} from './contact-solver.js';
export {createPlanar,tireLateral,contactVelocity,yawMoment} from './planar-reference.js';
export {tireForce};
export const BRAKES={front:100,rear:70,handbrake:160}; // Nm PER wheel, 59:41 service bias.
export function stepPlanar(p,w,loads,mass,{drive=0,brake=0,serviceBrake=0,handbrake=0,steer=0,steeringAngles,steeringSystem:st,brakeMechanism}={},h=.001,diff=createDifferential(),f){
 if(!f)throw Error('Persistent flywheel required');
 if(!(h>0&&mass>0&&f.engagement>=0&&f.engagement<=1))throw Error('Invalid contact timestep/mass/clutch command');
 const n=st?11:10,sd=st?.dynamics,oldSteering=st?.angularVelocity||0,steeringEnergy=()=>st ? .5*sd.inertia*st.angularVelocity**2 : 0;
 const g=f.gearbox,G=f.ratio,grad=gradient(g),neutral=g.selected==='N',R=rotorSystem(w,diff,g),old=w.map(c=>c.omega),oldEngine=f.omega,oldInput=shaftState({gearbox:g,wheels:w}).omega,oldSelector=g.velocity;
 const rotorE=()=>rotorEnergy(w,diff)+.5*f.inertia*f.omega**2+.5*g.inputInertia*shaftState({gearbox:g,wheels:w}).omega**2+.5*g.selectorMass*g.velocity**2;
 const oldRotorE=rotorE(),oldEnergy=steeringEnergy()+oldRotorE+.5*mass*(p.u*p.u+p.v*p.v)+.5*p.Iz*p.r*p.r;
 const capacity=f.actuator?advancePressurePlate(f.actuator,f.engagement,h).capacity:f.engagement*f.ratedTorque;
 if(!st){const target=Math.max(-.45,Math.min(.45,steer));p.steering+=Math.max(-1.2*h,Math.min(1.2*h,target-p.steering));
}
 if(steeringAngles)p.steering=(steeringAngles[0]+steeringAngles[1])/2;
 g.faceBlocked=neutral&&dogState({gearbox:g,wheels:w}).blocked;
 const selector=selectorForces(g),v0=[...old,g.velocity,f.omega,neutral?g.neutralOmega:0,p.u,p.v,p.r,...(st?[oldSteering]:[])];
 const inverse=Array.from({length:n},()=>Array(n).fill(0));for(let i=0;i<5;i++)for(let j=0;j<5;j++)inverse[i][j]=R[i][j];
 inverse[5][5]=1/f.inertia;inverse[6][6]=neutral?1/(g.inputInertia+h*g.bearingDrag):0;inverse[7][7]=inverse[8][8]=1/mass;inverse[9][9]=1/p.Iz;
 if(st)inverse[10][10]=1/(sd.inertia+h*sd.damping);
 const external=[0,0,0,0,selector,drive,0,0,0,0,...(st?[st.driverTorque]:[])],free=v0.map((v,i)=>v+h*inverse[i].reduce((s,b,j)=>s+b*external[j],0));if(neutral)free[6]=g.neutralOmega*g.inputInertia*inverse[6][6];
 if(st)free[10]=(sd.inertia*oldSteering+h*st.driverTorque)*inverse[10][10];
 const sj=st?steeringJacobian(st):[0,0];
 const rows=[],groups=[],geometry=[];
 w.forEach((c,i)=>{const delta=c.axle===0?(steeringAngles?.[i]??p.steering):0,cos=Math.cos(delta),sin=Math.sin(delta),j=Array(n).fill(0),k=Array(n).fill(0);j[i]=-c.radius;j[7]=cos;j[8]=sin;const front=st&&c.axle===0,trail=front?sd.trail:0,x=c.x+trail*(1-cos),y=c.y-trail*sin;j[9]=x*sin-y*cos;k[7]=-sin;k[8]=cos;k[9]=x*cos+y*sin;if(front)k[10]=trailContactJacobian(trail,sj[i]);const start=rows.length;rows.push({j,compliance:1/(h*800)},{j:k,compliance:1/(h*800)});groups.push({indices:[start,start+1],limit:h*c.mu*Math.max(0,loads[i])});geometry.push({cos,sin,j,k,delta});});
 const brakeStart=rows.length;
 w.forEach((c,i)=>{
  const mechanism=brakeMechanism?.wheels[i];
  const service=mechanism?mechanism.serviceCapacity:Math.max(0,brake)+Math.max(0,Math.min(1,serviceBrake))*(i<2?BRAKES.front:BRAKES.rear);
  const hand=mechanism?mechanism.handCapacity:(i>=2?Math.max(0,Math.min(1,handbrake))*BRAKES.handbrake:0);
  const cap=service+hand,j=Array(n).fill(0);j[i]=1;rows.push({j});groups.push({indices:[rows.length-1],limit:h*cap});
  c.serviceBrakeCapacity=service;c.handbrakeCapacity=hand;c.brakeCapacity=cap;
 });
 const steeringStart=rows.length;
 if(st){
  const friction=Array(n).fill(0);friction[10]=.1;rows.push({j:friction});groups.push({indices:[rows.length-1],limit:h*sd.friction/.1});
  for(const sign of [1,-1]){const j=Array(n).fill(0);j[10]=sign*.1;rows.push({j,bias:.1*(sign*st.wheelAngle-st.geometry.columnLimit)/h});groups.push({indices:[rows.length-1],lower:0,upper:1e6,limit:1e6});}
 }
 const cj=Array(n).fill(0);cj[5]=1;if(neutral)cj[6]=-1;else grad.forEach((a,i)=>cj[i]=-a);rows.push({j:cj});groups.push({indices:[rows.length-1],limit:h*capacity});
 let result,v,z,clutch,slipOld=oldEngine-oldInput,slipNew,heat,acceptedMode,totalIterations=0;
 for(const mode of capacity>0?['locked',1,-1]:[0]){
  const last=groups.at(-1);delete last.fixed;if(mode!=='locked')last.fixed=mode*h*capacity;
  const trial=solveContacts(inverse,free,rows,groups,h,{maxIterations:st?20000:2000,tolerance:st?1e-12:1e-10,initial:p.contactImpulse?.map(a=>a*h/p.contactImpulseH)});totalIterations+=trial.iterations;
  const speed=cj.reduce((s,a,i)=>s+a*trial.velocity[i],0),torque=trial.z.at(-1)/h,loss=h*torque*(slipOld+speed)/2;
  if((mode==='locked'?Math.abs(speed)<1e-8:mode===0||mode*(slipOld+speed)>=-1e-9)&&loss>=-1e-10){result=trial;v=trial.velocity;z=trial.z;clutch=torque;slipNew=speed;heat=Math.max(0,loss);acceptedMode=mode;break;}
 }
 if(!result)throw Error(`Clutch/contact modes unresolved: h=${h}, slip=${slipOld}, capacity=${capacity}, motor=${drive}`);
 p.contactImpulse=[...z];p.contactImpulseH=h;
 f.omega=v[5];f.angle+=h*f.omega;f.torque=clutch;f.capacity=capacity;f.slip=slipNew;f.state=capacity===0?'disengaged':acceptedMode==='locked'?'locked':'slipping';f.heatingPower=Math.max(0,heat)/h;f.heat+=Math.max(0,heat);f.motorTorque=drive;
 g.velocity=v[4];g.q+=h*g.velocity;if(neutral){g.neutralOmega=v[6];g.neutralAngle+=h*v[6];}
 let tireDissipation=0,brakeDissipation=0,serviceDissipation=0,handbrakeDissipation=0,forceLawResidual=0;w.forEach((c,i)=>{const a=geometry[i];c.omega=v[i];c.angle+=h*c.omega;c.steering=a.delta;c.forceHeading=p.heading+a.delta;c.fx=-z[2*i]/h;c.fy=-z[2*i+1]/h;c.normal=loads[i];c.brake=-z[brakeStart+i]/h;c.serviceBrakeTorque=c.brakeCapacity?c.brake*c.serviceBrakeCapacity/c.brakeCapacity:0;c.handbrakeTorque=c.brakeCapacity?c.brake*c.handbrakeCapacity/c.brakeCapacity:0;c.drive=i>=2?G*clutch/2:0;c.slipX=a.j.reduce((s,b,j)=>s+b*v[j],0);c.slipY=a.k.reduce((s,b,j)=>s+b*v[j],0);c.slip=-c.slipX;c.alpha=Math.atan2(c.slipY,Math.max(Math.abs(a.j[7]*v[7]+a.j[8]*v[8]+a.j[9]*v[9]),.5));c.utilization=loads[i]>0?Math.hypot(c.fx,c.fy)/(c.mu*loads[i]):0;c.contactMode=loads[i]<=0?'unloaded':c.utilization>1-1e-6?'sliding':'rolling/creep';c.brakeHeld=c.brakeCapacity>0&&Math.abs(z[brakeStart+i])<h*c.brakeCapacity-1e-9;const constitutive=tireForce(c.slipX,c.slipY,loads[i],c.mu);forceLawResidual=Math.max(forceLawResidual,Math.hypot(c.fx-constitutive.fx,c.fy-constitutive.fy));tireDissipation+=-(c.fx*c.slipX+c.fy*c.slipY);brakeDissipation+=-c.brake*c.omega;serviceDissipation-=c.serviceBrakeTorque*c.omega;handbrakeDissipation-=c.handbrakeTorque*c.omega;});
 let steeringLoss=0;
 if(st){
  const tireTorque=w.slice(0,2).reduce((sum,c,i)=>sum-sd.trail*sj[i]*c.fy,0),frictionTorque=-.1*z[steeringStart]/h,stopTorque=.1*(-z[steeringStart+1]+z[steeringStart+2])/h;
  steeringLoss=sd.damping*v[10]**2-(frictionTorque+stopTorque)*v[10];
  st.last={tireTorque,driverTorque:st.driverTorque,frictionTorque,stopTorque,dampingTorque:-sd.damping*v[10],torqueResidual:sd.inertia*(v[10]-oldSteering)/h-st.driverTorque-tireTorque-frictionTorque-stopTorque+sd.damping*v[10]};
  finishSteering(st,v[10],h);p.steering=(st.leftAngle+st.rightAngle)/2;
  w[0].steering=st.leftAngle;w[1].steering=st.rightAngle;
 }
 const acc=w.map((c,i)=>(c.omega-old[i])/h),inputNew=shaftState({gearbox:g,wheels:w}).omega,inputAcc=(inputNew-oldInput)/h,delivered=G*(clutch-g.inputInertia*inputAcc);
 recordDifferential(diff,w,old,acc,w.map((c,i)=>c.brake+(i>=2?delivered/2:0)),h,delivered);
 w[2].drive=diff.outputs[0];w[3].drive=diff.outputs[1];
 g.inputTorque=G?delivered/G:0;g.inputPower=g.inputTorque*inputNew;g.outputPower=delivered*(w[2].omega+w[3].omega)/2;g.camForce=grad[4]*g.inputTorque;g.camPower=g.camForce*g.velocity;g.driverWork=(g.driverWork||0)+h*g.driverForce*(oldSelector+g.velocity)/2;
 const midWork=h*(drive*(oldEngine+f.omega)/2+selector*(oldSelector+g.velocity)/2+w.reduce((s,c,i)=>s+(c.brake-c.radius*c.fx)*(old[i]+c.omega)/2,0)),bearing=neutral?h*g.bearingDrag*inputNew*(oldInput+inputNew)/2:0;
 g.rotationalWorkResidual=rotorE()-oldRotorE-midWork+Math.max(0,heat)+bearing;f.transmissionSpeed=inputNew;f.gearHousingTorque=(1-G)*g.inputTorque;
 const co=Math.cos(p.heading),si=Math.sin(p.heading),wx=co*v[7]-si*v[8],wy=si*v[7]+co*v[8];p.r=v[9];p.heading+=h*p.r;p.x+=h*wx;p.y+=h*wy;const cn=Math.cos(p.heading),sn=Math.sin(p.heading);p.u=cn*wx+sn*wy;p.v=-sn*wx+cn*wy;
 const energy=steeringEnergy()+rotorE()+.5*mass*(p.u*p.u+p.v*p.v)+.5*p.Iz*p.r*p.r,work=h*(drive*f.omega+selector*g.velocity+(st?st.driverTorque*v[10]:0)),clutchEnd=clutch*slipNew,bearingEnd=neutral?g.bearingDrag*inputNew**2:0;
 const numericalLoss=(st ? .5*sd.inertia*(v[10]-oldSteering)**2 : 0)+rotorEnergy(w,diff,w.map((c,i)=>c.omega-old[i]))+.5*f.inertia*(f.omega-oldEngine)**2+.5*g.inputInertia*(inputNew-oldInput)**2+.5*g.selectorMass*(g.velocity-oldSelector)**2+.5*mass*((v[7]-v0[7])**2+(v[8]-v0[8])**2)+.5*p.Iz*(v[9]-v0[9])**2;
 p.contact={iterations:totalIterations,acceptedCandidateIterations:result.iterations,residual:result.residual,prePolishResidual:result.prePolishResidual,forceLawResidual,constitutiveImpulseResidual:h*forceLawResidual,energy,work,steeringLoss,tireDissipation,brakeDissipation,serviceDissipation,handbrakeDissipation,clutchEndPower:clutchEnd,bearingEndPower:bearingEnd,numericalLoss,energyResidual:energy-oldEnergy-work+h*(steeringLoss+tireDissipation+brakeDissipation+clutchEnd+bearingEnd)+numericalLoss,serviceBrake,handbrake,ax:(v[7]-v0[7])/h,ay:(v[8]-v0[8])/h};
 g.lastSolveCases=totalIterations; // counts convex iterations, NOT legacy active-set candidates
 if(![...v,energy,numericalLoss].every(Number.isFinite)||h*forceLawResidual>2e-8||Math.abs(p.contact.energyResidual)>1e-7||numericalLoss< -1e-7||tireDissipation< -1e-7||brakeDissipation< -1e-7)throw Error(`Contact energy/domain violation: residual=${p.contact.energyResidual}, constitutiveImpulse=${h*forceLawResidual}, tirePower=${tireDissipation}, brakePower=${brakeDissipation}, numericLoss=${numericalLoss}`);
}
