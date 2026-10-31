import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const root=new URL('../../../../',import.meta.url);
const server=createServer(async(req,res)=>{try{const p=decodeURI(req.url.split('?')[0]);const file=new URL('.'+p+(p.endsWith('/')?'index.html':''),root);if(!file.href.startsWith(root.href))throw Error('path');res.setHeader('Content-Type',file.pathname.endsWith('.js')?'text/javascript':file.pathname.endsWith('.json')?'application/json':file.pathname.endsWith('.css')?'text/css':'text/html');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--enable-unsafe-swiftshader']});
 const page=await browser.newPage(),base=`http://127.0.0.1:${server.address().port}`;
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.goto(base+'/lab/');await page.waitForSelector('.card');
  assert.equal(await page.locator('.card').count(),11);assert.match(await page.locator('.card').first().innerText(),/No\. 11[\s\S]*Latest/i);
  await page.selectOption('#sort-order','oldest');assert.match(await page.locator('.card').first().innerText(),/No\. 01/);
  await page.getByRole('button',{name:'Terrain',exact:true}).click();assert.equal(await page.locator('.card').count(),1);
  await page.locator('.card').click();await page.waitForURL('**/lab/terrain/');assert.match(await page.locator('nav').innerText(),/No\. 11.*Latest/);
  const frame=page.frameLocator('iframe');await frame.locator('#terrain').waitFor();assert.equal(await frame.locator('#terrain option').count(),4);
  await page.reload();await frame.locator('#regenerate').waitFor();await page.getByRole('link',{name:'← Laboratory',exact:true}).click();await page.waitForSelector('.card');
 }
 const registry=JSON.parse(await readFile(new URL('lab/experiments.json',root)));
 for(const item of registry){const route=await page.request.get(base+`/lab/${item.id}/`);assert.equal(route.status(),200);assert.ok((await route.text()).includes(`No. ${String(item.sequence).padStart(2,'0')}`));assert.equal((await page.request.get(base+'/'+item.entry)).status(),200);}
 console.log('PASS navigator desktop/mobile, 11 chronological routes, terrain filter, iframe launch, refresh and return');
}finally{await browser?.close();server.close();}
