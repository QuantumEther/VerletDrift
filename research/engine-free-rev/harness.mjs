// Measurement adapter around production engine code, not an alternate integrator.
import state from '../../js/state.js';
import {updateEngine, synchronizeEngineWithWheels, requestEngineStart, requestEngineToggle} from '../../js/physics/engine.js';
const initial=structuredClone(state), rpm=w=>w*30/Math.PI;
export function reset(parameters, {rpm: initialRpm=800, mode='running'}={}) {
  Object.assign(state,structuredClone(initial));
  Object.assign(state.params,parameters);
  Object.assign(state.engine,{omega:initialRpm*Math.PI/30,rpm:Math.abs(initialRpm),mode,
    currentGear:'N',requestedGear:'N',inputOmega:0,clutchPedalPosition:0,clutchEngagement:0,command:null});
  Object.assign(state.input,{clutchKeyHeld:true,brakeKeyHeld:false,handbrakeKeyHeld:false,throttleKeyHeld:false,mouseThrottleActive:true});
  // Throw on any wheel dependency, including accidentally added future coupling.
  state.wheelOmega=new Proxy({}, {get(){throw Error('Isolated engine accessed wheel rotation');},set(){throw Error('Isolated engine wrote wheel rotation');}});
  state.wheels=new Proxy({}, {get(){throw Error('Isolated engine accessed chassis');}});
}
export function step(dt, throttle=0, externalTorque=0, action=null) {
  const e=state.engine,p=state.params,old=e.omega;
  if(action==='start')requestEngineStart();
  if(action==='stop')requestEngineToggle();
  state.input.mouseThrottleAmount=throttle;
  let activeMode=e.command==='start'?'starting':e.command==='stop'?'stopped':e.mode;
  if(activeMode==='running'&&old<p.stallRpm*(1-p.stallResistance*.8)*Math.PI/30)activeMode='stalled';
  const n=rpm(old), drag=p.peakEngineTorqueNm*.035+.01*Math.abs(old);
  const firing=activeMode==='running'&&old>0&&n<p.redlineRpm;
  const governor=firing?Math.max(0,Math.min(p.peakEngineTorqueNm*.25,drag+(p.idleRpm-n)*.05)):0;
  const expectedCombustion=firing?p.peakEngineTorqueNm*Math.max(0,1-2.5*((n-4500)/(p.redlineRpm-p.idleRpm))**2)*throttle+governor:0;
  updateEngine(dt);
  if(Math.abs(e.combustionTorqueNm-expectedCombustion)>1e-9)throw Error("Torque observer no longer matches production");
  const free=e.omega, midpoint=(old+free)/2, combustion=e.combustionTorqueNm-governor;
  // Optional prescribed actuator torque, applied after the production free step.
  // Exact work for this kick uses its own midpoint. This is a test port only.
  e.omega+=externalTorque*dt/p.engineInertiaKgM2;
  const loadWork=externalTorque*dt*(free+e.omega)/2;
  synchronizeEngineWithWheels(dt);
  if(e.transmittedTorqueNm!==0||e.inputOmega!==0||e.clutchState!=='open')throw Error('Engine isolation violated');
  const kinetic=.5*p.engineInertiaKgM2*e.omega**2, deltaK=.5*p.engineInertiaKgM2*(e.omega**2-old**2);
  return {throttle,omega:e.omega,rpm:Math.abs(rpm(e.omega)),combustion,governor,
    coulombTorque:p.peakEngineTorqueNm*.035,viscousTorque:.01*Math.abs(free),pumpingTorque:0,
    dragTorqueEffective:(e.combustionTorqueNm+e.starterTorqueNm)-p.engineInertiaKgM2*(free-old)/dt,
    starter:e.starterTorqueNm,externalTorque,alpha:(e.omega-old)/dt,rpmDerivative:rpm(e.omega-old)/dt,
    mode:e.mode,fuelCut:activeMode==='running'&&n>=p.redlineRpm,
    kinetic,deltaK,combustionWork:combustion*midpoint*dt,governorWork:governor*midpoint*dt,
    starterWork:e.starterTorqueNm*midpoint*dt,loadWork,dragWork:e.dragWorkJ,
    energyResidual:deltaK-e.externalWorkJ-loadWork+e.dragWorkJ,clutchTorque:e.transmittedTorqueNm};
}
export const scenarios=[
 {name:'idle',rpm:1000,duration:12},
 {name:'throttle-step',duration:4,throttle:t=>t>=1?1:0},
 {name:'full-throttle',duration:4,throttle:()=>1},
 {name:'release-redline',rpm:7000,duration:16},
 {name:'release-4000',rpm:4000,duration:12},
 {name:'release-2000',rpm:2000,duration:10},
 {name:'small-blip',duration:8,throttle:t=>t>=1&&t<1.2?.2:0},
 {name:'pulses',duration:10,throttle:t=>[.5,1,1.5,2].some(s=>t>=s&&t<s+.2)?.5:0},
 {name:'idle-recovery',rpm:1200,duration:12},
 {name:'shutdown',rpm:4000,duration:12,action:t=>t===0?'stop':null},
 {name:'restart',rpm:0,mode:'stalled',duration:5,action:t=>t===0?'start':null},
 {name:'loaded-stall',duration:4,load:t=>t>=.5&&t<1?-100:0},
];
export function run(parameters,spec,hz) {
 reset(parameters,spec);const rows=[],dt=1/hz;let work={combustion:0,governor:0,starter:0,load:0,drag:0};
 for(let i=0;i<Math.round(spec.duration*hz);i++){
   const t=i/hz,r=step(dt,spec.throttle?.(t)??0,spec.load?.(t)??0,spec.action?.(t));
   for(const key of Object.keys(work))work[key]+=r[`${key}Work`];
   if(Object.values(r).some(v=>typeof v==='number'&&!Number.isFinite(v)))throw Error("Nonfinite engine measurement");
   rows.push({t:(i+1)/hz,...r});
 }
 return {name:spec.name,hz,initialRpm:spec.rpm??800,rows,work};
}
