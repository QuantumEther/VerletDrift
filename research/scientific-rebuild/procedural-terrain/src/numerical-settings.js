// Explicit headless Experiment-11 numerical experiments. No physical parameter
// or safety tolerance belongs here. Undefined and explicit strict settings have
// the exact original convergence path, including diagnostic state/iteration counts.
export const STRICT_NUMERICS=Object.freeze({contactTolerance:1e-12,positionTolerance:1e-11,velocityTolerance:1e-10,velocityRelative:0,velocityMode:'absolute'});
export function numericalSettings(options){
 if(options===undefined)return STRICT_NUMERICS;
 if(!options||typeof options!=='object'||Array.isArray(options))throw Error('Invalid numerical settings');
 for(const key of Object.keys(options))if(!Object.hasOwn(STRICT_NUMERICS,key))throw Error('Unknown numerical setting: '+key);
 const p={...STRICT_NUMERICS,...options};
 for(const [key,lo,hi] of [['contactTolerance',1e-12,1e-7],['positionTolerance',1e-11,1e-8],['velocityTolerance',1e-10,1e-7],['velocityRelative',0,1e-7]])if(!(Number.isFinite(p[key])&&p[key]>=lo&&p[key]<=hi))throw Error('Invalid '+key);
 if(!['absolute','scaled'].includes(p.velocityMode)||p.velocityMode==='absolute'&&p.velocityRelative!==0)throw Error('Invalid velocity convergence mode');
 return Object.keys(p).every(k=>p[k]===STRICT_NUMERICS[k])?STRICT_NUMERICS:Object.freeze(p);
}
// Reference scales have the units of their own generalized velocity: wheel
// rad/s; selector m/s; engine/input rad/s; body m/s; yaw/column rad/s; vertical
// heave m/s, pitch/roll rad/s, and four hub m/s. These are declared numerical
// normalization scales, not modifications of inertia, geometry or motion.
export const VELOCITY_SCALES=Object.freeze([1,1,1,1,.01,100,100,1,1,1,1,1,1,1,1,1,1,1]);
export function velocityConverged(prior,next,absoluteError,p){
 if(p.velocityMode==='absolute')return absoluteError<p.velocityTolerance;
 if(!prior)return false;
 return next.every((value,i)=>Math.abs(value-prior[i])<p.velocityTolerance*VELOCITY_SCALES[i]+p.velocityRelative*Math.max(Math.abs(value),Math.abs(prior[i])));
}

// Validated opt-in compromise. Strict/default remains unchanged.
export const NUMERICAL_EXPERIMENTS=Object.freeze({balanced:Object.freeze({contactTolerance:1e-10,velocityMode:'scaled',velocityTolerance:1e-9,velocityRelative:1e-9})});
