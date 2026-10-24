import state from '../../js/state.js';
import {reset,scenarios as original} from '../engine-free-rev/harness.mjs';
import {updateEngine,synchronizeEngineWithWheels,requestEngineStart,requestEngineToggle} from '../../js/physics/engine.js';
export {reset};
export const scenarios=[...original.filter(s=>s.name!=='loaded-stall'),
 ...[.2,.5,1].map(u=>({name:`blip-${u}`,duration:8,throttle:t=>t>=1&&t<1.2?u:0})),
 {name:'off-open-throttle',rpm:4000,mode:'stopped',duration:12,throttle:()=>1},
 {name:'negative-start',rpm:-200,mode:'stopped',duration:5,action:t=>t===0?'start':null},
];
export function run(p,s,hz){
 reset(p,s);let previous=state.engine.omega;const rows=[],dt=1/hz;
 for(let i=0;i<Math.round(s.duration*hz);i++){
  const time=i/hz,u=s.throttle?.(time)??0,a=s.action?.(time);
  if(a==='start')requestEngineStart();if(a==='stop')requestEngineToggle();
  state.input.mouseThrottleAmount=u;
  updateEngine(dt);const e=state.engine;
  const phase=e.omega;
  synchronizeEngineWithWheels(dt);
  if(e.transmittedTorqueNm!==0||e.inputOmega!==0||e.clutchState!=='open')throw Error('Isolation failed');
  const row={t:(i+1)/hz,throttle:u,rpm:e.rpm,omega:e.omega,mode:e.mode,
    combustion:e.indicatedTorqueNm??e.combustionTorqueNm,idle:e.idleTorqueNm??null,
    friction:e.frictionTorqueNm??null,pumping:e.pumpingTorqueNm??null,starter:e.starterTorqueNm,
    alpha:(phase-previous)/dt,kinetic:.5*state.params.engineInertiaKgM2*e.omega**2,
    energyResidual:.5*state.params.engineInertiaKgM2*(e.omega**2-previous**2)-e.externalWorkJ+e.dragWorkJ,
    combustionWork:e.combustionWorkJ??null,idleWork:e.idleWorkJ??null,
    work:e.externalWorkJ,dragWork:e.dragWorkJ,frictionWork:e.frictionWorkJ??null,pumpingWork:e.pumpingWorkJ??null,
    limiter:e.limiterFraction??null,fuelCut:e.fuelCut??null};
  if(Object.values(row).some(v=>typeof v==='number'&&!Number.isFinite(v)))throw Error('Nonfinite observation');
  rows.push(row);previous=e.omega;
 }
 return {name:s.name,hz,rows};
}
