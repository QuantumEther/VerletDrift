// Run from a checkout with playwright and Chromium installed.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {chromium} from 'playwright';

const root=await mkdtemp(join(tmpdir(),'vd-isolation-'));
execFileSync('unzip',['-q',fileURLToPath(new URL('independent-benchmark.zip',import.meta.url)),'-d',root]);
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    const data=await readFile(join(root,path==='/'?'index.html':path));
    res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':'text/html');
    res.end(data);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',
  args:['--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-vulkan=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface']});
try{
  const page=await browser.newPage();
  await page.goto(origin);
  const dependencies=await page.evaluate(async()=>{
    const {sources}=await import('./dependencies.js');
    return Promise.all(Object.values(sources).map(async src=>(await import(src)).REVISION));
  });
  assert.deepEqual(dependencies,['180','180','187']);
  await page.reload();
  await page.route('**/vendor-r180/three.webgpu.js',route=>route.abort());
  await page.click('#run');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Dependency check failed'));
  assert.equal(await page.locator('#results tr').count(),0);
  console.log('Extracted package imports both builds. Missing dependency stops before the first timing.');
  await page.unrouteAll();await page.reload();
  await page.fill('#buffer-width','640');await page.fill('#buffer-height','360');
  await page.locator('#status').evaluate(el=>new MutationObserver(()=>console.log(el.textContent)).observe(el,{childList:true}));
  page.on('console',msg=>{if(msg.type()==='log')console.log(msg.text());});
  await page.click('#run');
  await page.waitForFunction(()=>!document.querySelector('#save').disabled,null,{timeout:180000});
  const pending=page.waitForEvent('download');await page.click('#save');
  const report=JSON.parse(await readFile(await(await pending).path(),'utf8'));
  console.table(report.records.map(r=>({kind:r.configuration.kind,path:r.configuration.path,status:r.validationStatus,error:r.error})));
  assert.equal(report.records.length,10);
  assert.ok(report.records.slice(1).every(r=>r.validationStatus==='passed'));
}finally{await browser.close();server.close();}
