import {WetTrails} from '../js/renderer/wet-trails.js';
import {describe,it,expect,beforeEach} from 'vitest';
import {recordWetTireTransfer,getWetTireTransfers,resetWetTireTransfers,MAX_WET_TRANSFERS} from '../js/renderer/wet-trail-events.js';
const seg=()=>({x1:0,y1:0,x2:1,y2:0,width:.2,hue:350,alpha:.5,paintSaturation:.8});
beforeEach(resetWetTireTransfers);
describe('immutable wet tire transfer history',()=>{
 it('captures resolved dye once, independent of native mutations and deletion',()=>{
  const s=seg();recordWetTireTransfer(s,2);s.hue=210;s.alpha=0;recordWetTireTransfer(s,3);
  const e=getWetTireTransfers().events;expect(e).toHaveLength(1);expect(e[0]).toMatchObject({hue:350,time:2,dose:.5});expect(Object.isFrozen(e[0])).toBe(true);
 });
 it('rejects dry rubber and invalid positions and bounds rollover in source order',()=>{
  recordWetTireTransfer({...seg(),hue:-1},0);recordWetTireTransfer({...seg(),x1:NaN},0);expect(getWetTireTransfers().events).toHaveLength(0);
  for(let i=0;i<MAX_WET_TRANSFERS+5;i++)recordWetTireTransfer(seg(),i);
  const {events}=getWetTireTransfers();expect(events).toHaveLength(MAX_WET_TRANSFERS);expect(events[0].time).toBe(5);expect(events.at(-1).time).toBe(MAX_WET_TRANSFERS+4);
 });
});

it('ring rollover uploads only new GPU geometry rather than the retained history',()=>{
 globalThis.GPUTextureUsage??={RENDER_ATTACHMENT:1,TEXTURE_BINDING:2};
 const writes=[];const d={createTexture:()=>({createView:()=>({}),destroy(){}}),queue:{writeBuffer:(_b,offset,_data,_start,count)=>writes.push({offset,count})}};
 const gpu=new WetTrails(d,{});gpu.buffer={size:MAX_WET_TRANSFERS*48};gpu.data=new Float32Array(MAX_WET_TRANSFERS*12);
 for(let i=0;i<MAX_WET_TRANSFERS;i++)recordWetTireTransfer(seg(),i);
 gpu.prepare(10,10);writes.length=0;recordWetTireTransfer(seg(),MAX_WET_TRANSFERS);gpu.prepare(10,10);
 expect(writes).toEqual([{offset:0,count:12}]);expect(gpu.count).toBe(MAX_WET_TRANSFERS);expect(gpu.firstSlot).toBe(1);
 expect(gpu.data[5]).toBe(MAX_WET_TRANSFERS);
});
