import {tireForce} from '../../tire-road-observatory-prototype/src/contact-solver.js';
export const REFERENCE=Object.freeze({id:'reference',kx:800,ky:800});
export function createTireStrategy({id='reference',corneringStiffness=3800,minSpeed=.5}={}){
 if(id==='reference')return REFERENCE;
 if(id!=='speed-normalized-anisotropic'||!Number.isFinite(corneringStiffness)||corneringStiffness<=0||!Number.isFinite(minSpeed)||minSpeed<=0)throw Error('Invalid tire strategy');
 if(!Number.isFinite(corneringStiffness/minSpeed))throw Error('Unrepresentable tire stiffness');
 return Object.freeze({id,kx:800,corneringStiffness,minSpeed});
}
export function freezeTireCoefficients(strategy,speed){const ky=strategy.corneringStiffness/Math.max(Math.abs(speed),strategy.minSpeed);if(!Number.isFinite(speed)||!Number.isFinite(ky)||ky<=0)throw Error('Invalid frozen tire speed/stiffness');return Object.freeze({kx:800,ky,referenceSpeed:Math.abs(speed)});}
export function tireCompliance(h,k){return k===undefined?1/(h*800):1/(h*k);}
export function frictionImpulseLimit(h,mu,normal){return h*mu*Math.max(0,normal);}
// Opposing force t=-F minimizes .5*(tx²/kx+ty²/ky)-s.t on ||t||<=L.
// KKT: s_i=t_i/k_i+lambda*t_i, lambda>=0, lambda*(||t||-L)=0.
// lambda has velocity/force units (m/(N s)). This is NOT radial force-vector clamping.
export function anisotropicForceReference(sx,sy,normal,mu,{kx,ky},profile=null){
 const started=profile?performance.now():0;let bracketSteps=0;

 if(![sx,sy,normal,mu,kx,ky].every(Number.isFinite)||mu<0||kx<=0||ky<=0)throw Error('Invalid anisotropic tire input');
 const limit=mu*Math.max(0,normal);if(!Number.isFinite(limit))throw Error('Unrepresentable tire force limit');if(limit===0)return diagnosticDone(profile,started,{fx:0,fy:0},false);
 let x=kx*sx,y=ky*sy;if(Math.hypot(x,y)<=limit)return diagnosticDone(profile,started,{fx:-x,fy:-y},false);
 const norm=l=>Math.hypot(sx/(1/kx+l),sy/(1/ky+l));let lo=0,hi=1;while(norm(hi)>limit){if(hi>Number.MAX_VALUE/2)throw Error('Unrepresentable tire multiplier');hi*=2;bracketSteps++;}
 for(let i=0;i<80;i++){const m=(lo+hi)/2;if(norm(m)>limit)lo=m;else hi=m;}
 const l=(lo+hi)/2;return diagnosticDone(profile,started,{fx:-sx/(1/kx+l),fy:-sy/(1/ky+l)},true,80,bracketSteps);
}
export {tireForce};

function diagnosticDone(profile,started,force,saturated,iterations=0,bracketSteps=0){profile?.({stage:'constitutive',ms:performance.now()-started,saturated,iterations,bracketSteps});return force;}

// Same monotone KKT multiplier equation, with a velocity/force bracket and
// safeguarded Newton. The original diagnostic remains available for ablation.
export function anisotropicForce(sx,sy,normal,mu,{kx,ky},profile=null){
 const started=profile?performance.now():0;
 if(![sx,sy,normal,mu,kx,ky].every(Number.isFinite)||mu<0||kx<=0||ky<=0)throw Error('Invalid anisotropic tire input');
 const limit=mu*Math.max(0,normal);if(!Number.isFinite(limit))throw Error('Unrepresentable tire force limit');
 if(limit===0)return diagnosticDone(profile,started,{fx:0,fy:0},false);
 if(Math.hypot(kx*sx,ky*sy)<=limit)return diagnosticDone(profile,started,{fx:-kx*sx,fy:-ky*sy},false);
 const ax=1/kx,ay=1/ky,norm=l=>Math.hypot(sx/(ax+l),sy/(ay+l));
 // ||s/(a+l)|| <= ||s||/l, so this is an upper bound on the root.
 let lo=0,hi=Math.min(1,Math.hypot(sx,sy)/limit),bracketSteps=0;
 if(!(hi>0))hi=1;
 while(norm(hi)>limit){if(hi>Number.MAX_VALUE/2)throw Error('Unrepresentable tire multiplier');hi*=2;bracketSteps++;}
 let l=(lo+hi)/2;
 for(let i=0;i<80;i++){
  const dx=ax+l,dy=ay+l,x=sx/dx,y=sy/dy,r=Math.hypot(x,y),error=r-limit;
  if(Math.abs(error)<=16*Number.EPSILON*limit)return diagnosticDone(profile,started,{fx:-x,fy:-y},true,i+1,bracketSteps);
  if(error>0)lo=l;else hi=l;
  const midpoint=(lo+hi)/2;
  if(midpoint===lo||midpoint===hi){
   if(Math.abs(error)>64*Number.EPSILON*limit)throw Error('Tire diagnostic bracket lost precision');
   return diagnosticDone(profile,started,{fx:-x,fy:-y},true,i+1,bracketSteps);
  }
  const derivative=-(x/r)*(x/dx)-(y/r)*(y/dy),newton=l-error/derivative;
  l=Number.isFinite(newton)&&newton>lo&&newton<hi?newton:midpoint;
 }
 throw Error('Tire diagnostic root did not converge');
}
