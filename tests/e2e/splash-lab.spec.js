import { test, expect } from '@playwright/test';
import { offscreenSplash, splashPixels, seekSplash, groundPixels, splashKinematics, puddleOptics, dryGroundPixels, airborneOptics } from './helpers/splash-gpu.js';
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

test('world deposition accumulates, persists and reconstructs exactly after backward seeks',async({page})=>{
 await start(page);expect((await groundPixels(page)).mass).toBe(0);
 await seekSplash(page,1.25);const first=await groundPixels(page);expect(first.mass).toBeGreaterThan(0);
 await seekSplash(page,1.85);const growing=await groundPixels(page);expect(growing.mass).toBeGreaterThan(first.mass);
 await seekSplash(page,3.8);const settled=await groundPixels(page);
 expect(settled.mass).toBeGreaterThan(growing.mass);expect(settled.touched).toBeGreaterThan(1000);
 const visible=await splashPixels(page),dry=await dryGroundPixels(page);
 // Visibility is a wet/dry comparison, not a bright-red paint pixel threshold.
 expect(dry.hash).not.toBe(visible.hash);expect(dry.differenceMean).toBeGreaterThan(1);
 await seekSplash(page,8);expect((await groundPixels(page)).hash).toBe(settled.hash);
 await seekSplash(page,1.25);expect((await groundPixels(page)).hash).toBe(first.hash);
 await seekSplash(page,.3);expect((await groundPixels(page)).mass).toBe(0);
 await seekSplash(page,8);expect((await groundPixels(page)).hash).toBe(settled.hash);
 expect(await page.evaluate(()=>window.splashLab.renderer.stats.error)).toBeUndefined();
});

test('settled ground is cached, world anchored and independent of frame history',async({page})=>{
 await start(page,'time=8&paused=1');const direct=await groundPixels(page);
 const reuse=await page.evaluate(()=>{
  const r=window.splashLab.renderer,before=r.getStats();
  for(const time of [4,5,6,7,8])r.render(time,window.splashLab.getSettings());
  return {before,after:r.getStats()};
 });
 expect(reuse.after.depositionRebuilds).toBe(reuse.before.depositionRebuilds);
 expect(reuse.after.resourceAllocations).toBe(reuse.before.resourceAllocations);
 expect(reuse.after.drawCalls).toBe(2);
 await page.setViewportSize({width:900,height:800});await seekSplash(page,8);
 expect((await groundPixels(page)).hash).toBe(direct.hash);
 for(const time of [.3,.7,1.1,1.8,2.6,8])await seekSplash(page,time);
 expect((await groundPixels(page)).hash).toBe(direct.hash);
 await page.selectOption('#quality','performance');await seekSplash(page,8);
 expect((await groundPixels(page)).width).toBe(512);
 await page.selectOption('#quality','balanced');await seekSplash(page,8);
 expect((await groundPixels(page)).hash).toBe(direct.hash);
 expect(await page.evaluate(()=>window.splashLab.renderer.getStats().ownedResourceCount)).toBe(reuse.before.ownedResourceCount);
});

test('speed adds forward momentum while retaining outward spread without axis stretching',async({page})=>{
 await start(page,'time=1.05&paused=1&speed=5');const low=await splashKinematics(page);
 await page.locator('#speed').focus();await page.locator('#speed').press('End');await seekSplash(page,1.05);
 const high=await splashKinematics(page);
 const moments=rows=>{
  const x=rows.map(r=>r.sheet[0]),y=rows.map(r=>r.sheet[1]+.8);
  const mean=a=>a.reduce((s,n)=>s+n,0)/a.length,mx=mean(x),my=mean(y);
  return {forward:-my,vx:mean(x.map(n=>(n-mx)**2)),vy:mean(y.map(n=>(n-my)**2)),minY:Math.min(...y),maxY:Math.max(...y)};
 };
 const a=moments(low),b=moments(high);
 expect(b.forward).toBeGreaterThan(a.forward+1.5);
 expect(b.vx/b.vy).toBeCloseTo(a.vx/a.vy,4);
 expect(Math.sqrt(b.vx/a.vx)).toBeLessThan(1.25);
 expect(b.minY).toBeLessThan(0);expect(b.maxY).toBeGreaterThan(0);
 expect(high[0].momentum).toBeLessThan(low[0].momentum);
 // The closed polar mesh must stay joined after contact as well as in flight.
 await seekSplash(page,1.8);
 const joined=await splashKinematics(page);
 for(let axis=0;axis<3;axis++)expect(joined[0].sheet[axis]).toBeCloseTo(joined[256].sheet[axis],5);
 for(const point of joined)for(let axis=0;axis<2;axis++)expect(point.center[axis]).toBeCloseTo(joined[0].center[axis],5);
});

test('droplet touchdown feeds a lasting footprint and secondary landing uses the same geometry',async({page})=>{
 await start(page,'time=1.05&paused=1');const initial=await splashKinematics(page);
 const id=initial.findIndex((r,i)=>i<128&&r.landing[3]>.05);
 expect(id).toBeGreaterThanOrEqual(0);
 const [x,y,arrival]=initial[id].landing;
 await seekSplash(page,.55+arrival-.015);let rows=await splashKinematics(page);
 expect(rows[id].drop[2]).toBeGreaterThan(0);expect(rows[id].drop[3]).toBeGreaterThan(0);
 await seekSplash(page,.55+arrival+.07);rows=await splashKinematics(page);
 expect(rows[id].drop[0]).toBeCloseTo(x,5);expect(rows[id].drop[1]).toBeCloseTo(y,5);
 expect(rows[id].drop[2]).toBe(0);expect((await groundPixels(page,[[x,y]])).samples[0]).toBeGreaterThan(0);
 expect(rows[id*2].secondary[2]).toBeGreaterThan(0);expect(rows[id*2].secondary[3]).toBeGreaterThan(0);
 const [sx,sy,secondaryArrival]=rows[id*2].secondaryLanding;
 await seekSplash(page,.55+secondaryArrival+.1);rows=await splashKinematics(page);
 expect(rows[id].drop[3]).toBe(0);
 expect(rows[id*2].secondary[0]).toBeCloseTo(sx,5);expect(rows[id*2].secondary[1]).toBeCloseTo(sy,5);
 expect(rows[id*2].secondary[2]).toBe(0);
 await seekSplash(page,8);const residue=await groundPixels(page,[[x,y],[sx,sy]]);
 expect(residue.samples.every(n=>n>0)).toBe(true);
});

test('puddle optics retain transmission, water Fresnel, directional reflections and settling',async({page})=>{
 await start(page,'time=5&paused=1');const values=await puddleOptics(page);
 expect(values.flat().every(Number.isFinite)).toBe(true);
 for(let channel=0;channel<3;channel++){
  expect(values[0][channel]).toBeGreaterThan(values[1][channel]);
  expect(values[1][channel]).toBeGreaterThan(values[2][channel]);
 }
 expect(values[1][0]).toBeGreaterThan(values[1][1]);expect(values[1][1]).toBeGreaterThan(values[1][2]);
 expect(values[3][0]).toBeCloseTo(.0204,5);expect(values[3][1]).toBeGreaterThan(values[3][0]);
 expect(values[3][2]).toBeLessThan(values[3][3]);
 expect(values[4][0]).toBeGreaterThan(values[5][0]*2);
 expect(values[6][0]).toBe(0);expect(values[6][1]).toBe(0);expect(values[6][2]).toBeGreaterThan(0);
 expect(values[7][0]).toBeGreaterThan(0);expect(values[8][0]).toBeGreaterThan(values[7][0]);
 expect(Math.hypot(...values[9].slice(0,2))).toBeGreaterThan(0);
 expect(values[10].slice(0,2)).toEqual([0,0]);expect(values[11].slice(0,2)).toEqual([0,0]);
 expect(values[12][0]).toBeGreaterThan(values[12][1]*100);
 expect(values[13].slice(0,3)).toEqual([0,0,0]);expect(values[13][3]).toBeGreaterThan(0);
});

test('settled reflected ground stays still and concentration changes only optics',async({page})=>{
 await start(page,'time=5&paused=1');const first=await splashPixels(page),atlas=await groundPixels(page);
 await seekSplash(page,8);expect((await splashPixels(page)).groundHash).toBe(first.groundHash);
 await seekSplash(page,1.6);await seekSplash(page,5);
 expect((await splashPixels(page)).hash).toBe(first.hash);
 const rebuilds=await page.evaluate(()=>window.splashLab.renderer.stats.depositionRebuilds);
 await page.locator('#concentration').focus();await page.locator('#concentration').press('End');await seekSplash(page,5);
 expect((await groundPixels(page)).hash).toBe(atlas.hash);
 expect(await page.evaluate(()=>window.splashLab.renderer.stats.depositionRebuilds)).toBe(rebuilds);
 expect((await splashPixels(page)).groundHash).not.toBe(first.groundHash);
});


test('airborne water shares puddle absorption, thins at edges and absorbs overlapping layers',async({page})=>{
 await start(page,'time=1.25&paused=1');const values=await airborneOptics(page);
 expect(values.flat().every(Number.isFinite)).toBe(true);
 expect(values[0]).toEqual(values[1]); // Same dye, path model and concentration.
 for(let channel=0;channel<3;channel++){
  expect(values[0][channel]).toBeGreaterThan(values[2][channel]);
  expect(values[2][channel]).toBeGreaterThan(values[3][channel]);
 }
 expect(values[2][0]).toBeGreaterThan(values[2][1]);expect(values[2][1]).toBeGreaterThan(values[2][2]);
 expect(values[4][3]).toBeLessThan(values[5][3]);
 expect(values[6]).toEqual([0,0,0,0]);expect(values[7][3]).toBeLessThan(.02);
 // Layers reduce transmitted luminance instead of replacing prior liquid
 // with a fresh dry scene sample. White highlights remain lighting-driven.
 const luminance=v=>v[0]*.2126+v[1]*.7152+v[2]*.0722;
 expect(luminance(values[9])).toBeLessThan(luminance(values[8]));
 expect(values[10][0]).toBeLessThan(.18);expect(values[10][1]).toBeLessThan(.01);
 expect(values[11][0]).toBeGreaterThan(values[5][0]);
 expect(values[11][1]).toBeGreaterThan(values[5][1]);
});
