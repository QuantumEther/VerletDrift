import { test, expect } from '@playwright/test';
import { offscreenSplash, splashPixels, seekSplash, dryGroundPixels, groundPixels } from './helpers/splash-gpu.js';
async function start(page,query='time=1.25&paused=1'){
 await offscreenSplash(page);await page.goto(`/experiments/splash-lab/?${query}`);
 test.skip(!await page.evaluate(async()=>!!await navigator.gpu?.requestAdapter()),'WebGPU required for production WGSL checks.');
 expect(await page.evaluate(()=>window.splashLab.ready),await page.locator('#failure').textContent()).toBe(true);
 await page.waitForFunction(()=>window.splashLab.renderer.stats.frames>0);
}

test('asphalt cache invalidates on seed and resize but not optical controls or time',async({page})=>{
 await start(page,'time=5&paused=1');const original=await splashPixels(page),atlas=await groundPixels(page);
 const before=await page.evaluate(()=>window.splashLab.renderer.getStats());
 for(const time of [18,45,1.25,5])await seekSplash(page,time);
 expect((await splashPixels(page)).hash).toBe(original.hash);
 let stats=await page.evaluate(()=>window.splashLab.renderer.getStats());
 expect(stats.terrainRebuilds).toBe(before.terrainRebuilds);expect(stats.resourceAllocations).toBe(before.resourceAllocations);
 // The first seek back from airborne time reconstructs the atlas (three draws).
 expect(stats.drawCalls).toBe(5);expect(stats.computeDispatches).toBe(0);
 await seekSplash(page,5);stats=await page.evaluate(()=>window.splashLab.renderer.getStats());
 expect(stats.drawCalls).toBe(2);expect(stats.computeDispatches).toBe(0);
 await page.locator('#concentration').evaluate(n=>{n.value='2';n.dispatchEvent(new Event('input'));});await seekSplash(page,5);
 expect((await splashPixels(page)).hash).not.toBe(original.hash);expect((await groundPixels(page)).hash).toBe(atlas.hash);
 expect(await page.evaluate(()=>window.splashLab.renderer.stats.terrainRebuilds)).toBe(before.terrainRebuilds);
 await page.locator('#seed').fill('77');await seekSplash(page,5);
 expect(await page.evaluate(()=>window.splashLab.renderer.stats.terrainRebuilds)).toBeGreaterThan(before.terrainRebuilds);
 stats=await page.evaluate(()=>window.splashLab.renderer.getStats());
 await page.setViewportSize({width:1000,height:700});await seekSplash(page,5);
 const resized=await page.evaluate(()=>window.splashLab.renderer.getStats());
 expect(resized.terrainRebuilds).toBeGreaterThan(stats.terrainRebuilds);expect(resized.ownedResourceCount).toBe(stats.ownedResourceCount);
 expect(resized.error).toBeUndefined();
});

test('fully evaporated water with no dye restores dry asphalt without a phantom Fresnel film',async({page})=>{
 await start(page,'time=72&paused=1&dyeResidue=0&bodyResidue=0');
 const dry=await splashPixels(page),reference=await dryGroundPixels(page);
 // One output code value is possible from linear/display round trips; no wet film remains.
 expect(reference.differenceMean).toBeLessThan(.01);
 await seekSplash(page,5);expect((await splashPixels(page)).hash).not.toBe(dry.hash);
 await seekSplash(page,72);expect((await splashPixels(page)).hash).toBe(dry.hash);
});

test('bounded car pass matches the combined reference shader at actual pixel centres',async({page})=>{
 await start(page);
 for(const time of [.53,1.25,5,18]){
  await seekSplash(page,time);await splashPixels(page);
  await page.evaluate(()=>{
   window.__splitReference=new Uint8ClampedArray(window.__splashLastPixels);
   const r=window.splashLab.renderer,d=r.device,create=d.createCommandEncoder.bind(d);
   const ground=r.pipelines.groundScene,direct=r.pipelines.directGround;
   // Diagnostic only: run the retained original combined shader, omit the car draw.
   d.createCommandEncoder=(...args)=>{
    const encoder=create(...args),begin=encoder.beginRenderPass.bind(encoder);
    encoder.beginRenderPass=(...args)=>{
     const pass=begin(...args),set=pass.setPipeline.bind(pass),draw=pass.draw.bind(pass);let pipeline;
     pass.setPipeline=p=>{pipeline=p;set(p);};
     pass.draw=(...args)=>{if(pipeline!==r.pipelines.car&&pipeline!==r.pipelines.directCar)draw(...args);};
     return pass;
    };return encoder;
   };
   try{r.pipelines.groundScene=r.pipelines.scene;r.pipelines.directGround=r.pipelines.directScene;r.render(window.splashLab.clock.time,window.splashLab.getSettings());}
   finally{r.pipelines.groundScene=ground;r.pipelines.directGround=direct;d.createCommandEncoder=create;}
  });
  await splashPixels(page);
  const maximum=await page.evaluate(()=>{let max=0;const a=window.__splitReference,b=window.__splashLastPixels;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-b[i]));delete window.__splitReference;return max;});
  expect(maximum,`bounded/composite image mismatch at ${time}s`).toBeLessThanOrEqual(1);
 }
});
