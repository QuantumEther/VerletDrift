// Installed only by the external audit runner. Production source is read and
// executed, with wrappers at existing module boundaries for observation only.
export async function install(base) {
  const state = (await import(`${base}js/state.js`)).default;
  const physics = await import(`${base}js/physics/index.js`);
  const constants = await import(`${base}js/constants.js`);
  const main = await (await fetch(`${base}js/main.js`)).text();
  const marker = 'function runPhysicsStep(dt) {';
  const begin = main.indexOf(marker) + marker.length, end = main.indexOf('  // 16. Camera:', begin);
  if (begin < marker.length || end < begin) throw Error('Production step boundaries changed');
  const initial = structuredClone(state);
  const names = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'];
  const modes = ['stopped', 'starting', 'running', 'stalled'];
  let tire, drag, freeCrank, preRear, enginePhaseMode, yawBefore;
  let tireImplementation=physics.computeTireForces;
  const mode = () => state.engine.mode || (!state.engine.isRunning ? 'stopped' : state.engine.isStalled ? 'stalled' : 'running');
  const signedCrank = () => state.engine.omega ?? state.engine.rpm * Math.PI / 30;
  const env = { ...physics, state, ...constants,
    updateEngine(dt) { yawBefore=state.body.angularVelocity; physics.updateEngine(dt); freeCrank = signedCrank(); enginePhaseMode = mode(); },
    computeTireForces(dt) { tire = tireImplementation(dt); preRear = [state.wheelOmega.rearLeft, state.wheelOmega.rearRight]; return tire; },
    computeDragForces() { drag = physics.computeDragForces(); return drag; },
    updateInputDiagnostics() {},
  };
  const step = new Function(...Object.keys(env), 'dt', main.slice(begin, end)).bind(null, ...Object.values(env));
  const ratio = gear => gear === 'N' ? 0 : (gear === 'R' ? -state.params.gearRatio1 : state.params[`gearRatio${gear}`]) * state.params.finalDriveRatio;
  function reset(spec, dt) {
    Object.assign(state, structuredClone(initial));
    Object.assign(state.params, { mapWidth: 20000, mapHeight: 20000, simulationFps: 1 / dt, timeScale: 1 });
    physics.initializeCarBody(1000, 1000);
    const speed = spec.speed || 0, beta = spec.beta || 0, yaw = spec.yaw || 0;
    const vx = speed * Math.sin(beta), vy = -speed * Math.cos(beta);
    const c = Math.cos(yaw * dt), s = Math.sin(yaw * dt);
    for (const [name, w] of Object.entries(state.wheels)) {
      const x = w.x - 1000, y = w.y - 1000;
      w.prevX = 1000 - vx * dt + c * x + s * y;
      w.prevY = 1000 - vy * dt - s * x + c * y;
      state.wheelOmega[name] = (-vy - yaw * x) / state.params.wheelRadius;
      if (name.startsWith('rear')) state.wheelOmega[name] *= spec.spin || 1;
    }
    physics.computeBodyDerivedState(dt);
    Object.assign(state.body, { accelX: 0, accelY: 0, prevAccelX: 0, prevAccelY: 0,
      longitudinalAccel: 0, lateralAccel: 0, jerkX: 0, jerkY: 0, jerkMagnitude: 0 });
    const e = state.engine, gear = spec.gear || 'N';
    e.currentGear = gear;
    if ('requestedGear' in e) e.requestedGear = gear;
    const inputOmega = ratio(gear) * (state.wheelOmega.rearLeft + state.wheelOmega.rearRight) / 2;
    e.rpm = spec.rpm ?? (gear === 'N' ? state.params.idleRpm : Math.abs(inputOmega) * 30 / Math.PI);
    e.isRunning = spec.mode !== 'stopped'; e.isStalled = spec.mode === 'stalled';
    if ('mode' in e) e.mode = spec.mode || 'running';
    if ('omega' in e) e.omega = e.rpm * Math.PI / 30;
    if ('inputOmega' in e) e.inputOmega = inputOmega;
    e.clutchPedalPosition = spec.pedal ?? 0; e.clutchEngagement = spec.pedal ?? 0;
    state.loop.simulationTime = 0;
    return { speed, beta, yaw, gear, rpm: e.rpm, mode: mode(), pedal: e.clutchPedalPosition };
  }
  const columns = ['t','throttle','clutchKey','brake','handbrake','steerCommand','gear','requestedGear','mode',
    'rpm','crank','inputOmega','freeCrank','enginePhaseMode','combustionTorque','clutchTorque','starterTorque',
    'clutchPedal','clutchEngagement','clutchCapacity','clutchSlip','preRearLeft','preRearRight',
    ...names.map(n=>`omega_${n}`),...names.map(n=>`kappa_${n}`),...names.map(n=>`alpha_${n}`),
    ...names.map(n=>`fx_${n}`),...names.map(n=>`fy_${n}`),...names.map(n=>`load_${n}`),
    ...names.map(n=>`brakeTorque_${n}`),...names.map(n=>`roadTorque_${n}`),
    'vx','vy','longV','latV','heading','yaw','beta','longAccel','latAccel','yawDampingTorque','tireTorque',
    'constraintCorrection','dragForce','dt','tickMs','clutchHeat','frictionHeat','synchronizerTorque',
    'steerAngle','steerVelocity','sat','x','y','steerDragging','yawBefore',...names.map(n=>`finalRotorKappa_${n}`)];
  function sample(time, driver, dt, cost) {
    const b = state.body, e = state.engine;
    const long = b.velocityX * Math.sin(b.heading) - b.velocityY * Math.cos(b.heading);
    const lat = b.velocityX * Math.cos(b.heading) + b.velocityY * Math.sin(b.heading);
    const inertia = state.params.carMassKg * (constants.CAR_HALF_LENGTH ** 2 + constants.CAR_HALF_WIDTH ** 2) / 3;
    return [time,driver.throttle,Number(driver.clutch),Number(driver.brake),Number(driver.handbrake),driver.steer,
      e.currentGear,e.requestedGear ?? e.currentGear,mode(),e.rpm,signedCrank(),e.inputOmega ?? ratio(e.currentGear)*(state.wheelOmega.rearLeft+state.wheelOmega.rearRight)/2,
      freeCrank,enginePhaseMode,e.combustionTorqueNm ?? null,e.transmittedTorqueNm,e.starterTorqueNm ?? null,
      e.clutchPedalPosition,e.clutchEngagement,(state.params.clutchCapacityNm ?? state.params.peakEngineTorqueNm)*e.clutchEngagement,
      signedCrank()-(e.inputOmega ?? ratio(e.currentGear)*(state.wheelOmega.rearLeft+state.wheelOmega.rearRight)/2),
      ...preRear,...names.map(n=>state.wheelOmega[n]),...names.map(n=>state.wheelSlipRatio[n]),...names.map(n=>state.wheelSlipAngle[n]),
      ...names.map(n=>state.wheelForces[n].fx),...names.map(n=>state.wheelForces[n].fy),...names.map(n=>state.wheelLoads[n]),
      ...names.map(n=>state.wheelBrakeTorque[n]),...names.map(n=>{
        const k=state.wheelKinematics[n],f=state.wheelForces[n];return -state.params.wheelRadius*(f.fx*k.wheelForwardX+f.fy*k.wheelForwardY);
      }),b.velocityX,b.velocityY,long,lat,b.heading,b.angularVelocity,Math.atan2(lat,long),b.longitudinalAccel,b.lateralAccel,
      -state.params.yawDamping*inertia*yawBefore,tire.torque,state.debug.metrics.constraintMaxCorr,
      Math.hypot(drag.forceX,drag.forceY),dt,cost,e.clutchHeatJ ?? null,e.frictionHeatJ ?? null,e.synchronizerTorqueNm ?? null,
      state.steering.frontWheelAngle,state.steering.angularVelocity,state.steering.selfAligningTorque,b.centerX,b.centerY,Number(state.steering.isDragging),yawBefore,
      ...names.map(n=>{const k=state.wheelKinematics[n],v=k.wheelVelX*k.wheelForwardX+k.wheelVelY*k.wheelForwardY,u=state.wheelOmega[n]*state.params.wheelRadius;
        return Math.max(-1,Math.min(1,(u-v)/Math.max(Math.abs(u),Math.abs(v),.5)));})];
  }
  return {
    columns, parameters: structuredClone(initial.params), constants: { mass: initial.params.carMassKg,
      wheelbase: constants.CAR_HALF_LENGTH*2, track: constants.CAR_HALF_WIDTH*2,
      inertia: initial.params.carMassKg*(constants.CAR_HALF_LENGTH**2+constants.CAR_HALF_WIDTH**2)/3 },
    run(spec, hz=100) {
      const dt=1/hz, initialCondition=reset(spec,dt), rows=[], anomalies=[], transitions=[];
      const driver={throttle:0,clutch:false,brake:false,handbrake:false,steer:0};
      let eventIndex=0, previousMode=mode(), previousGear=state.engine.currentGear;
      for(let tick=0;tick<Math.round(spec.duration*hz);tick++){
        const time=tick*dt;
        while(eventIndex<spec.events.length&&spec.events[eventIndex].time<=time+1e-10){
          const event=spec.events[eventIndex++];
          for(const key of Object.keys(driver))if(Object.hasOwn(event,key))driver[key]=event[key];
          if(event.gear)physics.handleGearChange(event.gear);
          if(event.toggle)document.getElementById('engineToggle').click();
        }
        Object.assign(state.input,{throttleKeyHeld:driver.throttle===1,mouseThrottleActive:driver.throttle>0&&driver.throttle<1,
          mouseThrottleAmount:driver.throttle,clutchKeyHeld:driver.clutch,brakeKeyHeld:driver.brake,handbrakeKeyHeld:driver.handbrake});
        state.steering.isDragging=driver.steer!==null;
        if(driver.steer!==null)state.steering.wheelAngle=driver.steer/state.params.maxFrontWheelAngle*Math.PI*2.5;
        state.loop.simulationTime=(tick+1)*dt;
        try{
          const begin=performance.now();step(dt);const cost=performance.now()-begin;
          const row=sample((tick+1)*dt,driver,dt,cost);
          if(row.length!==columns.length)throw Error('Telemetry schema mismatch');
          rows.push(row);
          if(mode()!==previousMode||state.engine.currentGear!==previousGear){
            transitions.push({time:(tick+1)*dt,mode:mode(),gear:state.engine.currentGear,previousMode,previousGear});
            previousMode=mode();previousGear=state.engine.currentGear;
          }
          if(row.some(v=>typeof v==='number'&&!Number.isFinite(v)))throw Error('Nonfinite telemetry');
        }catch(error){anomalies.push({time:(tick+1)*dt,error:error.message});break;}
      }
      state.debug.faults.isFrozen=true;
      return {name:spec.name,hz,definition:spec,initialCondition,rows,transitions,anomalies};
    },
    probes(){
      const results={};
      for(const damping of [initial.params.yawDamping,0]){
        reset({yaw:1,mode:'stopped'},.01);
        Object.assign(state.params,{yawDamping:damping,tireFrictionCoeff:0,rollingResistanceCoeff:0,aeroDragCoeff:0});
        for(let i=0;i<100;i++)step(.01);
        results[`freeYaw_${damping}`]={yaw:state.body.angularVelocity,heading:state.body.heading};
      }
      reset({speed:.019,yaw:.019,mode:'stopped'},.01);
      const before=structuredClone(state.body);
      physics.applySleepIfNeeded();
      const motion=awaitlessMotion();
      results.sleep={before:{speed:before.speed,yaw:before.angularVelocity},after:motion};
      return results;
    },
    async orderProbe(spec){
      const source=await(await fetch(`${base}js/physics/tires.js`)).text();
      function extract(name){
        const start=source.indexOf(`function ${name}(`),begin=source.indexOf('{',start);let depth=1;
        if(start<0)throw Error(`Missing helper ${name}`);
        for(let i=begin+1;i<source.length;i++){
          if(source[i]==='{')depth++;
          if(source[i]==='}'&&--depth===0)return source.slice(start,i+1);
        }
        throw Error('Tire helper source boundary changed');
      }
      const wheel=await import(`${base}js/physics/wheel.js`),rotation=await import(`${base}js/physics/drivetrain-rotation.js`);
      const load=await import(`${base}js/physics/tire-load.js`),logging=await import(`${base}js/debug/logger.js`),events=await import(`${base}js/debug/events.js`);
      const dependencies={state,...constants,...wheel,signedGearRatio:rotation.gearRatio,rearMobility:rotation.rearMobility,
        tireGripLimit:load.tireGripLimit,logger:logging.logger,eventBuffer:events.eventBuffer};
      const list="['frontLeft', 'frontRight', 'rearLeft', 'rearRight']";
      const original=physics.computeTireForces.toString();if(!original.includes(list))throw Error('Wheel-order source boundary changed');
      const reversed=original.replace(list,"['frontLeft', 'frontRight', 'rearRight', 'rearLeft']");
      const helpers=['clamp','clamp01','dot','pacejkaForce'].map(extract).join('\n');
      const alternate=new Function(...Object.keys(dependencies),`${helpers}\nreturn (${reversed});`)(...Object.values(dependencies));
      const normal=this.run(spec);
      try{tireImplementation=alternate;return {normal,reversed:this.run(spec)};}
      finally{tireImplementation=physics.computeTireForces;}
    },
  };
  function awaitlessMotion(){
    let dx=0,dy=0;for(const w of Object.values(state.wheels)){dx+=(w.x-w.prevX)/4;dy+=(w.y-w.prevY)/4;}
    return {speed:Math.hypot(dx,dy)/state.body.historyDt,allHistoryZero:Object.values(state.wheels).every(w=>w.x===w.prevX&&w.y===w.prevY)};
  }
}
