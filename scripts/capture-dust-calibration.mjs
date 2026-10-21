// Frozen real driving pose: compare appearance presets and lighting with native car drawing.
import {chromium} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {bootSimulatorLiquid,renderSimulatorLiquid} from '../tests/e2e/helpers/simulator-liquid.js';
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1];};
const out=arg('--output','/tmp/dust-materials');mkdirSync(out,{recursive:true});
const fixture=JSON.parse(readFileSync(arg('--fixture','/tmp/v33-calibrated/fixture.json'),'utf8'));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({baseURL:'http://localhost:8000',viewport:{width:1000,height:800}});
 if(!await bootSimulatorLiquid(page))throw Error('No adapter');
 await page.evaluate(async f=>{
  const {s,target}=window.__liquidHarness,b=f.benchmark;target.width=926;target.height=696;
  Object.assign(s.body,b.body);s.wheels=b.wheels;s.camera=b.camera;s.steering=b.steering;s.skidMarks=b.marks;s.params.pixelsPerMeter=20;s.params.liquidEnabled=false;
  window.__world=await import('/js/renderer/world.js');window.__presets=await import('/js/renderer/dust-controls.js');window.__lighting=await import('/js/renderer/environment.js');
  const {observeDust,resetDustHistory}=await import('/js/renderer/dust-history.js');resetDustHistory();
  for(let i=0;i<f.count;i++){const k=((f.head+i)%96)*8,h=f.history;observeDust({centerX:h[k],centerY:h[k+1],velocityX:h[k+4],velocityY:h[k+5],heading:h[k+6],angularVelocity:h[k+7]},h[k+2]);}
 },fixture);
 // Image loads are independent from shader readiness; wait for the real sprite assets.
 await page.waitForFunction(()=>performance.getEntriesByType('resource').filter(e=>e.name.includes('/assets/vehicles/')).length>=2);
 const results=[];
 for(const lighting of ['daylight','overcast','sunset'])for(const preset of ['off','subtle','cinematic']){
  await page.evaluate(({lighting,preset})=>{const {s}=window.__liquidHarness;Object.assign(s.params,window.__lighting.LIGHT_PRESETS[lighting],window.__presets.DUST_PRESETS[preset]??{});s.params.dustEnabled=preset!=='off';},{lighting,preset});
  const result=await renderSimulatorLiquid(page,fixture.benchmark.time,true);
  if(result.errors.length||result.stats.dustError)throw Error(JSON.stringify(result));
  await page.evaluate(()=>{const c=document.getElementById('liquid-capture'),ctx=c.getContext('2d');window.__world.applyCameraTransform(ctx,c.width,c.height);window.__world.drawCar(ctx,false);window.__world.removeCameraTransform(ctx);});
  await page.locator('#liquid-capture').screenshot({path:`${out}/${lighting}-${preset}.png`});results.push({lighting,preset,...result});
 }
 writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));console.log({out,captures:results.length});
}finally{await browser.close();}
