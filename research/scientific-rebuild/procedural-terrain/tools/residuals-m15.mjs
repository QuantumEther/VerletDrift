import {fixture} from './tire-ab-fixtures.mjs';
import {stepTerrainVehicle} from '../src/vehicle.js';
import {NUMERICAL_EXPERIMENTS} from '../src/numerical-settings.js';
const runs=[];
for(const id of ['reference','speed-normalized-anisotropic'])for(const scenario of ['acceleration','combined','recovery','drift-recovery','recontact'])for(const h of [.001,.002,.004]){
 const {v,inputs}=fixture(id,.5,scenario,1);v.numerics=NUMERICAL_EXPERIMENTS.balanced;
 let maxPre=0,maxPost=0,maxPosition=0,maxVelocity=0,fault=null;
 for(let i=0;i<Math.round(.2/h);i++){
  try{stepTerrainVehicle(v,inputs(i*h),h);}catch(e){fault={message:e.message,time:v.state.time};break;}
  const c=v.state.planar.contact,l=v.state.terrainLedger;maxPre=Math.max(maxPre,c.prePolishResidual);maxPost=Math.max(maxPost,c.residual);maxPosition=Math.max(maxPosition,l.endpointPositionError);maxVelocity=Math.max(maxVelocity,l.endpointVelocityError);
 }
 runs.push({id,scenario,h,simulated:v.state.time,maxPre,maxPost,maxPosition,maxVelocity,fault});
}
console.log(JSON.stringify({note:'Mixed-coordinate projected impulse residuals, before and after scalar polish. Final accepted-mode residuals; all mode and endpoint attempts remain subject to existing solver and physical gates.',runs}));
