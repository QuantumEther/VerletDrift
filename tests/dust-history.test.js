import {beforeEach,it,expect} from 'vitest';
import {observeDust,dustHistory,resetDustHistory,DUST_HISTORY_CAPACITY} from '../js/renderer/dust-history.js';
import {AtmosphericDust} from '../js/renderer/atmospheric-dust.js';
const body=t=>({centerX:12*t,centerY:3*t,velocityX:12,velocityY:3,heading:.4,angularVelocity:.2});
const ordered=()=>{const h=dustHistory();return Array.from({length:h.count},(_,i)=>Array.from(h.data.slice(((h.head+i)%96)*8,((h.head+i)%96)*8+8)));};
beforeEach(resetDustHistory);
it('samples a shared simulation-time grid independently of observation rate and preserves source state',()=>{
 for(let i=0;i<=200;i++){const b=body(i/100),original={...b};observeDust(b,i/100);expect(b).toEqual(original);}
 const fast=ordered();resetDustHistory();for(let i=0;i<=100;i++)observeDust(body(i/50),i/50);
 expect(ordered()).toEqual(fast);expect(fast).toHaveLength(21);expect(fast[10][0]).toBe(12);
});
it('bounds long sessions and time jumps, ignores resting/disabled samples, resets rewinds and teleports',()=>{
 for(let i=0;i<1500;i++)observeDust(body(i*.1),i*.1);expect(dustHistory().count).toBe(DUST_HISTORY_CAPACITY);
 const generation=dustHistory().generation;observeDust(body(1),1);expect(dustHistory().generation).toBeGreaterThan(generation);
 resetDustHistory();observeDust({...body(0),velocityX:0,velocityY:0,angularVelocity:0},0);expect(dustHistory().count).toBe(0);
 observeDust(body(.1),.1,false);expect(dustHistory().count).toBe(0);
 observeDust({...body(.2),centerX:1000},.2);expect(dustHistory().count).toBeLessThan(2);
 observeDust({...body(.2),centerX:1000},1000000);expect(dustHistory().count).toBeLessThanOrEqual(96);
});
it('bounds visible cells and thins under sustained CPU submission pressure without allocating GPU resources',()=>{
 const writes=[];const device={queue:{writeBuffer:(...args)=>writes.push(args)},createBuffer:()=>{throw Error('unexpected allocation');}};
 const gpu=new AtmosphericDust(device,'rgba8unorm',{},'');gpu.uniform={size:144};gpu.history={size:3072};gpu.elements={size:204800};
 const state={params:{dustDensity:.42},loop:{simulationTime:3},body:body(3)};
 for(let i=0;i<300;i++)gpu.prepare(state,3840,2160,{x:0,y:0},.1,{detail:1},20);
 expect(gpu.count).toBeLessThanOrEqual(3320);expect(gpu.adaptive).toBeLessThan(.6);expect(gpu.bytes).toBe(208016);
 const previous=gpu.adaptive;for(let i=0;i<400;i++)gpu.prepare(state,1920,1080,{x:10,y:3},30,{detail:1},0);
 expect(gpu.adaptive).toBeGreaterThan(previous);expect(writes.length).toBe(701);
});
it('wake visibility remains independent of ambient density and physical airflow strength',()=>{
 const gpu=new AtmosphericDust({queue:{writeBuffer:()=>{}}},'rgba8unorm',{},'');
 const s={params:{dustDensity:0,dustVisibility:1.15,dustDisturbance:.7},loop:{simulationTime:3},body:body(3)};
 gpu.prepare(s,800,600,{x:0,y:0},20,{detail:1});
 expect(gpu.count).toBeGreaterThan(0);expect(gpu.frame[14]).toBe(0);expect(gpu.frame[15]).toBeCloseTo(.7);expect(gpu.frame[32]).toBeCloseTo(1.15);
 s.params.dustVisibility=0;gpu.prepare(s,800,600,{x:0,y:0},20,{detail:1});expect(gpu.count).toBe(0);
});
