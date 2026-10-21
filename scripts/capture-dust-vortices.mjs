// Replays real sampled vehicle motion; particles are evaluated at 12 Hz for inspection.
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {bootSimulatorLiquid,renderSimulatorLiquid} from '../tests/e2e/helpers/simulator-liquid.js';
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1];};
const out=arg('--output','/tmp/dust-vortices'),mode=arg('--mode','cinematic'),ref=arg('--ref','');mkdirSync(out,{recursive:true});
const f=JSON.parse(readFileSync('docs/rendering/dust-calibration/fixture.json','utf8'));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:process.argv.includes('--native')?['--no-sandbox','--enable-unsafe-webgpu']:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({baseURL:'http://localhost:8000',viewport:{width:1000,height:800}});
 if(ref)for(const file of ['js/renderer/atmospheric-dust.js','js/shaders/atmospheric-dust.wgsl'])await page.route(url=>url.pathname.endsWith('/'+file),r=>r.fulfill({body:execFileSync('git',['show',`${ref}:${file}`],{encoding:'utf8'}),contentType:file.endsWith('.js')?'text/javascript':'text/plain'}));
 if(!await bootSimulatorLiquid(page,process.argv.includes('--profile')?'gpuProfile=1&gpuPower=high-performance':'gpuPower=high-performance'))throw Error('No GPU adapter');
 await page.evaluate(async({f,mode,ref})=>{
  const {s,target}=window.__liquidHarness;target.width=926;target.height=696;s.params.pixelsPerMeter=20;s.params.dustDensity=ref?.48:.8;s.params.dustFlowDebug=mode==='debug';s.params.dustEnabled=mode!=='off';s.params.liquidEnabled=false;s.params.showSkidMarks=false;
  window.__world=await import('/js/renderer/world.js');const {observeDust,resetDustHistory}=await import('/js/renderer/dust-history.js');resetDustHistory();
  const history=[];for(let i=0;i<f.count;i++){const k=((f.head+i)%96)*8,h=f.history,b={centerX:h[k],centerY:h[k+1],velocityX:h[k+4],velocityY:h[k+5],heading:h[k+6],angularVelocity:h[k+7]};observeDust(b,h[k+2]);history.push({t:h[k+2],...b});}
  const b=f.benchmark;const offsets=Object.fromEntries(Object.entries(b.wheels).map(([key,w])=>{const x=w.x-b.body.centerX,y=w.y-b.body.centerY,c=Math.cos(-b.body.heading),q=Math.sin(-b.body.heading);return [key,{x:x*c-y*q,y:x*q+y*c}];}));
  window.__pose=t=>{
   let a=history[0],b=history.at(-1);for(let i=1;i<history.length;i++)if(history[i].t>=t){a=history[i-1];b=history[i];break;}
   const u=Math.max(0,Math.min(1,(t-a.t)/Math.max(.000001,b.t-a.t)));
   for(const k of ['centerX','centerY','velocityX','velocityY','heading','angularVelocity'])s.body[k]=a[k]+(b[k]-a[k])*u;
   if(t>history.at(-1).t){s.body.velocityX=0;s.body.velocityY=0;s.body.angularVelocity=0;}
   s.body.speed=Math.hypot(s.body.velocityX,s.body.velocityY);Object.assign(s.camera,{x:s.body.centerX,y:s.body.centerY,zoom:1});
   for(const [key,o]of Object.entries(offsets)){const c=Math.cos(s.body.heading),q=Math.sin(s.body.heading);s.wheels[key].x=s.body.centerX+o.x*c-o.y*q;s.wheels[key].y=s.body.centerY+o.x*q+o.y*c;}
  };
 },{f,mode,ref});
 await page.waitForFunction(()=>performance.getEntriesByType('resource').filter(e=>e.name.includes('/assets/vehicles/')).length>=2);
 if(process.argv.includes('--verify')&&!ref){
  await page.evaluate(()=>{window.__pose(2.8);window.__liquidHarness.s.params.dustFlowDebug=false;});
  const normal=await renderSimulatorLiquid(page,2.8);const original=await page.evaluate(()=>window.__liquidHarness.gpu.getDustTracerSnapshot());
  await page.evaluate(()=>window.__liquidHarness.s.params.dustFlowDebug=true);await renderSimulatorLiquid(page,2.8);
  const debug=await page.evaluate(()=>window.__liquidHarness.gpu.getDustTracerSnapshot());
  const known=new Set();for(let i=0;i<original.length;i+=16)if(original[i+13]>.001)known.add(`${original[i]},${original[i+1]}`);
  let checked=0,matched=0;
  const center=await page.evaluate(()=>[window.__liquidHarness.s.body.centerX,window.__liquidHarness.s.body.centerY]);
  for(let i=0;i<debug.length;i+=16)if(debug[i+13]>.001&&Math.abs(debug[i]-center[0])<5&&Math.abs(debug[i+1]-center[1])<5){checked++;if(known.has(`${debug[i]},${debug[i+1]}`))matched++;}
  await page.evaluate(()=>window.__liquidHarness.s.params.dustFlowDebug=false);const restored=await renderSimulatorLiquid(page,2.8);
  if(checked<10||checked!==matched||restored.hash!==normal.hash)throw Error(JSON.stringify({checked,matched,normal:normal.hash,restored:restored.hash}));
  writeFileSync(`${out}/controls-verification.json`,JSON.stringify({sameTracerHeads:matched,checked,normalHash:normal.hash,restoredHash:restored.hash},null,2));
  await page.evaluate(mode=>window.__liquidHarness.s.params.dustFlowDebug=mode==='debug',mode);
 }
 const clips=process.argv.includes('--quick')?[['drift',2.8,3.05]]:[['straight',1,1.8],['drift',2.6,3.8],['stop',3.8,5.2],['settle',5.2,7.2]];
 const frames=[];
 for(const [clip,start,end]of clips)for(let i=0,t=start;t<=end+.00001;t=start+(++i)/12){
  await page.evaluate(t=>window.__pose(t),t);const result=await renderSimulatorLiquid(page,t,true);
  if(result.errors.length||result.stats.dustError)throw Error(JSON.stringify(result));
  await page.evaluate(()=>{const c=document.getElementById('liquid-capture'),ctx=c.getContext('2d');window.__world.applyCameraTransform(ctx,c.width,c.height);window.__world.drawCar(ctx,false);window.__world.removeCameraTransform(ctx);});
  await page.locator('#liquid-capture').screenshot({path:`${out}/${clip}-${String(i).padStart(3,'0')}.png`});frames.push({clip,time:t,...result});
 }
 writeFileSync(`${out}/frames.json`,JSON.stringify(frames,null,2));console.log({out,frames:frames.length});
}finally{await browser.close();}
