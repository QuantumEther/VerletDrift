// Controlled actual-application RAF scheduling and targeted neutral maneuvers.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile,writeFile } from 'node:fs/promises';
import { resolve,extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { install } from './browser-harness.mjs';
const root=resolve('.'),mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer(async(req,res)=>{try{
  let p=new URL(req.url,'http://localhost').pathname;if(p.endsWith('/'))p+='index.html';p=resolve(root,'.'+decodeURIComponent(p));
  if(!p.startsWith(root+'/'))throw Error();const body=await readFile(p);res.writeHead(200,{'Content-Type':mime[extname(p)]||'application/octet-stream'});res.end(body);
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox','--disable-gpu']});
const origin=`http://127.0.0.1:${server.address().port}`,results={};
try{
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
  await page.addInitScript(()=>{
    let queued=[];window.requestAnimationFrame=cb=>{queued.push(cb);return queued.length;};
    window.__frame=time=>{const callbacks=queued;queued=[];for(const cb of callbacks)cb(time);};
    window.__mouseTargets=[];document.addEventListener('mousedown',e=>__mouseTargets.push(e.target.id));
  });
  await page.goto(`${origin}/?renderer=canvas&debugMode=quiet`);
  await page.waitForFunction(()=>Boolean(window.state),{},{polling:50});
  await page.evaluate(()=>{__frame(1000);__frame(1011);});
  await page.locator('#simCanvas').hover({position:{x:100,y:100}});
  const b=await page.locator('#simCanvas').boundingBox(),x=b.x+100,y=b.y+100;
  results.target=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.id,{x,y});
  await page.evaluate(()=>Object.assign(state.steering,{frontWheelAngle:.2,wheelAngle:.2/state.params.maxFrontWheelAngle*Math.PI*2.5,
    angularVelocity:0,selfAligningTorque:0,isDragging:false}));
  await page.mouse.move(x,y);await page.mouse.down({button:'right'});await page.mouse.move(x+1,y);
  results.regrab=await page.evaluate(async()=>{
    const command=state.steering.wheelAngle;(await import('/js/physics/steering.js')).updateSteering(.01);
    return {initialRoadAngle:.2,visualCommand:command,roadAngle:state.steering.frontWheelAngle,velocity:state.steering.angularVelocity,dragging:state.steering.isDragging};
  });
  await page.mouse.up({button:'right'});
  results.regrab.afterRelease=await page.evaluate(async()=>{(await import('/js/physics/steering.js')).updateSteering(.01);return state.steering.frontWheelAngle;});
  await page.evaluate(()=>Object.assign(state.steering,{frontWheelAngle:0,wheelAngle:0,angularVelocity:0,selfAligningTorque:0,isDragging:false}));
  await page.mouse.move(x,y);await page.mouse.down({button:'right'});await page.mouse.move(x+30,y);
  const read=()=>page.evaluate(()=>({wheelAngle:state.steering.wheelAngle,roadAngle:state.steering.frontWheelAngle,
    simTime:state.loop.simulationTime,dragging:state.steering.isDragging,throttle:state.input.throttleKeyHeld}));
  await page.keyboard.down('KeyD');results.pendingCommand=await read();
  await page.evaluate(()=>__frame(1012));results.afterRenderOnlyFrame=await read();
  await page.evaluate(()=>__frame(1022));results.afterNextPhysicsFrame=await read();
  await page.mouse.move(x+31,y);results.secondCommand=await read();
  await page.evaluate(()=>__frame(1033));results.afterImmediatePhysicsFrame=await read();
  await page.mouse.up({button:'right'});await page.keyboard.up('KeyD');
  results.mouseTargets=await page.evaluate(()=>__mouseTargets);
  await context.close();

  const ctx=await browser.newContext(),p=await ctx.newPage();await p.addInitScript(()=>{window.requestAnimationFrame=()=>1;});
  await p.goto(`${origin}/?renderer=canvas&debugMode=quiet`);await p.waitForFunction(()=>Boolean(window.state),{},{polling:50});
  const columns=await p.evaluate(async({source,base})=>{window.__audit=await(new Function(`return (${source})`)())(base);return __audit.columns;},{source:install.toString(),base:origin+'/'});
  const release={name:'neutral-release',duration:4,speed:15,gear:'N',events:[{time:0,clutch:true},{time:.3,steer:.18},{time:1.2,steer:null}]};
  const held={...release,name:'neutral-held',events:release.events.slice(0,2)};
  const neutral=[];
  for(const spec of [release,held])neutral.push(await p.evaluate(spec=>__audit.run(spec),spec));
  const lowTurn=[];
  for(const hz of [50,100,200,400])lowTurn.push(await p.evaluate(({spec,hz})=>__audit.run(spec,hz),{spec:{name:'neutral-low-turn',duration:4,speed:3,gear:'N',events:[{time:0,clutch:true,steer:.15}]},hz}));
  await writeFile('docs/vehicle-audit/steering-probe.json.gz',gzipSync(JSON.stringify({columns,neutral,lowTurn})));
  await ctx.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}
await writeFile('docs/vehicle-audit/causal-input.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
