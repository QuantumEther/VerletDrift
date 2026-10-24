// Reduced side view: small-angle mount heights; no longitudinal pitch coupling.
export function createVehicle() {
  const s={mass:80,inertia:45,gravity:9.81,x:0,v:0,z:0,vz:0,pitch:0,pitchRate:0,time:0,bump:null};
  s.corners=[1,-1].map(arm=>({arm,mass:12,radius:.32,inertia:2,ks:4000,cs:160,kt:40000,ct:180,L0:.6,mu:.9,slipStiffness:18000,z:.32-52*9.81/40000,vz:0,omega:0,angle:0,fx:0,drive:0,brake:0}));
  s.z=s.corners[0].z+.6-40*9.81/4000;
  return s;
}
export function roadAt(s,x) {
  if(s.bump===null)return {height:0,slope:0};
  const u=(x-s.bump)/.8;
  return u>0&&u<1?{height:.08*Math.sin(Math.PI*u)**2,slope:.08*Math.PI/.8*Math.sin(2*Math.PI*u)}:{height:0,slope:0};
}
export function cornerForces(s,c) {
  const road=roadAt(s,s.x+c.arm);
  const compression=c.L0-(s.z+c.arm*s.pitch-c.z);
  const spring=c.ks*compression,damper=-c.cs*(s.vz+c.arm*s.pitchRate-c.vz);
  const delta=Math.max(0,c.radius+road.height-c.z);
  const normal=delta>0?Math.max(0,c.kt*delta-c.ct*(c.vz-road.slope*s.v)):0;
  return {compression,spring,damper,suspension:spring+damper,delta,normal,contact:normal>0,road};
}
export function verticalDerivative(s) {
  const f=s.corners.map(c=>cornerForces(s,c));
  return [s.vz,(f[0].suspension+f[1].suspension)/s.mass-s.gravity,s.pitchRate,s.corners.reduce((sum,c,i)=>sum+c.arm*f[i].suspension,0)/s.inertia,...s.corners.flatMap((c,i)=>[c.vz,(f[i].normal-f[i].suspension)/c.mass-s.gravity])];
}
const vector=s=>[s.z,s.vz,s.pitch,s.pitchRate,...s.corners.flatMap(c=>[c.z,c.vz])];
function stateAt(s,y){return {...s,z:y[0],vz:y[1],pitch:y[2],pitchRate:y[3],corners:s.corners.map((c,i)=>({...c,z:y[4+2*i],vz:y[5+2*i]}))};}
export function stepVehicle(s,{drive=0,brake=0}={},h=.001) {
  const y=vector(s),add=(v,k)=>y.map((a,i)=>a+h*k*v[i]);
  const a=verticalDerivative(s),b=verticalDerivative(stateAt(s,add(a,.5))),c=verticalDerivative(stateAt(s,add(b,.5))),d=verticalDerivative(stateAt(s,add(c,1)));
  const next=stateAt(s,y.map((v,i)=>v+h*(a[i]+2*b[i]+2*c[i]+d[i])/6));
  Object.assign(s,{z:next.z,vz:next.vz,pitch:next.pitch,pitchRate:next.pitchRate});
  s.corners.forEach((c,i)=>{c.z=next.corners[i].z;c.vz=next.corners[i].vz;});
  const mass=s.mass+s.corners.reduce((sum,c)=>sum+c.mass,0);
  const ports=s.corners.map((c,i)=>{
    c.drive=i===1?drive:0;
    const free=c.omega+h*c.drive/c.inertia;
    c.brake=-Math.sign(free)*Math.min(brake,Math.abs(free)*c.inertia/h);
    return c.drive+c.brake;
  });
  // Solve two capped implicit slip laws with shared horizontal velocity.
  // Enumerate free / positive saturation / negative saturation (9 bounded cases).
  const limits=s.corners.map(c=>c.mu*cornerForces(s,c).normal);
  const A=s.corners.map(c=>s.corners.map((other,j)=>h/mass+(other===c?h*c.radius*c.radius/c.inertia+1/c.slipStiffness:0)));
  const rhs=s.corners.map((c,i)=>c.radius*(c.omega+h*ports[i]/c.inertia)-s.v);
  let force;
  for(const u of [0,1,-1])for(const v of [0,1,-1]){
    const modes=[u,v],m=A.map(row=>[...row]),r=[...rhs];
    modes.forEach((mode,i)=>{if(mode){m[i]=[0,0];m[i][i]=1;r[i]=mode*limits[i];}});
    const det=m[0][0]*m[1][1]-m[0][1]*m[1][0];
    const f=[(r[0]*m[1][1]-m[0][1]*r[1])/det,(m[0][0]*r[1]-r[0]*m[1][0])/det];
    if(modes.every((mode,i)=>mode===0?Math.abs(f[i])<=limits[i]+1e-9:mode*(rhs[i]-A[i][0]*f[0]-A[i][1]*f[1])>=-1e-9)) force=f;
  }
  if(!force)throw new Error('Contact active set unresolved');
  s.v+=h*(force[0]+force[1])/mass;s.x+=h*s.v;
  s.corners.forEach((c,i)=>{c.fx=force[i];c.omega+=h*(ports[i]-c.radius*c.fx)/c.inertia;c.angle+=h*c.omega;});
  s.time+=h;
  if(![s.x,s.v,...vector(s),...s.corners.map(c=>c.omega)].every(Number.isFinite))throw new Error('Nonfinite vehicle');
}
