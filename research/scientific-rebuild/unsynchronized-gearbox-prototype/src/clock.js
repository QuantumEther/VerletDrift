export class SimulationClock {
 constructor({now=()=>performance.now(),budgetMs=6,maxSteps=32,maxDebt=.05}={}){Object.assign(this,{now,budgetMs,maxSteps,maxDebt});this.reset();}
 reset(){Object.assign(this,{debt:0,wall:0,simulated:0,dilated:0,pausedWall:0,status:'running',fault:null,accepted:0,rejected:0,frameSteps:0,physicsMs:0,worstStepMs:0,candidates:0,searches:0});}
 fail(error,snapshot){if(!this.fault)this.fault={message:String(error.message||error),snapshot:structuredClone(snapshot),at:this.simulated};this.status='fault-paused';}
 frame(elapsed,step,snapshot,paused=false){
  elapsed=Math.max(0,elapsed);this.wall+=elapsed;this.frameSteps=0;this.physicsMs=0;
  if(this.fault||paused){this.pausedWall+=elapsed;if(!this.fault)this.status='paused';return;}
  const incoming=this.debt+elapsed;this.debt=Math.min(this.maxDebt,incoming);this.dilated+=Math.max(0,incoming-this.maxDebt);
  const begin=this.now();
  while(this.debt>=.001-1e-12&&this.frameSteps<this.maxSteps&&this.now()-begin<this.budgetMs){
   const start=this.now();try{const info=step(.001)||{};this.candidates+=info.lastStepCases||0;this.searches+=info.eventIterations||0;}catch(e){this.rejected++;this.worstStepMs=Math.max(this.worstStepMs,this.now()-start);this.fail(e,snapshot());break;}
   this.worstStepMs=Math.max(this.worstStepMs,this.now()-start);this.debt=Math.max(0,this.debt-.001);this.simulated+=.001;this.frameSteps++;this.accepted++;
  }
  this.physicsMs=this.now()-begin;this.status=this.fault?'fault-paused':this.debt>.002||incoming>this.maxDebt?'overloaded':'running';
 }
}
