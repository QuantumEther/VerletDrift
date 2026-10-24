// Browser audit only. Archives protected refs read-only, never checks them out.
// node research/vehicle-audit/run.mjs [--full]
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { install } from '../vehicle-audit/browser-harness.mjs';
import { scenarios } from '../vehicle-audit/scenarios.mjs';

const refs=process.env.BASELINE_ONLY?{realtime:'recovery/realtime'}:{realtime:'recovery/realtime',input:'recovery/playable-baseline'};
const output=resolve(process.env.BASELINE_ONLY?'research/playable-baseline/data/baseline-driving':'research/playable-baseline/data/driving');await mkdir(output,{recursive:true});
const root=await mkdtemp(join(tmpdir(),'verlet-behavior-audit-'));
const branches={};
for(const [name,ref] of Object.entries(refs)){
  const path=join(root,name);await mkdir(path);
  const archive=execFileSync('git',['archive',ref,'js','assets','index.html','styles.css'],{maxBuffer:128*1024*1024});
  execFileSync('tar',['-x','-C',path],{input:archive});
  branches[name]={ref,sha:execFileSync('git',['rev-parse',ref],{encoding:'utf8'}).trim()};
}
const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.wgsl':'text/plain'};
const server=createServer(async(req,res)=>{
  try{
    let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname.endsWith('/'))pathname+='index.html';
    const path=resolve(root,'.'+pathname);
    if(!path.startsWith(root+'/'))throw Error('Path outside archive');
    const body=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});res.end(body);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-gpu']});
const all={},summary={branches,scenarioCount:scenarios.length,scenarios:{},comparison:{},browser:'system Chromium',node:process.version};
let columns;
function get(row,key){return row[columns.indexOf(key)];}
function metrics(run){
  const rows=run.rows,last=rows.at(-1),times=rows.map(r=>get(r,'tickMs')).sort((a,b)=>a-b);
  if(!last)return {steps:0,anomalies:run.anomalies};
  const peak=key=>Math.max(...rows.map(r=>Math.abs(get(r,key))));
  const firstStall=rows.find(r=>get(r,'mode')==='stalled');
  return {steps:rows.length,anomalies:run.anomalies,finalSpeed:Math.hypot(get(last,'vx'),get(last,'vy')),
    finalMode:get(last,'mode'),finalRpm:get(last,'rpm'),gear:get(last,'gear'),requestedGear:get(last,'requestedGear'),
    finalHeading:get(last,'heading'),maxYaw:peak('yaw'),maxBeta:peak('beta'),maxSteering:peak('steerAngle'),
    maxLongAccel:peak('longAccel'),maxLatAccel:peak('latAccel'),maxRearOmega:Math.max(peak('omega_rearLeft'),peak('omega_rearRight')),
    meanTickMs:times.reduce((a,b)=>a+b,0)/times.length,p95TickMs:times[Math.ceil(times.length*.95)-1],worstTickMs:times.at(-1),
    firstStall:firstStall?{time:get(firstStall,'t'),rpm:get(firstStall,'rpm'),throttle:get(firstStall,'throttle'),clutch:get(firstStall,'clutchKey'),gear:get(firstStall,'gear')}:null,
    transitions:run.transitions};
}
try{
  for(const name of Object.keys(refs)){
    const context=await browser.newContext();const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    // Keep actual application initialization/UI, suppress scheduling only.
    // Deterministic mechanical ticks then execute in Chromium's real JS engine.
    await page.addInitScript(()=>{window.requestAnimationFrame=()=>1;});
    const base=`${origin}/${name}/`;
    await page.goto(`${base}?renderer=canvas&debugMode=quiet`);
    await page.waitForFunction(()=>Boolean(window.state),{},{polling:50});
    const metadata=await page.evaluate(async({source,base})=>{
      window.__audit=await (new Function(`return (${source})`)())(base);
      return {columns:__audit.columns,parameters:__audit.parameters,constants:__audit.constants};
    },{source:install.toString(),base});
    columns=metadata.columns;Object.assign(branches[name],metadata,{errors});
    const runs=[];
    for(const spec of scenarios){
      const run=await page.evaluate(spec=>__audit.run(spec),spec);runs.push(run);
      summary.scenarios[spec.name]??={};summary.scenarios[spec.name][name]=metrics(run);
    }
    // Repeat a difficult run to check deterministic reset, ignoring timers.
    const repeat=await page.evaluate(spec=>__audit.run(spec),scenarios.find(s=>s.name==='flick'));
    const first=runs.find(r=>r.name==='flick');
    branches[name].deterministicRepeat=first.rows.every((r,i)=>r.every((v,j)=>columns[j]==='tickMs'||v===repeat.rows[i][j]));
    branches[name].probes=await page.evaluate(()=>__audit.probes());
    // Mechanical convergence at fixed event times; no live UI slider changes.
    branches[name].convergence={};
    for(const scenario of ['steering-reversal','handbrake','gentle-launch']){
      branches[name].convergence[scenario]={};
      for(const hz of [50,100,200,400]){
        const run=await page.evaluate(({spec,hz})=>__audit.run(spec,hz),{spec:scenarios.find(s=>s.name===scenario),hz});
        branches[name].convergence[scenario][hz]=metrics(run);
      }
    }
    all[name]=runs;
    await context.close();
    console.log(`${name}: ${runs.length} browser replays, deterministic=${branches[name].deterministicRepeat}`);
  }
  if(!process.env.BASELINE_ONLY) for(const spec of scenarios){
    const reference=all.realtime.find(r=>r.name===spec.name),repair=all.realtime.find(r=>r.name===spec.name),input=all.input.find(r=>r.name===spec.name);
    let first=null,exactRepairInput=true;
    for(let i=0;i<Math.min(reference.rows.length,input.rows.length);i++){
      const a=reference.rows[i],b=input.rows[i];
      const changed=['gear','mode'].filter(k=>get(a,k)!==get(b,k));
      if(Math.hypot(get(a,'vx')-get(b,'vx'),get(a,'vy')-get(b,'vy'))>.1)changed.push('velocity');
      if(Math.abs(get(a,'yaw')-get(b,'yaw'))>.02)changed.push('yaw');
      if(Math.abs(get(a,'rpm')-get(b,'rpm'))>50)changed.push('rpm');
      if(changed.length&&!first)first={time:get(b,'t'),fields:changed,old:{rpm:get(a,'rpm'),gear:get(a,'gear'),mode:get(a,'mode')},new:{rpm:get(b,'rpm'),gear:get(b,'gear'),mode:get(b,'mode')}};
    }
    if(repair.rows.length!==input.rows.length)exactRepairInput=false;
    else exactRepairInput=repair.rows.every((r,i)=>r.every((v,j)=>columns[j]==='tickMs'||v===input.rows[i][j]));
    summary.comparison[spec.name]={firstSignificantDivergence:first,exactRepairInput};
  }
  // Preserve 20 Hz telemetry and 100 Hz windows around driver/mode/gear events.
  for(const [name,runs] of Object.entries(all)){
    const sampled=runs.map(run=>({...run,rows:run.rows.filter((row,i)=>process.argv.includes('--full')||i%5===0
      ||[...run.definition.events,...run.transitions].some(e=>Math.abs(get(row,'t')-e.time)<=.11+1e-10)||i===run.rows.length-1)}));
    await writeFile(join(output,`telemetry-${name}.json.gz`),gzipSync(JSON.stringify({metadata:branches[name],columns,runs:sampled})));
  }
  summary.columns=columns;
  await writeFile(join(output,'summary.json'),JSON.stringify(summary,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
