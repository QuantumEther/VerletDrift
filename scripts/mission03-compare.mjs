import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {reset,state,observe} from '../tests/helpers/numerical-chassis.js';
import {mechanicalStep,delayedSteeringStep} from '../tests/helpers/mechanical-step.js';
import {updateSteering} from '../js/physics/steering.js';
const delayed=process.argv.includes('--delayed');
const result={delayed,revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),platform:{node:process.version,cpu:fs.readFileSync('/proc/cpuinfo','utf8').match(/model name\s*:\s*(.*)/)?.[1]},sourceHashes:{},isolated:[],vehicle:[]};
for(const f of ['steering.js','steering-model.js','engine.js','tires.js','tire-contact.js','tire-model.js','integrator.js','planar-motion.js','suspension.js']){const p=new URL('../js/physics/'+f,import.meta.url);if(fs.existsSync(p))result.sourceHashes[f]=createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
for(const f of ['js/main.js','js/input.js','js/state.js','js/ui/controls.js','js/ui/control-data.js'])result.sourceHashes[f]=createHash('sha256').update(fs.readFileSync(new URL('../'+f,import.meta.url))).digest('hex');
reset();for(let i=0;i<2000;i++)updateSteering(.01);
const rates=[50,100,200,400,800];
for(const hz of rates)for(const scenario of ['chatter','viscous','spring-underdamped','spring-critical','spring-overdamped','torque-reversal','stop','driver-release']){
  if(delayed && (scenario!=='release-moving'||![50,400].includes(hz)))continue;
  if(delayed)continue;
  if(hz===800&&!scenario.startsWith('spring')&&scenario!=='driver-release')continue;
  const p={steeringSelfCenterRate:0,steeringCoulombFriction:0,steeringViscousDamping:0};
  if(scenario==='chatter')Object.assign(p,{steeringSelfCenterRate:5,steeringCoulombFriction:2,steeringViscousDamping:.1});
  if(scenario==='viscous')p.steeringViscousDamping=.3;
  if(scenario.startsWith('spring'))Object.assign(p,{steeringSelfCenterRate:25,steeringViscousDamping:scenario==='spring-underdamped'?.16:scenario==='spring-critical'?.8:2});
  if(scenario==='torque-reversal')p.steeringCoulombFriction=.2;
  reset({params:p});const s=state.steering;s.frontWheelAngle=scenario==='chatter'?.3:scenario.startsWith('spring')?.2:scenario==='stop'?.51:0;s.angularVelocity=scenario==='stop'?5:scenario==='viscous'?1:0;
  const duration=scenario==='chatter'?10:2,dt=1/hz,samples=[],totals={driverWork:0,tireWork:0,viscousWork:0,frictionWork:0,stopWork:0,numericalWork:0,configurationWork:0,residual:0};
  let flips=0,rateFlips=0,sign=Math.sign(s.frontWheelAngle),rsign=Math.sign(s.angularVelocity),maxAngle=Math.abs(s.frontWheelAngle),maxRate=Math.abs(s.angularVelocity),maxTorque=0,cpuMs=0,maxResidual=0;
  for(let i=0;i<duration*hz;i++){
    const t=i/hz,torque=scenario==='torque-reversal'?(t<1?.3:-.3):0;s.selfAligningTorque=-torque;
    s.isDragging=scenario==='driver-release'&&t<.5;if(s.isDragging)s.targetWheelAngle=s.wheelAngle=(t<.25?.15:-.1)/state.params.maxFrontWheelAngle*Math.PI*2.5;
    const start=performance.now();updateSteering(dt);cpuMs+=performance.now()-start;
    const sig=Math.sign(s.frontWheelAngle),rsg=Math.sign(s.angularVelocity);if(Math.abs(s.frontWheelAngle)>1e-6){if(sign&&sig!==sign)flips++;sign=sig;}if(Math.abs(s.angularVelocity)>1e-6){if(rsign&&rsg!==rsign)rateFlips++;rsign=rsg;}
    maxAngle=Math.max(maxAngle,Math.abs(s.frontWheelAngle));maxRate=Math.max(maxRate,Math.abs(s.angularVelocity));maxTorque=Math.max(maxTorque,Math.abs(s.ledger?.frictionTorque??0));
    if(s.ledger){for(const k in totals)totals[k]+=s.ledger[k]??0;maxResidual=Math.max(maxResidual,Math.abs(s.ledger.residual));}
    if(i%Math.max(1,Math.round(hz/100))===0)samples.push({t:(i+1)*dt,angle:s.frontWheelAngle,rate:s.angularVelocity,ledger:s.ledger});
  }
  result.isolated.push({hz,scenario,params:p,angle:s.frontWheelAngle,rate:s.angularVelocity,flips,rateFlips,maxAngle,maxRate,maxTorque,totals,maxResidual,cpuMs,usPerTick:cpuMs*1000/(duration*hz),samples});
}
const controls=JSON.parse(fs.readFileSync(new URL('../docs/physics-recovery/mission-01/audited-controls.json',import.meta.url),'utf8'));
for(const hz of rates)for(const scenario of ['release-low','release-moving','reverse','countersteer','drift','sleep-wake','rest','zero-capacity-recontact']){
  if(delayed && (scenario!=='release-moving'||![50,400].includes(hz)))continue;
  if(hz===800&&!['release-low','release-moving','countersteer'].includes(scenario))continue;
  const dt=1/hz,speed=scenario==='release-low'?1:scenario==='sleep-wake'?.01:scenario==='reverse'?-8:scenario==='rest'?0:25;
  reset({dt,vy:-speed,vx:scenario==='drift'?8:0,omega:scenario==='drift'?.7:0,center:1000,params:controls});state.engine.currentGear='N';state.engine.clutchEngagement=0;
  const s=state.steering;s.frontWheelAngle=scenario==='release-low'?.01:scenario==='rest'?.3:.08;s.wheelAngle=s.frontWheelAngle/state.params.maxFrontWheelAngle*Math.PI*2.5;
  for(const name of Object.keys(state.wheelOmega))state.wheelOmega[name]=speed/state.params.wheelRadius;
  let maxSubsteps=0,sumSubsteps=0,maxEvals=0,sumEvals=0,sumAttemptedEvaluations=0,sumIterations=0,sumRejected=0,maxAttemptedEvaluations=0,maxTickMs=0,maxAngle=0,maxRate=0,maxSat=0,maxResidual=0,flips=0,sign=Math.sign(s.frontWheelAngle),cpuMs=0;const times=[],samples=[],work={driverWork:0,tireWork:0,frictionWork:0,viscousWork:0,stopWork:0,numericalWork:0,residual:0};
  const duration=['rest','release-low'].includes(scenario)?10:3;
  for(let i=0;i<duration*hz;i++){
    const t=i*dt;s.isDragging=scenario==='countersteer';if(s.isDragging)s.targetWheelAngle=s.wheelAngle=(t<1?.22:-.22)/state.params.maxFrontWheelAngle*Math.PI*2.5;
    if(scenario==='sleep-wake'){s.isDragging=t>=1&&t<2;if(s.isDragging)s.targetWheelAngle=s.wheelAngle=.1/state.params.maxFrontWheelAngle*Math.PI*2.5;state.input.throttleKeyHeld=t>=2;}
    // Zero contact capacity isolates loss/re-establishment of the SAT path.
    // Actual normal-load removal is covered by the tire unloading tests.
    if(scenario==='zero-capacity-recontact')state.params.tireFrictionCoeff=t>=1&&t<1.5?0:controls.tireFrictionCoeff;
    const start=performance.now();(delayed?delayedSteeringStep:mechanicalStep)(dt);const ms=performance.now()-start;times.push(ms);cpuMs+=ms;maxTickMs=Math.max(maxTickMs,ms);
    const solve=state.tireContactSolve;maxSubsteps=Math.max(maxSubsteps,solve.substeps);sumSubsteps+=solve.substeps;maxEvals=Math.max(maxEvals,solve.evaluations);sumEvals+=solve.evaluations;sumAttemptedEvaluations+=solve.attemptedEvaluations??0;sumIterations+=solve.nonlinearIterations??0;sumRejected+=solve.rejectedIntervals??0;maxAttemptedEvaluations=Math.max(maxAttemptedEvaluations,solve.attemptedEvaluations??0);
    maxAngle=Math.max(maxAngle,Math.abs(s.frontWheelAngle));maxRate=Math.max(maxRate,Math.abs(s.angularVelocity));maxSat=Math.max(maxSat,Math.abs(s.selfAligningTorque));
    if(Math.abs(s.frontWheelAngle)>1e-6){const sg=Math.sign(s.frontWheelAngle);if(sign&&sg!==sign)flips++;sign=sg;}
    if(s.ledger){for(const k in work)work[k]+=s.ledger[k]??0;maxResidual=Math.max(maxResidual,Math.abs(s.ledger.residual));}
    if(i%Math.max(1,Math.round(hz/25))===0)samples.push({t:(i+1)*dt,angle:s.frontWheelAngle,rate:s.angularVelocity,sat:s.selfAligningTorque,speed:state.body.speed,yaw:state.body.angularVelocity,substeps:solve.substeps});
  }
  times.sort((a,b)=>a-b);result.vehicle.push({hz,scenario,final:{...observe(),steer:s.frontWheelAngle,steerRate:s.angularVelocity},flips,maxAngle,maxRate,maxSat,maxResidual,work,maxSubsteps,sumSubsteps,maxEvals,sumEvals,sumAttemptedEvaluations,sumIterations,sumRejected,maxAttemptedEvaluations,cpuMs,maxTickMs,p50TickMs:times[Math.floor(times.length*.5)],p95TickMs:times[Math.floor(times.length*.95)],samples});
  fs.writeFileSync('/tmp/mission03-progress.json',JSON.stringify(result));
  process.stderr.write(`${scenario} ${hz} Hz: ${cpuMs.toFixed(0)} ms; max ${maxSubsteps} contact steps\n`);
}
fs.writeFileSync(process.argv[2]??'/tmp/mission03-results.json',JSON.stringify(result,null,2)+'\n');
