// Apply Mission16's independent certificate to the *original* nested solver
// at actual saturated/recontact stages, without changing any tolerance.
import {makeFixture} from './fixtures.mjs';import {stepTerrainVehicle} from '../procedural-terrain/src/vehicle.js';import {NUMERICAL_EXPERIMENTS} from '../procedural-terrain/src/numerical-settings.js';import {certify} from '../contact-solver-challenge/check.js';import {writeFile} from 'node:fs/promises';
const runs=[];
for(const strategy of ['reference','speed-normalized-anisotropic'])for(const scenario of ['saturated','recontact'])for(const accuracy of ['strict','balanced']){
 const {v,inputs}=makeFixture(strategy,scenario);if(accuracy==='balanced')v.numerics=NUMERICAL_EXPERIMENTS.balanced;const certificates=[];let captured;
 v.contactCapture=p=>captured=p;
 for(let i=0;i<35;i++){stepTerrainVehicle(v,inputs(i*.001),.001);const c=certify(captured,captured.z,accuracy==='strict'?1e-12:1e-10,captured.L);certificates.push({time:v.state.time,residual:captured.postResidual,...c});}
 runs.push({strategy,scenario,accuracy,failures:certificates.filter(c=>!c.pass).length,maxKKT:Math.max(...certificates.map(c=>c.kkt)),certificates});
}
await writeFile(new URL('results/reference-certificates.json',import.meta.url),JSON.stringify({note:'Unmodified Mission16 certificate; same physical equations and FISTA tolerances. Extra capture/check cost is validation-only, not a performance denominator.',runs},null,2));console.log(runs.map(({certificates,...r})=>r));
