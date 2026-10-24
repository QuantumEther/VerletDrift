import {createView3D} from './view3d.js';
import {createVehicle,stepVehicle,cornerForces,roadAt} from './vehicle.js';
const canvas=document.querySelector('#wheel'),ctx=canvas.getContext('2d');
let state=createVehicle(),accumulator=0,last=performance.now();
const keys=new Set();
let trail=[];
let view3d;
const canvas3d=document.querySelector('#perspective');
function selectView(){const active=document.querySelector('#view').value==='3d';canvas.hidden=active;canvas3d.hidden=!active;document.querySelector('#reset-camera').hidden=!active;}
document.querySelector('#view').addEventListener('change',selectView);
selectView();
for(const id of ['differential','scenario'])document.querySelector('#'+id).addEventListener('change',()=>{state=createVehicle({mode:document.querySelector('#differential').value,scenario:document.querySelector('#scenario').value});accumulator=0;trail=[];keys.clear();});
window.addEventListener('keydown',e=>{
  const key=e.key.toLowerCase();
  if(['w','s','r','b',' ','a','d'].includes(key))e.preventDefault();
  if(!e.repeat){if(key==='r'){state=createVehicle({mode:document.querySelector('#differential').value,scenario:document.querySelector('#scenario').value});accumulator=0;trail=[];}if(key===' ')state.vz+=.5;if(key==='b')state.bump=state.x+1.3;}
  keys.add(key);
});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>keys.clear());
function draw(){
 if(document.querySelector('#view').value==='3d'){view3d??=createView3D(canvas3d,document.querySelector('#reset-camera'));view3d.draw(state);return;}
 if(document.querySelector('#view').value==='top'){drawTop();return;}
 const scale=120,ground=canvas.height*.85,xscreen=x=>canvas.width/2+(x-state.x)*scale,zscreen=z=>ground-z*scale;
 ctx.clearRect(0,0,canvas.width,canvas.height);
 ctx.strokeStyle='#8aa3b6';ctx.lineWidth=2;ctx.beginPath();
 for(let px=0;px<=canvas.width;px++){const x=state.x+(px-canvas.width/2)/scale;const z=roadAt(state,x).height;px?ctx.lineTo(px,zscreen(z)):ctx.moveTo(px,zscreen(z));}ctx.stroke();
 ctx.fillStyle='#657886';for(let x=Math.floor(state.x-3);x<state.x+3;x++)ctx.fillRect(xscreen(x),ground+18,12,3);
 ctx.strokeStyle='#dfb65d';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(xscreen(state.x-1),zscreen(state.z-state.pitch));ctx.lineTo(xscreen(state.x+1),zscreen(state.z+state.pitch));ctx.stroke();
 for(const c of state.corners){const x=xscreen(state.x+c.arm),top=zscreen(state.z+c.arm*state.pitch),bottom=zscreen(c.z);const f=cornerForces(state,c);
 ctx.lineWidth=2;ctx.strokeStyle='#dfb65d';ctx.beginPath();ctx.moveTo(x-12,top);for(let i=1;i<=12;i++)ctx.lineTo(x-12+(i%2?6:-6),top+(bottom-top)*i/13);ctx.lineTo(x-12,bottom);ctx.stroke();ctx.strokeRect(x+8,(top+bottom)/2-10,10,20);ctx.beginPath();ctx.moveTo(x+13,top);ctx.lineTo(x+13,bottom);ctx.stroke();
 ctx.beginPath();ctx.arc(x,bottom,c.radius*scale,0,2*Math.PI);ctx.fillStyle='#263747';ctx.fill();ctx.strokeStyle=f.contact?'#55d6be':'#eb9265';ctx.lineWidth=4;ctx.stroke();ctx.beginPath();ctx.moveTo(x,bottom);ctx.lineTo(x+Math.cos(c.angle)*c.radius*scale*.85,bottom+Math.sin(c.angle)*c.radius*scale*.85);ctx.stroke();
 }
}
function drawTop(){
 const p=state.planar,scale=85,cx=canvas.width/2,cy=canvas.height/2;
 ctx.clearRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#334c60';ctx.lineWidth=1;
 for(let x=Math.floor(p.x-5);x<p.x+5;x++){ctx.beginPath();ctx.moveTo(cx+(x-p.x)*scale,0);ctx.lineTo(cx+(x-p.x)*scale,canvas.height);ctx.stroke();}
 for(let y=Math.floor(p.y-4);y<p.y+4;y++){ctx.beginPath();ctx.moveTo(0,cy-(y-p.y)*scale);ctx.lineTo(canvas.width,cy-(y-p.y)*scale);ctx.stroke();}
 ctx.strokeStyle='#55d6be';ctx.beginPath();trail.forEach((point,i)=>{const x=cx+(point[0]-p.x)*scale,y=cy-(point[1]-p.y)*scale;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();
 ctx.save();ctx.translate(cx,cy);ctx.rotate(-p.heading);ctx.fillStyle='#dfb65d';ctx.fillRect(-scale,-.25*scale,2*scale,.5*scale);
 for(const c of state.wheels){ctx.save();ctx.translate(c.x*scale,-c.y*scale);ctx.rotate(-(c.steering||0));ctx.fillStyle=c.normal>0?'#55d6be':'#eb9265';ctx.fillRect(-22,-7,44,14);ctx.fillStyle='#10232e';const spin=Math.sin(c.angle)*17;ctx.fillRect(spin-2,-7,4,14);ctx.restore();}
 ctx.strokeStyle='white';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(1.3*scale,0);ctx.stroke();ctx.restore();
 const wx=Math.cos(p.heading)*p.u-Math.sin(p.heading)*p.v,wy=Math.sin(p.heading)*p.u+Math.cos(p.heading)*p.v;
 ctx.strokeStyle='#e79b64';ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+wx*15,cy-wy*15);ctx.stroke();
}
function diagnostics(){
 const d=state.drivetrain,w=state.wheels;
 document.querySelector('#drivetrain').textContent=`${d.mode} | RL ${w[2].omega.toFixed(3)} | RR ${w[3].omega.toFixed(3)} rad/s | carrier ${d.mode==='independent'?'not modeled':(d.carrierSpeed||0).toFixed(3)} | Δω ${(w[2].omega-w[3].omega).toFixed(4)} | input ${(d.inputTorque||0).toFixed(2)} Nm | outputs ${(d.outputs||[0,0]).map(t=>t.toFixed(2)).join(' / ')} Nm | power residual ${(d.powerResidual||0).toExponential(2)} W | lock reaction ${(d.lockReaction||0).toFixed(2)} Nm`;

 const p=state.planar;
 document.querySelector('#planar').textContent=`u ${p.u.toFixed(3)} m/s; lateral ${p.v.toFixed(3)} m/s; yaw ${(p.r*180/Math.PI).toFixed(2)} deg/s; heading ${(p.heading*180/Math.PI).toFixed(2)} deg; steer ${(p.steering*180/Math.PI).toFixed(2)} deg; sideslip ${(Math.atan2(p.v,Math.max(Math.abs(p.u),.01))*180/Math.PI).toFixed(2)} deg; world (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) m`;
 for(const c of state.wheels){const row=document.querySelector('#'+c.name);row.textContent=`${c.name} | ${c.omega.toFixed(2)} | ${(c.slip||0).toFixed(3)} | ${((c.alpha||0)*180/Math.PI).toFixed(2)} | ${c.fx.toFixed(2)} | ${(c.fy||0).toFixed(2)} | ${(c.normal??cornerForces(state,state.corners[c.axle]).normal/2).toFixed(2)} | ${((c.steering||0)*180/Math.PI).toFixed(2)}`;}
 document.querySelector('#speed').textContent=`${state.v.toFixed(3)} m/s`;
 document.querySelector('#position').textContent=`${state.x.toFixed(3)} m`;
 document.querySelector('#pitch').textContent=`${(state.pitch*180/Math.PI).toFixed(3)}°; rate ${state.pitchRate.toFixed(4)} rad/s; height ${state.z.toFixed(4)} m`;
 for(const [i,c] of state.corners.entries()) {const f=cornerForces(state,c);document.querySelector(i===0?'#front':'#rear').textContent=`ω ${c.omega.toFixed(3)} rad/s | slip ${(c.radius*c.omega-state.v).toFixed(3)} m/s | Fx ${c.fx.toFixed(2)} N | N ${f.normal.toFixed(2)} N | compression ${f.compression.toFixed(4)} m | contact ${f.contact} | drive ${c.drive.toFixed(1)} / brake ${c.brake.toFixed(1)} Nm`;}
}
function frame(now){accumulator+=(now-last)/1000;last=now;
 try{let steps=0;while(accumulator>=.001&&steps<1000){stepVehicle(state,{drive:keys.has('w')?Number(document.querySelector('#drive').value):0,brake:keys.has('s')?8:0,steer:(Number(keys.has('a'))-Number(keys.has('d')))*.4});accumulator-=.001;steps++;if(steps%20===0){trail.push([state.planar.x,state.planar.y]);if(trail.length>1000)trail.shift();}}draw();diagnostics();requestAnimationFrame(frame);}catch(e){document.querySelector('#warning').textContent=`Paused: ${e.message}; t=${state.time}`;console.error(e);}
}
requestAnimationFrame(frame);

// Read-only diagnostic snapshot, also used to verify camera isolation.
export function simulationSnapshot(){return structuredClone(state);}
