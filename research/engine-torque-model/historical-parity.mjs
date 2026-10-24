// Same seven replays as the historical guard; count differences instead of
// allocating an enormous assertion diff for an intentionally changed engine.
import {chromium} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {install} from '../vehicle-audit/browser-harness.mjs';
import {scenarios} from '../vehicle-audit/scenarios.mjs';
const chosen=['gentle-launch','upshift','engine-braking','hard-brake','steering-reversal','steering-release','handbrake'];
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-gpu']});
try{
 const results=[];
 for(const baseline of [true,false]){
  const page=await browser.newPage();await page.addInitScript(()=>{window.requestAnimationFrame=()=>1;});
  if(baseline){const cache=new Map();await page.route('**/js/**',route=>{
   const path=new URL(route.request().url()).pathname.slice(1);
   if(!cache.has(path))cache.set(path,execFileSync('git',['show',`3870cc9:${path}`]).toString());
   return route.fulfill({contentType:'text/javascript',body:cache.get(path)});
  });}
  await page.goto('http://127.0.0.1:8000/?renderer=canvas&debugMode=quiet');await page.waitForFunction(()=>Boolean(window.state),null,{polling:50});
  await page.evaluate(async source=>{window.audit=await(new Function(`return (${source})`)())('/');},install.toString());
  results.push(await page.evaluate(specs=>({columns:window.audit.columns,runs:specs.map(s=>window.audit.run(s))}),chosen.map(n=>scenarios.find(s=>s.name===n))));
  await page.close();
 }
 const comparisons=results[0].runs.map((old,i)=>{
  const next=results[1].runs[i];let differentFields=0,first=null;
  old.rows.forEach((row,j)=>row.forEach((v,k)=>{if(results[0].columns[k]!=='tickMs'&&v!==next.rows[j][k]){
   differentFields++;first??={tick:j+1,column:results[0].columns[k],baseline:v,candidate:next.rows[j][k]};
  }}));
  return {name:old.name,differentFields,first,baselineAnomalies:old.anomalies,candidateAnomalies:next.anomalies};
 });
 if(comparisons.some(c=>c.baselineAnomalies.length||c.candidateAnomalies.length))throw Error('Mechanical replay anomaly');
 const result={baseline:'3870cc9',historicalExactParity:false,reason:'Intentional engine torque change; original exact-parity assertion retained unchanged.',comparisons};
 await writeFile('docs/engine-torque-model-data/historical-parity.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
