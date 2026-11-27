import {chromium} from 'playwright';import assert from 'node:assert/strict';import {writeFile,readFile} from 'node:fs/promises';
const root='research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/',out=root+'ux-research/checkpoint/';
const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});const records=[];
try{for(let repeat=0;repeat<3;repeat++)for(const variant of ['studio','no-tachometer','legacy']){
const p=await b.newPage({viewport:{width:1440,height:900}});
if(variant==='no-tachometer'){const source=await readFile(root+'studio-shell.js','utf8');await p.route('**/studio-shell.js',r=>r.fulfill({body:source.replace('drawTachometer(state.engineOmega * 30 / Math.PI, engineLimit * 30 / Math.PI);',''),contentType:'text/javascript'}));}
await p.goto('http://127.0.0.1:8784/'+root+(variant==='legacy'?'?layout=legacy':''));
await p.evaluate(async()=>window.app=await import('./main.js'));await p.waitForFunction(()=>{try{return app.rendererSnapshot().activeBackend==='webgl'}catch{return false}});
await p.locator('#pause').click();
if(variant!=='legacy')await p.getByRole('button',{name:'Telemetry',exact:true}).click();
await p.locator('#perspective').evaluate(c=>{c.style.setProperty('width','800px','important');c.style.setProperty('height','500px','important')});
await p.locator('#diag-start').evaluate(e=>e.click());await p.waitForFunction(()=>app.performanceReport()?.frames>0,{},{timeout:30000});const r=await p.evaluate(()=>app.performanceReport());records.push({repeat,variant,stats:r.stats,frames:r.frames,paused:r.settings?.paused,settings:r.settings});console.log(repeat,variant,r.stats.dashboard.mean);
if(repeat===0&&variant==='studio'){for(const name of ['Drive','Vehicle','Terrain','Audio','Graphics','Telemetry']){await p.getByRole('button',{name,exact:true}).click();await p.screenshot({path:out+name+'.jpg',quality:85});}
await p.getByRole('button',{name:'Immersive view'}).click();await p.screenshot({path:out+'Immersive.jpg',quality:85});await p.getByRole('button',{name:'Immersive view'}).click();await p.getByRole('button',{name:'Drive',exact:true}).click();assert.equal(await p.evaluate(()=>document.activeElement.id),'perspective');await p.keyboard.down('w');assert((await p.evaluate(()=>app.runtimeSnapshot().held)).includes('w'));await p.locator('#throttle').focus();assert.deepEqual(await p.evaluate(()=>app.runtimeSnapshot().held),[]);await p.keyboard.up('w');const button=p.locator('[data-drive="w"]');await button.hover();await p.mouse.down();assert((await p.evaluate(()=>app.runtimeSnapshot().held)).includes('w'));await p.mouse.up();assert.deepEqual(await p.evaluate(()=>app.runtimeSnapshot().held),[]);}
await p.close();}
await writeFile(out+'measurements.json',JSON.stringify({protocol:'3 sequential 10-second paused captures each, same 800x500 canvas and 1440x900 viewport, WebGL SwiftShader; no-tachometer removes only new cluster draw callback. No hardware claims.',records},null,2));}finally{await b.close()}
