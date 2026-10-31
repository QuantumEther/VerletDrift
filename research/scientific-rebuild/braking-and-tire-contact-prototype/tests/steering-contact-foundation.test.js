import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSteeringContact,stepSteeringContact} from '../src/steering-contact-foundation.js';
import {createSteeringContact as otherCreate,stepSteeringContact as otherStep} from '../../tire-road-observatory-prototype/src/steering-contact-foundation.js';

const close=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<tol, `${a} != ${b}`);

test('an established stationary angle is retained without torque',()=>{
 const s=createSteeringContact(); s.angle=.3;
 for(let i=0;i<2000;i++) stepSteeringContact(s);
 close(s.angle,.3); close(s.angularVelocity,0); close(s.last.tireTorque,0);
});

test('contact lever supplies equal and opposite torque and closes energy',()=>{
 const s=createSteeringContact({friction:0}); s.lateralVelocity=2;
 for(let i=0;i<1000;i++){
  stepSteeringContact(s);
  close(s.last.tireTorque,-s.trail*s.last.tireForce);
  close(s.last.energyResidual,0,1e-7);
  assert.ok(s.last.dissipation>=-1e-9);
 }
 assert.ok(s.angularVelocity>0);
});

test('force direction mirrors, including reversed lateral contact motion',()=>{
 const a=createSteeringContact({friction:0}),b=createSteeringContact({friction:0});
 a.lateralVelocity=1; b.lateralVelocity=-1;
 for(let i=0;i<100;i++){stepSteeringContact(a);stepSteeringContact(b);}
 close(a.angle,-b.angle); close(a.last.tireTorque,-b.last.tireTorque);
});

test('zero grip gives no road moment and static friction can hold a driver torque',()=>{
 const s=createSteeringContact({mu:0,friction:2}); s.lateralVelocity=1;
 for(let i=0;i<100;i++)stepSteeringContact(s,{driverTorque:1});
 close(s.angle,0); close(s.last.tireTorque,0); close(s.last.frictionTorque,-1);
 for(let i=0;i<100;i++)stepSteeringContact(s,{driverTorque:3});
 assert.ok(s.angularVelocity>0);
});

test('continuous torque-driven response converges with timestep refinement',()=>{
 const run=h=>{const s=createSteeringContact({friction:0});s.lateralVelocity=1;for(let i=0;i<Math.round(.4/h);i++)stepSteeringContact(s,{},h);return s.angle;};
 const coarse=run(.004),fine=run(.002),reference=run(.001);
 assert.ok(Math.abs(fine-reference)<Math.abs(coarse-reference));
});

test('both prototypes use the same fixture',()=>{
 const a=createSteeringContact(),b=otherCreate(); a.lateralVelocity=b.lateralVelocity=.8;
 for(let i=0;i<100;i++){stepSteeringContact(a,{driverTorque:2});otherStep(b,{driverTorque:2});}
 assert.deepEqual(a,b);
});
