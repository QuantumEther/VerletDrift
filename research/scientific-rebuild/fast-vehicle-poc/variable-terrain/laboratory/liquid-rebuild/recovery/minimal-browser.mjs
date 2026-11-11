import {createServer} from 'node:http';import {readFile,writeFile} from 'node:fs/promises';import {resolve,extname} from 'node:path';import {chromium} from 'playwright';import assert from 'node:assert/strict';
const stress=process.argv.includes('--stress'),refine=process.argv.includes('--refine'),verify16=process.argv.includes('--verify16');const root=process.cwd(),base='/research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/liquid-rebuild/';const cases=[
 {id:'rest',speed:0,gravity:0,collisions:false,sigma:0,horizon:.3},
 {id:'rest-16',speed:0,gravity:0,collisions:false,sigma:0,iterations:16,horizon:1},
 {id:'rest-repeat',speed:0,gravity:0,collisions:false,sigma:0,horizon:.3},
 {id:'rest-fine',speed:0,gravity:0,collisions:false,sigma:0,spacing:.018,dt:1/480,horizon:.3},
 {id:'translation',speed:4,gravity:0,collisions:false,sigma:0,horizon:.1},
 {id:'gravity-open',speed:0,collisions:false,sigma:0,horizon:.1},
 {id:'cohesion-only',speed:0,gravity:0,collisions:false,sigma:.072,horizon:.3},
 {id:'floor',speed:0,collisions:'floor',sigma:0,horizon:.4},
 {id:'floor-half',speed:0,collisions:'floor',sigma:0,dt:1/480,horizon:.4},
 {id:'floor-8',speed:0,collisions:'floor',sigma:0,iterations:8,horizon:.4},
 {id:'floor-16',speed:0,collisions:'floor',sigma:0,iterations:16,horizon:.4},
 {id:'floor-fine',speed:0,collisions:'floor',sigma:0,spacing:.018,dt:1/480,horizon:.4},
 {id:'floor-long',speed:0,collisions:'floor',sigma:0,horizon:1},
 {id:'floor-16-long',speed:0,collisions:'floor',sigma:0,iterations:16,horizon:1},
 {id:'floor-long-fine',speed:0,collisions:'floor',sigma:0,spacing:.018,dt:1/480,horizon:1},
 {id:'static-paddle',speed:4,gravity:0,collisions:'paddle',sigma:0,horizon:.2},
 {id:'moving-paddle',speed:0,gravity:0,collisions:'paddle',sigma:0,boundaryVelocity:-2,horizon:.2}
];
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);res.setHeader('Content-Type',({'.js':'text/javascript','.wgsl':'text/plain','.html':'text/html'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}${base}recovery/minimal.html?presentation=offscreen`);await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('nominalMass'),{},{timeout:15000});await page.waitForFunction(()=>!document.querySelector('#step').disabled,{},{timeout:15000});await page.click('#step');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('0.016666'),{},{timeout:15000});await page.waitForFunction(()=>!document.querySelector('#step').disabled,{},{timeout:15000});const status=JSON.parse(await page.locator('#status').textContent());assert.equal(status.iterations,16);assert.equal(status.gravity,0);assert.equal(status.collisions,1);assert.deepEqual(errors,[]);await writeFile(new URL('results/minimal-browser.json',import.meta.url),JSON.stringify({status,errors,scope:'module/controls initialized and GPU work completed; offscreen target; native canvas presentation failed independently and is not asserted'},null,2));console.log(JSON.stringify(status));}finally{await browser.close();server.close();}