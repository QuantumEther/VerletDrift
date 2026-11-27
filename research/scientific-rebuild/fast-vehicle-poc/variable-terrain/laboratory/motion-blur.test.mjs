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
