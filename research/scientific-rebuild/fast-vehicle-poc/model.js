// Isolated reduced Lagrangian vehicle. No production imports or global solver.
import {createVertical,evaluate} from '../four-corner-load-transfer/src/vertical.js';
import {brakeActuation} from '../tire-road-observatory-prototype/src/brakes.js';
import {engineTorques} from '../tire-road-observatory-prototype/src/engine.js';
export const P=Object.freeze({mass:104,Iz:60,H:.5,R:.32,Iw:1,Ie:.3,gear:3.5,k:800,mu:.9,clutch:30});
// y: X,Y,heading,VX,VY,yawRate, q[7], qdot[7], wheelOmega[4], engineOmega,
// work[engine,contact,brake,clutch,suspension]. Wheel angles are not needed here.
export function create({speed=0,lateral=0,yaw=0,engine=40}={}){
 const vertical=createVertical(),y=[0,0,0,speed,lateral,yaw,...vertical.q,...vertical.v,...Array(4).fill(speed/P.R),engine,...Array(5).fill(0)];
 return {vertical,y,time:0};
}
export function evaluateVehicle(s,y=s.y,input={},brakes=brakeActuation(input.serviceBrake,input.handbrake)){
 const d=Array(30).fill(0),q=y.slice(6,13),w=y.slice(13,20),z=evaluate(s.vertical,q,w);
 const c=Math.cos(y[2]),sn=Math.sin(y[2]),u=c*y[3]+sn*y[4],v=-sn*y[3]+c*y[4];
 let fx=0,fy=0,mz=0,cp=0,bp=0; const tires=[];
 const shaft=P.gear*(y[22]+y[23])/2,slip=y[24]-shaft;
 const clutch=P.clutch*(input.clutch??.3)*Math.tanh(2*slip/P.clutch);
 const engine=engineTorques(y[24],input.throttle??0,input.ignition!==false,input.starter??false,input.ignition!==false);
 for(let i=0;i<4;i++){
  const [x,side]=s.vertical.corners[i],a=i<2?(input.steer??0):0,ca=Math.cos(a),sa=Math.sin(a);
  const vx=u-y[5]*side+P.H*w[1],vy=v+y[5]*x+P.H*w[2];
  const tx=ca*vx+sa*vy,ty=-sa*vx+ca*vy,sx=tx-P.R*y[20+i];
  let X=-P.k*sx,Y=-P.k*ty;const limit=P.mu*z.normal[i],scale=Math.min(1,limit/(Math.hypot(X,Y)||1));X*=scale;Y*=scale;
  const bx=ca*X-sa*Y,by=sa*X+ca*Y;
  fx+=bx;fy+=by;mz+=x*by-side*bx;z.force[1]+=P.H*bx;z.force[2]+=P.H*by;
  const brake=(brakes.wheels[i].serviceCapacity+brakes.wheels[i].handCapacity)*Math.tanh(y[20+i]/.5);
  d[20+i]=((i>=2?P.gear*clutch/2:0)-P.R*X-brake)/P.Iw;
  cp+=X*sx+Y*ty;bp-=brake*y[20+i];
  tires.push({N:z.normal[i],fx:X,fy:Y,sx,sy:ty,utilization:limit?Math.hypot(X,Y)/limit:0});
 }
 d[0]=y[3];d[1]=y[4];d[2]=y[5];d[3]=(c*fx-sn*fy)/P.mass;d[4]=(sn*fx+c*fy)/P.mass;d[5]=mz/P.Iz;
 const masses=[80,45,20,6,6,6,6];for(let i=0;i<7;i++){d[6+i]=w[i];d[13+i]=z.force[i]/masses[i];}
 d[24]=(engine.netTorque-clutch)/P.Ie;
 d[25]=engine.netTorque*y[24];d[26]=cp;d[27]=bp;d[28]=-clutch*slip;d[29]=-z.dissipation;
 return {d,tires,power:d.slice(25),clutch,slip};
}
export function energy(s,y=s.y){return evaluate(s.vertical,y.slice(6,13),y.slice(13,20)).energy+.5*P.mass*(y[3]**2+y[4]**2)+.5*P.Iz*y[5]**2+.5*P.Iw*y.slice(20,24).reduce((a,x)=>a+x*x,0)+.5*P.Ie*y[24]**2;}
export function step(s,input={},h=.001){
 if(!(h>0&&h<=.004))throw Error('Declared timestep domain (0, .004] s');
 const brakes=brakeActuation(input.serviceBrake,input.handbrake);
 const y=s.y,a=evaluateVehicle(s,y,input,brakes).d;
 const stage=(k,t)=>y.map((x,i)=>x+h*t*k[i]);
 const b=evaluateVehicle(s,stage(a,.5),input,brakes).d,c=evaluateVehicle(s,stage(b,.5),input,brakes).d,e=evaluateVehicle(s,stage(c,1),input,brakes).d;
 const next=y.map((x,i)=>x+h*(a[i]+2*b[i]+2*c[i]+e[i])/6);
 if(!next.every(Number.isFinite))throw Error('Invalid state; last accepted state retained');s.y=next;s.time+=h;
}
