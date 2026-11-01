// Classify real-RAF failures using identical captured entry states and ports.
import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
import {cloneMechanical,stepTerrainVehicle} from '../src/vehicle.js';
const original=await import(pathToFileURL((process.env.M14_BASE||'/tmp/m14-base')+'/research/scientific-rebuild/procedural-terrain/src/vehicle.js'));
const data=JSON.parse(await readFile(new URL('../results/performance-m14/browser-driving.json',import.meta.url))),results=[];
for(const r of data.results.filter(r=>r.phase==='steering'&&r.end.clock.fault)){
 const outcomes=[];
 for(const [name,step] of [['base',original.stepTerrainVehicle],['optimized',stepTerrainVehicle]]){
  const v={state:cloneMechanical(r.end.clock.fault.snapshot),terrainSettings:{preset:'road',seed:42,amplitude:.001,roughness:.1}},before=structuredClone(v.state);
  try{step(v,{throttle:1,steer:.4},1/r.hz);outcomes.push({name,accepted:true});}catch(e){outcomes.push({name,accepted:false,message:e.message,candidate:e.candidate});assert.deepEqual(structuredClone(v.state),before);}
 }
 assert.equal(outcomes[0].accepted,false);assert.equal(outcomes[1].accepted,false);assert.deepEqual(outcomes[1].candidate,outcomes[0].candidate);assert.equal(outcomes[1].message,outcomes[0].message);
 results.push({capturedFrom:r.kind,hz:r.hz,time:r.end.clock.fault.at,classification:'pre-existing bounded-domain energy rejection; exact same failure and rollback from identical inputs',outcomes});
}
assert.ok(results.length>0);await writeFile(new URL('../results/performance-m14/browser-fault-replay.json',import.meta.url),JSON.stringify({base:'bf45052',status:'PASS matched-failure classification, not a passing driving experiment',results},null,2));console.log('PASS identical captured-state failures:',results.length);
