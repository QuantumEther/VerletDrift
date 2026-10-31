import {createVertical,evaluate,stepVertical} from './vertical.js';
import {createEngine,prepareEngine,finishEngine} from '../../tire-road-observatory-prototype/src/engine.js';
import {createSteering,advanceSteering} from '../../tire-road-observatory-prototype/src/steering.js';
import {brakeActuation} from '../../tire-road-observatory-prototype/src/brakes.js';
import {createGearbox,syncGearParameters,shaftState,faceImpact,engageDogs,releaseDogs,dogState,GEOMETRY} from '../../tire-road-observatory-prototype/src/gearbox.js';
import {createFlywheel} from '../../tire-road-observatory-prototype/src/clutch.js';
import {createDifferential} from '../../tire-road-observatory-prototype/src/differential.js';
import {createPlanar,stepPlanar} from './combined-planar.js';
// Reduced side view: small-angle mount heights; no longitudinal pitch coupling.
export function createVehicle({mode='independent',scenario='uniform',worn=false,automobile=true}={}) {
  const s={mass:80,inertia:45,gravity:9.81,x:0,v:0,z:0,vz:0,pitch:0,pitchRate:0,time:0,bump:null};
  s.corners=[1,-1].map(arm=>({arm,mass:12,radius:.32,inertia:2,ks:4000,cs:160,kt:40000,ct:180,L0:.6,mu:.9,slipStiffness:18000,z:.32-52*9.81/40000,vz:0,omega:0,angle:0,fx:0,drive:0,brake:0}));
  s.planar=createPlanar();
  s.drivetrain=createDifferential(mode);
  s.flywheel=createFlywheel();
  Object.defineProperties(s,{x:{enumerable:true,get(){return this.planar.x;},set(v){this.planar.x=v;}},v:{enumerable:true,get(){return this.planar.u;},set(v){this.planar.u=v;}}});
  s.z=s.corners[0].z+.6-40*9.81/4000;
  s.scenario=scenario;
  s.wheelbase=2; s.track=1.2;
  s.wheels=s.corners.flatMap((c,i)=>[1,-1].map(side=>({...c,name:(i===0?'F':'R')+(side===1?'L':'R'),x:c.arm,y:side*s.track/2,axle:i,mass:c.mass/2,inertia:c.inertia/2})));
  if(scenario==='asymmetric')s.wheels[2].mu=.08;
  if(automobile){s.engine=createEngine();s.steering=createSteering(s.wheelbase,s.track);s.brakes=brakeActuation();}
  s.gearbox=createGearbox();s.gearbox.worn=worn;syncGearParameters(s);
  s.vertical=createVertical();s.verticalLedger={residual:0,dampingWork:0};
  return s;
}
export function roadAt(s,x) {
  if(s.bump===null)return {height:0,slope:0};
  const u=(x-s.bump)/.8;
  return u>0&&u<1?{height:.08*Math.sin(Math.PI*u)**2,slope:.08*Math.PI/.8*Math.sin(2*Math.PI*u)}:{height:0,slope:0};
}
export function supportRetracted(s){return s.scenario==='unload'&&s.time>=.5&&s.time<1;}
export function cornerForces(s,c) {
  const road=roadAt(s,s.x+c.arm*Math.cos(s.planar.heading));
  const compression=c.L0-(s.z+c.arm*s.pitch-c.z);
  const spring=c.ks*compression,damper=-c.cs*(s.vz+c.arm*s.pitchRate-c.vz);
  const delta=Math.max(0,c.radius+road.height-c.z);
  const normal=delta>0?Math.max(0,c.kt*delta-c.ct*(c.vz-road.slope*(s.planar.u*Math.cos(s.planar.heading)-s.planar.v*Math.sin(s.planar.heading)-c.arm*Math.sin(s.planar.heading)*s.planar.r))):0;
  const supportedNormal=normal*(c.arm<0&&supportRetracted(s)?.5:1);
  return {compression,spring,damper,suspension:spring+damper,delta,normal:supportedNormal,contact:supportedNormal>0,road};
}
const vector=s=>[...s.vertical.q,...s.vertical.v];
function stepVehicleCore(s,{drive=0,brake=0,serviceBrake=0,handbrake=0,steer=0,throttle=0,starter=false}={},h=.001) {
  if(s.bump!==null||s.scenario==='unload')throw Error('Combined vertical stage currently supports flat continuous ground only');
  if(s.engine){drive=prepareEngine(s.engine,s.flywheel.omega,{throttle,starter},h);}
  const steeringAngles=s.steering?advanceSteering(s.steering,steer/.4,h):undefined;
  if(s.brakes)s.brakes=brakeActuation(serviceBrake,handbrake);
  const before=evaluate(s.vertical);stepVertical(s.vertical,h);const after=evaluate(s.vertical);
  const dampingWork=h*(before.dissipation+after.dissipation)/2;
  s.verticalLedger.residual+=after.energy-before.energy+dampingWork;s.verticalLedger.dampingWork+=dampingWork;
  const loads=after.normal;
  stepPlanar(s.planar,s.wheels,loads,s.mass+4*s.vertical.wheelMass,{drive,brake,serviceBrake,handbrake,steer,steeringAngles,steeringSystem:s.steering,verticalState:s.vertical,brakeMechanism:s.brakes},h,s.drivetrain,s.flywheel);
  s.z=s.vertical.q[0];s.vz=s.vertical.v[0];s.pitch=s.vertical.q[1];s.pitchRate=s.vertical.v[1];s.roll=s.vertical.q[2];s.rollRate=s.vertical.v[2];
  // Legacy axle aggregates are display-only: no suspension equations use them.
  s.corners.forEach((c,i)=>{c.z=(s.vertical.q[3+2*i]+s.vertical.q[4+2*i])/2;c.vz=(s.vertical.v[3+2*i]+s.vertical.v[4+2*i])/2;});
  s.corners.forEach((c,i)=>{const pair=s.wheels.filter(w=>w.axle===i);c.angle=(pair[0].angle+pair[1].angle)/2;c.omega=(pair[0].omega+pair[1].omega)/2;c.fx=pair[0].fx+pair[1].fx;c.drive=pair[0].drive+pair[1].drive;c.brake=pair[0].brake+pair[1].brake;});
  if(s.engine)finishEngine(s.engine,s.flywheel.omega,h);
  s.time+=h;
  if(![s.x,s.v,...vector(s),...s.corners.map(c=>c.omega)].every(Number.isFinite))throw new Error('Nonfinite vehicle');
}

function cloneState(s){const c=structuredClone(s);Object.defineProperties(c,{x:{enumerable:true,get(){return this.planar.x;},set(v){this.planar.x=v;}},v:{enumerable:true,get(){return this.planar.u;},set(v){this.planar.u=v;}}});c.flywheel.gearbox=c.gearbox;return c;}
// Optional observer receives detached samples only AFTER the whole master step
// succeeds. Bisection probes never emit; work uses each accepted core's real dt.
export function stepVehicle(s,ports={},h=.001,observer=null){
 const begin=observer?.capture(s);let accepted=[];
 let work=0;const core=(q,p,dt)=>{stepVehicleCore(q,p,dt);work+=q.gearbox.lastSolveCases;};
 const g=s.gearbox;g.eventIterations=0;g.lastAngularImpulse=0;g.inputMomentumChange=0;g.lastImpulse=0;g.lastImpactEnergy=0;g.contactForce=0;
 if(g.selected==='N'&&Math.abs(g.q)>=GEOMETRY.mouth-1e-9&&dogState(s).blocked)faceImpact(s);
 const start=s.gearbox.q,trial=cloneState(s);core(trial,ports,h);
 if(g.selected==='N'&&Math.abs(start)<=GEOMETRY.mouth+1e-8&&Math.abs(trial.gearbox.q)>GEOMETRY.mouth+1e-10){
  let lo=0,hi=h,t=h,best=trial;
  for(let i=0;i<24;i++){t=(lo+hi)/2;best=cloneState(s);core(best,ports,t);best.gearbox.eventIterations=i+1;if(Math.abs(Math.abs(best.gearbox.q)-GEOMETRY.mouth)<1e-9)break;if(Math.abs(best.gearbox.q)<GEOMETRY.mouth)lo=t;else hi=t;}
  Object.assign(s,best);const middle=observer?.capture(s);
  if(observer)accepted.push({start:begin,end:middle,h:t});
  if(dogState(s).blocked)faceImpact(s);
  if(h-t>1e-12){core(s,ports,h-t);if(observer)accepted.push({start:middle,end:observer.capture(s),h:h-t});}
 }else {Object.assign(s,trial);if(observer)accepted.push({start:begin,end:observer.capture(s),h});}
 if(s.gearbox.selected==='N'&&Math.abs(s.gearbox.q)>=GEOMETRY.seat&&!dogState(s).blocked)engageDogs(s,dogState(s).target);
 else if(s.gearbox.selected!=='N'&&Math.abs(s.gearbox.q)<GEOMETRY.release)releaseDogs(s);
 s.gearbox.lastStepCases=work;
 if(observer)observer.accept(accepted);
}
