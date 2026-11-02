// Reduced world-coordinate contact geometry. No production dependencies.
export const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const add=(a,b)=>a.map((x,i)=>x+b[i]);
export const scale=(a,k)=>a.map(x=>x*k);
export const unit=a=>{const d=Math.hypot(...a);if(!(d>0&&Number.isFinite(d)))throw Error('Invalid contact axis');return scale(a,1/d);};
export function sample(terrain,x,y){
 const s=terrain.sample(x,y);
 if(!Number.isFinite(s.height)||s.gradient?.length!==2||!s.gradient.every(Number.isFinite)||!Number.isFinite(s.friction)||s.friction<0)throw Error('Invalid terrain sample');
 return {...s,normal:unit([-s.gradient[0],-s.gradient[1],1])};
}
export function point(y,corner,i){const c=Math.cos(y[2]),s=Math.sin(y[2]),[x,z]=corner;return [y[0]+c*x-s*z,y[1]+s*x+c*z,y[9+i]];}
// Parallel transport along the shortest great-circle arc. Isotropic elastic energy
// is unchanged; no projection, damping or history reset is used.
export function transport(z,a,b){
 const c=dot(a,b);if(c<=-1+1e-12)throw Error('Antipodal contact-frame transport outside domain');
 const k=cross(a,b),v=cross(k,z),w=cross(k,v),out=z.map((x,i)=>x+v[i]+w[i]/(1+c));
 const bound=256*Number.EPSILON*(1+dot(z,z));
 if(!out.every(Number.isFinite)||Math.abs(dot(out,out)-dot(z,z))>bound||Math.abs(dot(out,b))>256*Number.EPSILON*(1+Math.hypot(...out)))throw Error('Invalid bristle-frame transport');
 return out;
}
export function frame(normal,heading){const f=[Math.cos(heading),Math.sin(heading),0],t=unit(add(f,scale(normal,-dot(f,normal))));return [t,cross(normal,t)];}
export function normalStage(terrain,p0,p1,R,kt){
 const a=sample(terrain,p0[0],p0[1]),b=sample(terrain,p1[0],p1[1]),d=p1.map((x,i)=>x-p0[i]);
 // Fixed 3-point Gauss integration of the analytic height gradient; a work-secant
 // correction above roundoff also handles C1 road shoulders. Never subdivides time.
 const t=[.5-Math.sqrt(15)/10,.5,.5+Math.sqrt(15)/10],w=[5/18,4/9,5/18],g=[0,0];let mid;
 for(let j=0;j<3;j++){const s=sample(terrain,p0[0]+t[j]*d[0],p0[1]+t[j]*d[1]);if(j===1)mid=s;for(let k=0;k<2;k++)g[k]+=w[j]*s.gradient[k];}
 const dd=d[0]**2+d[1]**2,defect=b.height-a.height-g[0]*d[0]-g[1]*d[1];
 if(dd>0&&Math.abs(defect)>64*Number.EPSILON*(1+Math.abs(a.height)+Math.abs(b.height)))for(let k=0;k<2;k++)g[k]+=defect*d[k]/dd;
 const g0=R+a.height-p0[2],g1=R+b.height-p1[2],v0=Math.max(0,g0),v1=Math.max(0,g1);
 let pressure=0;if(g0>=0&&g1>=0)pressure=kt*(g0+g1)/2;else if(v0||v1)pressure=.5*kt*(v0*v0+v1*v1)/(Math.abs(g0)+Math.abs(g1));
 const direction=[-g[0],-g[1],1],force=scale(direction,pressure),normal=unit(direction),energyBefore=.5*kt*v0*v0,energyAfter=.5*kt*v1*v1;
 return {force,normal,N:Math.hypot(...force),mu:mid.friction,endpoint:b.normal,attached:g1>0,energyBefore,energyAfter,residual:energyAfter-energyBefore+dot(force,d),samples:5};
}
// Exact discrete carrier yaw Jacobian, plus tangent-only angular contact offsets.
// Normal force does no work on these offsets. This remains a reduced, nonholonomic
// contact-velocity model, not a complete 6-DOF wheel/carrier assembly.
export function jacobian(y0,y1,corner,n,H){
 const angle=(y0[2]+y1[2])/2,d=(y1[2]-y0[2])/2,sinc=d===0?1:Math.sin(d)/d,c=Math.cos(angle),s=Math.sin(angle),[x,y]=corner;
 const carrier=[(-s*x-c*y)*sinc,(c*x-s*y)*sinc,0],yaw=add(carrier,scale(cross([0,0,1],n),-H)),pitch=scale(cross([-s,c,0],n),H),roll=scale(cross(n,[c,s,0]),H);
 return {carrier,yaw,pitch,roll};
}
