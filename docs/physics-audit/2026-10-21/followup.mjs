import fs from 'node:fs';
import {state,reset,step,record,run} from './audit.mjs';
import {computeTireForces} from '/workspace/VerletDrift/js/physics/tires.js';
import {updateSuspension} from '/workspace/VerletDrift/js/physics/suspension.js';
import {updateSteering} from '/workspace/VerletDrift/js/physics/steering.js';
const dir='/workspace/physics-audit';
const r=[];const add=(...args)=>{const x=run(...args);r.push(x);console.log(x.name,JSON.stringify({finalV:x.final.v,maxDelta:x.totals.maxDelta,finalDelta:x.final.delta,deltaFlips:x.deltaFlips,rateFlips:x.rateFlips,maxRate:x.totals.maxRate}));};
for(const v of [.01,.03,.1,.5,1,2])add('low-speed-steering-'+v,{speed:v,delta:.01,duration:10});
add('brake-to-stop',{speed:15,delta:.16,duration:12,trace:true},t=>{state.input.brakeKeyHeld=t>1;});
for(const dt of [.02,.01,.005,.0025])add('friction-steering-'+dt,{delta:.3,duration:10,dt,params:{steeringCoulombFriction:2,steeringViscousDamping:.1}});
for(const dt of [.02,.01,.005])add('free-column-refine-'+dt,{speed:30,dt,duration:6},t=>{if(t<1.5){state.steering.isDragging=true;state.steering.wheelAngle=(t>=.5?.3:0)/state.params.maxFrontWheelAngle*Math.PI*2.5;}else state.steering.isDragging=false;});
fs.writeFileSync(dir+'/followup-results.json',JSON.stringify(r,null,2));
// Frozen straight-running kinematics to inspect the actual force curve.
const curves=[];
for(const c of [1.9,2.2,3])for(const angle of [.01,.05,.1,.15,.3,.5,.869,2,8,20,45,80]){
 reset({speed:20,delta:angle*Math.PI/180,params:{pacejkaC:c}});
 for(let i=0;i<200;i++)computeTireForces(.01);
 const k=state.wheelKinematics.frontLeft,f=state.wheelForces.frontLeft;
 curves.push({C:c,angle,alpha:state.wheelSlipAngle.frontLeft,normal:state.wheelLoads.frontLeft,lat:f.fx*k.wheelRightX+f.fy*k.wheelRightY,sat:state.steering.selfAligningTorque,slip:state.wheelSlipRatio.frontLeft});
}
// Positive wheel slip without longitudinal rotor slip at extreme lateral slip.
const lateral=[];
for(const c of [1.9,2.2,3]){
 reset({speed:1,lateral:20,params:{pacejkaC:c}});
 for(let i=0;i<500;i++)computeTireForces(.01);
 lateral.push({C:c,fx:state.wheelForces.frontLeft.fx,fy:state.wheelForces.frontLeft.fy,alpha:state.wheelSlipAngle.frontLeft,slip:state.wheelSlipRatio.frontLeft});
}
// Grip thresholds at fixed utilization between the UI thresholds.
reset({speed:20});const states=[];
for(let i=0;i<12;i++){
 state.engine.currentGear='N';state.params.gripLossThreshold=.7;state.params.gripRecoveryThreshold=.85;
 // Set physical parameters for exact lock kinetic friction .8; hold body kinematics.
 state.params.tireSlidingFrictionRatio=.8;state.input.brakeKeyHeld=true;state.params.brakeForce=100000;
 computeTireForces(.01);states.push({u:state.wheelFrictionUtil.frontLeft,state:state.wheelGripState.frontLeft.state});
}
// Suspension DC balance and the four-corner affine constraint.
reset();state.body.longitudinalAccel=3;state.body.lateralAccel=4;
for(let i=0;i<1000;i++)updateSuspension(.001);
const s=state.suspension,p=state.params;
const suspension={loads:{...state.wheelLoads},state:structuredClone(s),sum:Object.values(state.wheelLoads).reduce((a,b)=>a+b),diagonal:s.compression.frontLeft+s.compression.rearRight-s.compression.frontRight-s.compression.rearLeft};
fs.writeFileSync(dir+'/mechanism-probes.json',JSON.stringify({curves,lateral,gripStates:states,suspension},null,2));
