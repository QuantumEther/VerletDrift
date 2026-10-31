import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {createVehicle,stepVehicle,roadAt,cornerForces} from '../src/vehicle.js';
import {createVehicle as oldVehicle,stepVehicle as oldStep} from '../../braking-and-tire-contact-prototype/src/vehicle.js';
import {contactWorld,captureContacts} from '../src/contact-observation.js';import {TireObservatory,DEPOSITION,depositionOpacity} from '../src/tracks.js';import {createTrackView,displayedRoadHeight} from '../src/track-view.js';
const close=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
function synthetic(time,{x=time*4,y=0,heading=0,slip=8,side=0,normal=250,mu=.9,geometry=true}={}){
 const force=-Math.min(800,mu*normal/Math.max(Math.hypot(slip,side),1e-100));
 return {time,center:{x,y,z:0},heading,bump:null,wheels:[0,1,2,3].map(i=>({name:['FL','FR','RL','RR'][i],position:{x:x+(i<2?1:-1),y:y+(i%2?-.6:.6),z:0},heading,forceHeading:heading,omega:0,normal,mu,sx:slip,sy:side,fx:force*slip,fy:force*side,power:-force*(slip*slip+side*side),slidingSpeed:Math.hypot(slip,side),utilization:mu*normal>0?Math.abs(force)*Math.hypot(slip,side)/(mu*normal):null,supported:normal>0,geometryContact:geometry,saturated:Math.abs(force)*Math.hypot(slip,side)>=mu*normal-1e-8,brakeTorque:0}))};
}
function feed(o,n,config={},offset=0){let start=synthetic(offset,typeof config==='function'?config(offset):config);for(let i=1;i<=n;i++){const time=offset+i*.001,end=synthetic(time,typeof config==='function'?config(time):config);o.record({start,end,h:.001});start=end;}return o;}
const records=o=>o.marks.map(r=>[...r.values()]);
test('actual four-wheel world contacts include heading, lateral offsets and terrain height',()=>{
 const s=createVehicle();s.planar.x=3;s.planar.y=-2;s.planar.heading=Math.PI/2;
 const points=s.wheels.map(w=>contactWorld(s,w));close(points[0].x,2.4);close(points[1].x,3.6);close(points[0].y,-1);close(points[2].y,-3);
 s.bump=2.2;close(contactWorld(s,s.wheels[0]).z,roadAt(s,2.4).height);assert.ok(points[0].x!==points[1].x);
});
test('four independent locked-wheel trails follow straight world paths, not wheel angle',()=>{
 const o=feed(new TireObservatory(),1000);assert.ok(o.marks.every(r=>r.count>50));
 for(let i=0;i<4;i++){const rows=[...o.marks[i].values()];assert.ok(rows.every(r=>r.wheel===i));assert.ok(rows.every(r=>Math.abs(r.a.y-(i%2?-.6:.6))<1e-9));assert.ok(rows.some(r=>r.b.x-r.a.x>.03));}
 close(o.totalWork[0],1800,1e-8);assert.equal(o.latest[2].forceStageOmega,0);
});
test('curved combined sliding makes finite smooth joins without polygon spikes',()=>{
 const o=feed(new TireObservatory(),2000,t=>({x:2*Math.sin(2*t),y:2*(1-Math.cos(2*t)),heading:2*t,slip:5,side:3}));
 for(const ring of o.marks)for(const r of ring.values()){assert.ok(Math.hypot(r.b.x-r.a.x,r.b.y-r.a.y)<=DEPOSITION.footprint+1e-9);close(Math.hypot(r.na.x,r.na.y),1);close(Math.hypot(r.nb.x,r.nb.y),1);assert.ok(r.alpha>0&&r.alpha<=.7);}
 const rows=[...o.marks[0].values()];assert.ok(rows.at(-1).a.y>1);
});
test('stationary wheelspin deposits one local imprint and does not export old heat into a trail',()=>{
 const o=feed(new TireObservatory(),4000,{x:0,y:0,slip:-20});assert.deepEqual(o.marks.map(r=>r.count),[1,1,1,1]);
 const r=[...o.marks[2].values()][0];close(r.b.x-r.a.x,.12);assert.ok(r.alpha>.6);close(r.work,o.totalWork[2],1e-8);close(o.center.count,1);
 feed(o,100,{slip:1,x:.01},4);assert.ok(o.marks[2].count<=2);assert.ok([...o.marks[2].values()].every(m=>Math.abs(m.b.x-m.a.x)<=.12+1e-8));
});
test('ordinary rolling, airborne and invalid footprint contacts do not paint',()=>{
 for(const config of [{slip:0},{slip:.02},{normal:0,slip:10},{geometry:false,slip:10}]){const o=feed(new TireObservatory(),500,config);assert.equal(o.marks.reduce((n,r)=>n+r.count,0),0);}
 const airborne=feed(new TireObservatory(),10,{normal:0});assert.equal(airborne.latest[0].utilization,null);assert.equal(airborne.latest[0].supported,false);
});
test('saturation, significant slip, work and visible opacity are different measurements',()=>{
 const o=feed(new TireObservatory(),100,{mu:.01,slip:.05});assert.equal(o.latest[0].saturated,true);assert.equal(o.latest[0].significantSliding,false);assert.equal(o.marks[0].count,0);
 assert.ok(depositionOpacity(2,.1,250)>depositionOpacity(1,.1,250));assert.ok(depositionOpacity(2,.1,250)>depositionOpacity(2,.1,50));close(depositionOpacity(0,.1,250),0);
});
test('teleports, restarts and skipped observation intervals break links; pause alone does not',()=>{
 const o=feed(new TireObservatory(),100);feed(o,100,{x:100},.1);assert.ok(records(o).flat().every(r=>Math.hypot(r.b.x-r.a.x,r.b.y-r.a.y)<=.12+1e-9));
 const before=structuredClone(records(o));for(let i=0;i<240;i++)o.stats();assert.deepEqual(records(o),before);
 o.breakContinuity();feed(o,100,{x:0},0);assert.ok([...o.paths[0].values()].filter(p=>p.breakBefore).length>=3);
 const total=o.totalWork[0];o.clear();assert.ok(o.marks.every(r=>r.count===0));assert.ok(o.paths.every(r=>r.count===0));assert.equal(o.center.count,0);close(o.totalWork[0],total);
});
test('30/60/144/240 presentation rates produce identical deterministic history and GPU vertices',()=>{
 const outputs=[30,60,144,240].map(fps=>{const o=new TireObservatory({capacity:64}),view=createTrackView(new THREE.Scene(),64),s=createVehicle();let start=synthetic(0);
  for(let i=1;i<=1200;i++){const end=synthetic(i*.001,{x:4*i*.001,y:.2*Math.sin(i*.005)});o.record({start,end,h:.001});start=end;s.planar.x=end.center.x;s.planar.y=end.center.y;if(Math.floor(i*fps/1000)>Math.floor((i-1)*fps/1000))view.draw(s,o,true);}
  view.draw(s,o,true);return {records:records(o),positions:[...view.geometry.attributes.position.array],indices:[...view.geometry.index.array.slice(0,view.geometry.drawRange.count)].sort((a,b)=>a-b),colors:[...view.geometry.attributes.shade.array]};});
 for(const q of outputs.slice(1))assert.deepEqual(q,outputs[0]);
});
test('bounded FIFO history and incremental renderer survive overflow, hiding, terrain changes and clearing',()=>{
 const o=feed(new TireObservatory({capacity:32,pathCapacity:64}),20000),scene=new THREE.Scene(),view=createTrackView(scene,32),s=createVehicle();
 assert.ok(o.marks.every(r=>r.count===32));assert.ok(o.paths.every(r=>r.count<=64));assert.ok(o.center.count<=64);const before=structuredClone(o.stats());view.draw(s,o,true);const bytes=view.info().bytes;
 const positions=[...view.geometry.attributes.position.array];feed(o,10000,{},20);view.draw(s,o,false);assert.deepEqual([...view.geometry.attributes.position.array],positions);view.draw(s,o,true);assert.equal(view.info().bytes,bytes);assert.equal(scene.children.length,1);assert.ok(view.info().activePrimitives<=128);
 s.bump=1;view.draw(s,o,true);close(displayedRoadHeight(1.125,1),(roadAt(s,1).height+roadAt(s,1.25).height)/2);
 const state=structuredClone(s);o.clear();view.draw(s,o,true);close(view.geometry.drawRange.count,0);assert.deepEqual(structuredClone(s),state);assert.ok(before.revision>0);
});
test('observer leaves governing mechanics bit-identical to the predecessor, including dog time searches',()=>{
 const a=createVehicle({automobile:true}),b=oldVehicle({automobile:true}),o=new TireObservatory();let searches=0,sum=0;
 for(let i=0;i<1200;i++){const ports={starter:i<1000,throttle:i>800?.6:0,serviceBrake:i>1050?1:0,steer:i>400?.2:0};a.gearbox.driverForce=b.gearbox.driverForce=i<400?120:0;a.flywheel.engagement=b.flywheel.engagement=i>900?.3:0;stepVehicle(a,ports,.001,o);oldStep(b,ports);searches+=a.gearbox.eventIterations;assert.deepEqual(structuredClone(a),structuredClone(b));}
 assert.ok(searches>0);close(o.acceptedTime,a.time,1e-10);assert.ok(o.acceptedStages>=1200);assert.ok(o.totalWork.every(Number.isFinite));
});
test('accepted substage slip work is counted once and rejected probes never enter history',()=>{
 const s=createVehicle();s.v=8;s.wheels.forEach(w=>w.omega=25);const o=new TireObservatory(),realAccept=o.accept.bind(o);let independent=0,stages=0;
 o.accept=samples=>{for(const q of samples){independent+=q.h*q.end.wheels.reduce((p,w)=>p+w.power,0);stages++;}realAccept(samples);};
 for(let i=0;i<500;i++){s.gearbox.driverForce=120;stepVehicle(s,{handbrake:1,steer:.15},.001,o);}
 close(o.totalWork.reduce((a,b)=>a+b,0),independent,1e-8);assert.equal(o.acceptedStages,stages);close(o.acceptedTime,.5,1e-10);
});
test('all immediate predecessor files and all governing constitutive modules are preserved',()=>{
 const base='research/scientific-rebuild/braking-and-tire-contact-prototype',here='research/scientific-rebuild/tire-road-observatory-prototype';
 for(const f of execFileSync('git',['ls-tree','-r','--name-only','d419189','--',base],{encoding:'utf8'}).trim().split('\n'))assert.deepEqual(readFileSync(['index.html','src/main.js','src/view3d.js','src/steering.js','src/planar.js','src/vehicle.js','src/contact-solver.js','tests/automobile.test.js'].some(n=>f===base+'/'+n)?f.replace(base,'research/scientific-rebuild/steering-predecessor'):f),execFileSync('git',['show','d419189:'+f],{maxBuffer:8*1024*1024}),f);
 for(const f of ['planar.js','contact-solver.js','engine.js','brakes.js','steering.js','gearbox.js','clutch.js','pressure-plate.js','differential.js','clock.js'])assert.deepEqual(readFileSync(`${here}/src/${f}`),readFileSync(`${base}/src/${f}`));
});

test('source COM trail is unpopulated; accepted physics now records a separate trajectory',()=>{
 const source=readFileSync('research/scientific-rebuild/braking-and-tire-contact-prototype/src/main.js','utf8');assert.ok(source.includes('new TireObservatory()'));assert.ok(!source.includes('trail.push('));
 const s=createVehicle(),o=new TireObservatory();s.v=4;s.wheels.forEach(w=>w.omega=4/w.radius);for(let i=0;i<100;i++)stepVehicle(s,{},.001,o);assert.ok(o.center.count>1);assert.ok(o.marks.every(r=>r.count===0));
});

test('support-switch diagnostics distinguish applied stage loads from newly switched geometry loads',()=>{
 const s=createVehicle({scenario:'unload'}),o=new TireObservatory();for(let i=0;i<500;i++)stepVehicle(s,{},.001,o);
 const applied=s.wheels[2].normal+s.wheels[3].normal,now=cornerForces(s,s.corners[1]).normal;assert.ok(Math.abs(applied-now)>100);close(o.latest[2].normal,s.wheels[2].normal);
 stepVehicle(s,{},.001,o);assert.equal(o.latest[2].normal,0);assert.equal(o.latest[2].supported,false);assert.equal(o.latest[2].utilization,null);
});
