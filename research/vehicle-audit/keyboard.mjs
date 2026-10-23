// Actual live application, browser keyboard events and browser focus changes.
// Audit evidence only: deliberately leaves the Ctrl+R defect unfixed.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root=resolve('.');
const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer(async(req,res)=>{
  try{
    let path=new URL(req.url,'http://localhost').pathname;if(path.endsWith('/'))path+='index.html';
    path=resolve(root,'.'+decodeURIComponent(path));if(!path.startsWith(root+'/'))throw Error();
    const data=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});res.end(data);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox','--disable-gpu']});
const result={};
try{
  const context=await browser.newContext(),page=await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/?renderer=canvas&debugMode=quiet&inputDebug=1`);
  await page.waitForFunction(()=>window.state?.loop.previousTimestamp>0);
  await page.evaluate(()=>{
    window.__observedKeys=[];
    document.addEventListener('keydown',event=>queueMicrotask(()=>__observedKeys.push({
      code:event.code,ctrl:event.ctrlKey,shift:event.shiftKey,repeat:event.repeat,prevented:event.defaultPrevented,
      held:structuredClone(state.input.heldKeys),mode:state.engine.mode,command:state.engine.command,
    })));
  });
  const sample=()=>page.evaluate(()=>({rpm:state.engine.rpm,mode:state.engine.mode,
    throttle:state.input.throttleKeyHeld,clutch:state.input.clutchKeyHeld,brake:state.input.brakeKeyHeld,
    handbrake:state.input.handbrakeKeyHeld,held:Object.keys(state.input.heldKeys),
    starterWork:state.engine.starterWorkJ||0,combustion:state.engine.combustionTorqueNm,
    dropped:state.loop.droppedSubsteps,frozen:state.debug.faults.isFrozen}));
  await page.locator('#tireFrictionCoeff').focus();result.sliderBefore=await sample();
  await page.keyboard.down('KeyD');await page.waitForTimeout(250);result.sliderHeld=await sample();await page.keyboard.up('KeyD');
  await page.locator('#search').fill('');await page.keyboard.press('KeyD');await page.keyboard.press('KeyR');
  result.text={value:await page.locator('#search').inputValue(),state:await sample()};
  await page.locator('#soundToggle').focus();
  for(const key of ['KeyA','KeyS','KeyD','KeyF'])await page.keyboard.down(key);
  result.combination=await sample();
  const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();await page.waitForTimeout(100);
  result.genuineFocusLoss={state:await sample(),visibility:await page.evaluate(()=>document.visibilityState)};
  await other.close();await page.bringToFront();
  for(const key of ['KeyA','KeyS','KeyD','KeyF'])await page.keyboard.up(key);
  await page.keyboard.down('KeyD');result.restored=await sample();await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyD');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  result.syntheticBlur=await sample();await page.keyboard.up('KeyD');
  await page.evaluate(()=>document.activeElement.blur());
  for(const shortcut of ['Control+r','Control+Shift+r']){
    const before=await page.evaluate(()=>performance.timeOrigin);await page.keyboard.press(shortcut);await page.waitForTimeout(150);
    result[shortcut]={reloaded:(await page.evaluate(()=>performance.timeOrigin))!==before,state:await sample()};
  }
  await page.evaluate(()=>Object.assign(state.engine,{mode:'stopped',omega:0,rpm:0,isRunning:false,isStalled:false,command:null}));
  await page.keyboard.press('Control+r');await page.waitForTimeout(100);result.modifiedRWhenStopped=await sample();
  await page.evaluate(()=>Object.assign(state.engine,{mode:'stalled',omega:0,rpm:0,isRunning:false,isStalled:true,command:null}));
  await page.keyboard.down('KeyD');await page.waitForTimeout(100);result.stalledThrottle=await sample();await page.keyboard.up('KeyD');
  await page.keyboard.press('KeyR');await page.waitForTimeout(100);result.normalStarter=await sample();
  await page.evaluate(()=>{state.debug.faults.isFrozen=true;});
  const frozenBefore=await sample();await page.keyboard.down('KeyD');await page.waitForTimeout(100);
  result.frozen={before:frozenBefore,after:await sample()};await page.keyboard.up('KeyD');
  await page.evaluate(()=>{state.debug.faults.isFrozen=false;});
  const begin=performance.now();
  const blocked=page.evaluate(()=>{const end=performance.now()+200;while(performance.now()<end){};});
  const key=page.keyboard.down('KeyD');await Promise.all([blocked,key]);
  const eventRoundTripMs=performance.now()-begin;await page.waitForTimeout(100);
  result.blockingProbe={eventRoundTripMs,state:await sample()};await page.keyboard.up('KeyD');
  // Audit a real mouse re-grab at an off-center angle, with scheduling frozen
  // so the input discontinuity is separated from tire/SAT feedback.
  await page.locator('#simCanvas').scrollIntoViewIfNeeded();
  const box=await page.locator('#simCanvas').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);
  await page.evaluate(()=>{
    state.debug.faults.isFrozen=true;
    Object.assign(state.steering,{frontWheelAngle:.2,wheelAngle:.2/state.params.maxFrontWheelAngle*Math.PI*2.5,
      angularVelocity:0,selfAligningTorque:0,isDragging:false});
  });
  await page.mouse.down({button:'right'});await page.mouse.move(x+1,y);
  result.steeringRegrab=await page.evaluate(async()=>{
    const before=.2;(await import('/js/physics/steering.js')).updateSteering(.01);
    return {before,afterOnePixel:state.steering.frontWheelAngle,angularVelocity:state.steering.angularVelocity};
  });
  await page.mouse.up({button:'right'});
  result.steeringRegrab.afterRelease=await page.evaluate(async()=>{
    (await import('/js/physics/steering.js')).updateSteering(.01);return state.steering.frontWheelAngle;
  });
  result.steeringRegrab.note='Uncontrolled RAF can overwrite this fixture; use causal-input.json to isolate re-grab behavior.';
  result.events=await page.evaluate(()=>__observedKeys);
  await context.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}
await writeFile('docs/vehicle-audit/browser-input.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
