import {rotorSystem,selectorForces,gradient,dogState,shaftState} from './gearbox.js';
import {solveCoupled} from './clutch.js';
import {createDifferential,inverseRotorMass,recordDifferential,rotorEnergy} from './differential.js';
// Right handed x forward, y left, yaw positive counterclockwise.
export function createPlanar(){return {x:0,y:0,heading:0,u:0,v:0,r:0,Iz:60,steering:0};}
export function tireLateral(vx,vy,load,mu=.9){
 const alpha=Math.atan2(vy,Math.max(Math.abs(vx),.5));
 const fy=Math.max(-mu*load,Math.min(mu*load,-800*alpha));
 return {alpha,fy:fy||0};
}
export function contactVelocity(p,c){return {vx:p.u-p.r*c.y,vy:p.v+p.r*c.x};}
export function yawMoment(c,fx,fy){return c.x*fy-c.y*fx;}
export function stepPlanar(p,corners,loads,mass,{drive=0,brake=0,steer=0}={},h=.001,diff=createDifferential(),flywheel=null){
 if(!flywheel)throw new Error('Persistent flywheel state is required');
 const gear=flywheel.gearbox,engineOld=flywheel.omega,inputOld=gear.selected==='N'?gear.neutralOmega:gradient(gear).reduce((n,x,i)=>n+x*(i<4?corners[i].omega:gear.velocity),0),selectorOld=gear.velocity;
 const energyOld=rotorEnergy(corners,diff)+.5*flywheel.inertia*engineOld**2+.5*gear.inputInertia*inputOld**2+.5*gear.selectorMass*selectorOld**2;
 const old=corners.map(c=>c.omega),B=rotorSystem(corners,diff,flywheel.gearbox);
 const target=Math.max(-.45,Math.min(.45,steer));
 p.steering+=Math.max(-1.2*h,Math.min(1.2*h,target-p.steering));
 const t=corners.map((c,i)=>{
  const delta=c.axle===0?p.steering:0,cos=Math.cos(delta),sin=Math.sin(delta);
  const local=contactVelocity(p,c);
  const vx=cos*local.vx+sin*local.vy,vy=-sin*local.vx+cos*local.vy;
  c.steering=delta;
  const lateral=tireLateral(vx,vy,loads[i],c.mu);
  c.drive=flywheel?0:c.axle===1?drive/2:0;
  const free=c.omega+h*c.drive/c.inertia;
  c.brake=-Math.sign(free)*Math.min(brake,Math.abs(free)*c.inertia/h);
  return {cos,sin,vx,vy,lever:c.x*sin-c.y*cos,latLever:c.x*cos+c.y*sin,...lateral,torque:c.drive+c.brake,limit:Math.sqrt(Math.max(0,(c.mu*loads[i])**2-lateral.fy**2))};
 });
 // Lateral forces frozen at start; solve longitudinal slip implicitly with
 // full shared translation/yaw response, including steered force directions.
 const lateralFx=t.reduce((n,a)=>n-a.sin*a.fy,0),lateralFy=t.reduce((n,a)=>n+a.cos*a.fy,0);
 const lateralMz=t.reduce((n,a,i)=>n+a.latLever*a.fy,0);
 flywheel.gearbox.faceBlocked=flywheel.gearbox.selected==='N'&&dogState({gearbox:flywheel.gearbox,wheels:corners}).blocked;
 const ports=t.map(a=>a.torque).concat(selectorForces(flywheel.gearbox));
 const A=t.map((a,i)=>t.map((b,j)=>h*((a.cos*b.cos+a.sin*b.sin)/mass+a.lever*b.lever/p.Iz)+h*corners[i].radius*B[i][j]*corners[j].radius+(i===j?1/corners[i].slipStiffness:0)));
 const rhs=t.map((a,i)=>corners[i].radius*(corners[i].omega+h*B[i].reduce((sum,b,j)=>sum+b*ports[j],0))-a.vx-h*((a.cos*lateralFx+a.sin*lateralFy)/mass+a.lever*lateralMz/p.Iz));
 const coupled=solveCoupled(A,rhs,t.map(a=>a.limit),B,corners,flywheel,drive,ports,h);
 const force=coupled.force,acceleration=coupled.acc;
 const g=flywheel.gearbox;g.velocity+=h*acceleration[4];g.q+=h*g.velocity;
 const inputTorque=flywheel.ratio*coupled.torque;
 corners.forEach(c=>{c.drive=c.axle===1?inputTorque/2:0;});
 let fx=0,fy=0,mz=0;
 corners.forEach((c,i)=>{const a=t[i];c.fx=force[i]||0;c.fy=a.fy;c.alpha=a.alpha;c.normal=loads[i];c.slip=c.radius*c.omega-a.vx;c.utilization=loads[i]>0?Math.hypot(c.fx,c.fy)/(c.mu*loads[i]):0;
 const bx=a.cos*c.fx-a.sin*c.fy,by=a.sin*c.fx+a.cos*c.fy;fx+=bx;fy+=by;mz+=yawMoment(c,bx,by);
 c.omega+=h*acceleration[i];c.angle+=h*c.omega;
 });
 const shaftAcc=gradient(g).reduce((n,x,i)=>n+x*acceleration[i],0);
 const shaftInertiaTorque=flywheel.ratio*g.inputInertia*shaftAcc;
 const delivered=inputTorque-shaftInertiaTorque;
 recordDifferential(diff,corners,old,acceleration,t.map((a,i)=>a.torque+(i>=2?delivered/2:0)),h,delivered);
 flywheel.gearbox.inputTorque=flywheel.ratio?delivered/flywheel.ratio:0;
 flywheel.gearbox.inputPower=flywheel.gearbox.inputTorque*flywheel.transmissionSpeed;
 flywheel.gearbox.outputPower=delivered*(corners[2].omega+corners[3].omega)/2;
 g.camForce=gradient(g)[4]*g.inputTorque;g.camPower=g.camForce*g.velocity;
 flywheel.gearHousingTorque=(1-flywheel.ratio)*flywheel.gearbox.inputTorque;

 const inputNew=flywheel.transmissionSpeed;
 const energyNew=rotorEnergy(corners,diff)+.5*flywheel.inertia*flywheel.omega**2+.5*gear.inputInertia*inputNew**2+.5*gear.selectorMass*gear.velocity**2;
 const externalWork=h*(drive*(engineOld+flywheel.omega)/2+ports[4]*(selectorOld+gear.velocity)/2+corners.reduce((n,c,i)=>n+(t[i].torque-c.radius*c.fx)*(old[i]+c.omega)/2,0));
 const bearingWork=gear.selected==='N'?h*gear.bearingDrag*inputNew*(inputOld+inputNew)/2:0;
 gear.rotationalWorkResidual=energyNew-energyOld-externalWork+coupled.heat+bearingWork;
 gear.driverWork=(gear.driverWork||0)+h*gear.driverForce*(selectorOld+gear.velocity)/2;
 // World-frame velocity update is equivalent to body Newton-Euler equations
 // (uDot=Fx/m+r*v, vDot=Fy/m-r*u), without an explicit Coriolis energy error.
 const co=Math.cos(p.heading),si=Math.sin(p.heading);
 const wx=co*p.u-si*p.v+h*(co*fx-si*fy)/mass,wy=si*p.u+co*p.v+h*(si*fx+co*fy)/mass;
 p.r+=h*mz/p.Iz;p.heading+=h*p.r;p.x+=h*wx;p.y+=h*wy;
 const cn=Math.cos(p.heading),sn=Math.sin(p.heading);p.u=cn*wx+sn*wy;p.v=-sn*wx+cn*wy;
 if(!Object.values(p).every(Number.isFinite))throw new Error('Nonfinite planar state');
}
