import {test,expect} from '@playwright/test';
import {bootSimulatorLiquid,renderSimulatorLiquid,impactSimulatorLiquid} from './helpers/simulator-liquid.js';
async function boot(page){expect(await bootSimulatorLiquid(page)).toBe(true);await impactSimulatorLiquid(page);}
test('live uniforms and cached deposition respond independently to lab controls and quality presets',async({page})=>{
 await boot(page);
 const cases=[['liquidIntensity',1.5,.7],['liquidVolume',1.6,.7],['liquidMembraneThickness',.6,.7],['liquidBreakup',1.8,.7],['liquidFilamentLength',.6,.7],['liquidDropScale',1.7,.7],['liquidConcentration',2,.7],['liquidRoughness',1.7,5],['liquidReflections',0,5],['liquidPuddleDepth',1.6,5],['liquidVehicleInteraction',false,.7],['liquidBodyWetness',0,5],['liquidBodyRunoff',2,5],['liquidHoodDeflection',0,.7],['liquidBodyDryingDuration',8,18],['liquidBodyResidue',0,72],['liquidDryingEnabled',false,50],['liquidDryingDuration',8,18],['liquidDryingIrregularity',1,18],['liquidSurfaceAbsorption',0,18],['liquidDyeResidue',0,50],['liquidResidueAging',false,85],['liquidResidueLifetime',100,65],['liquidResidueIrregularity',0,65],['liquidResiduePersistence',0,65]];
 for(const [key,value,time] of cases){
  const base=await renderSimulatorLiquid(page,time);
  const original=await page.evaluate(({key,value})=>{const p=window.__liquidHarness.s.params,old=p[key];p[key]=value;return old;},{key,value});
  const changed=await renderSimulatorLiquid(page,time);expect(changed.errors,key).toEqual([]);expect(changed.hash,key).not.toBe(base.hash);
  if(!['liquidIntensity','liquidVolume','liquidBreakup'].includes(key))expect(changed.stats.liquid.depositionRebuilds,key+' reuses atlas').toBe(base.stats.liquid.depositionRebuilds);
  await page.evaluate(({key,original})=>window.__liquidHarness.s.params[key]=original,{key,original});
  expect((await renderSimulatorLiquid(page,time)).hash,key+' reset').toBe(base.hash);
 }
 for(const [index,name] of [[1,'performance'],[2,'balanced'],[3,'high']]){
  await page.evaluate(index=>window.__liquidHarness.s.params.liquidQuality=index,index);
  const f=await renderSimulatorLiquid(page,.7);expect(f.stats.liquid.quality).toBe(name);expect(f.stats.liquid.budget.drops).toBe([0,650,1200,2000][index]);expect(f.errors).toEqual([]);
 }
});
test('live residue clears, supports disabled degradation and reconstructs with no resource growth',async({page})=>{
 await boot(page);await page.evaluate(()=>window.__liquidHarness.s.params.liquidBodyResidue=0);
 const fresh=await renderSimulatorLiquid(page,40),aged=await renderSimulatorLiquid(page,70),clean=await renderSimulatorLiquid(page,300);
 expect(fresh.hash).not.toBe(aged.hash);expect(aged.hash).not.toBe(clean.hash);
 expect(clean.stats.liquid.active).toBe(false);
 const backward=await renderSimulatorLiquid(page,70);expect(backward.hash).toBe(aged.hash);expect(backward.stats.liquidResourceCount).toBe(aged.stats.liquidResourceCount);
 await page.evaluate(()=>window.__liquidHarness.s.params.liquidResidueAging=false);
 const retained=await renderSimulatorLiquid(page,300);expect(retained.stats.liquid.active).toBe(true);expect(retained.hash).not.toBe(clean.hash);
 await page.evaluate(()=>window.__liquidHarness.s.params.liquidEnabled=false);
 const disabled=await renderSimulatorLiquid(page,300);expect(disabled.hash).toBe(clean.hash);expect(disabled.stats.liquid.active).toBe(false);
});
test('new visuals suppress legacy splats and decals while leaving gameplay paint data intact',async({page})=>{
 await boot(page);await page.evaluate(()=>{
  const s=window.__liquidHarness.s;s.splatParticles=[{x:0,y:0,radius:1,hue:120,alpha:1}];s.splatDecals=[{x:0,y:0,radius:2,hue:120,alpha:1}];
 });
 const frame=await renderSimulatorLiquid(page,5);expect(frame.stats.instances.splats).toBe(0);
 expect(await page.evaluate(()=>[window.__liquidHarness.s.splatParticles.length,window.__liquidHarness.s.splatDecals.length])).toEqual([1,1]);
 await page.evaluate(()=>window.__liquidHarness.s.params.liquidEnabled=false);
 const legacy=await renderSimulatorLiquid(page,5);expect(legacy.stats.instances.splats).toBe(1);expect(legacy.hash).not.toBe(frame.hash);
});
test('extreme impact controls expand atlas coverage to contain actual WGSL landing geometry',async({page})=>{
 await boot(page);await page.evaluate(()=>{
  const s=window.__liquidHarness.s;s.params.liquidIntensity=2;s.params.liquidVolume=2;
  const d=window.__liquidDevice,write=d.queue.writeBuffer.bind(d.queue);
  d.queue.writeBuffer=(buffer,...args)=>{if(buffer.label==='liquid-events')window.__eventUniforms=buffer;return write(buffer,...args);};
 });
 await impactSimulatorLiquid(page,{speed:60,radius:1.2,time:0});await renderSimulatorLiquid(page,5);
 const samples=await page.evaluate(async()=>{
  const d=window.__liquidDevice,common=await fetch('/js/shaders/liquid/common.wgsl').then(r=>r.text());
  const m=d.createShaderModule({code:common+`
   @group(0) @binding(1) var<storage,read_write> output:array<vec4<f32>>;
   @compute @workgroup_size(64) fn probe(@builtin(global_invocation_id) id:vec3<u32>){
    let a=f32(id.x)/4095.*TAU;let s=sheetPoint(a,1.,3.,0.);let d=drop(id.x);let secondary=splashlet(id.x);
    output[id.x]=vec4(max(max(abs(s.xy-u.event.xy),abs(d.ground-u.event.xy)),abs(secondary.ground-u.event.xy)),u.ground.x,0.);
   }`});
  const p=await d.createComputePipelineAsync({layout:'auto',compute:{module:m,entryPoint:'probe'}}),size=4096*16;
  const out=d.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),read=d.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  try{
   const group=d.createBindGroup({layout:p.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:window.__eventUniforms,offset:256,size:256}},{binding:1,resource:{buffer:out}}]});
   const e=d.createCommandEncoder(),pass=e.beginComputePass();pass.setPipeline(p);pass.setBindGroup(0,group);pass.dispatchWorkgroups(64);pass.end();e.copyBufferToBuffer(out,0,read,0,size);d.queue.submit([e.finish()]);await read.mapAsync(GPUMapMode.READ);
   const values=new Float32Array(read.getMappedRange());let max=0;for(let i=0;i<values.length;i+=4)max=Math.max(max,values[i],values[i+1]);return {max,extent:values[2]};
  }finally{read.unmap();read.destroy();out.destroy();}
 });
 expect(samples.extent).toBeGreaterThan(32);expect(samples.max).toBeLessThan(samples.extent-1);
});
