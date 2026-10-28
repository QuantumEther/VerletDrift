import {SimulationClock} from './clock.js';
import {shaftState,dogState} from './gearbox.js';
import {selectorInputForce} from './selector-input.js';
import {movingSecond} from './initial-state.js';
import {createMechanicalAudio} from './audio.js';
import {visualState} from './visual-state.js';
import {drawSelector} from './selector-view.js';
import {drawDrivetrain} from './schematic.js';
import {createView3D} from './view3d.js';
import {createVehicle,stepVehicle,cornerForces,roadAt} from './vehicle.js';
const canvas=document.querySelector('#wheel'),ctx=canvas.getContext('2d');
let state=createVehicle(),accumulator=0,last=performance.now();
const keys=new Set(),pointers=new Map(),ignoredKeys=new Set();
const clock=new SimulationClock();let intentionalPause=false;
let renderMs=0,lastDiagnostics=-Infinity;
function clearInputs(){for(const key of keys)ignoredKeys.add(key);keys.clear();for(const [id,button]of pointers){if(button.hasPointerCapture(id))button.releasePointerCapture(id);}pointers.clear();}
function recover(){clock.reset();last=performance.now();clearInputs();document.querySelector('#warning').textContent='';}
let trail=[];
let view3d;
const canvas3d=document.querySelector('#perspective');
function selectView(){const active=document.querySelector('#view').value==='3d';canvas.hidden=active;canvas3d.hidden=!active;document.querySelector('#reset-camera').hidden=!active;}
document.querySelector('#view').addEventListener('change',()=>{clearInputs();selectView();});
selectView();
document.querySelector('#pause').addEventListener('click',()=>{intentionalPause=!intentionalPause;clearInputs();document.querySelector('#pause').textContent=intentionalPause?'Resume':'Pause';});
const audio=createMechanicalAudio(document.querySelector('#audio'),document.querySelector('#volume'));
for(const button of document.querySelectorAll('[data-selector]')){
 const clear=e=>pointers.delete(e.pointerId);
 button.addEventListener('pointerdown',e=>{button.setPointerCapture(e.pointerId);pointers.set(e.pointerId,button);});
 button.addEventListener('pointerup',clear);button.addEventListener('pointercancel',clear);button.addEventListener('lostpointercapture',clear);
}
document.querySelector('#worn').addEventListener('change',()=>resetExhibit());
document.querySelector('#moving-second').addEventListener('click',()=>{state=movingSecond({mode:document.querySelector('#differential').value,worn:document.querySelector('#worn').checked});document.querySelector('#engagement').value=0;accumulator=0;trail=[];recover();});
function resetExhibit(){state=createVehicle({mode:document.querySelector('#differential').value,scenario:document.querySelector('#scenario').value,worn:document.querySelector('#worn').checked});accumulator=0;trail=[];recover();}
document.querySelector('#rest').addEventListener('click',resetExhibit);
document.querySelector('#spin').addEventListener('click',()=>{resetExhibit();state.flywheel.omega=60;document.querySelector('#engagement').value=0;});
for(const button of document.querySelectorAll('[data-engagement]'))button.addEventListener('click',()=>document.querySelector('#engagement').value=button.dataset.engagement);
document.querySelector('#coast').addEventListener('click',()=>{
 state=createVehicle({mode:document.querySelector('#differential').value});state.v=3;state.wheels.forEach(w=>w.omega=3/w.radius);accumulator=0;trail=[];recover();
});
for(const id of ['differential','scenario'])document.querySelector('#'+id).addEventListener('change',()=>{state=createVehicle({mode:document.querySelector('#differential').value,scenario:document.querySelector('#scenario').value,worn:document.querySelector('#worn').checked});accumulator=0;trail=[];recover();});
window.addEventListener('keydown',e=>{
  const key=e.key.toLowerCase();if(ignoredKeys.has(key)&&e.repeat)return;ignoredKeys.delete(key);if(e.target.matches?.('input[type=number],textarea'))return;
  if(['w','s','r','b',' ','a','d','1','2','n'].includes(key))e.preventDefault();
  if(!e.repeat){if(key==='r'){state=createVehicle({mode:document.querySelector('#differential').value,scenario:document.querySelector('#scenario').value,worn:document.querySelector('#worn').checked});accumulator=0;trail=[];recover();}if(key===' ')state.vz+=.5;if(key==='b')state.bump=state.x+1.3;}
  keys.add(key);
});
window.addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());ignoredKeys.delete(e.key.toLowerCase());});window.addEventListener('blur',clearInputs);document.addEventListener('visibilitychange',()=>{clearInputs();if(!document.hidden){const unseen=Math.max(0,(performance.now()-last)/1000);clock.wall+=unseen;clock.pausedWall+=unseen;last=performance.now();}});
window.addEventListener('error',e=>{clock.fail(e.error||new Error(e.message),state);clearInputs();});
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
 const visual=visualState(state),f=state.flywheel,g=state.gearbox;
 document.querySelector('#actual-gear').textContent=`Gear ${g.selected}`;
 const dog=dogState(state);
 document.querySelector('#gearbox-status').textContent=`Selector ${g.q.toFixed(5)} m / ${g.velocity.toFixed(3)} m/s | driver ${g.driverForce.toFixed(1)} N | detent ${g.detentReaction.toFixed(2)} N | relative dog speed ${dog.relativeSpeed.toFixed(3)} rad/s | phase ${dog.phase.toFixed(3)} rad | depth ${Math.max(0,Math.abs(g.q)-.010).toFixed(4)} m | contact ${g.contactForce.toFixed(1)} N | impulse ${g.lastImpulse.toFixed(4)} Ns | angular impulse ${(g.lastAngularImpulse||0).toFixed(5)} Nms | impact loss ${g.lastImpactEnergy.toFixed(5)} J / total ${g.impactHeat.toFixed(4)} J | input ΔL ${(g.inputMomentumChange||0).toFixed(5)} Nms | cam force ${(g.camForce||0).toFixed(2)} N | rotor/selector work residual ${(g.rotationalWorkResidual||0).toExponential(2)} J | driver work ${(g.driverWork||0).toFixed(3)} J`;
 const display=(id,value)=>document.querySelector('#'+id).textContent=value;
 display('engine-rpm',visual.engineRPM.toFixed(1)+' rpm');display('input-rpm',visual.shaftRPM.toFixed(1)+' rpm');display('slip',visual.slip.toFixed(3)+' rad/s');display('clutch-state',visual.state);display('torque',visual.torque.toFixed(3)+' Nm');display('capacity',visual.capacity.toFixed(1)+' Nm');display('heat-power',visual.heatPower.toFixed(3)+' W');display('heat',visual.heat.toFixed(4)+' J');display('flow',visual.flow);
 drawSelector(document.querySelector('#selector'),state);
 drawDrivetrain(document.querySelector('#mechanism'),state);

 const d=state.drivetrain,w=state.wheels;
 display('drive-mode',visual.mode);display('carrier-speed',visual.carrierSpeed.toFixed(3)+' rad/s');display('rear-speeds',visual.rearSpeeds.map(w=>w.toFixed(3)).join(' / ')+' rad/s');display('outputs',visual.outputTorque.map(t=>t.toFixed(3)).join(' / ')+' Nm');display('difference',(visual.rearSpeeds[0]-visual.rearSpeeds[1]).toFixed(4)+' rad/s');display('power-residual',(d.powerResidual||0).toExponential(2)+' W');

 const p=state.planar;
 document.querySelector('#planar').textContent=`u ${p.u.toFixed(3)} m/s; lateral ${p.v.toFixed(3)} m/s; yaw ${(p.r*180/Math.PI).toFixed(2)} deg/s; heading ${(p.heading*180/Math.PI).toFixed(2)} deg; steer ${(p.steering*180/Math.PI).toFixed(2)} deg; sideslip ${(Math.atan2(p.v,Math.max(Math.abs(p.u),.01))*180/Math.PI).toFixed(2)} deg; world (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) m`;
 for(const c of state.wheels){const row=document.querySelector('#'+c.name);row.textContent=`${c.name} | ${c.omega.toFixed(2)} | ${(c.slip||0).toFixed(3)} | ${((c.alpha||0)*180/Math.PI).toFixed(2)} | ${c.fx.toFixed(2)} | ${(c.fy||0).toFixed(2)} | ${(c.normal??cornerForces(state,state.corners[c.axle]).normal/2).toFixed(2)} | ${((c.steering||0)*180/Math.PI).toFixed(2)}`;}
 document.querySelector('#speed').textContent=`${state.v.toFixed(3)} m/s`;
 document.querySelector('#position').textContent=`${state.x.toFixed(3)} m`;
 document.querySelector('#pitch').textContent=`${(state.pitch*180/Math.PI).toFixed(3)}°; rate ${state.pitchRate.toFixed(4)} rad/s; height ${state.z.toFixed(4)} m`;
 for(const [i,c] of state.corners.entries()) {const f=cornerForces(state,c);document.querySelector(i===0?'#front':'#rear').textContent=`ω ${c.omega.toFixed(3)} rad/s | slip ${(c.radius*c.omega-state.v).toFixed(3)} m/s | Fx ${c.fx.toFixed(2)} N | N ${f.normal.toFixed(2)} N | compression ${f.compression.toFixed(4)} m | contact ${f.contact} | drive ${c.drive.toFixed(1)} / brake ${c.brake.toFixed(1)} Nm`;}
}
function frame(now){
 try {
 const elapsed=(now-last)/1000;last=now;
 const held=new Set([...keys,...[...pointers.values()].map(b=>b.dataset.selector)]);
 const engagement=Number(document.querySelector('#engagement').value),motor=Number(document.querySelector('#drive').value);
 clock.frame(elapsed,h=>{state.flywheel.engagement=engagement;state.gearbox.driverForce=selectorInputForce(state.gearbox,held);stepVehicle(state,{drive:held.has('w')?motor:0,brake:held.has('s')?8:0,steer:(Number(held.has('a'))-Number(held.has('d')))*.4},h);audio.update(state.gearbox);return state.gearbox;},()=>state,document.hidden||intentionalPause);
 if(clock.fault){clearInputs();document.querySelector('#warning').textContent='Simulation paused: '+clock.fault.message+' — Reset to restart.';}
 const start=performance.now();
 try{draw();if(now-lastDiagnostics>100){diagnostics();lastDiagnostics=now;}if(document.querySelector('#inspection').open)document.querySelector('#performance').textContent=JSON.stringify({status:clock.status,frameIntervalMs:elapsed*1000,rejected:clock.rejected,wall:clock.wall,simulated:clock.simulated,slowMotionWall:clock.dilated,pausedWall:clock.pausedWall,debt:clock.debt,physicsMs:clock.physicsMs,stepsThisFrame:clock.frameSteps,accepted:clock.accepted,candidates:clock.candidates,eventTrials:clock.searches,worstStepMs:clock.worstStepMs,renderMs},null,2);}catch(e){clock.fail(e,state);view3d?.dispose();view3d=undefined;document.querySelector('#view').value='top';selectView();}
 renderMs=performance.now()-start;
 }catch(e){clock.fail(e,state);clearInputs();document.querySelector('#warning').textContent='Simulation paused: '+clock.fault.message+' — Reset to restart.';}finally{requestAnimationFrame(frame);}
}
requestAnimationFrame(frame);

// Read-only diagnostic snapshot, also used to verify camera isolation.
export function simulationSnapshot(){return structuredClone(state);}

export function runtimeSnapshot(){const {now,...data}=clock;return {clock:structuredClone(data),keys:[...keys],pointers:pointers.size,renderMs};}

export function rendererInfo(){return view3d?.info();}
export function recreateRenderer(){view3d?.dispose();view3d=undefined;}
