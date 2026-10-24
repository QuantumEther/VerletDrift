// Zhang Table 1, p.10; g is the explicit Mission 15 terrestrial assumption.
export const parameters=Object.freeze({mv:1200,mw:100,JG:2500,C:2.77,D:4.5,l:2.5,d:1.5,q:1,r:0.3,kx:4e6,ky:2e6,a:0.1,mu0:0.9,mu:0.6,g:9.81});
export const units=Object.freeze({state:['m/s','m/s','rad/s','rad/s','rad/s'],force:'N',moment:'Nm',power:'W',energy:'J',kx:'N/m^2',ky:'N/m^2'});
export function inertia(p=parameters){return {m:p.mv+2*p.mw,p:p.mw*(p.q-p.d),J:p.JG+p.mw*(p.d**2+p.q**2)+2*p.C};}
export function validateParameters(p){
 for(const [key,value]of Object.entries(p))if(!Number.isFinite(value))throw new RangeError(`Nonfinite parameter ${key}`);
 for(const k of ['mv','mw','JG','C','D','l','d','q','r','kx','ky','a','mu0','g'])if(!(p[k]>0))throw new RangeError(`Positive parameter required: ${k}`);
 if(p.mu<0||p.mu>p.mu0||Math.abs(p.l-p.d-p.q)>Number.EPSILON*p.l*4)throw new RangeError('Invalid friction/geometry');
 const {m,p:b,J}=inertia(p);if(!(m*J-b*b>0))throw new RangeError('Invalid inertia matrix');
}
