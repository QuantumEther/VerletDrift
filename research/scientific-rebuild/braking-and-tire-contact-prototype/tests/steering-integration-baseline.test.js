import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createVehicle,stepVehicle} from '../src/vehicle.js';
import {createVehicle as otherCreate,stepVehicle as otherStep} from '../../tire-road-observatory-prototype/src/vehicle.js';
import {linkage} from '../src/steering.js';
const close=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
for(const [name,create,step] of [['braking',createVehicle,stepVehicle],['observatory',otherCreate,otherStep]]){
 const make=(q=3,speed=0)=>{const s=create({automobile:true});s.engine.ignition=false;Object.assign(s.steering,linkage(q,s.steering.geometry));s.v=speed;s.wheels.forEach(w=>w.omega=speed/w.radius);return s;};
 const run=(s,t,ports={},h=.001)=>{for(let i=0;i<Math.round(t/h);i++){step(s,ports,h);const st=s.steering;close(st.last.torqueResidual,0,1e-7);assert.ok(Math.abs(s.planar.contact.energyResidual)<1e-7);close(s.wheels[0].steering,st.leftAngle);close(s.wheels[1].steering,st.rightAngle);assert.ok(Math.abs(st.wheelAngle)<=7+1e-8);}return s;};
 test(`${name}: stationary release retains angle, input is torque and coasts to rest`,()=>{
  const s=make();run(s,.2);close(s.steering.wheelAngle,3);run(s,.1,{steer:.4});assert.ok(s.steering.wheelAngle>3);const q=s.steering.wheelAngle;run(s,1);assert.equal(s.steering.driverTorque,0);assert.ok(s.steering.wheelAngle>=q);assert.ok(s.steering.wheelAngle>3);assert.ok(Math.abs(s.steering.angularVelocity)<1e-7);
 });
 test(`${name}: actual forward and reverse rolling generate opposite initial road moments`,()=>{
  const f=make(3,4),r=make(3,-4);run(f,.05);run(r,.05);assert.ok(f.steering.wheelAngle<3);assert.ok(r.steering.wheelAngle>3);assert.ok(f.steering.last.tireTorque<0);assert.ok(r.steering.last.tireTorque>0);
 });
 test(`${name}: zero grip removes contact torque; friction holds and both stops react`,()=>{
  const s=make();s.wheels.forEach(w=>w.mu=0);run(s,.2,{steer:.004});close(s.steering.wheelAngle,3);close(s.steering.last.tireTorque,0);
  for(const sign of [-1,1]){const q=make(sign*6.9);q.wheels.forEach(w=>w.mu=0);run(q,.4,{steer:sign*.4});close(q.steering.wheelAngle,sign*7,1e-7);assert.ok(sign*q.steering.last.stopTorque<0);run(q,.2,{steer:-sign*.4});assert.ok(sign*q.steering.wheelAngle<7);}
 });
 test(`${name}: mirrored steering produces opposite yaw and close response`,()=>{
  const a=make(1,3),b=make(-1,3);run(a,.1);run(b,.1);assert.ok(a.planar.r>0&&b.planar.r<0);assert.ok(Math.abs(a.steering.wheelAngle+b.steering.wheelAngle)<.02);
 });
 test(`${name}: vehicle response refines with timestep and speed can cross zero continuously`,()=>{
  const angles=[.002,.001,.0005].map(h=>run(make(3,4),.2,{},h).steering.wheelAngle);assert.ok(Math.abs(angles[1]-angles[2])<Math.abs(angles[0]-angles[2]));
  const s=make(2,.1);run(s,.1,{serviceBrake:1});s.v=-.1;s.wheels.forEach(w=>w.omega=-.1/w.radius);const q=s.steering.wheelAngle;run(s,.001);assert.ok(Math.abs(s.steering.wheelAngle-q)<.01);
 });
}

test('high steering friction prevents rolling return in both actual vehicles',()=>{
 for(const [create,step] of [[createVehicle,stepVehicle],[otherCreate,otherStep]]){
  const s=create({automobile:true});s.engine.ignition=false;Object.assign(s.steering,linkage(3,s.steering.geometry));s.steering.dynamics.friction=100;s.v=4;s.wheels.forEach(w=>w.omega=4/w.radius);
  for(let i=0;i<200;i++)step(s);
  close(s.steering.wheelAngle,3);assert.ok(Math.abs(s.steering.last.tireTorque)>0);
 }
});
