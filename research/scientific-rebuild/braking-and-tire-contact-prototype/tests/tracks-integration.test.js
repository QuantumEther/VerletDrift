import {test} from 'node:test';import assert from 'node:assert/strict';
import {createVehicle,stepVehicle} from '../src/vehicle.js';
import {TireObservatory} from '../src/tracks.js';
import {createVehicle as otherVehicle,stepVehicle as otherStep} from '../../tire-road-observatory-prototype/src/vehicle.js';
import {TireObservatory as OtherObservatory} from '../../tire-road-observatory-prototype/src/tracks.js';
test('accepted-stage recording matches observatory without changing physics',()=>{
 const a=createVehicle({automobile:true}),b=otherVehicle({automobile:true}),oa=new TireObservatory(),ob=new OtherObservatory();a.engine.ignition=b.engine.ignition=false;a.v=b.v=8;a.wheels.forEach(w=>w.omega=25);b.wheels.forEach(w=>w.omega=25);
 for(let i=0;i<500;i++){const input={steer:.1,serviceBrake:i>200?1:0};stepVehicle(a,input,.001,oa);otherStep(b,input,.001,ob);}
 assert.deepEqual(structuredClone(a),structuredClone(b));assert.deepEqual(oa.stats(),ob.stats());assert.deepEqual(oa.marks.map(r=>[...r.values()]),ob.marks.map(r=>[...r.values()]));assert.ok(oa.marks.some(r=>r.count>0));const original=oa.marks[0].count;oa.breakContinuity();assert.equal(oa.marks[0].count,original);oa.clear();assert.ok(oa.marks.every(r=>r.count===0));
});
test('rolling alone records paths but produces no rubber',()=>{const s=createVehicle({automobile:true}),o=new TireObservatory();s.engine.ignition=false;s.v=4;s.wheels.forEach(w=>w.omega=4/w.radius);for(let i=0;i<100;i++)stepVehicle(s,{},.001,o);assert.ok(o.paths.every(r=>r.count>0));assert.ok(o.marks.every(r=>r.count===0));});
test('steered contacts match solver geometry and world transform',async()=>{const {contactWorld}=await import('../src/contact-observation.js');const s=createVehicle({automobile:true});s.planar.x=5;s.planar.y=-3;s.planar.heading=.7;s.wheels[0].steering=.3;const w=s.wheels[0],trail=s.steering.dynamics.trail,c=Math.cos(.7),t=Math.sin(.7),x=w.x+trail*(1-Math.cos(.3)),y=w.y-trail*Math.sin(.3),p=contactWorld(s,w);assert.ok(Math.abs(p.x-(5+c*x-t*y))<1e-12);assert.ok(Math.abs(p.y-(-3+t*x+c*y))<1e-12);});
