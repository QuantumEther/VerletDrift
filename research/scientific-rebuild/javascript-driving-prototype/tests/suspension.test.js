import test from 'node:test';
import assert from 'node:assert/strict';
import {createSuspension,stepSuspension,suspensionDiagnostics} from '../src/suspension.js';
test('static equilibrium',()=>{const s=createSuspension();for(let i=0;i<10000;i++)stepSuspension(s,.001);assert.ok(Math.abs(s.z-s.equilibrium)<1e-12);});
test('undamped frequency',()=>{const s=createSuspension({damping:0});s.z+=.02;let crossings=[];for(let i=0;i<3000;i++){const q=s.z-s.equilibrium;stepSuspension(s,.001);if(q>0&&s.z<=s.equilibrium)crossings.push(i*.001);}const period=crossings[1]-crossings[0];assert.ok(Math.abs(period-2*Math.PI*Math.sqrt(s.mass/s.stiffness))<.002);});
test('damped decay',()=>{const s=createSuspension();s.z+=.02;for(let i=0;i<10000;i++)stepSuspension(s,.001);assert.ok(Math.abs(s.z-s.equilibrium)<1e-8);});
test('force signs and reaction',()=>{const s=createSuspension();s.z-=.01;s.velocity=.2;const d=suspensionDiagnostics(s);assert.ok(Math.abs(d.spring-(s.mass*s.gravity+40))<1e-10);assert.equal(d.damper,-32);assert.equal(d.supportReaction,-d.spring-d.damper);});
