// Frozen Mission 8 engine, ae87786; import paths only relocated. Research/tests only.
// Engine and transmission own signed shaft dynamics. Tires own road/brake impulses.
// Tick: engine external impulse -> shaft-aware tire contacts -> finite clutch impulse.
import { physicsState as state } from '../../js/state.js';
import { updateEngineSound as soundUpdate, triggerGearChange as soundGearChange } from '../../js/sound.js';
import { TORQUE_PEAK_RPM, TAU } from '../../js/constants.js';
import { clamp, gearRatio, clutchImpulse, frictionImpulse, clutchBrakeImpulse } from '../../js/physics/drivetrain-rotation.js';
import { computeWheelBrakeCapacity } from '../../js/physics/wheel.js';
import { eventBuffer } from '../../js/debug/events.js';

const rpmOf = omega => Math.abs(omega) * 60 / TAU;
function prepare() {
  const e=state.engine, p=state.params;
  // One-time migration/bootstrap for saved state and deterministic old fixtures.
  // After initialization, omega/mode own mechanics; RPM/flags are readout caches.
  e.omega ??= e.rpm * TAU / 60;
  e.mode ??= e.isStalled ? 'stalled' : e.isRunning ? 'running' : 'stopped';
  e.requestedGear ??= e.currentGear;
  e.inputOmega ??= gearRatio(e.currentGear,p)*(state.wheelOmega.rearLeft+state.wheelOmega.rearRight)/2;
  e.clutchHeatJ ??= 0; e.starterWorkJ ??= 0; e.synchronizerHeatJ ??= 0;
  e.shiftState ??= 'engaged';
  e.mechanicalActive=true;
  return e;
}
function publish() {
  const e=state.engine;
  e.rpm=rpmOf(e.omega);
  e.isRunning=e.mode==='running'; e.isStalled=e.mode==='stalled';
}
function checkStall() {
  const e=state.engine, p=state.params;
  if(e.mode==='running' && e.omega < p.stallRpm*(1-p.stallResistance*.8)*TAU/60) e.mode='stalled';
}
export function requestEngineStart() {
  const e=prepare();
  if(e.mode==='running'||e.mode==='starting'||e.command==='start')return false;
  e.command='start';
  return true;
}
export function requestEngineToggle() {
  const e=prepare();
  if(e.mode==='running'||e.mode==='starting')e.command='stop';
  else requestEngineStart();
}
export function handleGearChange(gear) {
  if(!['N','R','1','2','3','4','5','6'].includes(gear))return false;
  const e=prepare();
  e.requestedGear=gear;
  return true;
}

function advanceGear(dt) {
  const e=state.engine,p=state.params;
  if(e.requestedGear===e.currentGear){e.shiftState=e.currentGear==='N'?'neutral':'engaged';return;}
  if(e.currentGear!=='N') {
    // Dog-face friction under load must be overcome by the driver's fork force.
    // No clutch-key gate: a torque-unloaded clutchless shift can disengage.
    const load=Math.min(Math.abs(e.transmittedTorqueNm),p.clutchCapacityNm*e.clutchEngagement);
    const releaseLimit=p.shiftForkForceN*p.dogPitchRadiusM/p.dogFrictionCoeff;
    if(load>releaseLimit){e.shiftState='unloading';return;}
    e.previousGear=e.currentGear;e.currentGear='N';
  }
  if(e.requestedGear==='N'){e.shiftState='neutral';return;}
  e.shiftState='synchronizing';
  const g=gearRatio(e.requestedGear,p), Iw=p.wheelInertia, Ji=p.gearboxInputInertiaKgM2;
  const axle=(state.wheelOmega.rearLeft+state.wheelOmega.rearRight)/2;
  const result=frictionImpulse(e.inputOmega-g*axle,1/Ji+g*g/(2*Iw),p.synchronizerCapacityNm,dt);
  e.inputOmega-=result.impulse/Ji;
  const delta=g*result.impulse/(2*Iw);
  state.wheelOmega.rearLeft+=delta;state.wheelOmega.rearRight+=delta;
  e.synchronizerHeatJ+=result.heat;
  e.synchronizerTorqueNm=result.impulse/dt;
  if(result.locked){
    e.currentGear=e.requestedGear;e.shiftState='engaged';
    soundGearChange(Math.abs(g)<Math.abs(gearRatio(e.previousGear,p)));
    state.debug.transitionState.lastGear=e.currentGear;
    eventBuffer?.pushEvent({level:'info',channel:'drivetrain',type:'gear_change',
      msg:`Engaged ${e.currentGear}`,data:{fromGear:e.previousGear,toGear:e.currentGear,rpm:e.rpm}});
  }
}

export function updateEngine(dt) {
  const e=prepare(), p=state.params, input=state.input;
  e.stepDt=dt;
  if(e.command){e.mode=e.command==='start'?'starting':'stopped'; e.command=null;}
  const target=input.clutchKeyHeld?0:1;
  const travel=dt/Math.max(p.clutchEngageTime,1e-4);
  e.clutchPedalPosition+=clamp(target-e.clutchPedalPosition,-travel,travel);
  e.clutchEngagement=Math.pow(clamp((e.clutchPedalPosition-p.clutchBitePoint)/p.clutchBiteRange,0,1),p.clutchBiteCurve);
  e.synchronizerTorqueNm=0;
  advanceGear(dt);
  e.revMatchTimer=0; // No driver-assistance rev matching.
  checkStall();
  const throttle=input.mouseThrottleActive?input.mouseThrottleAmount:input.throttleKeyHeld?1:0;
  const signedRpm=e.omega*60/TAU;
  const drag=p.peakEngineTorqueNm*.035+Math.abs(e.omega)*.01;
  const governor=clamp(drag+(p.idleRpm-signedRpm)*.05,0,p.peakEngineTorqueNm*.25);
  const curve=Math.max(0,1-2.5*((signedRpm-TORQUE_PEAK_RPM)/(p.redlineRpm-p.idleRpm))**2);
  const combustion=e.mode==='running'&&e.omega>0&&signedRpm<p.redlineRpm
    ? p.peakEngineTorqueNm*curve*throttle+governor : 0;
  const starter=e.mode==='starting'?p.starterTorqueNm:0;
  const old=e.omega, Ie=p.engineInertiaKgM2;
  // Backward Euler viscous drag and bounded Coulomb friction: no reverse kick
  // from drag at rest, no clamp suppressing mechanically backwards rotation.
  const free=(old+(combustion+starter)*dt/Ie)/(1+.01*dt/Ie);
  e.omega=Math.sign(free)*Math.max(0,Math.abs(free)-p.peakEngineTorqueNm*.035*dt/Ie/(1+.01*dt/Ie));
  const midpoint=(old+e.omega)/2;
  e.combustionTorqueNm=combustion; e.starterTorqueNm=starter;
  e.starterWorkJ+=starter*midpoint*dt;
  e.externalWorkJ=(combustion+starter)*midpoint*dt;
  e.dragWorkJ=e.externalWorkJ-.5*Ie*(e.omega**2-old**2);
  e.netEngineImpulse=Ie*(e.omega-old);
  e.transmittedTorqueNm=0;
  if(e.mode==='starting'&&e.omega>=p.starterFiringRpm*TAU/60)e.mode='running';
  publish();
}

export function synchronizeEngineWithWheels(dt = state.engine.stepDt ?? .01) {
  const e=prepare(), p=state.params;
  const g=gearRatio(e.currentGear,p);
  if(g!==0)e.inputOmega=g*(state.wheelOmega.rearLeft+state.wheelOmega.rearRight)/2;
  const Js=p.gearboxInputInertiaKgM2+(g===0?0:2*p.wheelInertia/(g*g));
  const capacity=p.clutchCapacityNm*e.clutchEngagement;
  const bl=computeWheelBrakeCapacity('rearLeft',p.wheelRadius,p,state.input);
  const br=computeWheelBrakeCapacity('rearRight',p.wheelRadius,p,state.input);
  const joint=g!==0&&(bl>0||br>0);
  const result=joint ? clutchBrakeImpulse(e.omega,state.wheelOmega.rearLeft,state.wheelOmega.rearRight,
    p.engineInertiaKgM2,p.gearboxInputInertiaKgM2,p.wheelInertia,g,capacity,bl,br,dt)
    : clutchImpulse(e.omega,e.inputOmega,p.engineInertiaKgM2,Js,capacity,dt);
  if(joint){
    state.wheelOmega.rearLeft=result.left;state.wheelOmega.rearRight=result.right;
    state.wheelBrakeTorque.rearLeft=result.brakeLeft/dt;state.wheelBrakeTorque.rearRight=result.brakeRight/dt;
    result.input=g*(result.left+result.right)/2;
  } else if(g!==0){
    const delta=(result.input-e.inputOmega)/g;
    state.wheelOmega.rearLeft+=delta; state.wheelOmega.rearRight+=delta;
  }
  e.omega=result.crank; e.inputOmega=result.input;
  e.transmittedTorqueNm=result.impulse/dt;
  e.frictionHeatJ=(e.frictionHeatJ||0)+result.heat;
  if(!joint)e.clutchHeatJ+=result.heat; // Joint heat is not separately attributed.
  e.clutchState=capacity===0?'open':result.locked?'locked':'slipping';
  e.drivetrainLocked=g!==0&&result.locked;
  e.clutchSlipRadS=e.omega-e.inputOmega;
  checkStall(); publish();
}

// =============================================================
// SLEEP RULE (Phase 3b)
// =============================================================

// Applies a sleep/settle rule to prevent micro-drifting at very low speeds.
// When the car is nearly stationary and not being controlled, snap the Verlet
// history to zero velocity so the car comes to a complete, imperceptible stop.
// This fixes the "unending drift" problem where the car coasts to 0.049 m/s
// and stays there forever due to low-speed drag cutoffs.
export function applySleepIfNeeded() {
  const noInput = !state.input.throttleKeyHeld &&
                  !state.input.brakeKeyHeld &&
                  !state.input.mouseThrottleActive;

  const v = state.body.speed;
  const w = Math.abs(state.body.angularVelocity);

  const vSleep = 0.02;   // m/s (2 cm/s — imperceptible to player)
  const wSleep = 0.02;   // rad/s

  // When speed and yaw are below sleep thresholds and there's no input,
  // snap all Verlet history to current position, zeroing implicit velocity.
  if (noInput && v < vSleep && w < wSleep) {
    for (const wheel of Object.values(state.wheels)) {
      wheel.prevX = wheel.x;
      wheel.prevY = wheel.y;
    }
    // Also zero body rotational velocity by snapping heading history
    state.body.prevHeading = state.body.heading;
  }
}


// =============================================================
// AUDIO STUB (Phase 8)
// =============================================================

// Wrapper re-exported so main.js doesn't need to import sound.js directly.
// isSlipping and lateralSlipSpeed are passed through for tire squeal.
export function updateEngineSound(rpm, maxRpm, throttlePosition, isSlipping, lateralSlipSpeed) {
  soundUpdate(rpm, maxRpm, throttlePosition, isSlipping, lateralSlipSpeed);
}
