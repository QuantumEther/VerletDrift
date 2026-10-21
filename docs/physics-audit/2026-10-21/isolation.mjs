import fs from 'node:fs';
import {state,reset,step,record,run} from './audit.mjs';
import {computeTireForces} from '/workspace/VerletDrift/js/physics/tires.js';
import {updateEngine,synchronizeEngineWithWheels} from '/workspace/VerletDrift/js/physics/engine.js';
const rs=[];
for(const [n,p] of Object.entries({baseline:{},noSAT:{pneumaticTrail:0},noCoulomb:{steeringCoulombFriction:0},noSpring:{steeringSelfCenterRate:0},shortRelaxation:{tireRelaxationLength:.02},softCurve:{pacejkaB:1,pacejkaC:1.3},noGrip:{tireFrictionCoeff:0}})){
 const r=run('steer-isolate-'+n,{speed:1,delta:.01,duration:10,params:p,trace:n==='baseline'});rs.push(r);console.log(n,r.totals.maxDelta,r.deltaFlips,r.rateFlips);
}
// Locked-clutch transitions: fixed wheel speeds; account the crank energy jump.
const clutch=[];
for(const rpm of [800,5000]){
 reset({speed:20});state.engine.currentGear='2';state.engine.rpm=rpm;state.engine.clutchPedalPosition=1;state.input.clutchKeyHeld=false;
 const before={rpm:state.engine.rpm,omega:{...state.wheelOmega}};updateEngine(.01);const torque=state.engine.transmittedTorqueNm;const beforeSync={rpm:state.engine.rpm,omega:{...state.wheelOmega}};synchronizeEngineWithWheels();
 clutch.push({before,torque,beforeSync,after:{rpm:state.engine.rpm,omega:{...state.wheelOmega}},energyJump:.5*state.params.engineInertiaKgM2*(state.engine.rpm**2-beforeSync.rpm**2)*(Math.PI*2/60)**2});
}
// Off-engine brake/drag coupling state.
reset({speed:20});state.engine.currentGear='1';state.engine.clutchPedalPosition=1;state.engine.isRunning=false;updateEngine(.01);
const off={locked:state.engine.drivetrainLocked,transmitted:state.engine.transmittedTorqueNm,rpm:state.engine.rpm};
fs.writeFileSync('/workspace/physics-audit/isolation-results.json',JSON.stringify({runs:rs,clutch,off},null,2));
