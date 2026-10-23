// node research/cornering-performance/run.mjs [--candidate] [--quick|--grid|--parity] [--probe] [--out=/tmp/name]
// Actual application loop + rendering; read-only branch archives; no production edits.
import {chromium} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir,cpus} from 'node:os';
import {resolve,join,extname} from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {instrument,installProfiler} from './instrument.mjs';
import {installDriver} from './browser.mjs';
import {install} from '../vehicle-audit/browser-harness.mjs';
import {scenarios} from './scenarios.mjs';
const quick=process.argv.includes('--quick'),candidate=process.argv.includes('--candidate'),grid=process.argv.includes('--grid'),probe=process.argv.includes('--probe'),parity=process.argv.includes('--parity'),out=process.argv.find(s=>s.startsWith('--out='))?.slice(6)||'/tmp/verlet-cornering';
const root=await mkdtemp(join(tmpdir(),'verlet-cornering-')),refs={audit:candidate?'e3cb371':'3870cc9',input:'e3cb371'};
const metadata={node:process.version,cpu:cpus()[0]?.model,logicalCPUs:cpus().length,branches:{},mode:'headless Canvas 1280x900; full application RAF; fixed schedule, not presented FPS'};
for(const [name,ref]of Object.entries(refs)){
 const path=join(root,name);await mkdir(path);execFileSync('tar',['-x','-C',path],{input:execFileSync('git',['archive',ref,'js','assets','index.html','styles.css'],{maxBuffer:128*1024*1024})});
 metadata.branches[name]={sha:execFileSync('git',['rev-parse',ref],{encoding:'utf8'}).trim()};
}
const candidateSource=candidate?await readFile('js/renderer/vehicle-sprites.js','utf8'):null;
if(candidate)metadata.branches.input.variant={description:'working-tree heading-independent lighting cache',sha256:createHash('sha256').update(candidateSource).digest('hex')};
const cache=new Map(),mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.wgsl':'text/plain'};
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://local');let parts=url.pathname.split('/').filter(Boolean),profile=parts[0]==='profile';if(profile)parts.shift();
 const name=parts.shift();if(!refs[name])throw Error('Unknown archive');let path=parts.join('/');if(!path)path='index.html';
 const local=resolve(root,name,path);if(!local.startsWith(join(root,name)+'/'))throw Error('Path escape');
 const profileSource=profile&&!url.searchParams.has('auditReset');
 const key=`${profileSource}:${name}/${path}`;if(!cache.has(key)){
  let data=candidate&&name==='input'&&path==='js/renderer/vehicle-sprites.js'?candidateSource:await readFile(local);if(profileSource&&['js/main.js','js/physics/tires.js','js/physics/wheel.js','js/renderer/vehicle-sprites.js'].includes(path))data=instrument(path,data.toString());
  cache.set(key,data);
 }
 res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(cache.get(key));
}catch(e){res.writeHead(404);res.end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox','--disable-gpu','--enable-precise-memory-info']});
metadata.browser=browser.version();const runs=[];
function dist(values){const s=values.filter(Number.isFinite).sort((a,b)=>a-b),q=x=>s[Math.max(0,Math.ceil(s.length*x)-1)];return {samples:s.length,mean:s.reduce((a,b)=>a+b,0)/s.length,median:q(.5),p95:q(.95),p99:q(.99),max:s.at(-1)};}
function summary(r){
 const stages={};for(const stage of Object.keys(r.ticks[0]?.stages||{}))stages[stage]=dist(r.ticks.map(t=>t.stages[stage]));
 const renderStages={};for(const stage of Object.keys(r.frames[0]?.renderStages||{}))renderStages[stage]=dist(r.frames.map(f=>f.renderStages[stage]||0));
 const wheelStats={};for(const wheel of ['frontLeft','frontRight','rearLeft','rearRight']){
  const rows=r.ticks.map(t=>t.wheels[wheel]),totals={};
  if(rows.length){for(const key of Object.keys(rows[0]))totals[key]=key==='depth'?Math.max(...rows.map(x=>x[key])):rows.reduce((s,x)=>s+x[key],0);}
  wheelStats[wheel]=totals;
 }
 return {name:r.name,branch:r.branch,profile:r.profile,hz:r.hz,repeat:r.repeat,
  frameMs:dist(r.externalFrames),cpuFrameMs:dist(r.frames.map(f=>f.ms)),renderMs:dist(r.frames.map(f=>f.renderMs)),tickMs:dist(r.ticks.map(t=>t.ms)),stages,renderStages,wheelStats,
  dropped:r.dropped,simTime:r.simTime,wallMs:r.wallMs,stepsPerExecutionSecond:Math.round(r.simTime*100)/(r.wallMs/1000),
  wheelProbe:r.wheelProbe,stepsPerFrame:dist(r.frames.map(f=>f.ticks)),heap:r.heap,effects:r.effects,
  cpuFramesOver16_7ms:r.externalFrames.filter(x=>x>1000/60).length,cpuFramesOver50ms:r.externalFrames.filter(x=>x>50).length};
}
try{
 for(const profile of quick?[true]:parity?[false]:[false,true])for(const branch of Object.keys(refs)){
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{let q=[],seed=42;window.__seedRandom=()=>{seed=42};Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
    window.requestAnimationFrame=cb=>{q.push(cb);return q.length};window.__frame=t=>{const callbacks=q;q=[];for(const cb of callbacks)cb(t)};});
  if(profile)await page.addInitScript(installProfiler);
  const base=`${origin}/${profile?'profile/':''}${branch}/`;
  await page.goto(`${base}?renderer=canvas&debugMode=quiet`);await page.waitForFunction(()=>Boolean(window.state),{},{polling:50});
  const setup=await page.evaluate(async({driver,installSource,base})=>{const d=await(new Function(`return (${driver})`)())({installSource,base});return {columns:d.columns,parameters:d.parameters};},
   {driver:installDriver.toString(),installSource:install.toString().replace('${base}js/main.js', '${base}js/main.js?auditReset=1'),base});
  metadata.branches[branch].parameters=setup.parameters;metadata.columns=setup.columns;
  const specs=grid?scenarios.filter(s=>['coast','moderate-turn','reversal'].includes(s.name)):quick?scenarios.filter(s=>['coast','moderate-turn','maximum-lock','reversal'].includes(s.name)):scenarios;
  for(let repeat=0;repeat<(quick||grid||parity?1:2);repeat++)for(const hz of grid?[60,240]:[120])for(const spec of specs){
   const result=await page.evaluate(({spec,hz})=>{__seedRandom();return __cornerDriver.run(spec,hz,2);},{spec,hz});
   if(profile&&probe)result.wheelProbe=await page.evaluate(()=>__cornerDriver.probeWheel());
   Object.assign(result,{branch,profile,repeat});runs.push(result);
   const s=summary(result);console.log(JSON.stringify({branch,profile,repeat,name:spec.name,frame:s.frameMs,tick:s.tickMs,subdivisions:Object.values(s.wheelStats).reduce((s,w)=>s+(w.subdivisions||0),0)}));
  }
  metadata.branches[branch].errors=errors;await context.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
const summaries=runs.map(summary),comparisons=[],instrumentationParity=[];
for(const r of runs.filter(r=>r.branch==='input')){
 const base=runs.find(x=>x.branch==='audit'&&x.profile===r.profile&&x.name===r.name&&x.repeat===r.repeat&&x.hz===r.hz);
 let mismatches=0,maxAbsolute=0,first=null;
 for(let i=0;i<r.traces.length;i++)for(let j=0;j<r.traces[i].length;j++)if(r.traces[i][j]!==base.traces[i][j]){
  mismatches++;const d=typeof r.traces[i][j]==='number'&&typeof base.traces[i][j]==='number'?Math.abs(r.traces[i][j]-base.traces[i][j]):null;
  if(d!==null)maxAbsolute=Math.max(maxAbsolute,d);first??={frame:i,column:metadata.columns[j],audit:base.traces[i][j],input:r.traces[i][j]};
 }
 comparisons.push({name:r.name,hz:r.hz,profile:r.profile,repeat:r.repeat,mismatches,maxAbsolute,first});
}
for(const r of runs.filter(r=>r.profile)){
 const plain=runs.find(x=>!x.profile&&x.branch===r.branch&&x.name===r.name&&x.repeat===r.repeat&&x.hz===r.hz);
 if(plain)instrumentationParity.push({name:r.name,hz:r.hz,branch:r.branch,repeat:r.repeat,exact:JSON.stringify(r.traces)===JSON.stringify(plain.traces)});
}
await writeFile(`${out}.json`,JSON.stringify({metadata,summaries,comparisons,instrumentationParity},null,2));
await writeFile(`${out}.json.gz`,gzipSync(JSON.stringify({metadata,runs})));
console.log('Saved',out);
