// External profiling only: transformations are served in memory, never written
// into production modules. Every replacement fails closed on source drift.
export function instrument(path, source) {
  const one = (from, to) => {
    if (!source.includes(from)) throw Error(`Missing profiling boundary in ${path}: ${from}`);
    source = source.replace(from, to);
  };
  const prefix = 'const __cp = globalThis.__corneringProfile;\n';
  if (path === 'js/main.js') {
    one('function runPhysicsStep(dt) {', 'function runPhysicsStep(dt) {\n const __tickStart=performance.now(); __cp.beginTick();\n try {');
    const marker = source.indexOf('// HELPER: Canvas Resolution Scale');
    const end = source.lastIndexOf('}', marker);
    source = source.slice(0, end) + '\n } finally { __cp.endTick(performance.now()-__tickStart); }\n' + source.slice(end);
    for (const [name, stage] of Object.entries({ updateSteering:'steering', updateEngine:'engine',
      synchronizeEngineWithWheels:'synchronization', updateSuspension:'suspension',
      computeTireForces:'tires', computeDragForces:'drag', verletIntegrateAllPoints:'bodyIntegration',
      solveRigidBodyConstraints:'constraints', handleBoundaryCollisions:'boundary', computeBodyDerivedState:'derived' })) {
      // Replace call sites only, never imports or declarations.
      const begin = source.indexOf('function runPhysicsStep(dt) {'), end = source.indexOf('// HELPER: Canvas Resolution Scale');
      const middle = source.slice(begin,end).replace(new RegExp(`\\b${name}\\(([^;]*?)\\)`, 'g'),
        (_, args) => `__cp.measure('${stage}',()=>${name}(${args}))`);
      source = source.slice(0,begin)+middle+source.slice(end);
    }
    one('function mainLoop(timestampMilliseconds) {', 'function mainLoop(timestampMilliseconds) {\n const __frameStart=performance.now(); const __beforeTicks=__cp.ticks.length; __cp.frameStages={}; __cp.artMisses=0; __cp.artHits=0;');
    one('  renderFrame(alpha, snapPrev, snapCurr, wallFrameTime);',
      '  const __renderStart=performance.now();\n  renderFrame(alpha, snapPrev, snapCurr, wallFrameTime);\n  __cp.renderMs=performance.now()-__renderStart;');
    const loopEnd = source.lastIndexOf('}', source.indexOf('// ONE PHYSICS SUB-STEP'));
    source = source.slice(0,loopEnd) + '\n __cp.endFrame(performance.now()-__frameStart,__beforeTicks,timestampMilliseconds);\n' + source.slice(loopEnd);
    const rb=source.indexOf('function renderFrame(alpha,'), re=source.indexOf('// Update the live DOM/SVG instruments');
    let render=source.slice(rb,re);
    for(const [stage,names]of Object.entries({world:['drawCheckerboard','drawMapBoundary','drawSplatDecals','drawSkidMarks','drawSplatParticles','drawBalloons','drawTrailArrows','drawFallbackSmoke','drawSparks','drawKinematicArrows','drawCarGhosts','drawCar','renderFrameGPU'],
      hud:['drawSteeringWheelHud','drawThrottleBar','drawBrakeBar','drawHandbrakeBar','drawClutchBar','drawGearIndicator','drawScoreHud'],
      instruments:['drawGauges'],debug:['drawDebugPanels','checkFaults'],info:['updateInfoBar']})){
      for(const name of names)render=render.replace(new RegExp(`\\b${name}\\(([^;]*?)\\)`,'g'),(_,args)=>`__cp.measureRender('${({drawCheckerboard:'background',drawCar:'vehicle',drawCarGhosts:'ghosts'})[name]||stage}',()=>${name}(${args}))`);
    }
    source=source.slice(0,rb)+render+source.slice(re);
    return prefix+source;
  }
  if (path === 'js/renderer/vehicle-sprites.js') {
    one('function bodyArtwork(pose){','function __bodyArtwork(pose){');
    one(' if(key===relitKey)return relitSource;', ' if(key===relitKey){__cp.artHits++;return relitSource;} __cp.artMisses++;');
    return prefix+source+`\nfunction bodyArtwork(pose){return __cp.measureRender('bodyArtwork',()=>__bodyArtwork(pose));}\n`;
  }
  if (path === 'js/physics/wheel.js') {
    one('  if (dt === 0) return { omega, brakeTorque: 0 };', '  const __cw=__cp.current; __cw.solves++;\n  if (dt === 0) return { omega, brakeTorque: 0 };');
    one('    const middle = (low + high) * 0.5;', '    __cw.bisections++;\n    const middle = (low + high) * 0.5;');
    one('export function integrateWheelContact({', 'function __integrateWheelContact({');
    one('  function advance(speed, force, lateralForce, h) {', '  const __cw=__cp.current;\n  function advance(speed, force, lateralForce, h) {\n    __cw.advances++;');
    one('const forceAtOmega = (nextSpeed) => force + (targetForce(nextSpeed) - force) * alpha;',
      'const forceAtOmega = (nextSpeed) => { __cw.longCallbacks++; return force + (targetForce(nextSpeed) - force) * alpha; };');
    one('    const nextLateralForce = lateralForce', '    __cw.latCallbacks++;\n    const nextLateralForce = lateralForce');
    one('  function interval(speed, force, lateralForce, h, depth) {',
      '  function interval(speed, force, lateralForce, h, depth) {\n    __cw.nodes++; __cw.depth=Math.max(__cw.depth,depth);');
    one("      if (depth === 12) throw new Error('Wheel/contact integration did not converge');",
      "      if (depth === 12) { __cw.failures++; throw new Error('Wheel/contact integration did not converge'); }\n      __cw.subdivisions++;");
    return prefix+source+`\nexport function integrateWheelContact(options) {
      const t=performance.now(); __cp.current.calls++;
      try { return __integrateWheelContact(options); }
      finally { __cp.current.ms+=performance.now()-t;
       if(__cp.current.nodes>(__cp.witness?.nodes||0))__cp.witness={options,nodes:__cp.current.nodes,wheel:__cp.wheelName}; }
    }\n`;
  }
  if (path === 'js/physics/tires.js') {
    one('    const rotation = integrateWheelContact({', '    __cp.current=__cp.tick.wheels[name]; __cp.wheelName=name;\n    const rotation = integrateWheelContact({');
    one('    function contactTarget(omega) {', '    function contactTarget(omega) {\n      __cp.current.targets++;');
    return prefix+source;
  }
  return source;
}

// Runs before application boot. No patching of math or physical parameters.
export function installProfiler() {
  const wheels = ['frontLeft','frontRight','rearLeft','rearRight'];
  const p = window.__corneringProfile = {
    ticks: [], frames: [], current: null, tick: null, renderMs: 0,
    reset() { this.ticks=[];this.frames=[];this.witness=null; },
    beginTick() {
      this.tick={stages:{},wheels:{}};
      for(const name of wheels)this.tick.wheels[name]={calls:0,nodes:0,subdivisions:0,depth:0,advances:0,
        solves:0,bisections:0,longCallbacks:0,latCallbacks:0,targets:0,failures:0,ms:0};
    },
    measure(stage, fn) { const t=performance.now();try{return fn();}finally{
      this.tick.stages[stage]=(this.tick.stages[stage]||0)+performance.now()-t;
    } },
    measureRender(stage,fn) {const t=performance.now();try{return fn();}finally{this.frameStages[stage]=(this.frameStages[stage]||0)+performance.now()-t;}},
    endTick(ms) { this.tick.ms=ms;if(this.ticks.length>=20000)throw Error('Profiler tick bound exceeded');this.ticks.push(this.tick); },
    endFrame(ms,before,timestamp) {if(this.frames.length>=20000)throw Error('Profiler frame bound exceeded');
      this.frames.push({ms,timestamp,artMisses:this.artMisses||0,artHits:this.artHits||0,renderMs:this.renderMs,renderStages:this.frameStages,ticks:this.ticks.length-before,dropped:state.loop.droppedSubstepsLastFrame}); },
  };
}
