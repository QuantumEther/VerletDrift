import {beforeEach,it,expect} from 'vitest';
import {VehicleAirflow,AIRFLOW_SIZE,AIRFLOW_VORTICES,SMOKE_AIRFLOW_DEFAULTS} from '../js/renderer/vehicle-airflow.js';
import {observeDust,resetDustHistory,dustHistory} from '../js/renderer/dust-history.js';
beforeEach(()=>{resetDustHistory();globalThis.GPUBufferUsage={UNIFORM:1,STORAGE:2,COPY_DST:4,COPY_SRC:8};});
const body=t=>({centerX:10*t,centerY:0,velocityX:10,velocityY:0,heading:.5,angularVelocity:.4});
function fixture(){const allocations=[],writes=[];const d={features:new Set(),queue:{writeBuffer:(...args)=>writes.push(args)},createBuffer:desc=>{const b={...desc,destroyed:false,destroy(){this.destroyed=true;}};allocations.push(b);return b;}};const f=new VehicleAirflow(d);f.pipeline={};return {f,allocations,writes};}
it('shares bounded vortex cores without changing observations, physics, or allocating per frame',()=>{
 for(let i=0;i<200;i++)observeDust(body(i*.1),i*.1);
 const h=dustHistory(),original=Array.from(h.data),{f,allocations}=fixture();
 const s={body:body(19.9),params:{...SMOKE_AIRFLOW_DEFAULTS,dustEnabled:false},loop:{simulationTime:19.9}},copy=JSON.stringify(s);
 for(let i=0;i<200;i++)f.prepare(s);
 expect(allocations).toHaveLength(3);expect(f.bytes).toBe(149056);expect(AIRFLOW_SIZE).toBe(96);expect(f.stats.vortices).toBeLessThanOrEqual(AIRFLOW_VORTICES);expect(f.stats.vortices).toBeGreaterThan(35);
 expect(JSON.stringify(s)).toBe(copy);expect(Array.from(h.data)).toEqual(original);
 const coreA=Array.from(f.vortices),frameA=Array.from(f.data);s.loop.simulationTime=25;f.prepare(s);expect(f.stats.vortices).toBe(0);
 s.loop.simulationTime=19.9;f.prepare(s);expect(Array.from(f.vortices)).toEqual(coreA);expect(Array.from(f.data)).toEqual(frameA);
 f.destroy();expect(allocations.every(b=>b.destroyed)).toBe(true);
});
it('disables coupling independently of dust visibility, strength zero, or missing optional pipeline',()=>{
 const {f}=fixture(),s={body:body(0),params:{dustEnabled:false},loop:{simulationTime:0}};
 f.prepare(s);expect(f.stats.active).toBe(true);expect(f.data[5]).toBe(1);
 s.params.smokeAirflowEnabled=false;f.prepare(s);expect(f.data[5]).toBe(0);expect(f.encode({})).toBe(0);
 s.params.smokeAirflowEnabled=true;s.params.smokeAirflowStrength=0;f.prepare(s);expect(f.stats.active).toBe(false);
 s.params.smokeAirflowStrength=2;f.pipeline=null;f.prepare(s);expect(f.stats.active).toBe(false);
});
it('reuses its sampled world origin between 60 Hz field updates and refreshes after disable or rewind',()=>{
 const {f}=fixture(),s={body:body(0),params:{},loop:{simulationTime:0}};
 const encoder={beginComputePass:()=>({setPipeline(){},setBindGroup(){},dispatchWorkgroups(){},end(){}})};
 f.prepare(s);const origin=Array.from(f.data.slice(8,12));expect(f.encode(encoder)).toBe(144);
 s.body=body(.008);s.loop.simulationTime=.008;f.prepare(s);expect(f.encode(encoder)).toBe(0);expect(Array.from(f.data.slice(8,12))).toEqual(origin);
 s.loop.simulationTime=.017;f.prepare(s);expect(f.encode(encoder)).toBe(144);
 s.params.smokeAirflowEnabled=false;f.prepare(s);expect(f.encode(encoder)).toBe(0);
 s.params.smokeAirflowEnabled=true;f.prepare(s);expect(f.encode(encoder)).toBe(144);
 s.loop.simulationTime=.001;f.prepare(s);expect(f.encode(encoder)).toBe(144);
 f.prepare(s,false,false);expect(f.encode(encoder)).toBe(0);
});
