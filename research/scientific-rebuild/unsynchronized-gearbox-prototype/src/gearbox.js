import {inverseRotorMass} from './differential.js';
export const RATIOS={N:0,'1':3.5,'2':2};
export const GEOMETRY={mouth:.010,seat:.022,release:.014,stop:.030,teeth:6,gap:.24,radius:.04};
export function createGearbox(){return {selected:'N',inputInertia:.1,bearingDrag:.005,neutralOmega:0,neutralAngle:0,phase:0,q:0,velocity:0,selectorMass:.25,driverForce:0,worn:false,impactCount:0,impactHeat:0,lastImpulse:0,lastImpactEnergy:0,detentReaction:0,contactForce:0};}
export function cam(g){return g.selected==='2'&&g.worn?RATIOS[g.selected]*Math.tan(.05)/GEOMETRY.radius:0;}
export function gradient(g){const G=RATIOS[g.selected];return [0,0,G/2,G/2,-Math.sign(g.q)*cam(g)];}
export function shaftState(s){const g=s.gearbox,G=RATIOS[g.selected],w=s.wheels,a=gradient(g);return G?{omega:G*(w[2].omega+w[3].omega)/2+a[4]*g.velocity,angle:g.phase+G*(w[2].angle+w[3].angle)/2+a[4]*g.q}:{omega:g.neutralOmega,angle:g.neutralAngle};}
export function syncGearParameters(s){s.flywheel.ratio=RATIOS[s.gearbox.selected];s.flywheel.gearbox=s.gearbox;s.drivetrain.additionalCarrierInertia=0;}
export function rotorSystem(wheels,diff,g){
 const base=inverseRotorMass(wheels,{...diff,additionalCarrierInertia:0});
 const B=Array.from({length:5},(_,i)=>Array.from({length:5},(_,j)=>i<4&&j<4?base[i][j]:i===4&&j===4?1/g.selectorMass:0));
 const a=gradient(g),v=B.map(row=>row.reduce((n,b,j)=>n+b*a[j],0));
 const den=1+g.inputInertia*a.reduce((n,x,i)=>n+x*v[i],0);
 return B.map((row,i)=>row.map((b,j)=>b-g.inputInertia*v[i]*v[j]/den));
}
export function selectorForces(g){
 const center=Math.max(-1,Math.min(1,Math.round(g.q/.025)))*.025,k=g.worn?100:1600;
 const detent=-k*(g.q-center),damping=-6*g.velocity;
 const stop=Math.abs(g.q)>GEOMETRY.stop?-Math.sign(g.q)*60000*(Math.abs(g.q)-GEOMETRY.stop)-200*g.velocity:0;
 g.detentReaction=detent;const force=g.driverForce+detent+damping+stop;
 if(g.selected==='N'&&g.faceBlocked&&Math.abs(g.q)>=GEOMETRY.mouth-1e-8&&Math.sign(g.q)*g.velocity>=-1e-8&&Math.sign(g.q)*force>0){g.contactForce=Math.abs(force);return 0;}
 return force;
}
export function dogState(s,target=s.gearbox.q>=0?'1':'2'){
 const g=s.gearbox,G=RATIOS[target],phase=g.neutralAngle/G-(s.wheels[2].angle+s.wheels[3].angle)/2;
 const period=2*Math.PI/GEOMETRY.teeth,wrapped=((phase+period/2)%period+period)%period-period/2;
 return {target,phase:wrapped,blocked:Math.abs(wrapped)>GEOMETRY.gap/2,relativeSpeed:g.neutralOmega/G-(s.wheels[2].omega+s.wheels[3].omega)/2};
}
function recordImpact(s,impulse,loss){const g=s.gearbox;g.lastImpulse=impulse;g.lastImpactEnergy=loss;g.lastEventEnergy=loss;g.lastEventTime=s.time;g.impactHeat+=Math.max(0,loss);g.impactCount++;g.contactForce=impulse/.001;g.contactTorque=(g.lastAngularImpulse||0)/.001;s.flywheel.transmissionSpeed=shaftState(s).omega;s.flywheel.slip=s.flywheel.omega-s.flywheel.transmissionSpeed;s.flywheel.state=s.flywheel.engagement>0?'slipping':'disengaged';}
export function faceImpact(s,h=.001){
 const g=s.gearbox,dog=dogState(s),G=RATIOS[dog.target],sign=Math.sign(g.q)||1;
 const rear=inverseRotorMass(s.wheels,{...s.drivetrain,additionalCarrierInertia:0});
 const n=[0,0,-.5,-.5],v=rear.map(row=>row.reduce((sum,b,j)=>sum+b*n[j],0));
 const closing=Math.max(0,sign*g.velocity);
 const impulse=closing*g.selectorMass; // plastic axial tooth-face impact
 const center=Math.max(-1,Math.min(1,Math.round(g.q/.025)))*.025;
 const detent=-(g.worn?100:1600)*(g.q-center);
 const held=Math.abs(g.velocity)<1e-8?Math.max(0,sign*(g.driverForce+detent))*h:0;
 g.velocity-=impulse*sign/g.selectorMass;
 const compliance=1/(G*G*g.inputInertia)+n.reduce((sum,x,i)=>sum+x*v[i],0);
 // Axial tooth-face obstruction plus bounded dry face friction, not a synchronizer.
 const angularImpulse=Math.sign(dog.relativeSpeed)*Math.min(Math.abs(dog.relativeSpeed)/compliance,.15*(impulse+held)*GEOMETRY.radius);
 g.neutralOmega-=angularImpulse/(G*g.inputInertia);s.wheels.forEach((w,i)=>w.omega-=angularImpulse*v[i]);
 const loss=impulse*closing-.5*impulse*impulse/g.selectorMass+angularImpulse*dog.relativeSpeed-.5*angularImpulse*angularImpulse*compliance;
 g.lastAngularImpulse=angularImpulse/G;g.inputMomentumChange=-angularImpulse/G;g.outputAngularImpulse=angularImpulse;
 if(closing>1e-8||loss>1e-10)recordImpact(s,impulse+held,loss);
}
export function engageDogs(s,target){
 const g=s.gearbox,old=shaftState(s),G=RATIOS[target];
 // Install the rigid dog constraint through an inelastic impulse, not a speed assignment.
 g.selected=target;const a=gradient(g),B0=inverseRotorMass(s.wheels,{...s.drivetrain,additionalCarrierInertia:0});
 const base=Array.from({length:5},(_,i)=>Array.from({length:5},(_,j)=>i<4&&j<4?B0[i][j]:i===4&&j===4?1/g.selectorMass:0));
 const v=base.map(row=>row.reduce((sum,b,j)=>sum+b*a[j],0));
 const mismatch=old.omega-a.reduce((sum,x,i)=>sum+x*(i<4?s.wheels[i].omega:g.velocity),0);
 const compliance=1/g.inputInertia+a.reduce((sum,x,i)=>sum+x*v[i],0),impulse=mismatch/compliance;
 g.lastAngularImpulse=impulse;g.inputMomentumChange=-impulse;g.outputAngularImpulse=G*impulse;g.neutralOmega-=impulse/g.inputInertia;s.wheels.forEach((w,i)=>w.omega+=impulse*v[i]);g.velocity+=impulse*v[4];
 g.phase=old.angle-G*(s.wheels[2].angle+s.wheels[3].angle)/2-a[4]*g.q;
 syncGearParameters(s);recordImpact(s,impulse*v[4]*g.selectorMass,.5*mismatch*mismatch/compliance);
}
export function releaseDogs(s){const g=s.gearbox,shaft=shaftState(s);g.neutralOmega=shaft.omega;g.neutralAngle=shaft.angle;g.selected='N';syncGearParameters(s);}
