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
 expect(a.stats.dustError).toBeUndefined();expect(a.errors).toEqual([]);expect(a.stats.dust.history).toBe(21);expect(a.stats.dust.drawCalls).toBe(1);
 await page.evaluate(()=>window.__liquidHarness.s.params.dustDisturbance=0);const ambient=await renderSimulatorLiquid(page,2);
 expect(a.hash).not.toBe(ambient.hash);
 await page.evaluate(()=>{window.__liquidHarness.s.params.dustDisturbance=1;window.__liquidHarness.s.body.velocityX=0;window.__liquidHarness.s.body.angularVelocity=0;});
 const stopped=await renderSimulatorLiquid(page,2.2);const settled=await renderSimulatorLiquid(page,8);expect(stopped.hash).not.toBe(settled.hash);
 const again=await renderSimulatorLiquid(page,2.2);expect(again.hash).toBe(stopped.hash);
 expect(again.stats.resourceCount).toBe(a.stats.resourceCount);expect(again.stats.dust.bytes).toBe(3200);
 await page.evaluate(()=>window.__liquidHarness.s.params.dustEnabled=false);const off=await renderSimulatorLiquid(page,2.2);
 expect(off.stats.dust.drawCalls).toBe(0);expect(off.hash).not.toBe(again.hash);
});
test('camera/zoom restores the same world field and history stays bounded under long driving',async({page})=>{
 await scene(page);const a=await renderSimulatorLiquid(page,2);
 await page.evaluate(()=>Object.assign(window.__liquidHarness.s.camera,{x:20,y:3,zoom:2}));await renderSimulatorLiquid(page,2);
 await page.evaluate(()=>Object.assign(window.__liquidHarness.s.camera,{x:0,y:0,zoom:1}));const b=await renderSimulatorLiquid(page,2);expect(b.hash).toBe(a.hash);
 await page.evaluate(()=>{for(let i=41;i<8000;i++){const t=i*.05;window.__dust.observeDust({centerX:t*8-10,centerY:0,velocityX:8,velocityY:0,heading:0,angularVelocity:0},t);}});
 const long=await renderSimulatorLiquid(page,399.95);expect(long.stats.dust.history).toBe(96);expect(long.stats.dust.instances).toBeLessThanOrEqual(3320);expect(long.stats.resourceCount).toBe(a.stats.resourceCount);expect(long.errors).toEqual([]);
});
test('failed dust shader keeps liquid and the established renderer functional',async({page})=>{
 await page.route('**/atmospheric-dust.wgsl*',route=>route.fulfill({status:404,body:'missing'}));
 expect(await bootSimulatorLiquid(page)).toBe(true);const frame=await renderSimulatorLiquid(page,1);
 expect(frame.stats.dust).toBeNull();expect(frame.stats.dustError).toContain('404');expect(frame.stats.liquidError).toBeUndefined();expect(frame.errors).toEqual([]);expect(frame.stats.ready).toBe(true);
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
 await page.reload();await page.waitForFunction(()=>window.state?.params.dustWind===.4);
});
