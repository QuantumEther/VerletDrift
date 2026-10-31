import {solveContacts} from '../src/contact-solver.js';
import {createTireStrategy,freezeTireCoefficients,tireCompliance,frictionImpulseLimit,anisotropicForce,tireForce} from '../src/tire-strategy.js';
const curves=[],h=.001;
for(const floor of [.25,.5,1,2])for(const speed of [0,5,10,20])for(const angle of [.5,1,2,3,3.2,3.3,5,6,6.4,6.5,10,12,12.7,13,13.3,14,15,20,30])for(const sx of [0,.2]){
 const sy=speed*Math.tan(angle*Math.PI/180),N=1000,mu=.9,row={floor,speed,angle,sx,sy,normal:N,mu};
 for(const id of ['reference','speed-normalized-anisotropic']){
  const p=id==='reference'?{kx:800,ky:800}:freezeTireCoefficients(createTireStrategy({id,minSpeed:floor}),speed),rows=[{j:[1,0],compliance:tireCompliance(h,p.kx)},{j:[0,1],compliance:tireCompliance(h,p.ky)}];
  const result=solveContacts([[0,0],[0,0]],[sx,sy],rows,[{indices:[0,1],limit:frictionImpulseLimit(h,mu,N)}],h,{maxIterations:20000,tolerance:1e-12}),fx=-result.z[0]/h,fy=-result.z[1]/h,expected=id==='reference'?tireForce(sx,sy,N,mu):anisotropicForce(sx,sy,N,mu,p),residual=h*Math.hypot(fx-expected.fx,fy-expected.fy);
  if(residual>2e-8)throw Error('Isolated constitutive acceptance failed');row[id==='reference'?'A':'B']={fx,fy,kx:p.kx,ky:p.ky,iterations:result.iterations,impulseResidual:result.residual,constitutiveImpulseResidual:residual,complianceCondition:Math.max(p.kx,p.ky)/Math.min(p.kx,p.ky)};
 }
 curves.push(row);
}
console.log(JSON.stringify({runtime:process.version,method:'Existing convex solver with prescribed slip (zero inverse body inertia), two compliant rows and one shared circle; no free-vehicle claim',h,registeredAngles:[.5,1,2],normal:1000,mu:.9,curves},null,2));
