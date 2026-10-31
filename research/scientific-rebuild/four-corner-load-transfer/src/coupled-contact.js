import {solveContacts} from '../../braking-and-tire-contact-prototype/src/contact-solver.js';
import {wheelContactPorts} from './contact-port.js';
// One tangential impulse stage. The caller owns suspension/external-force
// integration; this stage never invents an acceleration-derived transfer force.
export function solveFourContacts(s,{velocity,normal,angles=[0,0,0,0],mu=.9,height=.5,wheelInertia=1},h=.001){
 if(velocity.length!==14||normal.length!==4||!(h>0))throw Error('Invalid coupled contact state');
 const masses=[s.mass+4*s.wheelMass,s.mass+4*s.wheelMass,45,s.mass,s.pitchInertia,s.rollInertia,...Array(4).fill(s.wheelMass),...Array(4).fill(wheelInertia)];
 const inverse=masses.map((m,i)=>masses.map((_,j)=>i===j?1/m:0));const rows=[],groups=[];
 wheelContactPorts(s,height).forEach((p,i)=>{const c=Math.cos(angles[i]),t=Math.sin(angles[i]);const x=p.jx.map((a,k)=>c*a+t*p.jy[k]),y=p.jx.map((a,k)=>-t*a+c*p.jy[k]);x.push(...Array(4).fill(0));y.push(...Array(4).fill(0));x[10+i]=-s.radius;rows.push({j:x,compliance:1/(h*800)},{j:y,compliance:1/(h*800)});groups.push({indices:[2*i,2*i+1],limit:h*mu*Math.max(0,normal[i])});});
 const result=solveContacts(inverse,velocity,rows,groups,h,{tolerance:1e-12,maxIterations:20000});
 const kinetic=v=>v.reduce((a,w,i)=>a+.5*masses[i]*w*w,0);const slip=rows.map(r=>r.j.reduce((a,j,i)=>a+j*result.velocity[i],0));
 const dissipation=result.z.reduce((a,z,i)=>a+z*slip[i],0),numericalLoss=result.velocity.reduce((a,v,i)=>a+.5*masses[i]*(v-velocity[i])**2,0);
 return {...result,forces:result.z.map(z=>-z/h),slip,dissipation,numericalLoss,energyResidual:kinetic(result.velocity)-kinetic(velocity)+dissipation+numericalLoss};
}
