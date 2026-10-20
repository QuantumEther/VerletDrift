import {test,expect} from '@playwright/test';
import {installLiveGPUTarget,startDyedDrift,collideDyedBalloon} from './helpers/live-gpu.js';
import {bootSimulatorLiquid,renderSimulatorLiquid} from './helpers/simulator-liquid.js';
const distance=(a,b)=>Math.abs(((a-b+540)%360)-180);
test('Crimson collisions resolve one dye identity for splash, fresh tires and retained transfers',async({page})=>{
 test.setTimeout(120000);await page.setViewportSize({width:800,height:600});await installLiveGPUTarget(page);await startDyedDrift(page);
 await page.locator('#balloonAppearance').evaluate(n=>{n.value=1;n.dispatchEvent(new Event('input',{bubbles:true}));});
 for(const source of [210,120,270]){
  await collideDyedBalloon(page,source);
  const result=await page.evaluate(()=>({event:window.__events.getLiquidImpacts().events.at(-1),fresh:state.tractionState.lastBalloonHue,tires:Object.values(state.tirePaint).map(p=>p.hue),source:state.balloons[0].hue}));
  expect(result.source).toBe(source);expect(result.event.hue).toBe(350);expect(result.fresh).toBe(350);
  for(const hue of result.tires)expect(distance(hue,350)).toBeLessThan(20);
 }
 await expect.poll(()=>page.evaluate(()=>window.__transfers.getWetTireTransfers().events.length)).toBeGreaterThan(10);
 const hues=await page.evaluate(()=>window.__transfers.getWetTireTransfers().events.map(e=>e.hue));for(const hue of hues)expect(distance(hue,350)).toBeLessThan(20);
 // A preset changes future impacts, never recolours previously deposited material.
 await page.locator('#balloonAppearance').evaluate(n=>{n.value=0;n.dispatchEvent(new Event('input',{bubbles:true}));});
 await collideDyedBalloon(page,210);
 expect(await page.evaluate(()=>window.__events.getLiquidImpacts().events.at(-1).hue)).toBe(210);
 expect(await page.evaluate(()=>window.__events.getLiquidImpacts().events[0].hue)).toBe(350);
 expect(await page.evaluate(()=>window.__transfers.getWetTireTransfers().events[0].hue)).toBeCloseTo(hues[0],6);
 const stats=await page.evaluate(()=>window.__gpuModule.getGPURenderStats());expect(stats.ready).toBe(true);expect(stats.error).toBeNull();
});
async function trails(page){
 expect(await bootSimulatorLiquid(page)).toBe(true);
 await page.evaluate(async()=>{
  const {s}=window.__liquidHarness;const m=await import('/js/renderer/wet-trail-events.js');
  window.__wet=m;
  s.balloons=[];s.skidMarks=[];s.params.liquidBodyResidue=0;
  for(const [hue,x]of [[350,-2],[210,0],[120,2]])for(let j=0;j<50;j++){
   m.recordWetTireTransfer({x1:x,y1:-5+j*.2,x2:x,y2:-4.8+j*.2,width:.24,hue,alpha:.65,paintSaturation:1},0);
  }
 });
}
test('wet-only tracks survive native skid culling, dry spatially and replay exactly with bounded resources',async({page})=>{
 await trails(page);
 const fresh=await renderSimulatorLiquid(page,1),wet=await renderSimulatorLiquid(page,7),dry=await renderSimulatorLiquid(page,35),aged=await renderSimulatorLiquid(page,65),clean=await renderSimulatorLiquid(page,301);
 for(const f of [fresh,wet,dry,aged,clean])expect(f.errors).toEqual([]);
 expect(fresh.stats.liquid.wetTransfers).toBe(150);expect(fresh.stats.liquid.active).toBe(true);
 expect(new Set([fresh.hash,wet.hash,dry.hash,aged.hash]).size).toBe(4);
 expect(clean.stats.liquid.active).toBe(false);
 expect((await renderSimulatorLiquid(page,7)).hash).toBe(wet.hash);
 expect((await renderSimulatorLiquid(page,35)).hash).toBe(dry.hash);
 expect((await renderSimulatorLiquid(page,35)).stats.resourceCount).toBe(dry.stats.resourceCount);
 await page.evaluate(()=>window.__liquidHarness.s.params.showSkidMarks=false);
 const hidden=await renderSimulatorLiquid(page,7);expect(hidden.stats.liquid.active).toBe(false);expect(hidden.hash).toBe(clean.hash);
});
test('optical field retains thickness and dye separately; overlapping colors mix absorption',async({page})=>{
 await trails(page);
 await page.evaluate(()=>{
  const d=window.__liquidDevice,create=d.createTexture.bind(d);
  d.createTexture=desc=>{const t=create(desc.label==='wet-tire-optical-field'?{...desc,usage:desc.usage|GPUTextureUsage.COPY_SRC}:desc);if(desc.label==='wet-tire-optical-field')window.__film=t;return t;};
 });
 await renderSimulatorLiquid(page,1);
 const inspect=()=>page.evaluate(async()=>{
  const d=window.__liquidDevice,t=window.__film,stride=Math.ceil(t.width*8/256)*256;
  const b=d.createBuffer({size:stride*t.height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  const enc=d.createCommandEncoder();enc.copyTextureToBuffer({texture:t},{buffer:b,bytesPerRow:stride},[t.width,t.height]);d.queue.submit([enc.finish()]);await b.mapAsync(GPUMapMode.READ);
  const bytes=new Uint16Array(b.getMappedRange());
  const half=n=>{const e=(n>>10)&31,f=n&1023;return e?2**(e-15)*(1+f/1024):2**-14*f/1024;};
  const centerIndex=256*stride/2+256*4;const center=Array.from(bytes.slice(centerIndex,centerIndex+4),half);
  let water=0,dye=0,count=0;for(let y=0;y<t.height;y++)for(let x=0;x<t.width;x++){const i=y*stride/2+x*4;water+=half(bytes[i+3]);dye+=half(bytes[i])+half(bytes[i+1])+half(bytes[i+2]);if(bytes[i+3])count++;}
  b.unmap();b.destroy();return {water,dye,count,center};
 });
 const fresh=await inspect();
 expect(fresh.center[0]).toBeGreaterThan(fresh.center[2]*10);
 await page.evaluate(()=>{for(let j=0;j<50;j++)window.__wet.recordWetTireTransfer({x1:0,y1:-5+j*.2,x2:0,y2:-4.8+j*.2,width:.24,hue:350,alpha:.65,paintSaturation:1},0);});
 await renderSimulatorLiquid(page,1);const mixed=await inspect();
 expect(mixed.center[3]).toBeCloseTo(fresh.center[3]*2,4);
 expect(mixed.center[1]/mixed.center[0]).toBeGreaterThan(fresh.center[1]/fresh.center[0]*2);
 await renderSimulatorLiquid(page,35);const dry=await inspect();await renderSimulatorLiquid(page,100);const late=await inspect();
 expect(fresh.water).toBeGreaterThan(.01);expect(dry.water).toBeLessThan(mixed.water*.02);expect(dry.dye).toBeGreaterThan(0);expect(late.dye).toBeLessThan(dry.dye*.05);
 expect(dry.count).toBeLessThan(fresh.count);
});

test('wet trails stay attached to the road through camera and zoom changes',async({page})=>{
 await trails(page);const base=await renderSimulatorLiquid(page,4);
 for(const [x,zoom]of [[1,1],[1,1.5],[-2,.7],[0,1]]){
  await page.evaluate(({x,zoom})=>Object.assign(window.__liquidHarness.s.camera,{x,zoom}),{x,zoom});
  const f=await renderSimulatorLiquid(page,4);expect(f.errors).toEqual([]);expect(f.stats.resourceCount).toBe(base.stats.resourceCount);
 }
 expect((await renderSimulatorLiquid(page,4)).hash).toBe(base.hash);
});
