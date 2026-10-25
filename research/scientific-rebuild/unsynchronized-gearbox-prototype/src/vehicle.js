import {createGearbox,syncGearParameters,shaftState,faceImpact,engageDogs,releaseDogs,dogState,GEOMETRY} from './gearbox.js';
import {createFlywheel} from './clutch.js';
import {createDifferential} from './differential.js';
import {createPlanar,stepPlanar} from './planar.js';
// Reduced side view: small-angle mount heights; no longitudinal pitch coupling.
export function createVehicle({mode='independent',scenario='uniform',worn=false}={}) {
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
  s.gearbox=createGearbox();s.gearbox.worn=worn;syncGearParameters(s);
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
export function verticalDerivative(s) {
  const f=s.corners.map(c=>cornerForces(s,c));
  return [s.vz,(f[0].suspension+f[1].suspension)/s.mass-s.gravity,s.pitchRate,s.corners.reduce((sum,c,i)=>sum+c.arm*f[i].suspension,0)/s.inertia,...s.corners.flatMap((c,i)=>[c.vz,(f[i].normal-f[i].suspension)/c.mass-s.gravity])];
}
const vector=s=>[s.z,s.vz,s.pitch,s.pitchRate,...s.corners.flatMap(c=>[c.z,c.vz])];
function stateAt(s,y){return {...s,z:y[0],vz:y[1],pitch:y[2],pitchRate:y[3],corners:s.corners.map((c,i)=>({...c,z:y[4+2*i],vz:y[5+2*i]}))};}
function stepVehicleCore(s,{drive=0,brake=0,steer=0}={},h=.001) {
  const y=vector(s),add=(v,k)=>y.map((a,i)=>a+h*k*v[i]);
  const a=verticalDerivative(s),b=verticalDerivative(stateAt(s,add(a,.5))),c=verticalDerivative(stateAt(s,add(b,.5))),d=verticalDerivative(stateAt(s,add(c,1)));
  const next=stateAt(s,y.map((v,i)=>v+h*(a[i]+2*b[i]+2*c[i]+d[i])/6));
  Object.assign(s,{z:next.z,vz:next.vz,pitch:next.pitch,pitchRate:next.pitchRate});
  s.corners.forEach((c,i)=>{c.z=next.corners[i].z;c.vz=next.corners[i].vz;});
  const loads=s.corners.map(c=>cornerForces(s,c).normal);
  stepPlanar(s.planar,s.wheels,loads.flatMap((n,i)=>i===1&&supportRetracted(s)?[0,n]:[n/2,n/2]),s.mass+s.corners.reduce((n,c)=>n+c.mass,0),{drive,brake,steer},h,s.drivetrain,s.flywheel);
  s.corners.forEach((c,i)=>{const pair=s.wheels.filter(w=>w.axle===i);c.angle=(pair[0].angle+pair[1].angle)/2;c.omega=(pair[0].omega+pair[1].omega)/2;c.fx=pair[0].fx+pair[1].fx;c.drive=pair[0].drive+pair[1].drive;c.brake=pair[0].brake+pair[1].brake;});
  s.time+=h;
  if(![s.x,s.v,...vector(s),...s.corners.map(c=>c.omega)].every(Number.isFinite))throw new Error('Nonfinite vehicle');
}

function cloneState(s){const c=structuredClone(s);Object.defineProperties(c,{x:{enumerable:true,get(){return this.planar.x;},set(v){this.planar.x=v;}},v:{enumerable:true,get(){return this.planar.u;},set(v){this.planar.u=v;}}});c.flywheel.gearbox=c.gearbox;return c;}
export function stepVehicle(s,ports={},h=.001){
 let work=0;const core=(q,p,dt)=>{stepVehicleCore(q,p,dt);work+=q.gearbox.lastSolveCases;};
 const g=s.gearbox;g.eventIterations=0;g.lastAngularImpulse=0;g.inputMomentumChange=0;g.lastImpulse=0;g.lastImpactEnergy=0;g.contactForce=0;
 if(g.selected==='N'&&Math.abs(g.q)>=GEOMETRY.mouth-1e-9&&dogState(s).blocked)faceImpact(s);
 const start=s.gearbox.q,trial=cloneState(s);core(trial,ports,h);
 if(g.selected==='N'&&Math.abs(start)<=GEOMETRY.mouth+1e-8&&Math.abs(trial.gearbox.q)>GEOMETRY.mouth+1e-10){
  let lo=0,hi=h,t=h,best=trial;
  for(let i=0;i<24;i++){t=(lo+hi)/2;best=cloneState(s);core(best,ports,t);best.gearbox.eventIterations=i+1;if(Math.abs(Math.abs(best.gearbox.q)-GEOMETRY.mouth)<1e-9)break;if(Math.abs(best.gearbox.q)<GEOMETRY.mouth)lo=t;else hi=t;}
  Object.assign(s,best);if(dogState(s).blocked)faceImpact(s);if(h-t>1e-12)core(s,ports,h-t);
 }else Object.assign(s,trial);
 if(s.gearbox.selected==='N'&&Math.abs(s.gearbox.q)>=GEOMETRY.seat&&!dogState(s).blocked)engageDogs(s,dogState(s).target);
 else if(s.gearbox.selected!=='N'&&Math.abs(s.gearbox.q)<GEOMETRY.release)releaseDogs(s);
 s.gearbox.lastStepCases=work;
}
