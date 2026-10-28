import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const root=new URL('../',import.meta.url),out=process.env.ARTIFACT_DIR||'/tmp/mission37-browser';await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const path=req.url==='/'?'index.html':req.url.slice(1),file=new URL(path,root);if(!file.href.startsWith(root.href))throw new Error('path');res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1500,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{window.pending=[];window.requestAnimationFrame=f=>window.pending.push(f);});
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.pending.length>0);
 await page.evaluate(async()=>{window.app=await import('/src/main.js');window.tickTime=performance.now();window.tick=(n=1)=>{for(let i=0;i<n;i++)window.pending.shift()(window.tickTime+=16);};window.tick();});
 const api=code=>page.evaluate(code=>Function(code)(),code),tick=n=>api(`window.tick(${n})`);
 await page.locator('#experiments summary').click();await page.locator('#spin').click();await page.locator('#experiments summary').click();await tick(10);
 const instruments=await api('return {state:app.simulationSnapshot(),rpm:Number(document.querySelector("#engine-dial svg").dataset.value)}');
 assert.ok(Math.abs(instruments.rpm-instruments.state.flywheel.omega*60/(2*Math.PI))<1e-9);
 const openPressure=await api('return app.presentationSnapshot().pressureX');
 await page.locator('#engagement').fill('1');await tick(3);assert.ok((await api('return app.presentationSnapshot().pressureX'))>openPressure);
 await page.selectOption('#differential','open');await page.locator('#experiments summary').click();await page.locator('#moving-second').click();await page.locator('#experiments summary').click();await page.locator('#engagement').fill('1');
 await page.keyboard.down('w');await page.keyboard.down('a');await tick(30);await page.keyboard.up('w');await page.keyboard.up('a');await page.locator('#engagement').fill('0');await tick(8);
 await page.locator('#pause').click();await tick(2);const original=await api('return app.simulationSnapshot()');
 assert.equal(original.gearbox.selected,'2');assert.ok(Math.abs(original.wheels[2].angle-original.wheels[3].angle)>1e-4);assert.ok(original.planar.heading>0);
 // Every gauge endpoint/midpoint tested geometrically via SVG screen matrices.
 const pivots=[];
 for(const viewport of [{width:1500,height:1050},{width:760,height:1000},{width:390,height:844}]){
  await page.setViewportSize(viewport);await tick(2);
  const result=await page.evaluate(async()=>{
   const {createInstrument}=await import('/src/instruments.js');const host=document.createElement('div');host.style.width='180px';document.body.append(host);const set=createInstrument(host,{label:'TEST',unit:'rpm',max:6000});const measurements=[];
   for(const value of [0,1500,3000,4500,6000]){set(value);const n=host.querySelector('.needle'),h=host.querySelector('.needle-hub'),a=n.getScreenCTM(),b=h.getScreenCTM();measurements.push({value,angle:n.getAttribute('transform'),pivotError:Math.hypot(a.e-b.e,a.f-b.f)});}host.remove();return {measurements,overflow:document.documentElement.scrollWidth>innerWidth};
  });assert.equal(result.overflow,false);for(const m of result.measurements)assert.ok(m.pivotError<1e-9);pivots.push({viewport,...result});
 }
 await page.screenshot({path:out+'/small.png',fullPage:true});await page.setViewportSize({width:1500,height:1050});
 const views={};
 for(const mode of ['normal','xray','driveline','clutch','exploded','driver']){
  await page.selectOption('#cutaway',mode);await tick(70);assert.deepEqual(await api('return app.simulationSnapshot()'),original);
  const view=await api('return app.presentationSnapshot()');views[mode]=view;assert.equal(view.bodyTransparent,mode==='xray');assert.equal(view.bodyOpacity,mode==='xray'?.12:1);
  assert.equal(view.engineAngle,original.flywheel.angle);assert.deepEqual(view.halfShaftAngles,original.wheels.slice(2).map(w=>w.angle));assert.deepEqual(view.wheelAngles,original.wheels.map(w=>w.angle));assert.equal(view.forkX,view.sleeveX);assert.equal(view.sleeveX,original.gearbox.q*8);
  assert.deepEqual(view.engagedMaterials,[false,true]);assert.deepEqual(view.gearAngles,view.mapping.pairs.map(p=>p.drivenAngle));assert.deepEqual(view.dogAngles,view.mapping.pairs.map(p=>p.freeAngle));assert.equal(view.layshaftAngle,view.mapping.layshaftAngle);
  assert.deepEqual(view.steering,original.wheels.map(w=>original.planar.heading+(w.steering||0)));assert.deepEqual(view.wheelHeights,original.wheels.map(w=>original.corners[w.axle].z));assert.equal(view.chassisHeight,original.z);assert.equal(view.chassisPitch,original.pitch);assert.equal(view.chassisYaw,original.planar.heading);
  if(['normal','xray','driveline','clutch','exploded'].includes(mode))await page.screenshot({path:out+'/'+mode+'.png',fullPage:true});
 }
 assert.ok(views.exploded.layshaftY>views.driveline.layshaftY);assert.equal(views.exploded.mapping.selectorX,views.driveline.mapping.selectorX);
 for(const mode of ['schematic','side','top','3d']){await page.selectOption('#view',mode);await tick(2);assert.deepEqual(await api('return app.simulationSnapshot()'),original);if(mode==='schematic')await page.locator('#mechanism').screenshot({path:out+'/schematic.png'});}
 // Orbit navigation changes camera only, then reset returns to the preset.
 await page.selectOption('#cutaway','driveline');await tick(70);const beforeCamera=await api('return app.presentationSnapshot()');
 const box=await page.locator('#perspective').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+90,box.y+box.height/2+20,{steps:5});await page.mouse.up();await tick(3);
 assert.notDeepEqual((await api('return app.presentationSnapshot()')).camera,beforeCamera.camera);await page.locator('#reset-camera').click();await tick(80);assert.ok((await api('return app.presentationSnapshot()')).camera.every((v,i)=>Math.abs(v-beforeCamera.camera[i])<1e-9));
 await page.evaluate(()=>{const c=document.querySelector('#perspective');c.style.width='320px';c.style.height='180px';});await tick(3);
 const memory=await api('return app.rendererInfo()');
 const sustained=await page.evaluate(()=>{const samples=[];for(let i=0;i<1200;i++){const t=performance.now();window.tick();samples.push(performance.now()-t);}const a=samples.sort((a,b)=>a-b);return {frames:1200,meanMs:a.reduce((x,y)=>x+y)/a.length,p95Ms:a[Math.floor(a.length*.95)],worstMs:a.at(-1)};});
 assert.deepEqual(await api('return app.rendererInfo()'),memory);assert.deepEqual(await api('return app.simulationSnapshot()'),original);
 await api('app.recreateRenderer()');await tick(3);const rebuilt=await api('return app.rendererInfo()');assert.equal(rebuilt.sceneGeometries,memory.sceneGeometries);assert.equal(rebuilt.materials,memory.materials);assert.ok(rebuilt.geometries<=memory.geometries);
 assert.deepEqual(errors,[]);const report={status:'PASS',resourceStressCanvas:'320x180 CSS pixels, 1200 submitted paused frames' ,browser:await browser.version(),pivots,memory,rebuilt,sustained,views:Object.fromEntries(Object.entries(views).map(([name,v])=>[name,{drawCalls:v.drawCalls,triangles:v.triangles,camera:v.camera}])),errors};
 await writeFile(out+'/verification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();server.close();}
