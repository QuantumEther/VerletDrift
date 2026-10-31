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
export function anisotropicForce(sx,sy,normal,mu,{kx,ky}){
 if(![sx,sy,normal,mu,kx,ky].every(Number.isFinite)||mu<0||kx<=0||ky<=0)throw Error('Invalid anisotropic tire input');
 const limit=mu*Math.max(0,normal);if(!Number.isFinite(limit))throw Error('Unrepresentable tire force limit');if(limit===0)return {fx:0,fy:0};
 let x=kx*sx,y=ky*sy;if(Math.hypot(x,y)<=limit)return {fx:-x,fy:-y};
 const norm=l=>Math.hypot(sx/(1/kx+l),sy/(1/ky+l));let lo=0,hi=1;while(norm(hi)>limit){if(hi>Number.MAX_VALUE/2)throw Error('Unrepresentable tire multiplier');hi*=2;}
 for(let i=0;i<80;i++){const m=(lo+hi)/2;if(norm(m)>limit)lo=m;else hi=m;}
 const l=(lo+hi)/2;return {fx:-sx/(1/kx+l),fy:-sy/(1/ky+l)};
}
export {tireForce};
