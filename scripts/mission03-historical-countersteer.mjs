// Exact Mission 02 countersteer setup, including its former 1,016-step tick.
import fs from 'node:fs';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';import {reset,state,observe} from '../tests/helpers/numerical-chassis.js';import {mechanicalStep} from '../tests/helpers/mechanical-step.js';
const report={revision:process.argv[3]??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceHashes:{},settings:{vx:5,vy:-18,yaw:.5,center:1000,targetBefore:.22,targetAfter:-.22,reversalTime:1.5,duration:3},runs:[]};
for(const p of ['js/main.js','js/physics/steering.js','js/physics/tire-contact.js','js/physics/tires.js'])report.sourceHashes[p]=createHash('sha256').update(fs.readFileSync(new URL('../'+p,import.meta.url))).digest('hex');
const controls=JSON.parse(fs.readFileSync(new URL('../docs/physics-recovery/mission-01/audited-controls.json',import.meta.url)));
for(const hz of [50,100,200,400]){
 const dt=1/hz;reset({dt,vx:5,vy:-18,omega:.5,center:1000,params:controls});state.engine.currentGear='N';state.engine.clutchEngagement=0;
 const s=state.steering;s.frontWheelAngle=.22;s.wheelAngle=.22/state.params.maxFrontWheelAngle*Math.PI*2.5;
 for(const [name,w]of Object.entries(state.wheels))state.wheelOmega[name]=(18-.5*(w.x-state.body.centerX))/state.params.wheelRadius;
 let wallMs=0,maxTickMs=0,maxSteps=0,steps=0,attempted=0,iterations=0,rejected=0,maxRate=0,maxYaw=0,maxResidual=0;const samples=[];
 for(let i=0;i<3*hz;i++){
  const t=i*dt;s.isDragging=true;s.targetWheelAngle=s.wheelAngle=(t<1.5?.22:-.22)/state.params.maxFrontWheelAngle*Math.PI*2.5;
  const start=performance.now();mechanicalStep(dt);const elapsed=performance.now()-start;wallMs+=elapsed;maxTickMs=Math.max(maxTickMs,elapsed);
  const c=state.tireContactSolve;maxSteps=Math.max(maxSteps,c.substeps);steps+=c.substeps;attempted+=c.attemptedEvaluations??0;iterations+=c.nonlinearIterations??0;rejected+=c.rejectedIntervals??0;
  maxRate=Math.max(maxRate,Math.abs(s.angularVelocity));maxYaw=Math.max(maxYaw,Math.abs(state.body.angularVelocity));maxResidual=Math.max(maxResidual,Math.abs(s.ledger?.residual??0));
  if(i%Math.round(hz/10)===0)samples.push({t:(i+1)*dt,angle:s.frontWheelAngle,rate:s.angularVelocity,yaw:state.body.angularVelocity,steps:c.substeps,sat:s.selfAligningTorque});
  if(![state.body.speed,state.body.angularVelocity,s.frontWheelAngle,s.angularVelocity].every(Number.isFinite))throw Error('Nonfinite historical countersteer');
 }
 report.runs.push({hz,wallMs,maxTickMs,maxSteps,steps,attemptedEvaluations:attempted,nonlinearIterations:iterations,rejectedIntervals:rejected,maxRate,maxYaw,maxResidual,final:observe(),finalAngle:s.frontWheelAngle,samples});
 process.stderr.write(`${hz} Hz: peak ${maxSteps} accepted steps, ${wallMs.toFixed(1)} ms\n`);
}
fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
