import * as T from './vendor/three-r180/three.module.js';
import {createMotionHistory} from './motion-history.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exposureScale,motionDefaults} from './motion-blur.js';

test('Constant velocity gives the same shutter displacement at 60, 120 and 240 Hz',()=>{
 for(const hz of [60,120,240]){
  const elapsed=1000/hz;
  assert.ok(Math.abs(exposureScale(elapsed,motionDefaults.shutter)*elapsed-motionDefaults.shutter)<1e-12);
 }
 for(const elapsed of [0,.1,75,400,NaN])assert.equal(exposureScale(elapsed,7),0);
});

test('A short interval and extreme shutter cannot generate an unbounded exposure',()=>{
 assert.equal(exposureScale(1,25),12);
 assert.equal(exposureScale(5,5),1);
});

test('Shared history compensates for a floating origin and resets after a cut',()=>{
 const camera=new T.PerspectiveCamera(),body=new T.Group(),ground=new T.Mesh();
 const history=createMotionHistory(T,body,[],new Set([ground]));
 const pose=x=>({planar:{x,y:0,u:10,v:0},wheels:[]});
 history.begin(camera,pose(0),640,360,motionDefaults,100);
 history.previousModel(ground);
 ground.position.x=3;ground.updateMatrixWorld();
 history.begin(camera,pose(1),640,360,motionDefaults,110);
 assert.equal(history.originShift.x,1);
 assert.equal(history.previousModel(ground).elements[12],4);
 history.reset();
 assert.equal(history.begin(camera,pose(1),640,360,motionDefaults,120).exposure,0);
 assert.equal(history.previousModel(ground).elements[12],3);
});

test('Wheel blur bypass removes spin while leaving previous carrier travel',()=>{
 const camera=new T.PerspectiveCamera(),hub=new T.Group(),wheel=new T.Mesh();
 hub.add(wheel);
 const history=createMotionHistory(T,new T.Group(),[hub],new Set());
 const pose=angle=>({planar:{x:0,y:0,u:0,v:0},wheels:[{angle,omega:100,lateral:[0,1,0]}]});
 const settings={...motionDefaults,wheels:false};
 history.begin(camera,pose(0),640,360,settings,100);
 history.previousModel(wheel);
 hub.position.x=1;wheel.rotation.y=1;hub.updateMatrixWorld();
 history.begin(camera,pose(1),640,360,settings,110);
 const previous=history.previousModel(wheel);
 assert.equal(previous.elements[12],0);
 const vertex=new T.Vector3(1,0,0).applyMatrix4(previous);
 assert.ok(Math.abs(vertex.z+Math.sin(1))<1e-12);
});

test('Stationary bypass retains the prior pose and uses the latest display interval',()=>{
 const camera=new T.PerspectiveCamera(),body=new T.Group();
 body.updateMatrixWorld();
 const history=createMotionHistory(T,body,[],new Set());
 const p={planar:{x:0,y:0,u:0,v:0},wheels:[]};
 history.begin(camera,p,640,360,motionDefaults,100);
 history.previousModel(body);
 history.hold(2020);
 body.position.x=1;body.updateMatrixWorld();
 const frame=history.begin(camera,p,640,360,motionDefaults,2030);
 assert.equal(frame.exposure,7/10*motionDefaults.intensity);
 assert.equal(history.previousModel(body).elements[12],0);
});
