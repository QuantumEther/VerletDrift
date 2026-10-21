// Run alone on each source snapshot; no rendering. Hardware-dependent timings.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {reset,state} from '../tests/helpers/numerical-chassis.js';
import {mechanicalStep} from '../tests/helpers/mechanical-step.js';
import {updateSteering} from '../js/physics/steering.js';
const report={revision:process.argv[3]??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,cpu:fs.readFileSync('/proc/cpuinfo','utf8').match(/model name\s*:\s*(.*)/)?.[1],sourceHashes:{},column:[],vehicle:[]};
for(const f of ['js/main.js','js/physics/steering.js','js/physics/tire-contact.js','js/physics/tires.js'])report.sourceHashes[f]=createHash('sha256').update(fs.readFileSync(new URL('../'+f,import.meta.url))).digest('hex');
const controls=JSON.parse(fs.readFileSync(new URL('../docs/physics-recovery/mission-01/audited-controls.json',import.meta.url)));
for(const driven of [false,true]){
 reset({params:controls});state.steering.isDragging=driven;state.steering.targetWheelAngle=state.steering.wheelAngle=1;
 for(let i=0;i<5000;i++)updateSteering(.01);
 const batches=[];for(let repeat=0;repeat<5;repeat++){const start=performance.now();for(let i=0;i<20000;i++)updateSteering(.01);batches.push((performance.now()-start)*1000/20000);}
 report.column.push({driven,microsecondsPerUpdate:batches});
}
// Warm module/JIT on independent neutral straight motion, not timed fixtures.
reset({vy:-20,params:controls});state.engine.currentGear='N';for(const n of Object.keys(state.wheelOmega))state.wheelOmega[n]=20/.35;for(let i=0;i<50;i++)mechanicalStep(.01);
for(const hz of [50,100,200,400])for(const scenario of ['release','rapid-countersteer']){
 const dt=1/hz;reset({vy:-25,dt,params:controls});state.engine.currentGear='N';state.engine.clutchEngagement=0;
 const s=state.steering;s.frontWheelAngle=.08;s.wheelAngle=.08/state.params.maxFrontWheelAngle*Math.PI*2.5;
 for(const n of Object.keys(state.wheelOmega))state.wheelOmega[n]=25/.35;
 const milliseconds=[],ticks=Math.round(.8*hz);let maxSubsteps=0,substeps=0,evaluations=0,iterations=0,attempted=0,rejected=0;
 for(let i=0;i<ticks;i++){
  s.isDragging=scenario==='rapid-countersteer';if(s.isDragging)s.targetWheelAngle=s.wheelAngle=(i*dt<.4?.22:-.22)/state.params.maxFrontWheelAngle*Math.PI*2.5;
  const start=performance.now();mechanicalStep(dt);milliseconds.push(performance.now()-start);
  const r=state.tireContactSolve;substeps+=r.substeps;maxSubsteps=Math.max(maxSubsteps,r.substeps);evaluations+=r.evaluations;attempted+=r.attemptedEvaluations??0;iterations+=r.nonlinearIterations??0;rejected+=r.rejectedIntervals??0;
 }
 const sorted=[...milliseconds].sort((a,b)=>a-b),wallMs=milliseconds.reduce((a,b)=>a+b,0);
 report.vehicle.push({hz,scenario,ticks,simulatedSeconds:ticks*dt,wallMs,meanTickMs:wallMs/ticks,p50TickMs:sorted[Math.floor(ticks*.5)],p95TickMs:sorted[Math.floor(ticks*.95)],worstTickMs:Math.max(...milliseconds),maxSubsteps,substeps,acceptedEvaluations:evaluations,attemptedEvaluations:attempted,nonlinearIterations:iterations,rejectedIntervals:rejected,simulatedSecondsPerWallSecond:1000*ticks*dt/wallMs,finalAngle:s.frontWheelAngle,finalYaw:state.body.angularVelocity,milliseconds});
 process.stderr.write(`${scenario} ${hz} Hz: ${wallMs.toFixed(1)} ms; peak ${maxSubsteps} accepted steps\n`);
}
fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
