import {SimulationClock as PreviousClock} from '../../four-corner-load-transfer/src/clock.js';
// Retain the mature 1 ms step, 32-step limit and 50 ms debt cap. Report
// dropped wall time and actual throughput; never advance fictional sim time.
export class SimulationClock extends PreviousClock {
 // Measured terrain work needs more of a 16.7 ms display frame than the
 // predecessor's 6 ms allowance. This bounds CPU work, not physical time.
 constructor(options={}){super({budgetMs:12,...options});}
 reset(){
  super.reset();Object.assign(this,{fps:0,stepsPerSecond:0,realtimeRatio:0,lastStepMs:0,acceptedPhysicsMs:0,rateWall:0,rateFrames:0,rateSteps:0});
 }
 fail(error,snapshot){
  const first=!this.fault;super.fail(error,snapshot);
  if(first&&error.candidate)this.fault.candidate=structuredClone(error.candidate);
  const message=this.fault.message;
  this.fault.kind=/gear event/.test(message)?'gear-event':/converge|modes unresolved/.test(message)?'nonconvergence':/energy|work|domain/.test(message)?'energy-check':'runtime';
 }
 frame(elapsed,step,snapshot,paused=false){
  super.frame(elapsed,h=>{
   const begin=this.now(),result=step(h);
   this.lastStepMs=this.now()-begin;this.acceptedPhysicsMs+=this.lastStepMs;
   return result;
  },snapshot,paused);
  this.rateWall+=Math.max(0,elapsed);this.rateFrames++;this.rateSteps+=this.frameSteps;
  if(this.rateWall>=.5){
   this.fps=this.rateFrames/this.rateWall;
   this.stepsPerSecond=this.rateSteps/this.rateWall;
   this.realtimeRatio=.001*this.stepsPerSecond;
   this.rateWall=0;this.rateFrames=0;this.rateSteps=0;
  }
 }
}
