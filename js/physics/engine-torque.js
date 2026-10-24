// Provisional 3.5 L naturally aspirated four-stroke SI engine class.
// Pressure coefficients are estimates, not measurements. See engine-torque-model.md.
// Full-load curve is BRAKE torque; add mechanical losses to obtain indicated torque.
import {TORQUE_PEAK_RPM, TAU} from '../constants.js';
export const ENGINE_TORQUE_DEFAULTS=Object.freeze({
 engineDisplacementM3:.0035,
 engineFrictionBasePa:50000,
 engineFrictionSlopePaPerRpm:10,
 enginePumpingPressurePa:65000,
 enginePumpingSpeedRpm:600,
 engineIdleGainNmPerRpm:.05,
 engineIdleFadeRpm:400,
 engineLimiterBandRpm:300,
});
const clamp01=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{const t=clamp01(x);return t*t*(3-2*t);};
// No allocation if the caller supplies its reusable output record.
export function engineTorques(omega, throttle, mode, p, out={}) {
 const n=Math.abs(omega)*60/TAU,u=clamp01(throttle),k=p.engineDisplacementM3/(4*Math.PI);
 const coulomb=p.engineFrictionBasePa*k;
 const viscous=p.engineFrictionSlopePaPerRpm*k*60/TAU;
 const friction=coulomb+viscous*Math.abs(omega);
 // Pressure drop below atmosphere, reduced by throttle opening. Off engines
 // still pump through the same throttle; ignition is not a throttle actuator.
 const pumping=p.enginePumpingPressurePa*k*(1-u)**2*n/(n+p.enginePumpingSpeedRpm);
 const running=mode==='running'&&omega>0;
 const limiter=smooth((p.redlineRpm-n)/p.engineLimiterBandRpm);
 const brake=p.peakEngineTorqueNm*Math.max(0,1-2.5*((n-TORQUE_PEAK_RPM)/(p.redlineRpm-p.idleRpm))**2);
 const combustion=running?u*(brake+friction)*limiter:0;
 const idleGate=smooth((p.idleRpm+p.engineIdleFadeRpm-n)/p.engineIdleFadeRpm);
 // Idle bypass torque compensates modeled losses plus proportional error.
 // Remove the mechanical-loss offset already included in indicated driver torque.
 const idle=running?Math.min((1-u)*p.peakEngineTorqueNm*.25,
   Math.max(0,friction+pumping-u*friction+p.engineIdleGainNmPerRpm*(p.idleRpm-n)))*idleGate*limiter:0;
 out.combustion=combustion;out.idle=idle;out.starter=mode==='starting'?p.starterTorqueNm:0;
 out.coulomb=coulomb;out.viscous=viscous;out.pumping=pumping;out.friction=friction;
 out.limiter=limiter;out.fuelCut=running&&n>=p.redlineRpm;
 return out;
}

// Validate infrequent settings import, outside the per-step evaluator.
export function validateEngineTorqueParameters(p) {
 for(const key of Object.keys(ENGINE_TORQUE_DEFAULTS)) {
  const value=p[key];
  const positive=['engineDisplacementM3','enginePumpingSpeedRpm','engineIdleFadeRpm','engineLimiterBandRpm'].includes(key);
  if(!Number.isFinite(value)||(positive?value<=0:value<0))throw Error(`Invalid engine coefficient: ${key}`);
 }
 if(p.enginePumpingPressurePa>101325)throw Error('Pumping pressure drop exceeds reference atmospheric pressure.');
}
