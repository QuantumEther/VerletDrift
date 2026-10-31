import {test} from 'node:test';import assert from 'node:assert/strict';import {contactPort} from '../src/contact-port.js';
test('virtual work equals contact power for independent generalized velocities',()=>{
 const p=contactPort({x:1,y:.6,height:.5}),f=[-120,30];
 for(let i=0;i<10;i++){const v=Array(10).fill(0);v[i]=1;const c=p.velocity(v),q=p.reaction(...f);assert.ok(Math.abs(c[0]*f[0]+c[1]*f[1]-q[i])<1e-12);}
});
test('actual contact moment signs mirror braking, acceleration and turn direction',()=>{
 const p=contactPort({x:1,y:.6,height:.5});assert.equal(p.reaction(-100,0)[4],-50);assert.equal(p.reaction(100,0)[4],50);assert.equal(p.reaction(0,100)[5],50);assert.equal(p.reaction(0,-100)[5],-50);
});
test('zero reference height has no longitudinal/lateral pitch or roll moment',()=>{const p=contactPort({x:1,y:.6,height:0});assert.deepEqual(p.reaction(100,100).slice(4,6),[0,0]);});
