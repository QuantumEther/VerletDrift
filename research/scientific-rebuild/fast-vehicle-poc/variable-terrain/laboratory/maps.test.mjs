import test from 'node:test';import assert from 'node:assert/strict';
import {authored,createMap,mapColor} from './maps.js';import {createLaboratory,advance,presentation} from './adapter.js';
for(const preset of authored)test(`${preset}: gradients, surfaces and vehicle contacts`,()=>{const settings={preset,seed:23,amplitude:.15,roughness:.5},map=createMap(settings);for(const [x,y] of [[0,0],[12,2],[-8,6],[30,-4]]){const s=map.sample(x,y),e=1e-4,dx=(map.sample(x+e,y).height-map.sample(x-e,y).height)/(2*e),dy=(map.sample(x,y+e).height-map.sample(x,y-e).height)/(2*e);assert.ok(Math.abs(dx-s.gradient[0])<1e-8);assert.ok(Math.abs(dy-s.gradient[1])<1e-8);assert.ok(Math.abs(Math.hypot(...s.normal)-1)<1e-12);assert.ok(s.friction>0);assert.deepEqual(map.paint(x,y),mapColor(s,x,y,preset));assert.equal(mapColor(s,x,y,preset).length,3);}const center=map.sample(0,0),far=map.sample(0,40);assert.notEqual(center.surface,far.surface);assert.notEqual(center.friction,far.friction);const lab=createLaboratory(settings,{speed:2}),energy=lab.initialEnergy;for(let i=0;i<500;i++)advance(lab,{throttle:.3,clutch:.3,steer:.05});const p=presentation(lab);assert.ok(Math.abs(p.energyResidual)<1e-7);assert.ok(p.wheels.every(w=>Number.isFinite(w.normal)&&w.normal>=0));assert.ok(lab.state.consistency.iterations<=24);assert.ok(Number.isFinite(energy));});
test('each wheel independently consumes midpoint corridor friction',()=>{
 for(const preset of authored){
  const settings={preset,seed:23,amplitude:.15,roughness:.5};
  const spawn=preset==="flight"?40:0,road=createMap(settings).sample(spawn,0).road;
  const lab=createLaboratory(settings,{x:spawn,y:road.width/2}),before=lab.state.y;
  advance(lab,{clutch:0,ignition:false});
  const {contacts,y,vertical}=lab.state;
  assert.ok(new Set(contacts.map(c=>c.normal.mu)).size>=2,preset);
  for(let i=0;i<4;i++){
   const [x,z]=vertical.corners[i];
   const wheel=q=>[q[0]+Math.cos(q[2])*x-Math.sin(q[2])*z,q[1]+Math.sin(q[2])*x+Math.cos(q[2])*z];
   const start=wheel(before),end=wheel(y);
   assert.ok(Math.abs(contacts[i].normal.mu-lab.terrain.sample((start[0]+end[0])/2,(start[1]+end[1])/2).friction)<1e-12);
  }
 }
});
