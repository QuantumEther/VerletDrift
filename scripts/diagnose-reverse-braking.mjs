// Unmodified braking fixture with timing observations; comparison routes v33 runtime sources.
import {chromium} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const ref=process.argv[2]||'',out=process.argv[3]||'/tmp/reverse-braking.json';
const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const p=await b.newPage({viewport:{width:1280,height:720}});
 if(ref)for(const file of ['js/gpu-renderer.js','js/renderer/atmospheric-dust.js','js/renderer/dust-controls.js','js/shaders/atmospheric-dust.wgsl','js/ui/workspace.js'])await p.route(url=>url.pathname.endsWith('/'+file),r=>r.fulfill({body:execFileSync('git',['show',`${ref}:${file}`],{encoding:'utf8'}),contentType:file.endsWith('.js')?'text/javascript':'text/plain'}));
 await p.goto('http://localhost:8000/?debugMode=quiet');await p.waitForFunction(()=>window.state?.loop.simulationTime>0);await p.keyboard.down('KeyS');
 const initial=await p.evaluate(async()=>{
  const {computeBodyDerivedState}=await import('/js/physics/kinematics.js'),s=state,speed=-10,dt=s.params.timeScale/s.params.simulationFps;s.engine.currentGear='N';
  for(const [name,wheel]of Object.entries(s.wheels)){wheel.prevY=wheel.y+speed*dt;s.wheelOmega[name]=speed/s.params.wheelRadius;}computeBodyDerivedState(dt);
  window.__brakeGpu=await import('/js/gpu-renderer.js');return {time:s.loop.simulationTime,speed:s.body.speed,params:{timeScale:s.params.timeScale,simulationFps:s.params.simulationFps},gpu:window.__brakeGpu.getGPURenderStats()};
 });
 const samples=[],start=performance.now();let reached=null;
 while(performance.now()-start<25000){
  const v=await p.evaluate(()=>({simulationTime:state.loop.simulationTime,speed:state.body.speed,backend:window.__brakeGpu.getGPURenderStats().backend,ready:window.__brakeGpu.isGPUReady()}));
  const elapsedMs=performance.now()-start;samples.push({elapsedMs,...v});if(v.speed<.05){reached=elapsedMs;break;}await p.waitForTimeout(250);
 }
 writeFileSync(out,JSON.stringify({ref:ref||'v34',threshold:.05,originalDeadlineMs:15000,initial,reachedMs:reached,samples},null,2));console.log({ref:ref||'v34',reachedMs:reached,last:samples.at(-1)});
}finally{await b.close();}
