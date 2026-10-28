import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createVehicle} from '../src/vehicle.js';
import {movingSecond} from '../src/initial-state.js';
import {shaftState,GEOMETRY} from '../src/gearbox.js';
import {mechanicalPresentation,AXIS_DISTANCE,PRIMARY,SELECTOR_SCALE,DOG_FACE,SLEEVE_HALF} from '../src/mechanical-layout.js';
import {instrumentValues,gaugeAngle} from '../src/instruments.js';
import {gearGeometry} from '../src/mechanical-geometry.js';
const close=(a,b,tolerance=1e-11)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);

test('dial angles and displayed values use physical angular speed and translational speed',()=>{
 const s=createVehicle();s.flywheel.omega=200*Math.PI;s.gearbox.neutralOmega=-40*Math.PI;s.planar.u=3;s.planar.v=4;
 const v=instrumentValues(s);close(v.engine,6000);close(v.input,-1200);close(v.speed,18);assert.equal(v.gear,'N');
 for(const [rpm,angle]of [[0,-135],[1500,-67.5],[3000,0],[4500,67.5],[6000,135]])close(gaugeAngle(rpm,6000),angle);
 // Only the needle is bounded; the signed numerical value above is never clipped.
 assert.equal(gaugeAngle(-1200,3000),-135);assert.equal(gaugeAngle(9000,6000),135);
});

test('equal module, centre distances and rolling velocities agree for both constant mesh ratios',()=>{
 const s=createVehicle();s.gearbox.neutralAngle=1.231;s.gearbox.neutralOmega=37;
 const a=mechanicalPresentation(s);s.gearbox.neutralAngle+=.007;const b=mechanicalPresentation(s);
 for(let i=0;i<2;i++){
  const p=a.pairs[i],q=b.pairs[i];close(p.driverRadius+p.drivenRadius,AXIS_DISTANCE);
  close(p.drivenTeeth/p.driverTeeth,p.ratio);close(p.drivenRadius/p.driverRadius,p.ratio);
  close((q.driverAngle-p.driverAngle)*p.driverRadius+(q.drivenAngle-p.drivenAngle)*p.drivenRadius,0);
  close((p.driverTeeth*p.driverAngle+p.drivenTeeth*p.drivenAngle)%(2*Math.PI),Math.PI);
  close(p.freeSpeed,37/p.ratio);
  const geometry=gearGeometry(p.drivenTeeth);geometry.computeBoundingBox();
  assert.ok([...geometry.attributes.position.array].every(Number.isFinite));
  close(geometry.boundingBox.max.x-geometry.boundingBox.min.x,.055,1e-7);geometry.dispose();
 }
 close(2*PRIMARY.radius,AXIS_DISTANCE);
});

test('clutch separation, selector travel and dog engagement have distinct physical sources',()=>{
 const s=createVehicle();s.flywheel.engagement=.25;s.gearbox.q=GEOMETRY.mouth;
 let v=mechanicalPresentation(s);close(v.clutchGap,.075);close(v.selectorX,GEOMETRY.mouth*SELECTOR_SCALE);
 close(v.selectorX+SLEEVE_HALF,DOG_FACE);assert.ok(v.pairs.every(p=>!p.engaged));
 s.flywheel.engagement=1;s.flywheel.state='locked';v=mechanicalPresentation(s);assert.equal(v.clutchGap,0);
 const moving=movingSecond();v=mechanicalPresentation(moving);assert.deepEqual(v.pairs.map(p=>p.engaged),[false,true]);close(v.inputAngle,shaftState(moving).angle);
 // q reaching a position alone is never a display claim that a gear is engaged.
 s.gearbox.q=.025;assert.ok(mechanicalPresentation(s).pairs.every(p=>!p.engaged));
});

test('individual rear outputs, free gears and exploded presentation preserve source state',()=>{
 const s=createVehicle({mode:'open'});s.wheels[2].angle=1;s.wheels[3].angle=3;s.wheels[2].omega=5;s.wheels[3].omega=9;s.gearbox.neutralAngle=7;
 const before=structuredClone(s),normal=mechanicalPresentation(s),exploded=mechanicalPresentation(s,true);
 assert.deepEqual(normal.rearAngles,[1,3]);assert.deepEqual(normal.rearSpeeds,[5,9]);close(normal.outputAngle,2);
 close(normal.pairs[0].freeAngle,2);close(normal.pairs[1].freeAngle,3.5);
 const {offsets:a,...plain}=normal,{offsets:b,...expanded}=exploded;assert.deepEqual(plain,expanded);assert.notDeepEqual(a,b);assert.deepEqual(structuredClone(s),before);
});

test('copied drivetrain, clock and mechanical mapping modules remain source-identical',()=>{
 const old='research/scientific-rebuild/unsynchronized-gearbox-prototype/src/',current='research/scientific-rebuild/braking-and-tire-contact-prototype/src/';
 for(const name of ['differential.js','gearbox.js','clutch.js','clock.js','audio.js','selector-input.js','initial-state.js','visual-state.js','mechanical-layout.js'])assert.deepEqual(readFileSync(current+name),execFileSync('git',['show','012423a:'+old+name],{maxBuffer:8*1024*1024}));
});
