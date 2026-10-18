import { test, expect } from '@playwright/test';
import { offscreenSplash, splashPixels, seekSplash, groundPixels, vehicleLiquidProbe } from './helpers/splash-gpu.js';
async function start(page,query='time=.95&paused=1') {
 await offscreenSplash(page);await page.goto(`/experiments/splash-lab/?${query}`);
 test.skip(!await page.evaluate(async()=>!!await navigator.gpu?.requestAdapter()),'No WebGPU adapter; use the GPU test configuration.');
 expect(await page.evaluate(()=>window.splashLab.ready),await page.locator('#failure').textContent()).toBe(true);
 await page.waitForFunction(()=>window.splashLab.renderer.stats.frames>0);
 await page.locator('#vehicle-controls').evaluate(node=>node.open=true);
}
async function setRange(page,id,value){await page.locator(`#${id}`).evaluate((node,value)=>{node.value=String(value);node.dispatchEvent(new Event('input',{bubbles:true}));},value);}

test('vehicle contact splits local liquid, retains body film and dries to optional dye on the GPU',async({page})=>{
 await start(page);const probe=await vehicleLiquidProbe(page);
 expect(probe.fields.flat(2).every(Number.isFinite)).toBe(true);
 const sum=(t,c)=>probe.fields.reduce((total,row)=>total+row[t][c],0);
 expect(sum(0,0)).toBeGreaterThan(.001);expect(sum(1,0)).toBeGreaterThan(.001);
 expect(sum(2,0)).toBeLessThan(sum(1,0));expect(sum(3,0)).toBe(0);expect(sum(3,1)).toBe(0);expect(sum(3,2)).toBeGreaterThan(0);
 const [left,right,far]=probe.response;
 expect(left[0]).toBeLessThan(-.1);expect(right[0]).toBeGreaterThan(.1);
 expect(left[2]).toBeGreaterThan(0);expect(right[2]).toBeGreaterThan(0);
 expect(left[3]).toBe(0);expect(right[3]).toBe(0);expect(far).toEqual([0,0,0,1]);
 await setRange(page,'body-wetness',0);await setRange(page,'hood-deflection',0);await seekSplash(page,.95);
 const disabled=await vehicleLiquidProbe(page);expect(disabled.fields.every(row=>row.every(f=>f[0]===0&&f[1]===0&&f[2]===0))).toBe(true);
 expect(disabled.response.every(row=>row.slice(0,3).every(n=>n===0))).toBe(true);
});

test('interaction and persistent body wetness replay exactly while ground deposition and resources stay unchanged',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await start(page);const impact=await splashPixels(page),atlasImpact=await groundPixels(page);
 await page.locator('#vehicle-interaction').uncheck();await seekSplash(page,.95);
 expect((await splashPixels(page)).hash).not.toBe(impact.hash);expect((await groundPixels(page)).hash).toBe(atlasImpact.hash);
 await page.locator('#vehicle-interaction').check();await seekSplash(page,.95);expect((await splashPixels(page)).hash).toBe(impact.hash);
 await seekSplash(page,5);const wet=await splashPixels(page),atlas=await groundPixels(page);
 const before=await page.evaluate(()=>window.splashLab.renderer.getStats());
 await seekSplash(page,18);const drying=await splashPixels(page);expect(drying.hash).not.toBe(wet.hash);
 for(const t of [72,.3,1.05,5])await seekSplash(page,t);expect((await splashPixels(page)).hash).toBe(wet.hash);
 expect((await groundPixels(page)).hash).toBe(atlas.hash);
 await page.locator('#vehicle-interaction').uncheck();await seekSplash(page,5);const dryCar=await splashPixels(page);
 expect(dryCar.hash).not.toBe(wet.hash);expect(dryCar.groundHash).toBe(wet.groundHash);
 await page.locator('#vehicle-interaction').check();await seekSplash(page,5);expect((await splashPixels(page)).hash).toBe(wet.hash);
 const after=await page.evaluate(()=>window.splashLab.renderer.getStats());expect(after.resourceAllocations).toBe(before.resourceAllocations);expect(after.ownedResourceCount).toBe(before.ownedResourceCount);
 await setRange(page,'body-residue',0);await seekSplash(page,72);const clear=await splashPixels(page);
 await page.locator('#vehicle-interaction').uncheck();await seekSplash(page,72);expect((await splashPixels(page)).hash).toBe(clear.hash);
 expect(errors).toEqual([]);expect(await page.evaluate(()=>window.splashLab.renderer.stats.error)).toBeUndefined();
});

test('vehicle appearance controls have independently visible effects and reset restores the prototype',async({page})=>{
 await start(page,'time=5&paused=1');
 for(const [id,value,restore,time] of [['body-wetness',2,1,5],['body-runoff',0,1,5],['hood-deflection',0,1,.95],['body-drying-duration',8,22,18],['body-residue',0,.18,72]]){
  await seekSplash(page,time);const base=await splashPixels(page);
  await setRange(page,id,value);await seekSplash(page,time);expect((await splashPixels(page)).hash,`${id} must affect the image`).not.toBe(base.hash);
  await setRange(page,id,restore);await seekSplash(page,time);expect((await splashPixels(page)).hash,`${id} must restore exactly`).toBe(base.hash);
 }
 await page.locator('#reset-controls').click();await seekSplash(page,5);
 expect(await page.evaluate(()=>window.splashLab.getSettings())).toMatchObject({vehicleInteraction:true,bodyWetness:1,bodyRunoff:1,hoodDeflection:1,bodyDryingDuration:22,bodyResidue:.18});
});
