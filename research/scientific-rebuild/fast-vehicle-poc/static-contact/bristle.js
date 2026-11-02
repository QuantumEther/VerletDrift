// Lumped Kelvin-Voigt element in series with an isotropic Coulomb slider.
// SI: z metres, slip m/s, K N/m, c Ns/m, force N, energy J. No root solver.
export const POLICY=Object.freeze({stiffness:20000,viscosity:800});
export function bristleFlow(z0,slip,normal,mu,h,attached=true,policy=POLICY){
 const K=policy.stiffness,c=policy.viscosity,L=mu*normal;
 if(z0.length!==2||slip.length!==2||![...z0,...slip,normal,mu,h,K,c,L].every(Number.isFinite)||normal<0||mu<0||!(h>0&&K>0&&c>=0))throw Error('Invalid bristle problem');
 const E0=.5*K*(z0[0]**2+z0[1]**2);
 if(!Number.isFinite(E0))throw Error('Nonfinite bristle energy');

 const d=c+h*K/2,trial=[K*z0[0]+d*slip[0],K*z0[1]+d*slip[1]],norm=Math.hypot(...trial),sliding=norm>L;
 const p=sliding?trial.map(x=>x*(L/norm)):trial,ve=sliding?p.map((x,i)=>(x-K*z0[i])/d):slip.slice(),next=z0.map((x,i)=>x+h*ve[i]);
 const plasticVelocity=sliding?slip.map((x,i)=>x-ve[i]):[0,0];
 const viscous=c*h*(ve[0]**2+ve[1]**2),plastic=h*(p[0]*plasticVelocity[0]+p[1]*plasticVelocity[1]);
 const E1=.5*K*(next[0]**2+next[1]**2),work=-h*(p[0]*slip[0]+p[1]*slip[1]),residual=work+E1-E0+viscous+plastic;
 const tolerance=256*Number.EPSILON*(1+E0+E1+Math.abs(work)+viscous+Math.abs(plastic));
 if(![...next,...p,E0,E1,work,viscous,plastic,residual,tolerance].every(Number.isFinite)||plastic < -tolerance||Math.abs(residual)>tolerance||Math.hypot(...p)>L+64*Number.EPSILON*(1+L))throw Object.assign(Error('Bristle work/friction check failed'),{residual,tolerance,plastic});
 return {force:p.map(x=>-x),next,elasticBefore:E0,elasticAfter:E1,viscous,plastic,work,residual,mode:normal===0?'airborne':attached?(sliding?'sliding':'grip'):'detaching'};
}
