import {test,expect} from '@playwright/test';
import {bootSimulatorLiquid,renderSimulatorLiquid} from './helpers/simulator-liquid.js';
import {installLiveGPUTarget,startDyedDrift} from './helpers/live-gpu.js';
async function scene(page){
 expect(await bootSimulatorLiquid(page)).toBe(true);
 await page.evaluate(async()=>{
  const {s}=window.__liquidHarness;s.params.liquidEnabled=false;s.params.dustWind=0;Object.assign(s.camera,{x:0,y:0,zoom:1});
  window.__dust=await import('/js/renderer/dust-history.js');window.__dust.resetDustHistory();
  for(let i=0;i<=40;i++){const t=i*.05;window.__dust.observeDust({centerX:t*8-10,centerY:0,velocityX:8,velocityY:0,heading:0,angularVelocity:.6},t);}
  Object.assign(s.body,{centerX:6,centerY:0,velocityX:8,velocityY:0,heading:0,angularVelocity:.6});
 });
}
test('world dust reacts to velocity and slip, retains a settling wake, and reconstructs time',async({page})=>{
 await scene(page);const a=await renderSimulatorLiquid(page,2,true);
 expect(a.stats.dustError).toBeUndefined();expect(a.errors).toEqual([]);expect(a.stats.dust.history).toBe(21);expect(a.stats.dust.drawCalls).toBe(2);
 await page.evaluate(()=>window.__liquidHarness.s.params.dustDisturbance=0);const ambient=await renderSimulatorLiquid(page,2);
 expect(a.hash).not.toBe(ambient.hash);
 await page.evaluate(()=>{window.__liquidHarness.s.params.dustDisturbance=1;window.__liquidHarness.s.body.velocityX=0;window.__liquidHarness.s.body.angularVelocity=0;});
 const stopped=await renderSimulatorLiquid(page,2.2);const settled=await renderSimulatorLiquid(page,8);expect(stopped.hash).not.toBe(settled.hash);
 const again=await renderSimulatorLiquid(page,2.2);expect(again.hash).toBe(stopped.hash);
 expect(again.stats.resourceCount).toBe(a.stats.resourceCount);expect(again.stats.dust.bytes).toBe(5257376);
 await page.evaluate(()=>window.__liquidHarness.s.params.dustEnabled=false);const off=await renderSimulatorLiquid(page,2.2);
 expect(off.stats.dust.drawCalls).toBe(0);expect(off.hash).not.toBe(again.hash);
});
test('camera/zoom restores the same world field and history stays bounded under long driving',async({page})=>{
 await scene(page);const a=await renderSimulatorLiquid(page,2);
 await page.evaluate(()=>Object.assign(window.__liquidHarness.s.camera,{x:20,y:3,zoom:2}));await renderSimulatorLiquid(page,2);
 await page.evaluate(()=>Object.assign(window.__liquidHarness.s.camera,{x:0,y:0,zoom:1}));const b=await renderSimulatorLiquid(page,2);expect(b.hash).toBe(a.hash);
 await page.evaluate(()=>{for(let i=41;i<8000;i++){const t=i*.05;window.__dust.observeDust({centerX:t*8-10,centerY:0,velocityX:8,velocityY:0,heading:0,angularVelocity:0},t);}});
 const long=await renderSimulatorLiquid(page,399.95);expect(long.stats.dust.history).toBe(96);expect(long.stats.dust.instances).toBeLessThanOrEqual(65536);expect(long.stats.resourceCount).toBe(a.stats.resourceCount);expect(long.errors).toEqual([]);
});
test('failed dust shader keeps liquid and the established renderer functional',async({page})=>{
 await page.route('**/atmospheric-dust.wgsl*',route=>route.fulfill({status:404,body:'missing'}));
 expect(await bootSimulatorLiquid(page)).toBe(true);const frame=await renderSimulatorLiquid(page,1);
 expect(frame.stats.dust).toBeNull();expect(frame.stats.dustError).toContain('404');expect(frame.stats.liquidError).toBeUndefined();expect(frame.errors).toEqual([]);expect(frame.stats.ready).toBe(true);
});
test('airflow follows actual velocity with fixed heading, independently of the ground renderer',async({page})=>{
 await scene(page);await page.evaluate(()=>{window.__dust.resetDustHistory();window.__liquidHarness.s.body.angularVelocity=0;});
 const right=await renderSimulatorLiquid(page,2);
 await page.evaluate(()=>Object.assign(window.__liquidHarness.s.body,{velocityX:0,velocityY:-8}));const forward=await renderSimulatorLiquid(page,2);expect(forward.hash).not.toBe(right.hash);
 await page.evaluate(()=>window.__liquidHarness.s.params.dustEnabled=false);const offForward=await renderSimulatorLiquid(page,2);
 await page.evaluate(()=>Object.assign(window.__liquidHarness.s.body,{velocityX:8,velocityY:0}));const offRight=await renderSimulatorLiquid(page,2);expect(offRight.hash).toBe(offForward.hash);
});
test('the real simulator records moving-car airflow without altering input and persists dust controls',async({page})=>{
 await installLiveGPUTarget(page);await startDyedDrift(page);
 await expect.poll(()=>page.evaluate(async()=>{const {dustHistory}=await import('/js/renderer/dust-history.js');return dustHistory().count;})).toBeGreaterThan(3);
 await page.locator('#search').fill('Atmospheric dust');
 await expect(page.locator('#dustEnabled')).toBeVisible();
 await page.locator('#dustWind').evaluate(n=>{n.value=.4;n.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(await page.evaluate(()=>state.params.dustWind)).toBe(.4);
 expect(await page.evaluate(()=>localStorage.getItem('dustParam_dustWind'))).toBe('0.4');
 const settings=await page.evaluate(async()=>{const c=await import('/js/ui/controls.js');const v=c.exportSettings();c.importSettings(v);return state.params.dustWind;});expect(settings).toBe(.4);
 await page.locator('#dustAppearancePreset').selectOption('subtle');
 expect(await page.evaluate(()=>[state.params.dustDensity,state.params.dustVisibility,state.params.dustDisturbance])).toEqual([.45,.45,1]);
 await page.locator('#dustVisibility').evaluate(n=>{n.value=1.4;n.dispatchEvent(new Event('input',{bubbles:true}));});
 await expect(page.locator('#dustAppearancePreset')).toHaveValue('custom');
 await page.locator('#dustAppearancePreset').selectOption('cinematic');
 expect(await page.evaluate(()=>[state.params.dustDensity,state.params.dustVisibility,state.params.dustWind])).toEqual([.8,1.15,.4]);
 await page.reload();await page.waitForFunction(()=>window.state?.params.dustWind===.4&&window.state.params.dustVisibility===1.15);
 await expect(page.locator('#dustAppearancePreset')).toHaveValue('cinematic');
});

test('visible wake does not require ambient motes and a settled stationary field stays calm',async({page})=>{
 await scene(page);
 await page.evaluate(()=>{window.__liquidHarness.s.params.dustDensity=0;window.__liquidHarness.s.params.dustVisibility=1.15;});
 const wake=await renderSimulatorLiquid(page,2);
 await page.evaluate(()=>window.__liquidHarness.s.params.dustEnabled=false);const off=await renderSimulatorLiquid(page,2);expect(wake.hash).not.toBe(off.hash);
 await page.evaluate(()=>{const s=window.__liquidHarness.s;s.params.dustEnabled=true;s.body.velocityX=0;s.body.angularVelocity=0;});
 const settled=await renderSimulatorLiquid(page,10);
 await page.evaluate(()=>window.__liquidHarness.s.params.dustEnabled=false);const clean=await renderSimulatorLiquid(page,10);
 expect(settled.hash).toBe(clean.hash);expect(wake.errors).toEqual([]);
});

test('tracers complete sustained opposite rotations and reconstruct exactly after seeking',async({page})=>{
 // Controlled pair isolates transport from the changing car and nearby vortices.
 await page.route('**/dust-vortices.js',route=>route.fulfill({contentType:'text/javascript',body:`
 export const DUST_TRACERS=65536,DUST_VORTICES=96,DUST_ELEMENT_BYTES=64;
 export function buildDustTransport(h,t,b,p,v){v.set([-3,0,0,9,0,0,.72,1,3,0,0,-9,0,0,.72,-1]);return {poses:0,vortices:2};}` }));
 expect(await bootSimulatorLiquid(page)).toBe(true);
 await page.evaluate(()=>{const {s}=window.__liquidHarness;s.params.liquidEnabled=false;s.params.dustWind=0;s.body.velocityX=s.body.velocityY=0;Object.assign(s.camera,{x:0,y:0,zoom:1});});
 await renderSimulatorLiquid(page,.15);
 const initial=await page.evaluate(()=>window.__liquidHarness.gpu.getDustTracerSnapshot());
 const candidates=[];
 for(let k=0;k<initial.length;k+=16)for(const cx of [-3,3]){
  const x=initial[k]-cx,y=initial[k+1],r=Math.hypot(x,y);
  if(r>.10&&r<.50&&initial[k+13]>.1)candidates.push({id:k/16,cx,r,angle:0,last:[x,y],valid:true});
 }
 expect(candidates.length).toBeGreaterThan(3);
 const first=Math.min(...candidates.map(c=>c.id)),count=Math.max(...candidates.map(c=>c.id))-first+1;
 let reference;
 for(let i=2;i<=18;i++){
  const frame=await renderSimulatorLiquid(page,i*.15);if(i===6)reference=frame.hash;
  const values=await page.evaluate(({first,count})=>window.__liquidHarness.gpu.getDustTracerSnapshot(first,count),{first,count});
  for(const c of candidates){const k=(c.id-first)*16,x=values[k]-c.cx,y=values[k+1];if(Math.abs(Math.hypot(x,y)-c.r)>.0001)c.valid=false;
   c.angle+=Math.atan2(c.last[0]*y-c.last[1]*x,c.last[0]*x+c.last[1]*y);c.last=[x,y];}
 }
 const stable=candidates.filter(c=>c.valid);
 await test.info().attach('vortex-orbits',{body:JSON.stringify(stable.map(({id,cx,r,angle})=>({id,centerX:cx,radius:r,rotationRadians:angle})),null,2),contentType:'application/json'});
 expect(Math.max(...stable.filter(c=>c.cx<0).map(c=>c.angle))).toBeGreaterThan(2*Math.PI);
 expect(Math.min(...stable.filter(c=>c.cx>0).map(c=>c.angle))).toBeLessThan(-2*Math.PI);
 expect((await renderSimulatorLiquid(page,.9)).hash).toBe(reference);
});

test('optional dust timestamps survive disable, re-enable and device release without validation errors',async({page})=>{
 expect(await bootSimulatorLiquid(page,'gpuProfile=1')).toBe(true);
 const timestamps=await page.evaluate(()=>window.__liquidDevice.features.has('timestamp-query'));
 for(let i=0;i<22;i++)await renderSimulatorLiquid(page,i/60);
 const stats=await page.evaluate(()=>window.__liquidHarness.gpu.getGPURenderStats());
 if(timestamps){expect(stats.dust.gpuTimestampSamples).toBeGreaterThan(0);expect(stats.dust.gpuComputeMs).toBeGreaterThanOrEqual(0);}
 else expect(stats.dust.gpuComputeMs).toBeNull();
 await page.evaluate(()=>window.__liquidHarness.s.params.dustEnabled=false);
 for(let i=0;i<3;i++)await renderSimulatorLiquid(page,.5+i/60);
 await page.evaluate(()=>window.__liquidHarness.s.params.dustEnabled=true);await renderSimulatorLiquid(page,.6);
 expect(await page.evaluate(()=>window.__liquidErrors)).toEqual([]);
 await page.evaluate(()=>window.__liquidDevice.destroy());await page.waitForFunction(()=>!window.__liquidHarness.gpu.isGPUReady());
 expect(await page.evaluate(()=>window.__liquidHarness.gpu.getGPURenderStats().resourceCount)).toBe(0);
});
