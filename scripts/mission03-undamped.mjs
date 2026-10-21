// Quantify numerical damping separately from mechanical damping.
import fs from 'node:fs';import {reset,state} from '../tests/helpers/numerical-chassis.js';import {updateSteering} from '../js/physics/steering.js';import {mechanicalStep} from '../tests/helpers/mechanical-step.js';
const results=[];
for(const coupled of [false,true])for(const hz of [50,100,200,400]){
 reset({dt:1/hz,params:{steeringSelfCenterRate:25,steeringViscousDamping:0,steeringCoulombFriction:0,tireFrictionCoeff:0,yawDamping:0,rollingResistanceCoeff:0,aeroDragCoeff:0}});
 state.engine.currentGear='N';state.engine.clutchEngagement=0;state.steering.frontWheelAngle=.2;
 let numericalWork=0,maxResidual=0,maxSubsteps=0;
 for(let i=0;i<2*hz;i++){(coupled?mechanicalStep:updateSteering)(1/hz);numericalWork+=state.steering.ledger.numericalWork;maxResidual=Math.max(maxResidual,Math.abs(state.steering.ledger.residual));if(coupled)maxSubsteps=Math.max(maxSubsteps,state.tireContactSolve.substeps);}
 const a=state.steering.frontWheelAngle,w=state.steering.angularVelocity,energy=.04*w*w+a*a;
 results.push({coupled,hz,angle:a,rate:w,initialEnergy:.04,energy,retention:energy/.04,numericalWork,maxResidual,maxSubsteps,angleError:a-.2*Math.cos(10),rateError:w+Math.sin(10),singleStepBEAnalyticRetention:(1+25/hz**2)**(-2*hz)});
}
fs.writeFileSync(process.argv[2],JSON.stringify(results,null,2)+'\n');
