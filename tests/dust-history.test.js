import {beforeEach,it,expect} from 'vitest';
import {observeDust,dustHistory,resetDustHistory,DUST_HISTORY_CAPACITY} from '../js/renderer/dust-history.js';
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
