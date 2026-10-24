// Right handed x forward, y left, yaw positive counterclockwise.
export function createPlanar(){return {x:0,y:0,heading:0,u:0,v:0,r:0,Iz:60,steering:0};}
export function tireLateral(vx,vy,load,mu=.9){
 const alpha=Math.atan2(vy,Math.max(Math.abs(vx),.5));
 const fy=Math.max(-mu*load,Math.min(mu*load,-800*alpha));
 return {alpha,fy:fy||0};
}
export function stepPlanar(p,corners,loads,mass,{drive=0,brake=0,steer=0}={},h=.001){
 const target=Math.max(-.45,Math.min(.45,steer));
 p.steering+=Math.max(-1.2*h,Math.min(1.2*h,target-p.steering));
 const t=corners.map((c,i)=>{
  const delta=i===0?p.steering:0,cos=Math.cos(delta),sin=Math.sin(delta);
  const vx=cos*p.u+sin*(p.v+c.arm*p.r),vy=-sin*p.u+cos*(p.v+c.arm*p.r);
  const lateral=tireLateral(vx,vy,loads[i],c.mu);
  c.drive=i===1?drive:0;
  const free=c.omega+h*c.drive/c.inertia;
  c.brake=-Math.sign(free)*Math.min(brake,Math.abs(free)*c.inertia/h);
  return {cos,sin,vx,vy,...lateral,torque:c.drive+c.brake,limit:Math.sqrt(Math.max(0,(c.mu*loads[i])**2-lateral.fy**2))};
 });
 // Lateral forces frozen at start; solve longitudinal slip implicitly with
 // full shared translation/yaw response, including steered force directions.
 const lateralFx=t.reduce((n,a)=>n-a.sin*a.fy,0),lateralFy=t.reduce((n,a)=>n+a.cos*a.fy,0);
 const lateralMz=t.reduce((n,a,i)=>n+corners[i].arm*a.cos*a.fy,0);
 const A=t.map((a,i)=>t.map((b,j)=>h*((a.cos*b.cos+a.sin*b.sin)/mass+corners[i].arm*a.sin*corners[j].arm*b.sin/p.Iz)+(i===j?h*corners[i].radius**2/corners[i].inertia+1/corners[i].slipStiffness:0)));
 const rhs=t.map((a,i)=>corners[i].radius*(corners[i].omega+h*a.torque/corners[i].inertia)-a.vx-h*(a.cos*lateralFx/mass+a.sin*(lateralFy/mass+corners[i].arm*lateralMz/p.Iz)));
 let force;
 for(const u of [0,1,-1])for(const v of [0,1,-1]){
  const modes=[u,v],m=A.map(row=>[...row]),r=[...rhs];
  modes.forEach((mode,i)=>{if(mode){m[i]=[0,0];m[i][i]=1;r[i]=mode*t[i].limit;}});
  const det=m[0][0]*m[1][1]-m[0][1]*m[1][0];
  const f=[(r[0]*m[1][1]-m[0][1]*r[1])/det,(m[0][0]*r[1]-r[0]*m[1][0])/det];
  if(modes.every((mode,i)=>mode===0?Math.abs(f[i])<=t[i].limit+1e-9:mode*(rhs[i]-A[i][0]*f[0]-A[i][1]*f[1])>=-1e-9))force=f;
 }
 if(!force)throw new Error('Planar contact unresolved');
 let fx=0,fy=0,mz=0;
 corners.forEach((c,i)=>{const a=t[i];c.fx=force[i]||0;c.fy=a.fy;c.alpha=a.alpha;c.normal=loads[i];c.slip=c.radius*c.omega-a.vx;c.utilization=loads[i]>0?Math.hypot(c.fx,c.fy)/(c.mu*loads[i]):0;
 const bx=a.cos*c.fx-a.sin*c.fy,by=a.sin*c.fx+a.cos*c.fy;fx+=bx;fy+=by;mz+=c.arm*by;
 c.omega+=h*(a.torque-c.radius*c.fx)/c.inertia;c.angle+=h*c.omega;
 });
 // World-frame velocity update is equivalent to body Newton-Euler equations
 // (uDot=Fx/m+r*v, vDot=Fy/m-r*u), without an explicit Coriolis energy error.
 const co=Math.cos(p.heading),si=Math.sin(p.heading);
 const wx=co*p.u-si*p.v+h*(co*fx-si*fy)/mass,wy=si*p.u+co*p.v+h*(si*fx+co*fy)/mass;
 p.r+=h*mz/p.Iz;p.heading+=h*p.r;p.x+=h*wx;p.y+=h*wy;
 const cn=Math.cos(p.heading),sn=Math.sin(p.heading);p.u=cn*wx+sn*wy;p.v=-sn*wx+cn*wy;
 if(!Object.values(p).every(Number.isFinite))throw new Error('Nonfinite planar state');
}
