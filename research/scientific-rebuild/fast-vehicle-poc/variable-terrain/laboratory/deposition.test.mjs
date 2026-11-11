import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TireObservatory} from './tracks.js';
function deposit(power,heading=0,slidingSpeed=.1){const o=new TireObservatory();for(let i=0;i<20;i++){const frame=t=>({time:t,center:{x:t*10,y:0},wheels:Array.from({length:4},()=>({position:{x:t*10,y:0,z:0},heading,normal:4000,supported:true,geometryContact:true,slidingSpeed,power,omega:10}))});o.record({start:frame(i*.001),end:frame((i+1)*.001),h:.001});}return [...o.marks[0].values()].filter(m=>m.kind==='strip');}
test('mild deposition increases continuously with dissipated power below old thresholds',()=>{const marks=[.01,.1,1,10,100].map(p=>deposit(p));marks.forEach(m=>assert.ok(m.length>0));for(let i=1;i<marks.length;i++)assert.ok(marks[i][0].alpha>marks[i-1][0].alpha);assert.equal(deposit(0).length,0);});
test('deposit footprint responds to heading and slip severity',()=>{const rolling=deposit(100)[0],side=deposit(100,Math.PI/2)[0],strong=deposit(100,0,10)[0];assert.notEqual(rolling.width,side.width);assert.ok(strong.width>rolling.width);});
