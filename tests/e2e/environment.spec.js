import {test,expect} from '@playwright/test';
import {bootSimulatorLiquid,renderSimulatorLiquid,impactSimulatorLiquid} from './helpers/simulator-liquid.js';
async function start(page){expect(await bootSimulatorLiquid(page)).toBe(true);await impactSimulatorLiquid(page);}
test('lighting controls change the live materials without invalidating deposition or physics',async({page})=>{
 await start(page);
 const snapshot=await page.evaluate(()=>JSON.stringify([window.__liquidHarness.s.body,window.__liquidHarness.s.wheels]));
 for(const [key,value]of [['sceneLightAzimuth',75],['sceneLightElevation',20],['sceneLightIntensity',1.7],['sceneAmbient',1.3],['sceneShadowSoftness',1],['sceneLightTemperature',3500]]){
  const base=await renderSimulatorLiquid(page,5);
  const original=await page.evaluate(({key,value})=>{const s=window.__liquidHarness.s,old=s.params[key];s.params[key]=value;return old;},{key,value});
  const changed=await renderSimulatorLiquid(page,5);expect(changed.errors).toEqual([]);expect(changed.hash,key).not.toBe(base.hash);
  expect(changed.stats.liquid.depositionRebuilds).toBe(base.stats.liquid.depositionRebuilds);
  expect(changed.stats.liquidResourceCount).toBe(base.stats.liquidResourceCount);
  await page.evaluate(({key,original})=>window.__liquidHarness.s.params[key]=original,{key,original});
  expect((await renderSimulatorLiquid(page,5)).hash,key+' reset').toBe(base.hash);
 }
 expect(await page.evaluate(()=>JSON.stringify([window.__liquidHarness.s.body,window.__liquidHarness.s.wheels]))).toBe(snapshot);
});
test('palette changes affect real collisions and pigment consistently without changing score or source hue',async({page})=>{
 await start(page);
 const data=await page.evaluate(async()=>{
  const {s,events}=window.__liquidHarness;const {checkBalloonCollisions}=await import('/js/balloon.js');
  const source={x:s.wheels.frontLeft.x,y:s.wheels.frontLeft.y,radius:.6,hue:210,isPopped:false,deformTime:0,deformScale:1,deformDir:{x:0,y:0}};
  const result=[];
  for(const preset of [0,1]){
   events.resetLiquidImpacts();s.params.balloonAppearance=preset;s.balloons=[{...source}];s.splatParticles=[];s.score.totalScore=0;s.score.combo.multiplier=1;s.score.combo.count=0;s.score.combo.lastPopTime=-999;
   s.body.velocityX=0;s.body.velocityY=-20;
   for(const w of Object.values(s.wheels)){w.prevX=w.x;w.prevY=w.y+.2;}
   checkBalloonCollisions(.01,0);
   result.push({event:events.getLiquidImpacts().events[0],sourceHue:s.balloons[0].hue,score:s.score.totalScore,pigment:s.splatParticles[0].hue});
  }
  return result;
 });
 expect(data[0].sourceHue).toBe(210);expect(data[1].sourceHue).toBe(210);
 expect(data[0].event.hue).toBe(210);expect(data[1].event.hue).toBe(350);
 expect(data[0].score).toBe(data[1].score);expect(data[1].score).toBeGreaterThan(0);
 expect(data[1].pigment>325||data[1].pigment<15).toBe(true);
});
test('environment controls persist and presets reset through the existing simulator bindings',async({page})=>{
 await page.goto('/?renderer=canvas&debugMode=quiet');await page.waitForFunction(()=>window.state?.loop.previousTimestamp>0);
 await page.locator('#environmentPreset').selectOption('sunset');
 expect(await page.evaluate(()=>state.params.sceneLightTemperature)).toBe(4500);
 await page.reload();await page.waitForFunction(()=>window.state?.loop.previousTimestamp>0);
 expect(await page.evaluate(()=>state.params.sceneLightTemperature)).toBe(4500);
 await page.locator('#resetEnvironment').evaluate(n=>n.click());expect(await page.evaluate(()=>state.params.sceneLightTemperature)).toBe(6500);
});
test('dry GPU body pixels respond to ambient illumination, independently of the road',async({page})=>{
 await start(page);await page.evaluate(()=>{const p=window.__liquidHarness.s.params;p.sceneLightIntensity=0;p.sceneAmbient=.1;p.liquidBodyWetness=0;});
 await renderSimulatorLiquid(page,5);
 const body=()=>page.evaluate(()=>{const pixels=window.__liquidPixels;let sum=0;for(let y=284;y<294;y++)for(let x=251;x<261;x++)sum+=pixels[(y*512+x)*4];return sum/100;});
 const dark=await body();await page.evaluate(()=>window.__liquidHarness.s.params.sceneAmbient=1.3);await renderSimulatorLiquid(page,5);
 expect(await body()).toBeGreaterThan(dark+20);
});
test('weathered blue dye remains blue rather than adopting the crimson reference residue',async({page})=>{
 expect(await bootSimulatorLiquid(page)).toBe(true);await impactSimulatorLiquid(page,{hue:215});
 await renderSimulatorLiquid(page,70);
 await page.evaluate(()=>window.__agedBlue=new Uint8ClampedArray(window.__liquidPixels));
 await page.evaluate(()=>window.__liquidHarness.events.resetLiquidImpacts());await renderSimulatorLiquid(page,70);
 const losses=await page.evaluate(()=>{const aged=window.__agedBlue,dry=window.__liquidPixels;let red=0,blue=0;for(let y=0;y<190;y++)for(let x=0;x<512;x++){const i=(y*512+x)*4;red+=Math.max(0,dry[i]-aged[i]);blue+=Math.max(0,dry[i+2]-aged[i+2]);}return {red,blue};});
 expect(losses.red).toBeGreaterThan(losses.blue*1.3+10);
});

test('contact-shadow footprint rotates with the vehicle and preserves render resources',async({page})=>{
 expect(await bootSimulatorLiquid(page)).toBe(true);
 await page.evaluate(()=>{
  const s=window.__liquidHarness.s;s.balloons=[];s.params.sceneLightIntensity=0;
  window.__shadowPose=structuredClone({body:s.body,wheels:s.wheels});
  s.body.centerX=100;s.body.centerY=100;
  for(const w of Object.values(s.wheels)){w.x+=100;w.y+=100;}
 });
 const empty=await renderSimulatorLiquid(page,0);
 await page.evaluate(()=>window.__shadowBackground=new Uint8ClampedArray(window.__liquidPixels));
 const moments=[];
 for(const angle of [0,Math.PI/2]){
  await page.evaluate(angle=>{
   const s=window.__liquidHarness.s,pose=window.__shadowPose;
   Object.assign(s.body,pose.body,{heading:angle});
   const c=Math.cos(angle),sn=Math.sin(angle);
   for(const [name,w]of Object.entries(s.wheels)){
    const source=pose.wheels[name],x=source.x-pose.body.centerX,y=source.y-pose.body.centerY;
    Object.assign(w,source,{x:pose.body.centerX+c*x-sn*y,y:pose.body.centerY+sn*x+c*y});
   }
  },angle);
  const frame=await renderSimulatorLiquid(page,0);expect(frame.errors).toEqual([]);
  expect(frame.stats.resourceCount).toBe(empty.stats.resourceCount);
  moments.push(await page.evaluate(()=>{
   const background=window.__shadowBackground,pixels=window.__liquidPixels;let mass=0,x=0,y=0,xx=0,yy=0;
   for(let j=0;j<512;j++)for(let i=0;i<512;i++){
    const k=(j*512+i)*4,w=Math.max(0,background[k]-pixels[k]);
    mass+=w;x+=w*i;y+=w*j;xx+=w*i*i;yy+=w*j*j;
   }
   return {mass,xVariance:xx/mass-(x/mass)**2,yVariance:yy/mass-(y/mass)**2};
  }));
 }
 expect(moments[0].mass).toBeGreaterThan(1000);
 expect(moments[0].yVariance).toBeGreaterThan(moments[0].xVariance*1.6);
 expect(moments[1].xVariance).toBeGreaterThan(moments[1].yVariance*1.6);
});
