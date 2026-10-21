import fs from 'node:fs';
import state from '/workspace/VerletDrift/js/state.js';
import {initializeCarBody,computeBodyDerivedState,updateSuspension,computeTireForces,computeDragForces,updateSteering,updateEngine,synchronizeEngineWithWheels,verletIntegrateAllPoints,solveRigidBodyConstraints,clampParticleDisplacements,handleBoundaryCollisions,applySleepIfNeeded} from '/workspace/VerletDrift/js/physics/index.js';
import {CAR_HALF_LENGTH,CAR_HALF_WIDTH} from '/workspace/VerletDrift/js/constants.js';
import {PRESETS} from '/workspace/VerletDrift/js/ui/presets.js';
const dir='/workspace/physics-audit';
const initial=structuredClone(state);
const ui=JSON.parse(fs.readFileSync(dir+'/browser-defaults.json','utf8'));
const names=Object.keys(state.wheels);
const inertia=()=>state.params.carMassKg*(CAR_HALF_LENGTH**2+CAR_HALF_WIDTH**2)/3;
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
function snapshot(dt){
 const w=state.wheels; const heading=(prev=false)=>{const x=prev?'prevX':'x',y=prev?'prevY':'y';return Math.atan2(w.frontLeft[y]+w.frontRight[y]-w.rearLeft[y]-w.rearRight[y],w.frontLeft[x]+w.frontRight[x]-w.rearLeft[x]-w.rearRight[x])+Math.PI/2};
 const vx=names.reduce((a,n)=>a+(w[n].x-w[n].prevX)/dt,0)/4,vy=names.reduce((a,n)=>a+(w[n].y-w[n].prevY)/dt,0)/4;
 const wh=wrap(heading()-heading(true))/dt;
 return {vx,vy,wh,k:.5*state.params.carMassKg*(vx*vx+vy*vy)+.5*inertia()*wh*wh};
}
// Execute the exact production vehicle-dynamics prefix, with read-only stage hooks.
const main=fs.readFileSync('/workspace/VerletDrift/js/main.js','utf8');
const begin=main.indexOf('function runPhysicsStep(dt) {')+'function runPhysicsStep(dt) {'.length;
let prefix=main.slice(begin,main.indexOf('  // 16. Camera:',begin));
prefix=prefix.replace('  verletIntegrateAllPoints(dt, netLinearAccelX, netLinearAccelY, netAngularAccel);','  const beforeIntegration=snapshot(dt);\n  verletIntegrateAllPoints(dt, netLinearAccelX, netLinearAccelY, netAngularAccel);\n  const afterIntegration=snapshot(dt);');
prefix=prefix.replace('  solveRigidBodyConstraints();','  solveRigidBodyConstraints();\n  const afterConstraint1=snapshot(dt);');
prefix=prefix.replace('  clampParticleDisplacements();','  clampParticleDisplacements();\n  const afterClamp=snapshot(dt);');
prefix=prefix.replace('  handleBoundaryCollisions();','  handleBoundaryCollisions();\n  const afterBoundary=snapshot(dt);');
prefix=prefix.replace('  applySleepIfNeeded();','  const beforeSleep=snapshot(dt);\n  applySleepIfNeeded();\n  const afterSleep=snapshot(dt);');
const step=eval('(dt)=>{'+prefix+'\nreturn {tireForces,dragForces,yawDampingTorque,beforeIntegration,afterIntegration,afterConstraint1,afterClamp,afterBoundary,beforeSleep,afterSleep};}');
function reset({dt=.01,speed=0,lateral=0,yaw=0,delta=0,params={},preset}={}){
 Object.assign(state,structuredClone(initial));Object.assign(state.params,ui,preset?PRESETS[preset].params:{},params,{mapWidth:100000,mapHeight:100000});
 initializeCarBody(50000,50000);
 for(const wheel of Object.values(state.wheels)){
 const x=wheel.x-50000,y=wheel.y-50000,a=-yaw*dt;
 wheel.prevX=50000+Math.cos(a)*x-Math.sin(a)*y-lateral*dt;
 wheel.prevY=50000+Math.sin(a)*x+Math.cos(a)*y+speed*dt;
 }
 state.body.heading=-yaw*dt;computeBodyDerivedState(dt);
 Object.assign(state.body,{longitudinalAccel:0,lateralAccel:0,accelX:0,accelY:0,prevAccelX:0,prevAccelY:0});
 state.steering.frontWheelAngle=delta;state.steering.wheelAngle=delta/state.params.maxFrontWheelAngle*Math.PI*2.5;
 for(const n of names){const w=state.wheels[n];const vx=state.body.velocityX-yaw*(w.y-state.body.centerY),vy=state.body.velocityY+yaw*(w.x-state.body.centerX);state.wheelOmega[n]=(vx*Math.sin(n.startsWith('front')?delta:0)-vy*Math.cos(n.startsWith('front')?delta:0))/state.params.wheelRadius;}
}
function record(t){const b=state.body,s=state.steering;return {t,v:b.speed,vx:b.velocityX,vy:b.velocityY,heading:b.heading,yaw:b.angularVelocity,beta:Math.atan2(b.velocityX*Math.cos(b.heading)+b.velocityY*Math.sin(b.heading),b.velocityX*Math.sin(b.heading)-b.velocityY*Math.cos(b.heading)),delta:s.frontWheelAngle,rate:s.angularVelocity,sat:s.selfAligningTorque,loads:{...state.wheelLoads},omega:{...state.wheelOmega},slip:{...state.wheelSlipRatio},alpha:{...state.wheelSlipAngle},forces:structuredClone(state.wheelForces),suspension:structuredClone(state.suspension),energy:.5*state.params.carMassKg*b.speed**2+.5*inertia()*b.angularVelocity**2,wheelEnergy:names.reduce((s,n)=>s+.5*state.params.wheelInertia*state.wheelOmega[n]**2,0)};}
function run(name,options={},input=()=>{}){
 const dt=options.dt??.01,duration=options.duration??5;reset({...options,dt});
 const samples=[record(0)],totals={tireWork:0,dragWork:0,yawWork:0,yawImpulse:0,tireYawImpulse:0,projectionDeltaK:0,clampDeltaK:0,sleepDeltaK:0,linearImpulseResidual:0,yawImpulseResidual:0,maxHistoryYawMismatch:0,maxDelta:0,maxRate:0,maxYaw:0,maxBeta:0,minLoad:Infinity,maxCorrection:0,positivePatchWork:0,patchWork:0};
 let deltaSign=0,rateSign=0,deltaFlips=0,rateFlips=0;
 const trace=[];
 for(let i=0;i<Math.round(duration/dt);i++){
 const t=i*dt;input(t,dt);const old=record(t);const out=step(dt);const next=record((i+1)*dt);
 const vx=(old.vx+next.vx)/2,vy=(old.vy+next.vy)/2,wy=(old.yaw+next.yaw)/2;
 totals.tireWork+=(out.tireForces.forceX*vx+out.tireForces.forceY*vy+out.tireForces.torque*wy)*dt;
 totals.dragWork+=(out.dragForces.forceX*vx+out.dragForces.forceY*vy)*dt;
 totals.yawWork+=out.yawDampingTorque*wy*dt;totals.yawImpulse+=out.yawDampingTorque*dt;totals.tireYawImpulse+=out.tireForces.torque*dt;
 totals.projectionDeltaK+=out.afterConstraint1.k-out.afterIntegration.k+out.beforeSleep.k-out.afterBoundary.k;
 totals.clampDeltaK+=out.afterClamp.k-out.afterConstraint1.k;totals.sleepDeltaK+=out.afterSleep.k-out.beforeSleep.k;
 totals.yawImpulseResidual+=inertia()*(next.yaw-old.yaw)-(out.tireForces.torque+out.yawDampingTorque)*dt;
 totals.linearImpulseResidual=Math.max(totals.linearImpulseResidual,Math.hypot(state.params.carMassKg*(next.vx-old.vx)-(out.tireForces.forceX+out.dragForces.forceX)*dt,state.params.carMassKg*(next.vy-old.vy)-(out.tireForces.forceY+out.dragForces.forceY)*dt));
 totals.maxHistoryYawMismatch=Math.max(totals.maxHistoryYawMismatch,Math.abs(next.yaw-out.beforeSleep.wh));
 for(const n of names){const f=state.wheelForces[n],k=state.wheelKinematics[n];const power=f.fx*(k.wheelVelX-state.params.wheelRadius*state.wheelOmega[n]*k.wheelForwardX)+f.fy*(k.wheelVelY-state.params.wheelRadius*state.wheelOmega[n]*k.wheelForwardY);totals.patchWork+=power*dt;totals.positivePatchWork+=Math.max(0,power)*dt;}
 for(const [value,key] of [[next.delta,'maxDelta'],[next.rate,'maxRate'],[next.yaw,'maxYaw'],[next.beta,'maxBeta']])totals[key]=Math.max(totals[key],Math.abs(value));
 totals.minLoad=Math.min(totals.minLoad,...Object.values(state.wheelLoads));totals.maxCorrection=Math.max(totals.maxCorrection,state.debug.metrics.constraintMaxCorr);
 if(Math.abs(next.delta)>1e-6){if(deltaSign&&deltaSign!==Math.sign(next.delta))deltaFlips++;deltaSign=Math.sign(next.delta);}
 if(Math.abs(next.rate)>1e-6){if(rateSign&&rateSign!==Math.sign(next.rate))rateFlips++;rateSign=Math.sign(next.rate);}
 if(i%Math.max(1,Math.round(.1/dt))===0||i===Math.round(duration/dt)-1)samples.push(next);
 if(options.trace)trace.push({...next,torque:{sat:-old.sat,spring:-old.delta*state.params.steeringSelfCenterRate*(1-Math.min(old.v/3,1))*state.params.steeringColumnInertia,actual:state.params.steeringColumnInertia*(next.rate-old.rate)/dt,implicitViscous:-state.params.steeringViscousDamping*next.rate}});
 if(!Number.isFinite(next.energy))throw Error(name+' nonfinite');
 }
 const output={name,options,initial:samples[0],final:samples.at(-1),totals,deltaFlips,rateFlips,samples};
 if(options.trace)fs.writeFileSync(dir+'/'+name+'-trace.json',JSON.stringify(trace));
 return output;
}
if (!process.env.AUDIT_LIBRARY) {
const cases=[];
const add=(...args)=>{const r=run(...args);cases.push(r);console.log(r.name,JSON.stringify({v:r.final.v,yaw:r.final.yaw,delta:r.final.delta,maxDelta:r.totals.maxDelta,deltaFlips:r.deltaFlips,rateFlips:r.rateFlips}));};
add('stationary-zero',{duration:10,trace:true});
add('stationary-small',{delta:.01,duration:10,trace:true});
add('stationary-large',{delta:.3,duration:10,trace:true});
add('stationary-drift-preset',{delta:.3,preset:'driftCar',duration:10,trace:true});
add('stationary-coarse',{delta:.3,dt:.1,duration:10,trace:true});
add('stationary-coulomb-high',{delta:.3,params:{steeringCoulombFriction:2,steeringViscousDamping:.1},duration:10,trace:true});
add('stationary-residual-sat',{duration:3,trace:true},t=>{if(t===0)state.steering.selfAligningTorque=50;});
for(const dt of [.02,.01,.005,.0025])for(const d of [0,1])add(`free-yaw-${dt}-${d}`,{dt,yaw:2,params:{tireFrictionCoeff:0,rollingResistanceCoeff:0,aeroDragCoeff:0,yawDamping:d}});
for(const it of [1,4,12])for(const cd of [.05,.85,1])add(`constraints-${it}-${cd}`,{yaw:2,params:{tireFrictionCoeff:0,rollingResistanceCoeff:0,aeroDragCoeff:0,yawDamping:0,constraintIterations:it,constraintDamping:cd}});
add('coast-default',{speed:20});
add('coast-force-free',{speed:20,params:{tireFrictionCoeff:0,rollingResistanceCoeff:0,aeroDragCoeff:0,yawDamping:0}});
const command=angle=>{state.steering.isDragging=true;state.steering.wheelAngle=angle/state.params.maxFrontWheelAngle*Math.PI*2.5;};
for(const d of [0,1,5])add('steering-step-yawdamp-'+d,{speed:30,duration:6,params:{yawDamping:d}},t=>command(t>=.5&&t<1.5?.3:0));
add('steering-free-return',{speed:30,duration:6,trace:true},t=>{if(t<1.5)command(t>=.5?.3:0);else state.steering.isDragging=false;});
add('cornering',{speed:30,duration:6},t=>command(t>=.5?.16:0));
for(const dt of [.02,.01,.005,.0025])add('steering-refine-'+dt,{speed:30,dt,duration:3},t=>command(t>=.5?.16:0));
for(const d of [0,1])add('handbrake-'+d,{speed:25,duration:6,params:{yawDamping:d}},t=>{command(t>=.5?.16:0);state.input.handbrakeKeyHeld=t>=1&&t<2;});
for(const d of [0,1])add('low-friction-'+d,{speed:20,lateral:10,yaw:1,duration:6,params:{tireFrictionCoeff:.1,yawDamping:d}},()=>command(0));
for(const lift of [false,true])add('lift-off-'+lift,{speed:20,duration:6},t=>{command(t>=.5?.16:0);state.engine.currentGear='3';state.engine.clutchPedalPosition=1;state.input.throttleKeyHeld=!lift||t<2;});
add('speed-clamp',{speed:90,duration:.1,params:{tireFrictionCoeff:0,rollingResistanceCoeff:0,aeroDragCoeff:0,yawDamping:0}});
// In-place timestep change using the unmodified history update.
reset({speed:20});const before=record(0);step(.005);const after=record(.005);
fs.writeFileSync(dir+'/timestep-change.json',JSON.stringify({before,after},null,2));
fs.writeFileSync(dir+'/results.json',JSON.stringify(cases,null,2));

}
export {state,reset,step,record,run,snapshot};
