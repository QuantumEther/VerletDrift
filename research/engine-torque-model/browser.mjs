import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {install} from '../vehicle-audit/browser-harness.mjs';
import {loadedScenarios} from './scenarios.mjs';
const baseline=process.argv.includes('--baseline'),label=baseline?'baseline':'candidate';
// Instrument only the external audit adapter; production main/tires stay intact.
let source=install.toString().replace('let tire, drag, freeCrank,','let preEngine; let tire, drag, freeCrank,')
 .replace('physics.updateEngine(dt); freeCrank','preEngine=signedCrank(); physics.updateEngine(dt); freeCrank')
 .replace("'steerAngle','steerVelocity'","'preEngine','indicated','idleTorque','frictionTorque','pumpingTorque','engineImpulse','steerAngle','steerVelocity'")
 .replace('      state.steering.frontWheelAngle,','      preEngine,e.indicatedTorqueNm??null,e.idleTorqueNm??null,e.frictionTorqueNm??null,e.pumpingTorqueNm??null,e.netEngineImpulse,\n      state.steering.frontWheelAngle,');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-gpu']});
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(baseline){const legacy=execFileSync('git',['show','ae87786:js/physics/engine.js']).toString();
  await page.route('**/js/physics/engine.js',r=>r.fulfill({contentType:'text/javascript',body:legacy}));}
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>1;});
 async function initialize(){await page.goto('http://127.0.0.1:8000/');await page.waitForFunction(()=>Boolean(window.state),null,{polling:50});
 await page.evaluate(async source=>{window.audit=await(new Function(`return (${source})`)())('/');},source);}
 await initialize();const parameters=await page.evaluate(()=>structuredClone(window.audit.parameters));
 const isolated=await page.evaluate(async p=>{const h=await import('/research/engine-torque-model/harness.mjs');return [50,100,200,400].flatMap(hz=>h.scenarios.map(s=>h.run(p,s,hz)));},parameters);
 await page.reload();await page.waitForFunction(()=>Boolean(window.state),null,{polling:50});
 await page.evaluate(async source=>{window.audit=await(new Function(`return (${source})`)())('/');},source);
 const loaded=await page.evaluate(specs=>({columns:window.audit.columns,runs:[50,100,200,400].flatMap(hz=>specs.map(s=>window.audit.run(s,hz)))}),loadedScenarios);
 if(errors.length)throw Error(errors.join('\n'));
 await writeFile(`docs/engine-torque-model-data/${label}.json.gz`,gzipSync(JSON.stringify({parameters,isolated,loaded,errors}),{level:9}));
 console.log(JSON.stringify({label,isolated:isolated.length,loaded:loaded.runs.length,errors}));
}finally{await browser.close();}
