import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createTerrainVehicle,stepTerrainVehicle} from '../src/vehicle.js';
const fixture=JSON.parse(await readFile(new URL('../results/performance/long-drive-failure.json',import.meta.url),'utf8'));
function replay(){const v=createTerrainVehicle(fixture.settings);Object.assign(v.state,structuredClone(fixture.state));v.state.flywheel.gearbox=v.state.gearbox;return v;}
test('139.912 s work-gate stall is corrected without relaxing endpoint or energy limits',()=>{
 assert.equal(fixture.candidate.error,0);assert.ok(fixture.candidate.identity>1e-9);const a=replay(),b=replay();let peak=0,peakNormalWork=0,maxIterations=0;
 for(let i=0;i<100;i++){stepTerrainVehicle(a,fixture.ports);stepTerrainVehicle(b,fixture.ports);peakNormalWork=Math.max(peakNormalWork,a.state.terrainLedger.normalWorkResidual);peak=Math.max(peak,Math.abs(a.state.terrainLedger.residual));maxIterations=Math.max(maxIterations,a.state.terrainLedger.iterations);assert.ok(Math.abs(a.state.terrainLedger.residual)<1e-7);}
 assert.deepEqual(structuredClone(a.state),structuredClone(b.state));assert.ok(a.state.time>fixture.time+.099);console.log({peak,peakNormalWork,maxIterations,after:a.state.time});
});
test('long-drive checkpoint converges at 2/1/0.5 ms with unchanged work checks',()=>{
 const states=[.002,.001,.0005].map(h=>{const v=replay();for(let i=0;i<Math.round(.02/h);i++){stepTerrainVehicle(v,fixture.ports,h);assert.ok(Math.abs(v.state.terrainLedger.residual)<1e-7);}return v.state;});
 const distance=(a,b)=>Math.hypot(a.planar.u-b.planar.u,a.planar.v-b.planar.v,...a.vertical.v.map((v,i)=>v-b.vertical.v[i]));
 const coarse=distance(states[0],states[2]),fine=distance(states[1],states[2]);assert.ok(fine<coarse);console.log({coarse,fine});
});
