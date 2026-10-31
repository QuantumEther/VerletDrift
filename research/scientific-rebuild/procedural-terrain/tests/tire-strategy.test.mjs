import {test} from 'node:test';import assert from 'node:assert/strict';
import {createTireStrategy,freezeTireCoefficients,anisotropicForce} from '../src/tire-strategy.js';
import {createTerrainVehicle,respawnTerrain,stepTerrainVehicle} from '../src/vehicle.js';
test('anisotropic saturation minimizes the constrained objective, not radial clipping',()=>{
 const p={kx:800,ky:3800},sx=.6,sy=.3,L=200,f=anisotropicForce(sx,sy,L,1,p),objective=(x,y)=>.5*(x*x/p.kx+y*y/p.ky)-sx*x-sy*y;
 assert.ok(Math.abs(Math.hypot(f.fx,f.fy)-L)<1e-10);const exact=objective(-f.fx,-f.fy);
 for(let i=0;i<100000;i++){const a=i*2*Math.PI/100000;assert.ok(exact<=objective(L*Math.cos(a),L*Math.sin(a))+1e-8);}
});
test('B meets registered unsaturated speed overlap and has bounded zero-speed coefficients',()=>{
 for(const floor of [.25,.5,1,2]){const s=createTireStrategy({id:'speed-normalized-anisotropic',minSpeed:floor});assert.ok(Object.isFrozen(s));assert.ok(Number.isFinite(freezeTireCoefficients(s,0).ky));for(const angle of [.5,1,2]){const forces=[5,10,20].map(v=>anisotropicForce(0,v*Math.tan(angle*Math.PI/180),1000,.9,freezeTireCoefficients(s,v)).fy);assert.ok((Math.max(...forces)-Math.min(...forces))/900<.02);}}
});
test('B actually advances non-flat production vehicle; flat rejection is atomic',()=>{
 const b=createTireStrategy({id:'speed-normalized-anisotropic'}),v=createTerrainVehicle({preset:'road',seed:42,amplitude:.001,roughness:.1});assert.ok(respawnTerrain(v,v.terrainSettings).success);v.tireStrategy=b;for(let i=0;i<30;i++)stepTerrainVehicle(v,{starter:true,steer:.01});assert.equal(v.state.planar.contact.tireStrategy.id,b.id);assert.ok(Math.abs(v.state.terrainLedger.residual)<1e-7);
 const flat=createTerrainVehicle();flat.tireStrategy=b;const before=structuredClone(flat.state);let samples=0;assert.throws(()=>stepTerrainVehicle(flat,{},.001,{capture:()=>0,accept:()=>samples++}),/flat-ground/);assert.deepEqual(structuredClone(flat.state),before);assert.equal(samples,0);
});
// Independent angular minimization of the boundary objective; no multiplier
// equation from the implementation is used by this reference.
function angularReference(sx,sy,L,p){
 if(L===0)return {fx:0,fy:0};if(Math.hypot(p.kx*sx,p.ky*sy)<=L)return {fx:-p.kx*sx,fy:-p.ky*sy};
 const value=a=>.5*L*L*(Math.cos(a)**2/p.kx+Math.sin(a)**2/p.ky)-L*(sx*Math.cos(a)+sy*Math.sin(a));
 const derivative=a=>L*L*Math.sin(a)*Math.cos(a)*(1/p.ky-1/p.kx)+L*(sx*Math.sin(a)-sy*Math.cos(a));
 let best=0;for(let i=0;i<256;i++){let lo=i*2*Math.PI/256,hi=(i+1)*2*Math.PI/256,f=derivative(lo);if(f*derivative(hi)>0)continue;for(let j=0;j<70;j++){const m=(lo+hi)/2;if(f*derivative(m)<=0)hi=m;else{lo=m;f=derivative(m);}}const a=(lo+hi)/2;if(value(a)<value(best))best=a;}
 return {fx:-L*Math.cos(best),fy:-L*Math.sin(best)};
}
test('B diagnostic agrees with independent angular minima and the actual isolated convex solver',async()=>{
 const {solveContacts}=await import('../src/contact-solver.js');
 for(const floor of [.25,.5,1,2])for(const speed of [0,5,10,20])for(const normal of [0,250,1000])for(const sx of [-.8,0,.2])for(const sy of [-2,-.1,0,.2,4]){
  const p=freezeTireCoefficients(createTireStrategy({id:'speed-normalized-anisotropic',minSpeed:floor}),speed),L=.9*normal,h=.001;
  const actual=anisotropicForce(sx,sy,normal,.9,p),expected=angularReference(sx,sy,L,p);assert.ok(Math.hypot(actual.fx-expected.fx,actual.fy-expected.fy)<1e-7);
  const solved=solveContacts([[0,0],[0,0]],[sx,sy],[{j:[1,0],compliance:1/(h*p.kx)},{j:[0,1],compliance:1/(h*p.ky)}],[{indices:[0,1],limit:h*L}],h,{tolerance:1e-12,maxIterations:20000});
  assert.ok(Math.hypot(actual.fx+solved.z[0]/h,actual.fy+solved.z[1]/h)<2e-5);assert.ok(actual.fx*sx+actual.fy*sy<=1e-9);
 }
});
test('frozen reference speed is ground motion, excludes wheel spin and is not updated by braking trials',async()=>{
 const {sampleWheelTerrain}=await import('../src/vehicle.js');const v=createTerrainVehicle({preset:'road',seed:42,amplitude:.001,roughness:.1});assert.ok(respawnTerrain(v,v.terrainSettings).success);v.state.v=5;v.tireStrategy=createTireStrategy({id:'speed-normalized-anisotropic'});
 const sample=sampleWheelTerrain(v)[0],n=sample.normal.map(x=>x/Math.hypot(...sample.normal)),expected=5*Math.sqrt(1-n[0]*n[0]);stepTerrainVehicle(v,{serviceBrake:1},.001);const speed=v.state.planar.contact.tireStrategy.coefficients[0].referenceSpeed;
 assert.ok(Math.abs(speed-expected)<1e-10);assert.ok(Math.abs(speed-v.state.planar.u)>1e-5);assert.ok(speed>4.9);
});
test('longitudinal-only B matches A, including saturation and zero grip/load',()=>{
 for(const floor of [.25,.5,1,2])for(const speed of [0,5,10,20])for(const N of [0,250,1000])for(const mu of [0,.45,.9])for(const sx of [-5,-.2,0,.2,5]){
  const p=freezeTireCoefficients(createTireStrategy({id:'speed-normalized-anisotropic',minSpeed:floor}),speed),b=anisotropicForce(sx,0,N,mu,p);const limit=mu*N,expected=-Math.sign(sx)*Math.min(800*Math.abs(sx),limit);assert.ok(Math.abs(b.fx-expected)<1e-9);assert.ok(Math.abs(b.fy)<1e-12);
 }
 assert.throws(()=>anisotropicForce(1,1,100,-1,{kx:800,ky:3800}),/Invalid/);assert.throws(()=>createTireStrategy({id:'speed-normalized-anisotropic',minSpeed:Number.MIN_VALUE}),/stiffness/);
});
test('B is physically distinct and rejected regeneration retains configuration and history',()=>{
 const settings={preset:'road',seed:42,amplitude:.001,roughness:.1},a=createTerrainVehicle(settings),b=createTerrainVehicle(settings);assert.ok(respawnTerrain(a,settings).success);b.tireStrategy=createTireStrategy({id:'speed-normalized-anisotropic'});assert.ok(respawnTerrain(b,settings).success);
 for(let i=0;i<30;i++){stepTerrainVehicle(a,{steer:.01});stepTerrainVehicle(b,{steer:.01});}assert.ok(a.state.wheels.some((w,i)=>Math.abs(w.fy-b.state.wheels[i].fy)>1e-6));
 const original=structuredClone(b.state),config=b.tireStrategy;let clears=0;const status=respawnTerrain(b,{preset:'flat'},{clear:()=>clears++});assert.equal(status.success,false);assert.equal(b.tireStrategy,config);assert.deepEqual(structuredClone(b.state),original);assert.equal(clears,0);
});
test('B row dispatch is active in every supported fixture and timestep/floor combination',async()=>{
 const {fixture}=await import('../tools/tire-ab-fixtures.mjs');
 for(const scenario of ['acceleration','braking','steering','combined','recontact','recovery','steering-release','near-steady','drift-recovery'])for(const h of [.001,.002,.004])for(const floor of [.25,.5,1,2]){
  const {v,inputs}=fixture('speed-normalized-anisotropic',floor,scenario,1);stepTerrainVehicle(v,inputs(0),h);const c=v.state.planar.contact;
  assert.equal(c.tireStrategy.id,'speed-normalized-anisotropic');for(let i=0;i<4;i++){assert.equal(c.tireRows.compliance[2*i],1/(h*800));assert.equal(c.tireRows.compliance[2*i+1],1/(h*c.tireStrategy.coefficients[i].ky));assert.equal(c.tireRows.limit[i],h*v.state.wheels[i].mu*Math.max(0,v.state.wheels[i].normal));}
 }
});
test('speed floor is continuous through rest and reversal; contact cannot pull at negative load',()=>{
 for(const floor of [.25,.5,1,2]){
  const s=createTireStrategy({id:'speed-normalized-anisotropic',minSpeed:floor});
  for(const speed of [-1e-12,0,1e-12])assert.equal(freezeTireCoefficients(s,speed).ky,3800/floor);
  assert.ok(Math.abs(freezeTireCoefficients(s,floor*(1+1e-10)).ky-3800/floor)<2e-6);
  assert.deepEqual(anisotropicForce(2,3,-1,.9,freezeTireCoefficients(s,0)),{fx:0,fy:0});
 }
});
test('matched A/B fixtures have identical non-tire initial state and input schedules',async()=>{
 const {fixture}=await import('../tools/tire-ab-fixtures.mjs');
 for(const scenario of ['acceleration','braking','steering','combined','recontact','recovery','steering-release','near-steady','drift-recovery']){
  const a=fixture('reference',.5,scenario,1),b=fixture('speed-normalized-anisotropic',.5,scenario,1);
  assert.deepEqual(structuredClone(a.v.state),structuredClone(b.v.state));
  for(const t of [0,.2,.5,.6,1])assert.deepEqual(a.inputs(t),b.inputs(t));
 }
});
