import {test,expect} from '@playwright/test';
import {bootSimulatorLiquid,renderSimulatorLiquid} from './helpers/simulator-liquid.js';
test('optional smoke material failure retains the original renderer',async({page})=>{
 await page.route('**/smoke-density.wgsl*',r=>r.fulfill({status:404,body:'missing'}));expect(await bootSimulatorLiquid(page)).toBe(true);
 const f=await renderSimulatorLiquid(page,.1);expect(f.stats.ready).toBe(true);expect(f.stats.smokeMaterialError).toContain('404');expect(f.errors).toEqual([]);
});
test('all smoke material pipelines compile and render live smoke',async({page})=>{
 expect(await bootSimulatorLiquid(page)).toBe(true);
 await page.evaluate(async()=>{
  const {s}=window.__liquidHarness;Object.assign(s.params,{smokeEnabled:true,dustEnabled:false,liquidEnabled:false,smokeAirflowEnabled:false,smokeSpawnRate:200});
  Object.assign(s.body,{speed:10,velocityX:0,velocityY:-10});for(const n of Object.keys(s.wheels)){s.wheelSlipRatio[n]=2;s.wheels[n].x=s.wheels[n].y=0;}
  (await import('/js/renderer/smoke-system.js')).updateSmoke(.1);
 });
 for(const mode of [0,1,2]){await page.evaluate(m=>window.__liquidHarness.s.params.smokeShadingMode=m,mode);const f=await renderSimulatorLiquid(page,.4+mode*.01);expect(f.errors).toEqual([]);expect(f.stats.smokeMaterialError).toBeUndefined();expect(f.stats.smokeMaterial.mode).toBe(mode);}
});

import {bootSmokeMaterial} from './helpers/smoke-material.js';
test('shared optical depth, lighting, resize and comparison do not alter smoke state',async({page})=>{
 await bootSmokeMaterial(page,{count:128,width:320,height:240});
 const r=await page.evaluate(async()=>{
  const a=window.__material,d=a.d;
  const read=async()=>{const b=d.createBuffer({size:a.count*48,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});const e=d.createCommandEncoder();e.copyBufferToBuffer(a.particles,0,b,0,a.count*48);d.queue.submit([e.finish()]);await b.mapAsync(GPUMapMode.READ);const v=Array.from(new Uint32Array(b.getMappedRange()));b.unmap();b.destroy();return v;};
  const measure=async()=>{const p=await a.pixels();let alpha=0,sum=0;for(let i=0;i<p.length;i+=4){alpha+=p[i+3];sum+=p[i]+p[i+1]+p[i+2];}return {alpha,sum};};
  a.seed('sparse');const before=await read();a.render(2,{transparent:true});const thin=await measure();
  a.s.params.smokeOpticalDensity=3;a.render(2,{transparent:true});const thick=await measure();
  a.s.params.smokeOpticalDensity=1;a.render(2,{transparent:true});const repeat=await measure();
  a.s.params.sceneLightAzimuth=90;a.s.params.sceneLightElevation=20;a.render(2,{transparent:true});const side=await measure();
  a.s.params.sceneLightAzimuth=270;a.render(2,{transparent:true});const back=await measure();
  for(const m of [0,1,2]){a.render(m,{ppm:80});await a.pixels();}
  const after=await read(),alloc=a.volume.stats.allocations;for(let i=0;i<4;i++)a.render(2);await a.pixels();const stable=a.volume.stats.allocations===alloc;
  a.render(2,{scale:1});await a.pixels();const resized=a.volume.stats.allocations===alloc+1&&a.volume.stats.width===320;
  const resources=a.volume.resourceCount;a.volume.destroy();
  return {thin,thick,repeat,side,back,unchanged:JSON.stringify(before)===JSON.stringify(after),stable,resized,resources,destroyed:a.volume.resourceCount,errors:a.errors};
 });
 expect(r.errors).toEqual([]);expect(r.thick.alpha).toBeGreaterThan(r.thin.alpha);expect(r.repeat).toEqual(r.thin);expect(r.side.alpha).toBe(r.back.alpha);expect(r.side.sum).not.toBe(r.back.sum);expect(r.unchanged).toBe(true);expect(r.stable).toBe(true);expect(r.resized).toBe(true);expect(r.resources).toBe(3);expect(r.destroyed).toBe(0);
});
test('material controls persist, import and reset independently of smoke dynamics',async({page})=>{
 await page.goto('/?debugMode=quiet');await page.waitForFunction(()=>window.state?.loop.simulationTime>0);
 await page.evaluate(async()=>{
  const c=await import('/js/ui/controls.js');const n=document.getElementById('smokeOpticalDensity');n.value=1.8;n.dispatchEvent(new Event('input',{bubbles:true}));c.importSettings(c.exportSettings());
 });
 expect(await page.evaluate(()=>[state.params.smokeOpticalDensity,state.params.smokeCurlNoiseScale,state.params.smokeAirflowStrength])).toEqual([1.8,2.5,1]);
 await page.reload();await page.waitForFunction(()=>window.state?.params.smokeOpticalDensity===1.8);
 await page.evaluate(async()=>{(await import('/js/ui/controls.js')).resetControls();});
 expect(await page.evaluate(()=>[state.params.smokeShadingMode,state.params.smokeOpticalDensity,state.params.smokeScattering,state.params.smokeInternalShadow])).toEqual([2,1,1,.8]);
});
