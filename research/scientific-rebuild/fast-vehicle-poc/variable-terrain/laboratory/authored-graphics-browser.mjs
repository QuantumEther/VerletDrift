import {createServer} from 'node:http';import {readFile,writeFile} from 'node:fs/promises';import {resolve,extname} from 'node:path';import {chromium} from 'playwright';import assert from 'node:assert/strict';
const root=process.cwd(),path='/research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/',server=createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost'),p=resolve(root,'.'+u.pathname+(u.pathname.endsWith('/')?'index.html':''));res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[extname(p)]||'text/plain');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:950}}),errors=[],records=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${server.address().port}${path}`);await page.evaluate(async path=>window.app=await import(path+'main.js'),path);
 await page.selectOption('#vehicle-select','mustang-1969');await page.locator('#pause').click();await page.selectOption('#render-scale','.5');
 for(const map of ['mountain','yard','rally']){
  await page.selectOption('#terrain',map);await page.locator('#pause').click();await page.waitForFunction(()=>app.simulationSnapshot().time>=.4||app.runtimeSnapshot().clock.fault,null,{timeout:90000});assert.equal(await page.evaluate(()=>app.runtimeSnapshot().clock.fault),null);await page.locator('#pause').click();await page.waitForFunction(()=>app.rendererSnapshot().assetStatus==='ready'&&app.rendererSnapshot().graphics.status==='ready',null,{timeout:90000});
  assert.ok(await page.evaluate(()=>app.visualSnapshot().wheels.some(w=>w.normal>0)));const frozen=await page.evaluate(()=>app.simulationSnapshot());
  for(const preset of ['baseline','balanced']){
   await page.selectOption('#graphics',preset);await page.selectOption('#camera','normal');await page.waitForTimeout(700);
   const renderer=await page.evaluate(()=>app.rendererSnapshot());assert.equal(renderer.roadside.visible,preset==='balanced');assert.deepEqual(await page.evaluate(()=>app.simulationSnapshot()),frozen);
   await page.locator('#perspective').screenshot({path:new URL(`results/authored-${map}-${preset}.png`,import.meta.url).pathname});records.push({map,preset,renderer});
  }
  await page.locator('#roadside-detail').uncheck();await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>app.rendererSnapshot().roadside.visible),false);assert.deepEqual(await page.evaluate(()=>app.simulationSnapshot()),frozen);await page.locator('#roadside-detail').check();
  for(const camera of ['driver','contact','interior','top']){await page.selectOption('#camera',camera);await page.waitForTimeout(150);assert.deepEqual(await page.evaluate(()=>app.simulationSnapshot()),frozen);}
 }
 await page.selectOption('#camera','normal');await page.selectOption('#render-scale','1');for(const preset of ['baseline','balanced']){await page.selectOption('#graphics',preset);await page.waitForTimeout(300);await page.locator('#perspective').screenshot({path:new URL(`results/authored-rally-${preset}-full.png`,import.meta.url).pathname});}await page.selectOption('#render-scale','.5');
 await page.locator('#diag-mode').evaluate(el=>el.closest('details').open=true);for(const mode of ['minimal','empty','incremental','full']){const frozen=await page.evaluate(()=>app.simulationSnapshot());await page.selectOption('#diag-mode',mode);await page.waitForTimeout(250);assert.deepEqual(await page.evaluate(()=>app.simulationSnapshot()),frozen);}
 await page.setViewportSize({width:1100,height:800});await page.waitForTimeout(300);assert.ok((await page.evaluate(()=>app.rendererSnapshot())).memory.geometries>0);
 assert.deepEqual(errors,[]);await writeFile(new URL('results/authored-graphics-browser.json',import.meta.url),JSON.stringify({browser:await browser.version(),protocol:'Three authored maps after >=0.4s simulated settling, matched baseline/balanced captures at 50% render scale plus a full-resolution rally pair, roadside toggle, existing camera/diagnostic modes and resize; software rendering, not hardware performance evidence.',errors,records},null,2));console.log('PASS three authored maps, surface shader, roadside toggles, cameras, resize and physics invariance');
}finally{await browser.close();server.close();}
