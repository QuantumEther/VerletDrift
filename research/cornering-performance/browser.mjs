// Browser-side scenario driver. Uses the preserved audit reset contract, but
// advances the COMPLETE actual application via its queued RAF callbacks.
export async function installDriver({installSource,base,manual=true}) {
 const state=(await import(`${base}js/state.js`)).default;
 const controller=state.debug.controller;
 const contact=await import(`${base}js/physics/wheel.js`);
 const audit=await(new Function(`return (${installSource})`)())(base);
 const names=['frontLeft','frontRight','rearLeft','rearRight'];
 const selected={body:['centerX','centerY','heading','velocityX','velocityY','speed','angularVelocity','accelX','accelY','longitudinalAccel','lateralAccel'],
   engine:['mode','rpm','omega','inputOmega','currentGear','requestedGear','shiftState','clutchPedalPosition','clutchEngagement','transmittedTorqueNm','clutchHeatJ','clutchState','synchronizerTorqueNm','synchronizerHeatJ'],
   steering:['frontWheelAngle','angularVelocity','angularAcceleration','selfAligningTorque']};
 function sample() {
  const row=[];
  for(const [group,fields]of Object.entries(selected))for(const f of fields)row.push(state[group][f]??null);
  for(const n of names)row.push(state.wheelOmega[n],state.wheelForces[n].fx,state.wheelForces[n].fy,state.wheelLoads[n],state.prevTireForce[n].lon,state.prevTireForce[n].lat);
  row.push(state.debug.metrics.constraintMaxCorr,state.debug.faults.isFrozen);
  return row;
 }
 const columns=Object.entries(selected).flatMap(([g,f])=>f.map(n=>`${g}.${n}`));
 for(const n of names)columns.push(`${n}.omega`,`${n}.fx`,`${n}.fy`,`${n}.load`,`${n}.relaxedLon`,`${n}.relaxedLat`);
 columns.push('constraintCorrection','frozen');
 function command(spec,time) {
  const steering=spec.reversal?(Math.floor(time/.2)%2?-1:1)*spec.steer:spec.steer;
  state.steering.isDragging=true;
  state.steering.wheelAngle=steering/state.params.maxFrontWheelAngle*Math.PI*2.5;
  Object.assign(state.input,{throttleKeyHeld:spec.throttle===1,mouseThrottleActive:spec.throttle>0&&spec.throttle<1,
   mouseThrottleAmount:spec.throttle||0,clutchKeyHeld:!!spec.clutch,brakeKeyHeld:!!spec.brake});
 }
 return window.__cornerDriver={columns,parameters:audit.parameters,
  reset(spec){
   audit.run({...spec,duration:0,events:[]});state.debug.controller=controller;state.debug.faults.isFrozen=false;
   Object.assign(state.camera,{x:1000,y:1000});
   Object.assign(state.loop,{previousTimestamp:0,accumulator:0,droppedSubsteps:0,droppedSubstepsLastFrame:0});
   // A fixed population, seed and placement; all default effects stay enabled.
   state.balloons=Array.from({length:32},(_,i)=>({x:985+i%8*4,y:980+Math.floor(i/8)*4,radius:.6,hue:i*11,
    isPopped:false,deformTime:0,deformScale:1,deformDir:{x:0,y:0}}));
   return sample();
  },
  command,sample,
  probeWheel() {
   const p=window.__corneringProfile,witness=p.witness,options=witness.options,previous=p.current;
   const result={wheel:witness.wheel,options:Object.fromEntries(Object.entries(options).filter(([,v])=>typeof v!=='function')),tests:[]};
   const lon=options.targetForce(options.omega),lat=options.targetLateralForce(options.omega);
   for(const mode of ['original','constant-target-diagnostic']){
    p.current=Object.fromEntries(Object.keys(previous).map(k=>[k,0]));
    const settings=mode==='original'?options:{...options,targetForce:()=>lon,targetLateralForce:()=>lat};
    const rotation=contact.integrateWheelContact(settings),h=1e-5*Math.max(1,Math.abs(rotation.omega));
    result.tests.push({mode,counts:{...p.current},rotation,
     originalTargetSlopeAtEndpoint:(options.targetForce(rotation.omega+h)-options.targetForce(rotation.omega-h))/(2*h)});
   }
   p.current=previous;p.witness=witness;
   return result;
  },
  run(spec,hz=120,duration=2) {
   this.reset(spec);const traces=[],externalFrames=[],heapStart=performance.memory?.usedJSHeapSize;
   const start=performance.now(),step=1000/hz,warmFrames=Math.round(.3*hz),total=warmFrames+Math.round(duration*hz);
   let heapPeak=heapStart||0,heapDrops=0,lastHeap=heapStart||0;
   __frame(1000);
   // Previous scenario render snapshots may predate the fresh reset. Seed again
   // and force one complete tick before any sub-tick rendering can restore them.
   this.reset(spec);state.loop.previousTimestamp=1;command(spec,0);__frame(1010);
   window.__corneringProfile?.reset();
   for(let i=1;i<=total;i++){
    if(i===warmFrames+1){window.__corneringProfile?.reset();}
    command(spec,(i-1)/hz);
    const t=performance.now();__frame(1010+i*step);const cost=performance.now()-t;
    if(i>warmFrames){externalFrames.push(cost);traces.push(sample());}
    const heap=performance.memory?.usedJSHeapSize||0;if(heap<lastHeap)heapDrops++;heapPeak=Math.max(heapPeak,heap);lastHeap=heap;
   }
   return {name:spec.name,hz,duration,traces,externalFrames,ticks:window.__corneringProfile?.ticks||[],frames:window.__corneringProfile?.frames||[],
    wallMs:performance.now()-start,dropped:state.loop.droppedSubsteps,simTime:state.loop.simulationTime,
    heap:{start:heapStart,end:lastHeap,peak:heapPeak,drops:heapDrops},effects:{skids:state.skidMarks.length,balloons:state.balloons.length,
     sparks:state.sparks?.length,smoke:state.params.smokeEnabled},final:sample()};
  },
 };
}
