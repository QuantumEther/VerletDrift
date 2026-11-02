import {readFile,writeFile} from 'node:fs/promises';
const load=async name=>JSON.parse(await readFile(new URL('results/'+name+'.json',import.meta.url)));
const validation=await load('comparison'),timing=await load('timing'),mechanical=await load('mechanical');
const median=a=>a.sort((x,y)=>x-y)[Math.floor(a.length/2)],distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const scenarios=[...new Set(timing.runs.map(r=>r.name))];let sourceTotal=0,pocTotal=0;
const rows=scenarios.map(name=>{
 const row={name};for(const method of ['strict','poc']){
 const selected=timing.runs.filter(r=>r.name===name&&r.method===method&&!r.warmup);
 if(!selected.every(r=>r.completed===1000&&!r.failed))throw Error('Incomplete timing trajectory');
 row[method]={cpuMsPerSimSecond:median(selected.map(r=>r.cpuMsPerSimSecond)),medianStepMs:median(selected.map(r=>r.medianMs)),p95StepMs:median(selected.map(r=>r.p95Ms)),p99StepMs:median(selected.map(r=>r.p99Ms)),worstStepMs:Math.max(...selected.map(r=>r.worstMs)),meanContactIterationsPerStep:median(selected.map(r=>r.iterations/1000)),meanEndpointIterationsPerStep:median(selected.map(r=>r.outer/1000))};
 }sourceTotal+=row.strict.cpuMsPerSimSecond;pocTotal+=row.poc.cpuMsPerSimSecond;row.ratio=row.strict.cpuMsPerSimSecond/row.poc.cpuMsPerSimSecond;
 const ref=validation.refinements.find(r=>r.name===name&&r.method==='strict'&&r.h===.001),poc=validation.refinements.find(r=>r.name===name&&r.method==='poc'&&r.h===.001);
 row.modelDifferenceAt1Second={positionM:distance(ref.final,poc.final),headingRad:poc.final[2]-ref.final[2],speedMS:Math.hypot(...poc.final.slice(3,5))-Math.hypot(...ref.final.slice(3,5)),wheelOmegaMaxRadS:Math.max(...ref.final.slice(6,10).map((x,i)=>Math.abs(x-poc.final[i+6])))};
 row.refinement={};for(const method of ['strict','poc']){const a=validation.refinements.find(r=>r.name===name&&r.method===method&&r.h===.001),b=validation.refinements.find(r=>r.name===name&&r.method===method&&r.h===.00025);row.refinement[method]={positionM:distance(a.final,b.final),headingRad:Math.abs(a.final[2]-b.final[2]),wheelOmegaMaxRadS:Math.max(...a.final.slice(6,10).map((x,i)=>Math.abs(x-b.final[i+6]))) };}
 return row;
});
const result={equalScenarioAggregateRatio:sourceTotal/pocTotal,meanStrictCpuMsPerSimSecond:sourceTotal/scenarios.length,meanPocCpuMsPerSimSecond:pocTotal/scenarios.length,validationFailures:validation.refinements.filter(r=>r.failed||r.completed!==Math.round(1/r.h)),timingRows:rows,mechanicalRows:mechanical.rows};
await writeFile(new URL('results/summary.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,mechanicalRows:undefined},null,2));
