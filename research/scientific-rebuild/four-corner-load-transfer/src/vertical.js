// Small-angle vertical subsystem. SI reference parameters; no driving forces.
export function createVertical({damping=80}={}){
 const s={mass:80,pitchInertia:45,rollInertia:20,g:9.81,ks:2000,kt:20000,damping,radius:.32,length:.6,wheelMass:6,corners:[[1,.6],[1,-.6],[-1,.6],[-1,-.6]],q:[],v:Array(7).fill(0)};
 const wheel=s.radius-(s.mass/4+s.wheelMass)*s.g/s.kt;
 s.q=[wheel+s.length-s.mass*s.g/(4*s.ks),0,0,...Array(4).fill(wheel)];return s;
}
export function evaluate(s,q=s.q,v=s.v){
 const f=[-s.mass*s.g,0,0,...Array(4).fill(-s.wheelMass*s.g)];let potential=s.mass*s.g*q[0],dissipation=0;
 const normal=[],spring=[];
 s.corners.forEach(([x,y],i)=>{
  const compression=s.length-(q[0]+x*q[1]+y*q[2]-q[i+3]),rate=v[0]+x*v[1]+y*v[2]-v[i+3];
  const suspension=s.ks*compression-s.damping*rate,penetration=Math.max(0,s.radius-q[i+3]),n=s.kt*penetration;
  f[0]+=suspension;f[1]+=x*suspension;f[2]+=y*suspension;f[i+3]+=n-suspension;
  potential+=.5*s.ks*compression**2+.5*s.kt*penetration**2+s.wheelMass*s.g*q[i+3];dissipation+=s.damping*rate**2;normal.push(n);spring.push(suspension);
 });
 const mass=[s.mass,s.pitchInertia,s.rollInertia,...Array(4).fill(s.wheelMass)];
 return {force:f,acceleration:f.map((a,i)=>a/mass[i]),normal,spring,dissipation,energy:potential+v.reduce((a,w,i)=>a+.5*mass[i]*w*w,0)};
}
export function stepVertical(s,h=.001){
 if(!(h>0&&Number.isFinite(h)))throw Error('Invalid timestep');
 const y=[...s.q,...s.v],derivative=y=>[...y.slice(7),...evaluate(s,y.slice(0,7),y.slice(7)).acceleration];
 const add=(k,t)=>y.map((a,i)=>a+h*t*k[i]);const a=derivative(y),b=derivative(add(a,.5)),c=derivative(add(b,.5)),d=derivative(add(c,1));
 const next=y.map((a,i)=>a+h*(derivative(y)[i]+2*b[i]+2*c[i]+d[i])/6);s.q=next.slice(0,7);s.v=next.slice(7);return evaluate(s);
}
