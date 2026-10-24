import {createVehicle,stepVehicle,cornerForces,roadAt} from './vehicle.js';
const canvas=document.querySelector('#wheel'),ctx=canvas.getContext('2d');
let state=createVehicle(),accumulator=0,last=performance.now();
const keys=new Set();
window.addEventListener('keydown',e=>{
  const key=e.key.toLowerCase();
  if(['w','s','r','b',' '].includes(key))e.preventDefault();
  if(!e.repeat){if(key==='r'){state=createVehicle();accumulator=0;}if(key===' ')state.vz+=.5;if(key==='b')state.bump=state.x+1.3;}
  keys.add(key);
});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>keys.clear());
function draw(){
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
function diagnostics(){
 document.querySelector('#speed').textContent=`${state.v.toFixed(3)} m/s`;
 document.querySelector('#position').textContent=`${state.x.toFixed(3)} m`;
 document.querySelector('#pitch').textContent=`${(state.pitch*180/Math.PI).toFixed(3)}°; rate ${state.pitchRate.toFixed(4)} rad/s; height ${state.z.toFixed(4)} m`;
 for(const [i,c] of state.corners.entries()) {const f=cornerForces(state,c);document.querySelector(i===0?'#front':'#rear').textContent=`ω ${c.omega.toFixed(3)} rad/s | slip ${(c.radius*c.omega-state.v).toFixed(3)} m/s | Fx ${c.fx.toFixed(2)} N | N ${f.normal.toFixed(2)} N | compression ${f.compression.toFixed(4)} m | contact ${f.contact} | drive ${c.drive.toFixed(1)} / brake ${c.brake.toFixed(1)} Nm`;}
}
function frame(now){accumulator+=(now-last)/1000;last=now;
 try{let steps=0;while(accumulator>=.001&&steps<1000){stepVehicle(state,{drive:keys.has('w')?Number(document.querySelector('#drive').value):0,brake:keys.has('s')?8:0});accumulator-=.001;steps++;}draw();diagnostics();requestAnimationFrame(frame);}catch(e){document.querySelector('#warning').textContent=`Paused: ${e.message}; t=${state.time}`;console.error(e);}
}
requestAnimationFrame(frame);
