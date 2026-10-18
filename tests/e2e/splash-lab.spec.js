import { test, expect } from '@playwright/test';
import { offscreenSplash, splashPixels, seekSplash } from './helpers/splash-gpu.js';
async function start(page,query='time=.3&paused=1') {
 await offscreenSplash(page);await page.goto(`/experiments/splash-lab/?${query}`);
 const available=await page.evaluate(async()=>!!(await navigator.gpu?.requestAdapter()));
 test.skip(!available,'No WebGPU adapter; run with software GPU configuration for WGSL correctness.');
 expect(await page.evaluate(()=>window.splashLab.ready),await page.locator('#failure').textContent()).toBe(true);
 await page.waitForFunction(()=>window.splashLab.renderer.stats.frames>0);
}
test('real liquid shaders evolve and replay deterministically without importing the simulator',async({page})=>{
 const errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
 await start(page);const before=await splashPixels(page);
 await seekSplash(page,.95);const film=await splashPixels(page);
 await seekSplash(page,1.85);const breakup=await splashPixels(page);
 await seekSplash(page,.95);const replay=await splashPixels(page);
 expect(film.red).toBeGreaterThan(before.red*5);expect(film.red).toBeGreaterThan(10000);
 expect(breakup.hash).not.toBe(film.hash);expect(replay.hash).toBe(film.hash);
 expect(requests.some(url=>/\/js\/(main|state|balloon|physics\/)/.test(url))).toBe(false);
 expect(errors).toEqual([]);expect(await page.evaluate(()=>window.splashLab.renderer.stats.error)).toBeUndefined();
});
test('controls, pause, seed, resize and quality changes retain bounded resources',async({page})=>{
 await start(page,'time=.95&paused=1');const original=await splashPixels(page);
 const allocation=await page.evaluate(()=>{
  const lab=window.splashLab,before=lab.renderer.stats.resourceAllocations;
  for(let i=0;i<6;i++)lab.renderer.render(lab.clock.time,lab.getSettings());
  return {before,after:lab.renderer.stats.resourceAllocations,owned:lab.renderer.resources.length};
 });
 expect(allocation.after).toBe(allocation.before);expect(allocation.owned).toBe(6);
 await page.locator('#seed').fill('77');await seekSplash(page,.95);expect((await splashPixels(page)).hash).not.toBe(original.hash);
 await page.locator('#concentration').focus();await page.locator('#concentration').press('Home');await page.locator('#concentration').press('ArrowRight');await seekSplash(page,.95);expect((await splashPixels(page)).hash).not.toBe(original.hash);
 await page.selectOption('#quality','performance');await seekSplash(page,.95);
 expect(await page.evaluate(()=>window.splashLab.renderer.stats.quality)).toBe('performance');
 await page.setViewportSize({width:900,height:800});await seekSplash(page,.95);
 expect(await page.evaluate(()=>window.splashLab.renderer.stats.width*window.splashLab.renderer.stats.height)).toBeLessThanOrEqual(1400000);
 await page.getByRole('button',{name:'Replay impact'}).click();
 await page.waitForFunction(()=>window.splashLab.clock.time>.05);
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 const time=await page.evaluate(()=>window.splashLab.clock.time);await page.waitForTimeout(100);
 expect(await page.evaluate(()=>window.splashLab.clock.time)).toBe(time);
});
test('device loss stops the laboratory cleanly; failed artwork has a visible fallback',async({page})=>{
 await page.route('**/assets/vehicles/delorean/DeLorean.png',route=>route.abort());
 await start(page,'time=.95&paused=1');
 expect(await page.evaluate(()=>window.splashLab.renderer.stats.carFallback)).toBe(true);
 await page.evaluate(()=>window.splashLab.renderer.device.destroy());
 await expect(page.locator('#failure')).toBeVisible();
 expect(await page.evaluate(()=>window.splashLab.renderer.ready)).toBe(false);
 expect(await page.evaluate(()=>window.splashLab.renderer.resources.length)).toBe(0);
});
test('absence of WebGPU is explained without crashing or starting the simulator',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true}));
 await page.goto('/experiments/splash-lab/');
 await expect(page.locator('#failure')).toContainText('WebGPU is unavailable');
 expect(errors).toEqual([]);
});
test('partial GPU allocation failure releases the experiment resources',async({page})=>{
 await offscreenSplash(page);
 await page.addInitScript(()=>{
  if(!navigator.gpu)return;
  const request=navigator.gpu.requestAdapter.bind(navigator.gpu);
  navigator.gpu.requestAdapter=async options=>{
   const adapter=await request(options);if(!adapter)return adapter;
   const makeDevice=adapter.requestDevice.bind(adapter);
   adapter.requestDevice=async options=>{
    const device=await makeDevice(options),makeBuffer=device.createBuffer.bind(device);
    device.createBuffer=options=>{if(options.label==='membrane-indices')throw Error('Injected allocation failure');return makeBuffer(options);};
    return device;
   };return adapter;
  };
 });
 await page.goto('/experiments/splash-lab/?paused=1');
 const available=await page.evaluate(async()=>!!(await navigator.gpu?.requestAdapter()));
 test.skip(!available,'No GPU adapter for allocation-failure coverage');
 await expect(page.locator('#failure')).toContainText('Injected allocation failure');
 expect(await page.evaluate(()=>window.splashLab.renderer.getStats().ownedResourceCount)).toBe(0);
});
