import {test} from 'node:test';import assert from 'node:assert/strict';
import {createVehicle,stepVehicle} from '../src/combined-vehicle.js';
import {stepPlanar as combined} from '../src/combined-planar.js';
import {stepPlanar as predecessor} from '../../tire-road-observatory-prototype/src/planar.js';
import {createVehicle as oldVehicle} from '../../tire-road-observatory-prototype/src/vehicle.js';
import {engageDogs} from '../../tire-road-observatory-prototype/src/gearbox.js';
const close=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const rolling=()=>{const s=createVehicle({automobile:true,mode:'open'});s.engine.ignition=false;s.v=4;s.wheels.forEach(w=>w.omega=4/w.radius);return s;};
test('zero-height contact reduction preserves predecessor drivetrain and steering solve',()=>{
 const a=rolling(),b=oldVehicle({automobile:true,mode:'open'});b.v=4;b.wheels.forEach(w=>w.omega=4/w.radius);
 for(const s of [a,b]){s.gearbox.q=.025;engageDogs(s,'1');s.flywheel.engagement=.4;s.steering.driverTorque=1;}
 const ports=s=>({drive:10,steeringSystem:s.steering,steeringAngles:[0,0],serviceBrake:.2});
 combined(a.planar,a.wheels,Array(4).fill(255.06),104,{...ports(a),verticalState:a.vertical,contactHeight:0},.001,a.drivetrain,a.flywheel);
 predecessor(b.planar,b.wheels,Array(4).fill(255.06),104,ports(b),.001,b.drivetrain,b.flywheel);
 for(let i=0;i<4;i++)close(a.wheels[i].omega,b.wheels[i].omega,1e-10);close(a.flywheel.omega,b.flywheel.omega,1e-10);close(a.steering.angularVelocity,b.steering.angularVelocity,1e-10);
});
test('braking and dynamic steering exchange work with four independent corners',()=>{
 const s=rolling();let max=0;for(let i=0;i<300;i++){stepVehicle(s,{serviceBrake:.5,steer:.1});max=Math.max(max,Math.abs(s.planar.contact.energyResidual));close(s.steering.last.torqueResidual,0);assert.ok(s.wheels.every(w=>w.normal>=0));assert.ok(s.planar.contact.tireDissipation>=-1e-7);}
 assert.ok(s.vertical.q[1]<0);assert.ok(s.vertical.q[2]>0);assert.ok(s.wheels[0].normal!==s.wheels[1].normal);assert.ok(max<1e-7);assert.ok(Math.abs(s.gearbox.rotationalWorkResidual)<1e-7);console.log({contactResidual:max,verticalLedger:s.verticalLedger,loads:s.wheels.map(w=>w.normal)});
});
test('engine, clutch and differential transmit load in the combined vehicle',()=>{
 const s=createVehicle({automobile:true,mode:'open'});for(let i=0;i<2000;i++)stepVehicle(s,{starter:true});assert.equal(s.engine.mode,'running');s.gearbox.q=.025;engageDogs(s,'1');s.flywheel.engagement=.3;for(let i=0;i<300;i++)stepVehicle(s,{throttle:.5});assert.ok(s.v>0);assert.ok(s.wheels[2].omega>0);assert.ok(s.flywheel.heat>=0);
});
test('accepted observer emission is detached and diagnostics do not affect state',()=>{
 const a=rolling(),b=rolling(),samples=[];const observer={capture:s=>({time:s.time,q:[...s.vertical.q]}),accept:ss=>samples.push(...ss)};
 for(let i=0;i<100;i++){stepVehicle(a,{serviceBrake:.5},.001,observer);stepVehicle(b,{serviceBrake:.5});}
 assert.deepEqual(structuredClone(a),structuredClone(b));close(samples.reduce((n,s)=>n+s.h,0),.1,1e-10);samples[0].end.q[0]=999;assert.notEqual(a.vertical.q[0],999);
});
test('pitch and vertical work residual converge under refinement; reverse remains finite',()=>{
 const run=h=>{const s=rolling();for(let i=0;i<Math.round(.2/h);i++)stepVehicle(s,{serviceBrake:.5},h);return s;};
 const [a,b,c]=[.002,.001,.0005].map(run);assert.ok(Math.abs(b.vertical.q[1]-c.vertical.q[1])<Math.abs(a.vertical.q[1]-c.vertical.q[1]));assert.ok(Math.abs(c.verticalLedger.residual)<Math.abs(b.verticalLedger.residual));
 const s=rolling();s.v=-4;s.wheels.forEach(w=>w.omega=-4/w.radius);for(let i=0;i<200;i++)stepVehicle(s,{serviceBrake:.5,steer:.1});assert.ok(s.vertical.q.every(Number.isFinite));console.log({pitch:[a.vertical.q[1],b.vertical.q[1],c.vertical.q[1]],residual:[a.verticalLedger.residual,b.verticalLedger.residual,c.verticalLedger.residual]});
});
test('failed stage emits no samples or partial vertical state',()=>{const s=rolling(),q=[...s.vertical.q],v=[...s.vertical.v];s.bump=1;let emitted=0;const observer={capture:s=>({time:s.time}),accept:ss=>emitted+=ss.length};assert.throws(()=>stepVehicle(s,{},.001,observer),/flat continuous ground/);assert.deepEqual(s.vertical.q,q);assert.deepEqual(s.vertical.v,v);assert.equal(s.time,0);assert.equal(emitted,0);});
test('gear-event search reports accepted split stages once',()=>{const s=createVehicle();let searches=0,stages=0,time=0;const observer={capture:s=>({time:s.time}),accept:ss=>{stages+=ss.length;time+=ss.reduce((n,x)=>n+x.h,0);}};for(let i=0;i<400;i++){s.gearbox.driverForce=120;stepVehicle(s,{starter:true},.001,observer);searches+=s.gearbox.eventIterations;}assert.ok(searches>0);assert.ok(stages>400);close(time,.4,1e-10);close(s.time,time,1e-10);});
