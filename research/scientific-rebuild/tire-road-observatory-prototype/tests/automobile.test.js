import test from 'node:test';import assert from 'node:assert/strict';
import {createVehicle,stepVehicle} from '../src/vehicle.js';
import {engineTorques,ENGINE} from '../src/engine.js';
import {linkage,steeringGeometry} from '../src/steering.js';
import {brakeActuation,BRAKE_MECHANISM as B} from '../src/brakes.js';
import {engageDogs} from '../src/gearbox.js';
const close=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function run(s,t,ports={},h=.001){for(let i=0;i<Math.round(t/h);i++)stepVehicle(s,ports,h);return s;}
function started(h=.001){const s=createVehicle({automobile:true,mode:'open'});run(s,2,{starter:true},h);assert.equal(s.engine.mode,'running');return s;}
test('carburetor stop has a stable idle torque equilibrium, not an RPM floor',()=>{
 let lo=22,hi=100;for(let i=0;i<60;i++){let m=(lo+hi)/2;if(engineTorques(m,0,true).netTorque>0)lo=m;else hi=m;}
 close(lo,68.46575630623933,1e-10);assert.ok(engineTorques(lo-1,0,true).netTorque>0);assert.ok(engineTorques(lo+1,0,true).netTorque<0);
 const s=started();s.flywheel.omega=lo;run(s,1);close(s.flywheel.omega,lo,1e-8);s.flywheel.omega=lo-1;run(s,.2);assert.ok(s.flywheel.omega>lo-1&&s.flywheel.omega<lo);assert.ok(s.engine.lossWork>0);assert.ok(s.engine.combustionWork>0);
});
test('starter is finite torque; throttle alone cannot restart; ignition removes combustion',()=>{
 const s=createVehicle({automobile:true});run(s,.5,{throttle:1});close(s.flywheel.omega,0);assert.equal(s.engine.mode,'stopped');
 stepVehicle(s,{starter:true});assert.ok(s.flywheel.omega>0&&s.flywheel.omega<.03);run(s,2,{starter:true});assert.equal(s.engine.mode,'running');
 const before=s.flywheel.omega;s.engine.ignition=false;run(s,5,{throttle:1});assert.equal(s.engine.mode,'stopped');assert.equal(s.engine.combustion,0);assert.ok(s.flywheel.omega>=0&&s.flywheel.omega<before);
});
test('accelerator produces speed-dependent torque; closed throttle brakes; inertia stays unique',()=>{
 const s=started();const idle=s.flywheel.omega;run(s,2,{throttle:1});assert.ok(s.flywheel.omega>idle+100);assert.notEqual(engineTorques(70,1,true).netTorque,engineTorques(200,1,true).netTorque);
 const fast=s.flywheel.omega;run(s,1);assert.ok(s.flywheel.omega<fast);assert.ok(s.engine.netTorque<0);close(s.flywheel.inertia,.3);
 for(const omega of [-100,-.01,0,.01,100]){const q=engineTorques(omega,0,false);assert.ok((q.friction+q.pumping)*omega>=0);}
});
test('excessive locked-drivetrain brake load stalls; held throttle is not a restart action',()=>{
 const s=started();s.gearbox.q=.025;engageDogs(s,'1');s.flywheel.engagement=1;run(s,3,{serviceBrake:1});assert.equal(s.engine.mode,'stalled');assert.ok(Math.abs(s.flywheel.omega)<1e-7);
 run(s,.2,{throttle:1,serviceBrake:1});assert.equal(s.engine.mode,'stalled');assert.ok(Math.abs(s.flywheel.omega)<1e-7);
 s.flywheel.engagement=0;run(s,2,{starter:true});assert.equal(s.engine.mode,'running');
});
test('wheel/clutch back-driving can start with ignition; engine-off coasting cannot create combustion',()=>{
 for(const ignition of [true,false]){const s=createVehicle({automobile:true,mode:'open'});s.engine.ignition=ignition;s.v=8;s.wheels.forEach(w=>w.omega=8/w.radius);s.gearbox.q=.025;engageDogs(s,'1');s.flywheel.engagement=1;run(s,.5);assert.ok(s.flywheel.omega>20);assert.equal(s.engine.mode,ignition?'running':'stopped');if(!ignition)assert.equal(s.engine.combustion,0);}
});
test('hydraulic chain, shoe springs and independent rear cable give physical capacities',()=>{
 const q=brakeActuation(1,0);close(q.pressure,250*4/(Math.PI*.02**2/4));
 for(const [i,w]of q.wheels.entries()){
  close(w.serviceCapacity,2*B.mu*B.drumRadius*w.normalPerShoe);close(w.handCapacity,0);
  close(w.hydraulicForce,w.normalPerShoe+w.returnForce);assert.ok(w.shoeTravel>B.clearance);
 }
 assert.ok(q.wheels[0].serviceCapacity>q.wheels[2].serviceCapacity);assert.ok(q.masterTravel>0);
 const hand=brakeActuation(0,1);assert.ok(hand.handAngle>0&&hand.cableTension===800);assert.ok(hand.wheels.slice(0,2).every(w=>w.normalPerShoe===0));assert.ok(hand.wheels.slice(2).every(w=>w.handCapacity>150));
 assert.ok(brakeActuation().wheels.every(w=>w.normalPerShoe===0));
});
test('closed steering links retain all lengths and plausible Ackermann in both directions',()=>{
 const g=steeringGeometry();for(const col of [-7,-4,-2,0,2,4,7]){
  const q=linkage(col,g),dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  close(dist(q.leftPin,q.leftEnd),g.arm);close(dist(q.rightPin,q.rightEnd),g.arm);close(dist(q.leftEnd,q.rightEnd),g.tieLength);close(dist(q.tip,q.leftEnd),g.dragLength);
  close(q.boxAngle,col/g.ratio);if(col>0)assert.ok(q.leftAngle>q.rightAngle&&q.rightAngle>0);if(col<0)assert.ok(q.rightAngle<q.leftAngle&&q.leftAngle<0);
  if(col!==0){const inner=Math.max(Math.abs(q.leftAngle),Math.abs(q.rightAngle)),outer=Math.min(Math.abs(q.leftAngle),Math.abs(q.rightAngle));const ideal=Math.atan(1/(1/Math.tan(inner)+g.track/g.wheelbase));assert.ok(Math.abs(outer-ideal)<.01,`${col}: ${outer-ideal}`);}
 }
 close(linkage(100).wheelAngle,7);close(linkage(-100).wheelAngle,-7);close(linkage(0).leftAngle,0);
});
test('actual independent knuckle angles enter tire forces and yaw, including brake interaction',()=>{
 const s=createVehicle({automobile:true});s.engine.ignition=false;s.v=8;s.wheels.forEach(w=>w.omega=25);
 run(s,.5,{steer:.4});assert.ok(s.wheels[0].steering>s.wheels[1].steering);close(s.wheels[0].steering,s.steering.leftAngle);assert.ok(s.planar.r>0);assert.ok(s.wheels[0].fy>0);
 run(s,.3,{steer:.4,handbrake:1});assert.ok(Math.abs(s.wheels[2].omega)<1e-7);assert.ok(s.planar.u>0);assert.ok(s.planar.contact.tireDissipation>=0);
});
test('engine fixed-step refinement and unloaded low-speed/reverse linkage remain finite',()=>{
 const speeds=[.001,.0005].map(h=>{const s=started(h);run(s,1,{throttle:.5},h);return s.flywheel.omega;});assert.ok(Math.abs(speeds[0]-speeds[1])<.05);
 const s=createVehicle({automobile:true});s.engine.ignition=false;s.v=-.001;run(s,.2,{steer:-.4,serviceBrake:1});assert.ok(s.wheels.every(w=>Number.isFinite(w.omega)&&Number.isFinite(w.fy)));
});
test('hydraulic shoes hold finite applied driveline torque and release without an omega assignment',()=>{
 const s=createVehicle({automobile:true,mode:'open'});delete s.engine; // explicitly prescribed laboratory load
 s.gearbox.q=.025;engageDogs(s,'1');s.flywheel.engagement=1;run(s,.2,{drive:20,serviceBrake:1});
 assert.ok(s.wheels.every(w=>Math.abs(w.omega)<1e-7));assert.ok(s.wheels.slice(2).some(w=>Math.abs(w.brake)>1));
 assert.ok(s.wheels.every(w=>Math.abs(w.brake)<=w.brakeCapacity+1e-8));run(s,.1,{drive:20});assert.ok(s.wheels[2].omega>0);assert.ok(s.v>0);
});
test('zero-speed steering has no propulsion; both locks, steady curvature and reversal use tire yaw moments',()=>{
 const resting=createVehicle({automobile:true});run(resting,.3,{steer:.4});close(resting.planar.r,0);close(resting.planar.u,0);
 for(const sign of [-1,1]){
  const s=createVehicle({automobile:true});s.v=4;s.wheels.forEach(w=>w.omega=4/w.radius);run(s,3,{steer:sign*.2});
  const geometric=(Math.tan(s.steering.leftAngle)+Math.tan(s.steering.rightAngle))/(2*s.wheelbase);
  assert.ok(sign*s.planar.r>0);assert.ok(Math.abs(s.planar.r/s.planar.u-geometric)<.01);
  run(s,1,{steer:-sign*.2});assert.ok(sign*s.planar.r<0);
 }
});
test('engine port work and coupled rotor energy ledger use the same applied torque',()=>{
 const s=started();const before={c:s.engine.combustionWork,a:s.engine.starterWork,l:s.engine.lossWork};stepVehicle(s,{throttle:.4});
 const e=s.engine,work=(e.combustionWork-before.c)+(e.starterWork-before.a)-(e.lossWork-before.l);
 close(work,s.planar.contact.work,1e-10);assert.ok(Math.abs(s.planar.contact.energyResidual)<1e-7);assert.ok(e.lossWork>=0);
});
