import { test, expect } from '@playwright/test';

test('BMW appearance switches independently and renders its own body and steering wheels', async ({ page }) => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?debugMode=quiet');
  await page.waitForFunction(() => window.state?.loop.previousTimestamp > 0);
  const result = await page.evaluate(async () => {
    const select = document.getElementById('visualVehicleModel');
    const params = JSON.stringify(state.params), geometry = state.physicalGeometry;
    const body = JSON.stringify(state.body), wheels = JSON.stringify(state.wheels);
    select.value = 'bmw-e30-m3'; select.dispatchEvent(new Event('change', { bubbles: true }));
    const unchanged = params===JSON.stringify(state.params) && geometry===state.physicalGeometry
      && body===JSON.stringify(state.body) && wheels===JSON.stringify(state.wheels);
    const { drawVehicleSprites } = await import('/js/renderer/vehicle-sprites.js');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const calls = [];
    const drawImage = ctx.drawImage.bind(ctx);
    ctx.drawImage = (image, ...args) => { if(image.src?.endsWith('.svg')||image.vehicleBodySprite)calls.push({ name:image.vehicleBodySprite?'relit-body':image.src.split('/').pop(), args }); drawImage(image, ...args); };
    const pose = { cx: 10, cy: 20, heading: .3, steerAngle: .2, isGhost: false,
      modelId: state.visualVehicleModel, wheelRadius: state.params.wheelRadius,
      visualWheels: { frontLeft:{x:1,y:2}, frontRight:{x:3,y:4}, rearLeft:{x:5,y:6}, rearRight:{x:7,y:8} },
      wheels: state.wheels, wheelOmega: state.wheelOmega };
    let rendered = false;
    for (let i=0;i<30&&!rendered;i++) { rendered=drawVehicleSprites(ctx,pose); if(!rendered)await new Promise(r=>setTimeout(r,50)); }
    const bmwCalls = [...calls];
    calls.length=0;
    const { drawCar }=await import('/js/renderer/world.js');
    drawCar(ctx);
    const integratedCalls=[...calls];
    const { updateSmoke, getSmokePool }=await import('/js/renderer/smoke-system.js');
    const { visualWheelPositions }=await import('/js/renderer/vehicle-models.js');
    const oldSmoke=state.params.smokeEnabled, oldRate=state.params.smokeSpawnRate, oldMin=state.params.smokeMinSpeed;
    const oldSpeed=state.body.speed, oldSlip={...state.wheelSlipRatio};
    state.params.smokeEnabled=true;state.params.smokeSpawnRate=1000;state.params.smokeMinSpeed=0;state.body.speed=10;
    Object.keys(state.wheelSlipRatio).forEach(name=>state.wheelSlipRatio[name]=0);
    state.wheelSlipRatio.frontLeft=1;
    const pool=getSmokePool(), aliveBefore=pool.map(p=>p.alive);
    for(let i=0;i<3;i++)updateSmoke(.01);
    const smoke=pool.filter((p,i)=>p.alive&&!aliveBefore[i]);
    const target=visualWheelPositions(state.body,'bmw-e30-m3').frontLeft;
    const smokeOffset=smoke.length?Math.min(...smoke.map(p=>Math.hypot(p.pos.x-target.x,p.pos.y-target.y))):Infinity;
    state.params.smokeEnabled=oldSmoke;state.params.smokeSpawnRate=oldRate;state.params.smokeMinSpeed=oldMin;
    state.body.speed=oldSpeed;Object.assign(state.wheelSlipRatio,oldSlip);
    state.params.liquidEnabled=true;
    const {recordWetTireTransfer}=await import('/js/renderer/wet-trail-events.js');
    recordWetTireTransfer({x1:state.body.centerX,y1:state.body.centerY,x2:state.body.centerX+.1,
      y2:state.body.centerY,width:.25,hue:20,alpha:.8,paintSaturation:1},state.loop.simulationTime);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const preview=document.createElement('canvas');preview.id='bmwModelPreview';preview.width=400;preview.height=900;
    preview.style.cssText='position:fixed;left:0;top:0;width:400px;height:900px;z-index:99999;background:#d8dde0';document.body.append(preview);
    const previewCtx=preview.getContext('2d');previewCtx.setTransform(185,0,0,185,200,450);
    drawVehicleSprites(previewCtx,{cx:0,cy:0,heading:0,steerAngle:.12,modelId:'bmw-e30-m3',wheelRadius:.35,
      visualWheels:visualWheelPositions({centerX:0,centerY:0,heading:0},'bmw-e30-m3'),
      wheels:state.wheels,wheelOmega:state.wheelOmega,isStalled:false,groundShadow:false});
    const {getGPURenderStats}=await import('/js/gpu-renderer.js');
    return { rendered, bmwCalls, integratedCalls, unchanged, smokeCount:smoke.length, smokeOffset, model: state.visualVehicleModel,
      frozen:state.debug.faults.isFrozen,
      physicsGeometry: state.physicalGeometry.wheelbase,
      gpuReady:(await (await import('/js/gpu-renderer.js')).isGPUReady()),
      gpuVehicleReady:(await (await import('/js/gpu-renderer.js')).isGPUVehicleReady()),
      gpuModelArtAvailable:getGPURenderStats().liquid?.hasBMWArt };
  });
  expect(result.rendered).toBe(true);
  expect(result.unchanged).toBe(true);
  expect(result.frozen).toBe(false);
  expect(errors).toEqual([]);
  expect(result.smokeCount).toBeGreaterThan(0);
  expect(result.smokeOffset).toBeLessThan(.15);
  expect(result.model).toBe('bmw-e30-m3');
  expect(result.physicsGeometry).toBe(2.408);
  expect(typeof result.gpuReady).toBe('boolean');
  expect(typeof result.gpuVehicleReady).toBe('boolean');
  if(result.gpuReady)expect(result.gpuModelArtAvailable).toBe(true);
  if(result.gpuReady)expect(result.gpuVehicleReady).toBe(true);
  expect(result.bmwCalls.slice(0,4).map(x=>x.name)).toEqual(Array(4).fill('wheel.svg'));
  expect(['relit-body','body.svg']).toContain(result.bmwCalls[4].name);
  expect(result.integratedCalls.slice(0,4).map(x=>x.name)).toEqual(Array(4).fill('wheel.svg'));
  expect(['relit-body','body.svg']).toContain(result.integratedCalls[4].name);
  expect(result.bmwCalls[0].args[0]).toBeCloseTo(-.205/2, 5);
  await page.locator('#bmwModelPreview').screenshot({ path: '/tmp/verletdrift-bmw-visual-check.png' });
  await page.locator('#visualVehicleModel').selectOption('delorean');
  await expect(page.locator('#visualVehicleModel')).toHaveValue('delorean');
});
