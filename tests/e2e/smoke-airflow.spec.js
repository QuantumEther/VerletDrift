import {test,expect} from '@playwright/test';
import {bootSimulatorLiquid,renderSimulatorLiquid} from './helpers/simulator-liquid.js';

test('airflow shader compiles and failure preserves the existing smoke path',async({page})=>{
 await page.route('**/vehicle-airflow.wgsl*',route=>route.fulfill({status:404,body:'unavailable'}));
 expect(await bootSimulatorLiquid(page)).toBe(true);
 const frame=await renderSimulatorLiquid(page,.1);
 expect(frame.stats.ready).toBe(true);expect(frame.stats.airflowError).toContain('404');expect(frame.stats.smokeAirflow.active).toBe(false);expect(frame.errors).toEqual([]);
});

test('smoke airflow reads persistent shared vortices without dust enabled and releases resources',async({page})=>{
 expect(await bootSimulatorLiquid(page,'gpuProfile=1')).toBe(true);
 await page.evaluate(async()=>{
  const {s}=window.__liquidHarness;Object.assign(s.params,{dustEnabled:false,smokeEnabled:true,smokeSpawnRate:200,smokeLifetimeMin:5,smokeLifetimeMax:5,determinismMode:true});
  const history=await import('/js/renderer/dust-history.js');history.resetDustHistory();
  for(let i=0;i<=20;i++)history.observeDust({centerX:i*.8-16,centerY:0,velocityX:8,velocityY:0,heading:0,angularVelocity:1},i*.1);
  Object.assign(s.body,{centerX:0,centerY:0,velocityX:8,velocityY:0,speed:8});
  for(const n of Object.keys(s.wheels)){s.wheelSlipRatio[n]=1;s.wheels[n].x=-2;s.wheels[n].y=0;}
  (await import('/js/renderer/smoke-system.js')).updateSmoke(.1);
 });
 let last;for(let i=0;i<25;i++)last=await renderSimulatorLiquid(page,2+i/60);
 expect(last.errors).toEqual([]);expect(last.stats.smokeAirflow.vortices).toBeGreaterThan(10);expect(last.stats.smokeAirflow.dispatches).toBe(1);
 expect(last.stats.dust.drawCalls).toBe(0);
 if(await page.evaluate(()=>window.__liquidDevice.features.has('timestamp-query'))){expect(last.stats.smokeAirflow.gpuSamples).toBeGreaterThan(0);}
 const resources=last.stats.resourceCount;
 await page.evaluate(()=>{const {s}=window.__liquidHarness;Object.assign(s.body,{velocityX:0,velocityY:0});s.params.smokeAirflowEnabled=false;});
 const off=await renderSimulatorLiquid(page,2.5);expect(off.stats.smokeAirflow.dispatches).toBe(0);
 await page.evaluate(()=>window.__liquidHarness.s.params.smokeAirflowEnabled=true);
 const settled=await renderSimulatorLiquid(page,7);expect(settled.stats.smokeAirflow.vortices).toBe(0);expect(settled.stats.resourceCount).toBe(resources);
 await page.evaluate(()=>window.__liquidDevice.destroy());await page.waitForFunction(()=>!window.__liquidHarness.gpu.isGPUReady());
 expect(await page.evaluate(()=>window.__liquidHarness.gpu.getGPURenderStats().resourceCount)).toBe(0);
});

import {bootSmokeCompute} from './helpers/smoke-airflow.js';
test('smoke follows opposite sustained rotations, stays finite, and repeats the same seeded run',async({page})=>{
 await bootSmokeCompute(page,{count:32});
 const result=await page.evaluate(async()=>{
  const a=window.__smoke;
  // Both signs, initially at the same relative radius, away from the body field.
  for(let i=0;i<a.count;i++){const center=i<a.count/2?-3:3;a.seeds[i*12]=center+.6;a.seeds[i*12+1]=0;}
  const run=async()=>{a.reset();const tracks=[];for(let i=1;i<=300;i++){a.step(i/120,1/120,{pair:true});if(i%6===0)tracks.push(await a.snapshot());}return tracks;};
  const first=await run(),second=await run();
  const angles=[0,0],previous=[[.6,0],[.6,0]];
  for(const values of first)for(let j=0;j<2;j++){const k=j*(a.count/2)*12,x=values[k]-(j===0?-3:3),y=values[k+1];angles[j]+=Math.atan2(previous[j][0]*y-previous[j][1]*x,previous[j][0]*x+previous[j][1]*y);previous[j]=[x,y];}
  return {angles,repeated:first.every((values,k)=>values.every((v,i)=>Object.is(v,second[k][i]))),finite:first.flat().every(Number.isFinite),errors:a.errors};
 });
 await test.info().attach('smoke-orbits',{body:JSON.stringify(result),contentType:'application/json'});
 expect(result.angles[0]).toBeGreaterThan(Math.PI);expect(result.angles[1]).toBeLessThan(-Math.PI);
 expect(result.repeated).toBe(true);expect(result.finite).toBe(true);expect(result.errors).toEqual([]);
});

test('disabled and zero-strength coupling reproduce original force/drag motion and preserve lifetime',async({page})=>{
 await bootSmokeCompute(page,{count:4});
 const r=await page.evaluate(async()=>{
  const a=window.__smoke;a.seeds[0]=0;a.seeds[1]=0;a.seeds[2]=.7;a.seeds[3]=-.2;
  a.s.params.smokeAirflowEnabled=false;a.reset();a.step(.02,.02);const off=await a.snapshot();
  a.s.params.smokeAirflowEnabled=true;a.s.params.smokeAirflowStrength=0;a.reset();a.step(.02,.02);const zero=await a.snapshot();
  const drag=Math.pow(.96,.02*60),vx=.7*drag,vy=(-.2-.8*.02)*drag;
  return {off,zero,expected:[vx*.02,vy*.02,vx,vy,4.98],errors:a.errors};
 });
 expect(r.off).toEqual(r.zero);for(let i=0;i<5;i++)expect(r.off[i]).toBeCloseTo(r.expected[i],5);expect(r.errors).toEqual([]);
});

test('airflow controls persist and export/import without changing the existing smoke parameters',async({page})=>{
 await page.goto('/?debugMode=quiet');await page.waitForFunction(()=>window.state?.loop.simulationTime>0);
 await page.locator('#search').fill('Smoke airflow');
 await expect(page.locator('#smokeAirflowEnabled')).toBeVisible();
 await page.locator('#smokeAirflowStrength').evaluate(n=>{n.value=1.65;n.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.locator('#smokeAirflowEnabled').uncheck();
 const initial=await page.evaluate(async()=>{const c=await import('/js/ui/controls.js');const settings=c.exportSettings();c.importSettings(settings);return [state.params.smokeAirflowEnabled,state.params.smokeAirflowStrength,state.params.smokeCurlNoiseScale];});
 expect(initial).toEqual([false,1.65,2.5]);
 await page.reload();await page.waitForFunction(()=>window.state?.params.smokeAirflowStrength===1.65);
 expect(await page.evaluate(()=>state.params.smokeAirflowEnabled)).toBe(false);
 await page.evaluate(async()=>{(await import('/js/ui/controls.js')).resetControls();});
 expect(await page.evaluate(()=>[state.params.smokeAirflowEnabled,state.params.smokeAirflowStrength])).toEqual([true,1]);
 // Hiding dust and temporarily disabling coupling must not discard smoke's wake history.
 await page.evaluate(async()=>{
  Object.assign(state.params,{dustEnabled:false,smokeEnabled:true,smokeAirflowEnabled:false});
  (await import('/js/renderer/dust-history.js')).resetDustHistory();
  state.engine.currentGear='N';Object.assign(state.body,{velocityX:0,velocityY:-8,prevAccelX:0,prevAccelY:0});const dt=state.params.timeScale/state.params.simulationFps;
  for(const [n,w]of Object.entries(state.wheels)){w.prevX=w.x;w.prevY=w.y+8*dt;state.wheelOmega[n]=8/state.params.wheelRadius;}
  (await import('/js/physics/kinematics.js')).computeBodyDerivedState(dt);
 });
 await expect.poll(()=>page.evaluate(async()=>(await import('/js/renderer/dust-history.js')).dustHistory().count)).toBeGreaterThan(2);
});
