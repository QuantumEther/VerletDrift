import {writeFile} from 'node:fs/promises';import {gzipSync} from 'node:zlib';import os from 'node:os';import {performance} from 'node:perf_hooks';
import {createVehicle,stepVehicle} from '../src/vehicle.js';import {engineTorques,ENGINE} from '../src/engine.js';import {linkage,steeringGeometry} from '../src/steering.js';import {brakeActuation} from '../src/brakes.js';import {engageDogs} from '../src/gearbox.js';
const results={sourceCommit:'7fca4a488306b7aad44e7202ce7d1f987b248fba',runtime:process.version,cpu:os.cpus()[0].model,logicalCPUs:os.cpus().length,units:'SI; rpm explicitly labelled',clock:'fixed simulation h; CPU timings measured separately',cases:[]};
const record=s=>({time:s.time,engineOmega:s.flywheel.omega,rpm:s.flywheel.omega*60/(2*Math.PI),engineMode:s.engine?.mode||'prescribed torque',throttle:s.engine?.throttle,engineTorque:s.engine?.netTorque,combustion:s.engine?.combustion,friction:s.engine?.friction,pumping:s.engine?.pumping,engineWork:s.engine?{combustion:s.engine.combustionWork,starter:s.engine.starterWork,loss:s.engine.lossWork}:null,
 u:s.v,v:s.planar.v,yaw:s.planar.r,heading:s.planar.heading,pitch:s.pitch,steering:s.steering?{column:s.steering.wheelAngle,left:s.steering.leftAngle,right:s.steering.rightAngle}:null,
 wheels:s.wheels.map(w=>({omega:w.omega,angle:w.angle,fx:w.fx,fy:w.fy,normal:w.normal,slipX:w.slipX,slipY:w.slipY,brake:w.brake,capacity:w.brakeCapacity,mode:w.contactMode})),contact:s.planar.contact});
function run(s,seconds,ports,h=.001,trace){for(let i=0;i<Math.round(seconds/h);i++){stepVehicle(s,ports,h);if(trace&&i%100===0)trace.push(record(s));}return s;}
for(const h of [.001,.0005,.00025]){
 const s=createVehicle({automobile:true,mode:'open'}),trace=[];run(s,2,{starter:true},h,trace);run(s,4,{},h,trace);const warm=record(s);run(s,2,{throttle:1},h,trace);const rev=record(s);run(s,1,{},h,trace);const closed=record(s);
 results.cases.push({id:'engine-start-idle-rev-close',h,warm,rev,closed,trace});
}
let lo=22,hi=100;for(let i=0;i<60;i++){let m=(lo+hi)/2;if(engineTorques(m,0,true).netTorque>0)lo=m;else hi=m;}
results.idleEquilibrium={omega:lo,rpm:lo*60/(2*Math.PI),residual:engineTorques(lo,0,true).netTorque,torques:engineTorques(lo,0,true),parameters:ENGINE};
const original=createVehicle();run(original,2,{drive:20});results.previousTorqueFixture={h:.001,seconds:2,drive:20,result:record(original),equation:'No combustion/loss ports: J*omegaDot=20-clutch; omega is not speed governed.'};
for(const hand of [0,1])for(const direction of [-1,1]){
 const s=createVehicle({automobile:true,mode:'open'}),trace=[];s.v=8;s.wheels.forEach(w=>w.omega=25);
 run(s,.5,{steer:.2*direction},.001,trace);run(s,1.5,{steer:.2*direction,handbrake:hand},.001,trace);
 results.cases.push({id:`steer-${direction}-hand-${hand}`,h:.001,handAppliedAt:.5,result:record(s),trace});
}
results.steering=Array.from({length:15},(_,i)=>{const column=i-7,q=linkage(column),inner=Math.max(Math.abs(q.leftAngle),Math.abs(q.rightAngle)),outer=Math.min(Math.abs(q.leftAngle),Math.abs(q.rightAngle));return {column,left:q.leftAngle,right:q.rightAngle,tieLength:q.tieLength,dragLength:q.dragLength,idealOuter:inner>1e-8?Math.atan(1/(1/Math.tan(inner)+1.2/2)):0,outerError:inner>1e-8?outer-Math.atan(1/(1/Math.tan(inner)+1.2/2)):0};});results.steeringGeometry=steeringGeometry();results.brakes={released:brakeActuation(),service:brakeActuation(1,0),hand:brakeActuation(0,1),both:brakeActuation(1,1)};
// Independent measured work units: master 1 ms ticks, including stage trials.
// Warm each workload for 500 ticks, then time 2000 ticks. No rendering or I/O.
results.performance=[];
for(const automobile of [false,true])for(const scenario of ['neutral','steer','handbrake']){
 const s=createVehicle({automobile,mode:'open'});s.v=8;s.wheels.forEach(w=>w.omega=25);if(automobile){s.flywheel.omega=lo;s.engine.mode='running';}
 const ports=scenario==='neutral'?{}:scenario==='steer'?{steer:.2}:{steer:.2,handbrake:1};
 run(s,.5,ports);const times=[];let maxIterations=0,maxResidual=0,maxForceError=0,rejected=0;
 for(let i=0;i<2000;i++){const t=performance.now();try{stepVehicle(s,ports);}catch(e){rejected++;throw e;}times.push(performance.now()-t);maxIterations=Math.max(maxIterations,s.gearbox.lastStepCases);maxResidual=Math.max(maxResidual,Math.abs(s.planar.contact.energyResidual));maxForceError=Math.max(maxForceError,s.planar.contact.forceLawResidual);}
 times.sort((a,b)=>a-b);const mean=times.reduce((a,b)=>a+b)/times.length;results.performance.push({automobile,scenario,warmupSteps:500,steps:times.length,h:.001,meanMs:mean,medianMs:times[1000],p95Ms:times[1900],p99Ms:times[1980],worstMs:times.at(-1),stepsPerWallSecond:1000/mean,maxIterations,maxEnergyResidualJ:maxResidual,maxForceErrorN:maxForceError,rejected});
}
const traces=results.cases.filter(c=>c.trace).map(c=>({id:c.id,h:c.h,trace:c.trace}));for(const c of results.cases){delete c.trace;c.traceFile='living-automobile-traces.json.gz';}
await writeFile(new URL('../results/living-automobile-traces.json.gz',import.meta.url),gzipSync(JSON.stringify({units:results.units,cases:traces})));
await writeFile(new URL('../results/living-automobile-experiments.json',import.meta.url),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify({idle:results.idleEquilibrium,engineRefinement:results.cases.filter(c=>c.id.startsWith('engine')).map(c=>({h:c.h,warm:c.warm.rpm,rev:c.rev.rpm,closed:c.closed.rpm})),steeringMaxError:Math.max(...results.steering.map(s=>Math.abs(s.outerError))),performance:results.performance}));
