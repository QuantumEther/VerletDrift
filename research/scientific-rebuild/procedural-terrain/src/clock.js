import {SimulationClock as PreviousClock} from '../../four-corner-load-transfer/src/clock.js';
// Retain the mature 1 ms step, 32-step limit and 50 ms debt cap. Report
// dropped wall time and actual throughput; never advance fictional sim time.
export class SimulationClock extends PreviousClock {
 // Measured terrain work needs more of a 16.7 ms display frame than the
 // predecessor's 6 ms allowance. This bounds CPU work, not physical time.
 constructor(options={}){super({budgetMs:12,...options});}
 setFrequency(hz){
  if(![1000,500,250,200,100].includes(hz))throw new RangeError("Unsupported physics frequency");
  this.frequency=hz;this.timestep=1/hz;
  this.dilated+=this.debt;this.debt=0;this.rateWall=0;this.rateFrames=0;this.rateSteps=0;
  this.fps=0;this.stepsPerSecond=0;this.realtimeRatio=0;
 }
 reset(){
  this.frequency??=1000;this.timestep=1/this.frequency;
  super.reset();Object.assign(this,{fps:0,stepsPerSecond:0,realtimeRatio:0,lastStepMs:0,acceptedPhysicsMs:0,rateWall:0,rateFrames:0,rateSteps:0});
 }
 fail(error,snapshot){
  const first=!this.fault;super.fail(error,snapshot);
  if(first&&error.candidate)this.fault.candidate=structuredClone(error.candidate);
  const message=this.fault.message;
  this.fault.kind=/gear event/.test(message)?'gear-event':/converge|modes unresolved/.test(message)?'nonconvergence':/energy|work|domain/.test(message)?'energy-check':'runtime';
 }
 frame(elapsed,step,snapshot,paused=false){
  elapsed=Math.max(0,elapsed);this.wall+=elapsed;this.frameSteps=0;this.physicsMs=0;
  if(this.fault||paused){this.pausedWall+=elapsed;if(!this.fault)this.status='paused';}
  else {
   const incoming=this.debt+elapsed;this.debt=Math.min(this.maxDebt,incoming);this.dilated+=Math.max(0,incoming-this.maxDebt);
   const begin=this.now(),h=this.timestep;
   while(this.debt>=h-1e-12&&this.frameSteps<this.maxSteps&&this.now()-begin<this.budgetMs){
    const start=this.now();try{const info=step(h)||{};this.candidates+=info.lastStepCases||0;this.searches+=info.eventIterations||0;}
    catch(e){this.lastStepMs=this.now()-start;this.worstStepMs=Math.max(this.worstStepMs,this.lastStepMs);this.rejected++;this.fail(e,snapshot());break;}
    this.lastStepMs=this.now()-start;this.acceptedPhysicsMs+=this.lastStepMs;this.worstStepMs=Math.max(this.worstStepMs,this.lastStepMs);
    this.debt=Math.max(0,this.debt-h);this.simulated+=h;this.frameSteps++;this.accepted++;
   }
   this.physicsMs=this.now()-begin;this.status=this.fault?'fault-paused':this.debt>2*h||incoming>this.maxDebt?'overloaded':'running';
  }
  this.rateWall+=Math.max(0,elapsed);this.rateFrames++;this.rateSteps+=this.frameSteps;
  if(this.rateWall>=.5){
   this.fps=this.rateFrames/this.rateWall;
   this.stepsPerSecond=this.rateSteps/this.rateWall;
   this.realtimeRatio=this.timestep*this.stepsPerSecond;
   this.rateWall=0;this.rateFrames=0;this.rateSteps=0;
  }
 }
}
