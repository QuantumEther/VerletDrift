import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.goto('/?debugMode=quiet');await page.waitForFunction(()=>window.state?.loop.previousTimestamp>0);await page.evaluate(()=>{state.debug.faults.isFrozen=true;});});
test('mouse drag anchors at the current angle, survives render changes, and releases mechanically',async({page})=>{
  const out=await page.evaluate(async()=>{
    const {updateSteering}=await import('/js/physics/steering.js');const s=state.steering,c=document.getElementById('simCanvas');
    s.frontWheelAngle=.2;s.angularVelocity=0;s.wheelAngle=.2/state.params.maxFrontWheelAngle*Math.PI*2.5;
    c.dispatchEvent(new MouseEvent('mousedown',{button:2,clientX:100,bubbles:true}));const anchor=s.targetWheelAngle;
    c.dispatchEvent(new MouseEvent('mousemove',{clientX:140,bubbles:true}));const target=s.targetWheelAngle;
    s.wheelAngle=-5;updateSteering(.01);const first=s.frontWheelAngle;for(let i=0;i<30;i++)updateSteering(.01);
    c.dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true}));const beforeRate=s.angularVelocity;updateSteering(.01);
    return {anchor,target,first,angle:s.frontWheelAngle,dragging:s.isDragging,beforeRate,rate:s.angularVelocity,work:s.ledger.driverWork,residual:s.ledger.residual};
  });
  expect(out.anchor).toBeCloseTo(.2/.52*Math.PI*2.5,12);expect(out.target).toBeGreaterThan(out.anchor);expect(out.first).toBeGreaterThan(.2);expect(out.first).toBeLessThan(.4);expect(out.angle).toBeGreaterThan(.2);expect(out.dragging).toBe(false);expect(out.work).toBe(0);expect(Math.abs(out.residual)).toBeLessThan(1e-11);
});
test('event batching cannot fabricate a steering rate and blur releases driver authority',async({page})=>{
  const out=await page.evaluate(async()=>{
    const {updateSteering}=await import('/js/physics/steering.js');const s=state.steering,c=document.getElementById('simCanvas'),results=[];
    for(const events of [1,20]){
      Object.assign(s,{frontWheelAngle:0,angularVelocity:0,wheelAngle:0,isDragging:false,targetWheelAngle:null,energyParameters:null});
      c.dispatchEvent(new MouseEvent('mousedown',{button:2,clientX:100,bubbles:true}));
      for(let i=1;i<=events;i++)c.dispatchEvent(new MouseEvent('mousemove',{clientX:100+30*i/events,bubbles:true}));
      updateSteering(.01);results.push([s.frontWheelAngle,s.angularVelocity]);c.dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true}));
    }
    window.dispatchEvent(new Event('blur'));return {results,released:!s.isDragging&&!state.input.throttleKeyHeld&&!state.input.brakeKeyHeld};
  });expect(out.results[0]).toEqual(out.results[1]);expect(out.released).toBe(true);
});
test('steering presets retain units and explicitly identify changed model semantics',async({page})=>{
  const out=await page.evaluate(async()=>{
    const {exportSettings,importSettings}=await import('/js/ui/controls.js');let data=exportSettings();const version=data.steeringModelVersion;delete data.steeringModelVersion;importSettings(data);const notice=document.getElementById('actionStatus').textContent;
    const before=JSON.stringify(exportSettings());data={...exportSettings(),steeringModelVersion:999};let rejected=false;try{importSettings(data);}catch{rejected=true;}
    return{version,notice,rejected,atomic:before===JSON.stringify(exportSettings())};
  });expect(out.version).toBe(1);expect(out.notice).toContain('Steering migrated');expect(out.rejected).toBe(true);expect(out.atomic).toBe(true);
});
test('Shift-left steering releases even when Shift is lifted before the mouse button',async({page})=>{
  const out=await page.evaluate(()=>{
    const c=document.getElementById('simCanvas');
    c.dispatchEvent(new MouseEvent('mousedown',{button:0,shiftKey:true,bubbles:true}));const started=state.steering.isDragging;
    c.dispatchEvent(new MouseEvent('mouseup',{button:0,shiftKey:false,bubbles:true}));const released=!state.steering.isDragging;
    c.dispatchEvent(new MouseEvent('mousedown',{button:2,bubbles:true}));
    c.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));
    c.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));const retainedRight=state.steering.isDragging;
    c.dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true}));return{started,released,retainedRight,finalReleased:!state.steering.isDragging};
  });expect(out.started).toBe(true);expect(out.released).toBe(true);expect(out.retainedRight).toBe(true);expect(out.finalReleased).toBe(true);
});
