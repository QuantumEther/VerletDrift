import {chromium} from 'playwright';
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
const root='research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/';
const before=execFileSync('git',['show','6d6dcf0:'+root+'main.js'],{encoding:'utf8'});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const records=[];
try {
 for(const variant of ['before','after','legacy']){
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 if(variant==='before')await page.route('**/laboratory/main.js',route=>route.fulfill({body:before,contentType:'text/javascript'}));
 await page.goto('http://127.0.0.1:8783/'+root+(variant==='legacy'?'?layout=legacy':''));
 await page.evaluate(async()=>window.app=await import('./main.js'));
 await page.waitForFunction(()=>{try{return app.rendererSnapshot().activeBackend==='webgl'}catch{return false}});
 await page.locator('#pause').click();
 if(variant!=='legacy')await page.getByRole('button',{name:'Telemetry',exact:true}).click();
 await page.locator('#perspective').evaluate(c=>{c.style.setProperty('width','800px','important');c.style.setProperty('height','500px','important')});
 await page.locator('#diag-start').evaluate(e=>e.click());
 await page.waitForFunction(()=>app.performanceReport()?.frames>0,{},{timeout:30000});
 const r=await page.evaluate(()=>app.performanceReport());
 records.push({variant,frames:r.frames,stats:r.stats,settings:r.settings,backend:r.backend,meanFps:r.meanFps});
 console.log(variant, r.stats.dashboard);
 await page.close();
 }
 await writeFile(root+'ux-research/matched-ui-cost.json',JSON.stringify({protocol:'One sequential 10 s paused capture per case, identical 800x500 CSS canvas, 1440x900 browser, SwiftShader. Before serves committed main.js; after serves working tree. Telemetry visible in Studio. GPU hardware and statistical significance unverified.',records},null,2));
}finally{await browser.close()}
