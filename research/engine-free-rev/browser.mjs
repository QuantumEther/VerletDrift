import {chromium} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
import {install} from '../vehicle-audit/browser-harness.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-gpu']});
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>1;});
 await page.goto('http://127.0.0.1:8000/');
 await page.waitForFunction(()=>window.state?.params?.redlineRpm===7000,null,{polling:50});
 await page.evaluate(async source=>{window.engineAudit=await (new Function(`return (${source})`)())('/');},install.toString());
 const parameters=await page.evaluate(()=>structuredClone(window.engineAudit.parameters));
 const isolated=await page.evaluate(async parameters=>{
   const h=await import('/research/engine-free-rev/harness.mjs');
   return [50,100,200,400].flatMap(hz=>h.scenarios.map(s=>h.run(parameters,s,hz)));
 },parameters);
 // Reload clears the isolated harness's deliberately poisoned wheel state.
 await page.reload();await page.waitForFunction(()=>window.state?.params?.redlineRpm===7000,null,{polling:50});
 await page.evaluate(async source=>{window.engineAudit=await (new Function(`return (${source})`)())('/');},install.toString());
 const specs=[
 {name:'neutral',gear:'N',rpm:4000,pedal:0,duration:6,events:[{time:0,clutch:true}]},
 {name:'open-clutch-moving',gear:'3',speed:15,rpm:4000,pedal:0,duration:6,events:[{time:0,clutch:true}]},
 {name:'engine-braking',gear:'3',speed:15,pedal:1,duration:4,events:[]},
 {name:'small-lift',gear:'3',speed:15,pedal:1,duration:4,events:[{time:0,throttle:.2},{time:1,throttle:0}]},
 {name:'restart-idle',gear:'N',rpm:0,mode:'stalled',duration:5,events:[{time:0,toggle:true,clutch:true}]},
 {name:'gentle-launch',gear:'1',rpm:800,pedal:0,duration:6,events:[{time:0,clutch:true,throttle:.15},{time:1,clutch:false}]},
 {name:'braked-stall',gear:'1',rpm:800,pedal:0,duration:4,events:[{time:0,clutch:true,brake:true},{time:.5,clutch:false}]},
 ];
 const loaded=await page.evaluate(specs=>({columns:window.engineAudit.columns,runs:[50,100,200,400].flatMap(hz=>specs.map(s=>window.engineAudit.run(s,hz)))}),specs);
 if(errors.length)throw Error(errors.join('\n'));
 await mkdir('docs/engine-free-rev-data',{recursive:true});
 await writeFile('docs/engine-free-rev-data/parameters.json',JSON.stringify({source:'Fresh Chromium UI startup; no saved settings',parameters},null,2)+'\n');
 const {gzipSync}=await import('node:zlib');
 await writeFile('docs/engine-free-rev-data/browser.json.gz',gzipSync(JSON.stringify({isolated,loaded,errors}),{level:9}));
 console.log(JSON.stringify({isolated:isolated.length,loaded:loaded.runs.length,errors}));
} finally {await browser.close();}
