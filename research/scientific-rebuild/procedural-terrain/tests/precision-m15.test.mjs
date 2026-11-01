import {test} from 'node:test';import assert from 'node:assert/strict';
import {numericalSettings,STRICT_NUMERICS,velocityConverged,VELOCITY_SCALES,NUMERICAL_EXPERIMENTS} from '../src/numerical-settings.js';
import {fixture} from '../tools/tire-ab-fixtures.mjs';import {createTerrainVehicle,respawnTerrain,stepTerrainVehicle} from '../src/vehicle.js';
test('numerical experiments are explicit, bounded and cannot alter safety tolerances',()=>{
 assert.equal(numericalSettings(),STRICT_NUMERICS);assert.equal(numericalSettings({}),STRICT_NUMERICS);assert.ok(Object.isFrozen(STRICT_NUMERICS));
 for(const p of [{contactTolerance:1e-6},{contactTolerance:NaN},{positionTolerance:1e-7},{velocityTolerance:0},{energyTolerance:1},{velocityMode:'other'},{velocityRelative:1e-9},null])assert.throws(()=>numericalSettings(p));
 for(const contactTolerance of [1e-12,1e-11,1e-10,1e-9,1e-8,1e-7])assert.equal(numericalSettings({contactTolerance}).contactTolerance,contactTolerance);
});
test('explicit strict settings preserve all reference state and iteration counters',()=>{
 for(const id of ['reference','speed-normalized-anisotropic']){
  const a=fixture(id,.5,'recontact',.1),b=fixture(id,.5,'recontact',.1);b.v.numerics={...STRICT_NUMERICS};
  for(let i=0;i<20;i++){stepTerrainVehicle(a.v,{},.001);stepTerrainVehicle(b.v,{},.001);assert.deepEqual(b.v.state,a.v.state);}
 }
});
test('scaled velocity criterion handles mixed units explicitly and demands every component',()=>{
 const p=numericalSettings({velocityMode:'scaled',velocityTolerance:1e-9,velocityRelative:1e-9}),a=Array(18).fill(0),b=VELOCITY_SCALES.map(x=>x*5e-10);
 assert.ok(velocityConverged(a,b,1,p));b[4]=1e-8;assert.equal(velocityConverged(a,b,0,p),false);assert.equal(velocityConverged(null,a,0,p),false);
 assert.equal(velocityConverged(a,a,1e-10,STRICT_NUMERICS),false);
});
test('loose contact experiment rejects invalid physical solution without publishing state or history',()=>{
 const {v,inputs}=fixture('reference',.5,'acceleration',1);v.numerics={contactTolerance:1e-7};let accepted=0,rejected=false;
 const observer={capture:s=>s.time,accept:a=>accepted+=a.length};
 for(let i=0;i<20;i++){
  const before=structuredClone({state:v.state,contacts:v.contacts,integration:v.integration}),history=accepted;
  try{stepTerrainVehicle(v,inputs(i*.001),.001,observer);}catch(e){assert.match(e.message,/Contact energy\/domain violation/);assert.deepEqual(structuredClone({state:v.state,contacts:v.contacts,integration:v.integration}),before);assert.equal(accepted,history);rejected=true;break;}
 }
 assert.ok(rejected);
});

test('balanced opt-in passes coupled gates and explicit non-flat gear events still roll back',()=>{
 const settings={preset:'road',seed:42,amplitude:.001,roughness:.1},v=createTerrainVehicle(settings);assert.ok(respawnTerrain(v,settings).success);v.numerics=NUMERICAL_EXPERIMENTS.balanced;v.state.gearbox.driverForce=120;
 let rejected=false,accepted=0;const observer={capture:s=>s.time,accept:a=>accepted+=a.length};
 for(let i=0;i<12;i++){
  const before=structuredClone(v.state),history=accepted;
  try{stepTerrainVehicle(v,{},.001,observer);}catch(e){assert.match(e.message,/gear event/);assert.deepEqual(structuredClone(v.state),before);assert.equal(accepted,history);rejected=true;break;}
 }
 assert.ok(rejected);
});
test('non-strict numerical settings cannot silently change the inherited flat dispatch',()=>{
 const v=createTerrainVehicle({preset:'flat'}),before=structuredClone(v.state);v.numerics=NUMERICAL_EXPERIMENTS.balanced;
 assert.throws(()=>stepTerrainVehicle(v,{},.001),/non-flat terrain path/);assert.deepEqual(structuredClone(v.state),before);
});
