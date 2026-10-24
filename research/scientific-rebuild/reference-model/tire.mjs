import {parameters,validateParameters} from './parameters.mjs';
// Source Eqs.(9),(15),(16),(18)-(20), pp.11-14. No iteration/filter/clamp.
// Zero slip is the analytic limit; t=2a-lambda is computed without cancellation.
export function tire(Vx,Vy,Omega,Fz,p=parameters,counter){
 if(counter)counter.tires=(counter.tires||0)+1;
 validateParameters(p);
 if(![Vx,Vy,Omega,Fz].every(Number.isFinite)||Omega===0||Fz<=0)throw new RangeError('Invalid tire input (no standstill extension)');
 const peripheral=p.r*Omega,h=Math.abs(peripheral),Sx=(peripheral-Vx)/h,Sy=-Vy/h;
 const B=Math.hypot(Sx,Sy),K=Math.hypot(p.kx*Sx,p.ky*Sy),Kcrit=3*p.mu0*Fz/(2*p.a**2);
 if(B===0)return {Fx:0,Fy:0,Mz:0,Sx,Sy,B,K,Kcrit,lambda:2*p.a,branch:'adhesion',Fz,Vx,Vy,Omega};
 const cx=Sx/B,cy=Sy/B;
 if(K>=Kcrit)return {Fx:p.mu*Fz*cx,Fy:p.mu*Fz*cy,Mz:0,Sx,Sy,B,K,Kcrit,lambda:0,branch:'sliding',Fz,Vx,Vy,Omega};
 const t=4*p.a**3*K/(3*p.mu0*Fz),lambda=2*p.a-t,W=t*t*(p.a+lambda)/(4*p.a**3);
 const Fx=lambda**2/2*p.kx*Sx+W*p.mu*Fz*cx;
 const Fy=lambda**2/2*p.ky*Sy+W*p.mu*Fz*cy;
 const Mz=(3*p.a-2*lambda)*lambda**2/6*p.ky*Sy-3*t*t*lambda**2/(16*p.a**3)*p.mu*Fz*cy;
 if(![Fx,Fy,Mz,lambda].every(Number.isFinite)||lambda<0||lambda>2*p.a)throw new RangeError('Invalid adhesive intermediate');
 return {Fx,Fy,Mz,Sx,Sy,B,K,Kcrit,lambda,branch:'adhesion',Fz,Vx,Vy,Omega};
}
