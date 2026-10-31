import {engageDogs} from './gearbox.js';
import {regenerate,terrainSampler,terrainContacts} from './application-vehicle.js';
import {suspensionDiagnostics} from './suspension-diagnostics.js';
import {TireObservatory} from './tracks.js';
import {drawTracks2D} from './track-view.js';
import {updateObservatory} from './observatory-panel.js';
import {createSteering} from './steering.js';
import {brakeActuation} from './brakes.js';
import {reducedKineticEnergy} from './diagnostics.js';
import {createPressurePlate} from './pressure-plate.js';
import {createInstrument,instrumentValues} from './instruments.js';
import {SimulationClock} from './clock.js';
import {shaftState,dogState} from './gearbox.js';
import {selectorInputForce} from './selector-input.js';
import {movingSecond} from './initial-state.js';
import {createMechanicalAudio} from './audio.js';
import {visualState} from './visual-state.js';
import {drawSelector} from './selector-view.js';
import {drawDrivetrain} from './schematic.js';
import {createView3D} from './view3d.js';
import {createVehicle,stepVehicle,cornerForces,roadAt} from './application-vehicle.js';
const canvas=document.querySelector('#wheel'),ctx=canvas.getContext('2d');
const isAutomobile=()=>document.querySelector('#power-mode').value==='automobile';
function newVehicle(options={}){const s=createVehicle({...options,automobile:true});if(!isAutomobile())delete s.engine;return s;}
let state=newVehicle(),last=performance.now();
const gauges={engine:createInstrument(document.querySelector('#engine-dial'),{label:'ENGINE',unit:'rpm',max:6000}),input:createInstrument(document.querySelector('#input-dial'),{label:'INPUT SHAFT',unit:'rpm',max:3000}),speed:createInstrument(document.querySelector('#speed-dial'),{label:'ROAD SPEED',unit:'km/h',max:80,divisions:4})};
const observatory=new TireObservatory();
const keys=new Set(),pointers=new Map(),ignoredKeys=new Set();
const clock=new SimulationClock();let intentionalPause=false;
let renderMs=0,lastDiagnostics=-Infinity;
function clearInputs(){for(const key of keys)ignoredKeys.add(key);keys.clear();for(const [id,button]of pointers){if(button.hasPointerCapture(id))button.releasePointerCapture(id);}pointers.clear();}
function recover(){observatory.breakContinuity();clock.reset();last=performance.now();clearInputs();document.querySelector('#warning').textContent='';}

let view3d;
const canvas3d=document.querySelector('#perspective');
function selectView(){
 const mode=document.querySelector('#view').value,active=mode==='3d';
 canvas.hidden=active||mode==='schematic';canvas3d.hidden=!active;document.querySelector('#mechanism').hidden=mode!=='schematic';
 for(const id of ['reset-camera','focus-clutch','cutaway'])document.querySelector('#'+id).hidden=!active;
 document.querySelector('#mechanism-key').hidden=!(mode==='schematic'||active&&['driveline','clutch','exploded'].includes(document.querySelector('#cutaway').value));
 const names={road:'The Tire–Road Observatory',engine:'The carbureted engine',brakes:'The hydraulic drum brake',handbrake:'The rear cable brake',column:'The steering wheel & column',steeringbox:'The worm & sector',linkage:'The closed steering linkage',contact:'At the tire–road interface',normal:'The touring chassis',driver:'From the driver’s seat',xray:'Beneath the coachwork',driveline:'The unsynchronized gearbox',clutch:'The friction connection',exploded:'Anatomy of the mechanism'};
 document.querySelector('#view-title').textContent=active?names[document.querySelector('#cutaway').value]:({top:'The path of motion',side:'The sprung chassis',schematic:'The engineering section'})[mode];
 document.querySelector('#view-note').textContent=active?'Drag to orbit · right-drag to pan · scroll to zoom · double-click a component to focus':mode==='schematic'?'Steel: free-running · brass: dog-coupled · index marks follow real shaft angles':'W drive · S brake · A/D steer · B bump';
}
 document.querySelector('#cutaway').addEventListener('change',()=>{clearInputs();selectView();});
document.querySelector('#view').addEventListener('change',()=>{clearInputs();selectView();});
selectView();
document.querySelector('#pause').addEventListener('click',()=>{intentionalPause=!intentionalPause;clearInputs();document.querySelector('#pause').textContent=intentionalPause?'Resume':'Pause';});
document.querySelector('#observatory').addEventListener('toggle',()=>{lastDiagnostics=-Infinity;});
document.querySelector('#clear-tracks').addEventListener('click',()=>{observatory.clear();lastDiagnostics=-Infinity;});
document.querySelector('#record-contacts').addEventListener('change',()=>observatory.breakContinuity());
const audio=createMechanicalAudio(document.querySelector('#audio'),document.querySelector('#volume'));
for(const button of document.querySelectorAll('[data-selector]')){
 const clear=e=>pointers.delete(e.pointerId);
 button.addEventListener('pointerdown',e=>{button.setPointerCapture(e.pointerId);pointers.set(e.pointerId,button);});
 button.addEventListener('pointerup',clear);button.addEventListener('pointercancel',clear);button.addEventListener('lostpointercapture',clear);
}
document.querySelector('#worn').addEventListener('change',()=>resetExhibit());
document.querySelector('#moving-second').addEventListener('click',()=>{document.querySelector('#power-mode').value='laboratory';state=movingSecond({mode:document.querySelector('#differential').value,worn:document.querySelector('#worn').checked});state.steering=createSteering(state.wheelbase,state.track);state.brakes=brakeActuation();document.querySelector('#engagement').value=0;recover();});
function resetExhibit(){state=newVehicle({mode:document.querySelector('#differential').value,scenario:document.querySelector('#scenario').value,worn:document.querySelector('#worn').checked});recover();}
document.querySelector('#rest').addEventListener('click',resetExhibit);
document.querySelector('#ignition').addEventListener('click',()=>{if(state.engine)state.engine.ignition=!state.engine.ignition;});
document.querySelector('#spin').addEventListener('click',()=>{document.querySelector('#power-mode').value='laboratory';resetExhibit();state.flywheel.omega=60;document.querySelector('#engagement').value=0;});
for(const button of document.querySelectorAll('[data-engagement]'))button.addEventListener('click',()=>document.querySelector('#engagement').value=button.dataset.engagement);
document.querySelector('#coast').addEventListener('click',()=>{
 state=newVehicle({mode:document.querySelector('#differential').value});state.v=3;state.wheels.forEach(w=>w.omega=3/w.radius);recover();
});
document.querySelector('#brake-trial').addEventListener('click',()=>{resetExhibit();state.v=8;state.wheels.forEach(w=>w.omega=8/w.radius);document.querySelector('#engagement').value=0;});
for(const id of ['differential','scenario','power-mode'])document.querySelector('#'+id).addEventListener('change',()=>{state=newVehicle({mode:document.querySelector('#differential').value,scenario:document.querySelector('#scenario').value,worn:document.querySelector('#worn').checked});recover();});
window.addEventListener('keydown',e=>{
  const key=e.key.toLowerCase();if(ignoredKeys.has(key)&&e.repeat)return;ignoredKeys.delete(key);if(e.target.matches?.('input[type=number],textarea'))return;
  if(['w','s','r','b',' ','h','e','i','a','d','1','2','n'].includes(key))e.preventDefault();
  if(!e.repeat){if(key==='r'){state=newVehicle({mode:document.querySelector('#differential').value,scenario:document.querySelector('#scenario').value,worn:document.querySelector('#worn').checked});recover();}if(key==='i'&&state.engine)state.engine.ignition=!state.engine.ignition;if(key==='h')state.vz+=.5;if(key==='b')document.querySelector('#warning').textContent='Use the terrain selector to respawn on a validated uneven surface; the legacy injected bump is disabled';}
  keys.add(key);
});
window.addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());ignoredKeys.delete(e.key.toLowerCase());});window.addEventListener('blur',clearInputs);document.addEventListener('visibilitychange',()=>{clearInputs();if(!document.hidden){const unseen=Math.max(0,(performance.now()-last)/1000);clock.wall+=unseen;clock.pausedWall+=unseen;last=performance.now();}});
window.addEventListener('error',e=>{clock.fail(e.error||new Error(e.message),state);clearInputs();});
function draw(){
 if(document.querySelector('#view').value==='3d'){view3d??=createView3D(canvas3d,document.querySelector('#reset-camera'));view3d.draw(state,observatory);return;}
 if(document.querySelector('#view').value==='schematic'){drawDrivetrain(document.querySelector('#mechanism'),state);return;}
 if(document.querySelector('#view').value==='top'){drawTop();return;}
 const scale=120,ground=canvas.height*.85,xscreen=x=>canvas.width/2+(x-state.x)*scale,zscreen=z=>ground-z*scale;
 ctx.clearRect(0,0,canvas.width,canvas.height);
 ctx.strokeStyle='#9fa68e';ctx.lineWidth=2;ctx.beginPath();
 for(let px=0;px<=canvas.width;px++){const x=state.x+(px-canvas.width/2)/scale;const z=roadAt(state,x).height;px?ctx.lineTo(px,zscreen(z)):ctx.moveTo(px,zscreen(z));}ctx.stroke();
 ctx.fillStyle='#657886';for(let x=Math.floor(state.x-3);x<state.x+3;x++)ctx.fillRect(xscreen(x),ground+18,12,3);
 ctx.strokeStyle='#dfb65d';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(xscreen(state.x-1),zscreen(state.z-state.pitch));ctx.lineTo(xscreen(state.x+1),zscreen(state.z+state.pitch));ctx.stroke();
 for(const c of state.corners){const x=xscreen(state.x+c.arm),top=zscreen(state.z+c.arm*state.pitch),bottom=zscreen(c.z);const f=cornerForces(state,c);
 ctx.lineWidth=2;ctx.strokeStyle='#dfb65d';ctx.beginPath();ctx.moveTo(x-12,top);for(let i=1;i<=12;i++)ctx.lineTo(x-12+(i%2?6:-6),top+(bottom-top)*i/13);ctx.lineTo(x-12,bottom);ctx.stroke();ctx.strokeRect(x+8,(top+bottom)/2-10,10,20);ctx.beginPath();ctx.moveTo(x+13,top);ctx.lineTo(x+13,bottom);ctx.stroke();
 ctx.beginPath();ctx.arc(x,bottom,c.radius*scale,0,2*Math.PI);ctx.fillStyle='#202a23';ctx.fill();ctx.strokeStyle=f.contact?'#b8c2a1':'#eb9265';ctx.lineWidth=4;ctx.stroke();ctx.beginPath();ctx.moveTo(x,bottom);ctx.lineTo(x+Math.cos(c.angle)*c.radius*scale*.85,bottom+Math.sin(c.angle)*c.radius*scale*.85);ctx.stroke();
 }
}
function drawTop(){
 const p=state.planar,scale=85,cx=canvas.width/2,cy=canvas.height/2;
 ctx.fillStyle='#788174';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#626c5d';ctx.lineWidth=1;
 for(let x=Math.floor(p.x-5);x<p.x+5;x++){ctx.beginPath();ctx.moveTo(cx+(x-p.x)*scale,0);ctx.lineTo(cx+(x-p.x)*scale,canvas.height);ctx.stroke();}
 for(let y=Math.floor(p.y-4);y<p.y+4;y++){ctx.beginPath();ctx.moveTo(0,cy-(y-p.y)*scale);ctx.lineTo(canvas.width,cy-(y-p.y)*scale);ctx.stroke();}
 drawTracks2D(ctx,observatory,p,{marks:document.querySelector('#show-marks').checked,center:document.querySelector('#show-center').checked,paths:document.querySelector('#show-paths').checked,slips:document.querySelector('#show-slip').checked},scale,canvas.width,canvas.height);
 ctx.save();ctx.translate(cx,cy);ctx.rotate(-p.heading);ctx.fillStyle='#dfb65d';ctx.fillRect(-scale,-.25*scale,2*scale,.5*scale);
 for(const c of state.wheels){ctx.save();ctx.translate(c.x*scale,-c.y*scale);ctx.rotate(-(c.steering||0));ctx.fillStyle=c.normal>0?'#b8c2a1':'#eb9265';ctx.fillRect(-c.radius*scale,-.11*scale,2*c.radius*scale,.22*scale);ctx.fillStyle='#10232e';const spin=Math.sin(c.angle)*c.radius*scale*.8;ctx.fillRect(spin-2,-.11*scale,4,.22*scale);ctx.restore();}
 ctx.strokeStyle='white';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(1.3*scale,0);ctx.stroke();ctx.restore();
 const wx=Math.cos(p.heading)*p.u-Math.sin(p.heading)*p.v,wy=Math.sin(p.heading)*p.u+Math.cos(p.heading)*p.v;
 ctx.strokeStyle='#e79b64';ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+wx*15,cy-wy*15);ctx.stroke();
}
function diagnostics(){
 const visual=visualState(state),f=state.flywheel,g=state.gearbox;
 document.querySelector('#live-performance').textContent=`${clock.fps.toFixed(1)} render FPS · ${clock.stepsPerSecond.toFixed(0)} physics steps/s · ${clock.realtimeRatio.toFixed(2)}× real time · ${(clock.debt*1000).toFixed(1)} ms pending · ${clock.dilated.toFixed(2)} s discarded wall debt · ${clock.status}`;
 if(document.querySelector('#terrain-diagnostics').open)document.querySelector('#terrain-readings').textContent=JSON.stringify(terrainContacts(state).map((t,i)=>({wheel:i,...t,normalLoad:state.wheels[i].normal,slipX:state.wheels[i].slipX,slipY:state.wheels[i].slipY,utilization:state.wheels[i].mu*state.wheels[i].normal>0?Math.hypot(state.wheels[i].fx,state.wheels[i].fy)/(state.wheels[i].mu*state.wheels[i].normal):null,springCompression:state.vertical.length-(state.z+state.vertical.corners[i][0]*state.pitch+state.vertical.corners[i][1]*state.roll-state.vertical.q[3+i])})),null,2);
 if(document.querySelector('#suspension-diagnostics').open)document.querySelector('#suspension-readings').textContent=JSON.stringify(suspensionDiagnostics(state),null,2);
 document.querySelector('#corner-state').textContent=JSON.stringify({heave:state.vertical.q[0],pitch:state.pitch,roll:state.roll,heights:state.vertical.q.slice(3),springCompression:state.vertical.corners.map(([x,y],i)=>state.vertical.length-(state.vertical.q[0]+x*state.vertical.q[1]+y*state.vertical.q[2]-state.vertical.q[3+i])),normalLoads:state.wheels.map(w=>w.normal),verticalLedger:state.verticalLedger,terrainLedger:state.terrainLedger},null,2);
 if(document.querySelector('#observatory').open){updateObservatory(document.querySelector('#tire-readings'),document.querySelector('#friction-circles'),observatory,state);document.querySelector('#track-summary').textContent=JSON.stringify(observatory.stats(),null,2);}
 const e=state.engine,b=state.brakes,t=state.steering;
 document.querySelector('#engine-live').textContent=e?`${e.mode} · ignition ${e.ignition?'ON':'OFF'} · accelerator ${(e.throttle*100).toFixed(0)}% · throttle ${(e.throttleOpening*90).toFixed(1)}° · net ${e.netTorque.toFixed(2)} Nm`:'Prescribed-torque laboratory · no combustion model';
 document.querySelector('#ignition').textContent=e?.ignition?'Ignition ON':'Ignition OFF';
 document.querySelector('#automobile-record').textContent=JSON.stringify({engine:e||'laboratory',brakes:b||'direct torque fixture',steering:t||'parallel fixture'},null,2);
 document.querySelector('#actuation-live').textContent=b?`Drums · ${(b.pressure/1e6).toFixed(2)} MPa · rear cable ${b.perRearCable.toFixed(0)} N`:'Direct brake-capacity experiment';
 document.querySelector('#steering-live').textContent=t?`Column ${(t.wheelAngle*180/Math.PI).toFixed(0)}° · knuckles ${(t.leftAngle*180/Math.PI).toFixed(1)}° / ${(t.rightAngle*180/Math.PI).toFixed(1)}°`:'Parallel-angle laboratory fixture';
 const values=instrumentValues(state);for(const name of ['engine','input','speed'])gauges[name](values[name]);
 document.querySelector('#engagement-value').textContent=Math.round(Number(document.querySelector('#engagement').value)*100)+'%';
 document.querySelector('#selector-force').textContent=`Driver force: ${g.driverForce.toFixed(1)} N · q ${(g.q*1000).toFixed(2)} mm`;
 for(const button of document.querySelectorAll('[data-selector]'))button.classList.toggle('held',keys.has(button.dataset.selector)||[...pointers.values()].includes(button));
 document.querySelector('#engagement-note').textContent=g.selected==='N'?'Neutral · output uncoupled':`Dog constraint engaged · ${visual.gearRatio}:1`;
 document.querySelector('#record-clutch').textContent=visual.state;
 document.querySelector('#record-torque').textContent=visual.torque.toFixed(2)+' Nm';
 document.querySelector('#record-heat').textContent=visual.heat.toFixed(3)+' J';
 document.querySelector('#record-time').textContent=`${state.time.toFixed(2)} s / ${clock.dilated.toFixed(2)} s`;
 document.querySelector('#clock-status').textContent=clock.status==='overloaded'?'Slower than real time':clock.status;
 const contact=g.faceBlocked&&g.selected==='N';
 document.querySelector('#mechanical-caption').textContent=contact?'Selector resisted at the dog faces.':g.selected==='N'?'Constant mesh. Free output.':`Gear ${g.selected} coupled through the dogs.`;
 document.querySelector('#contact-record').textContent=state.wheels.map(w=>`${w.name}: ${(w.normal??0)<=0?'unloaded':(w.utilization??0)>=1-1e-6?'at friction limit':'inside envelope'} | brake ${(w.brake||0).toFixed(1)}/${(w.brakeCapacity||0).toFixed(1)} Nm (service ${(w.serviceBrakeTorque||0).toFixed(1)}, hand ${(w.handbrakeTorque||0).toFixed(1)}) | ${w.brakeHeld?'brake held':'at capacity/free'} | slip (${(w.slipX||0).toFixed(2)}, ${(w.slipY||0).toFixed(2)}) m/s`).join('\n')+'\n'+JSON.stringify({currentReducedKineticEnergy:reducedKineticEnergy(state),impactHeat:state.gearbox.impactHeat,forceStageLedger:state.planar.contact||{}});
 document.querySelector('#actual-gear').textContent=`Gear ${g.selected}`;
 const dog=dogState(state);
 document.querySelector('#gearbox-status').textContent=`Selector ${g.q.toFixed(5)} m / ${g.velocity.toFixed(3)} m/s | driver ${g.driverForce.toFixed(1)} N | detent ${g.detentReaction.toFixed(2)} N | relative dog speed ${dog.relativeSpeed.toFixed(3)} rad/s | phase ${dog.phase.toFixed(3)} rad | depth ${Math.max(0,Math.abs(g.q)-.010).toFixed(4)} m | contact ${g.contactForce.toFixed(1)} N | impulse ${g.lastImpulse.toFixed(4)} Ns | angular impulse ${(g.lastAngularImpulse||0).toFixed(5)} Nms | impact loss ${g.lastImpactEnergy.toFixed(5)} J / total ${g.impactHeat.toFixed(4)} J | input ΔL ${(g.inputMomentumChange||0).toFixed(5)} Nms | cam force ${(g.camForce||0).toFixed(2)} N | rotor/selector work residual ${(g.rotationalWorkResidual||0).toExponential(2)} J | driver work ${(g.driverWork||0).toFixed(3)} J`;
 const display=(id,value)=>document.querySelector('#'+id).textContent=value;
 display('engine-rpm',visual.engineRPM.toFixed(1)+' rpm');display('input-rpm',visual.shaftRPM.toFixed(1)+' rpm');display('slip',visual.slip.toFixed(3)+' rad/s');display('clutch-state',visual.state);display('torque',visual.torque.toFixed(3)+' Nm');display('capacity',visual.capacity.toFixed(1)+' Nm'+(f.actuator?` | command ${(f.engagement*100).toFixed(0)}% | plate ${(f.actuator.x*1000).toFixed(3)} mm | normal ${f.actuator.normal.toFixed(1)} N | axial energy ${f.actuator.energy.toFixed(4)} J | actuator work ${f.actuator.commandWork.toFixed(4)} J | damper ${f.actuator.dampingHeat.toFixed(4)} J | numerical loss ${f.actuator.numericalLoss.toFixed(4)} J`:''));display('heat-power',visual.heatPower.toFixed(3)+' W');display('heat',visual.heat.toFixed(4)+' J');display('flow',visual.flow);
 drawSelector(document.querySelector('#selector'),state);


 const d=state.drivetrain,w=state.wheels;
 display('drive-mode',visual.mode);display('carrier-speed',visual.carrierSpeed.toFixed(3)+' rad/s');display('rear-speeds',visual.rearSpeeds.map(w=>w.toFixed(3)).join(' / ')+' rad/s');display('outputs',visual.outputTorque.map(t=>t.toFixed(3)).join(' / ')+' Nm');display('difference',(visual.rearSpeeds[0]-visual.rearSpeeds[1]).toFixed(4)+' rad/s');display('power-residual',(d.powerResidual||0).toExponential(2)+' W');

 const p=state.planar;
 document.querySelector('#planar').textContent=`u ${p.u.toFixed(3)} m/s; lateral ${p.v.toFixed(3)} m/s; yaw ${(p.r*180/Math.PI).toFixed(2)} deg/s; heading ${(p.heading*180/Math.PI).toFixed(2)} deg; steer ${(p.steering*180/Math.PI).toFixed(2)} deg; sideslip ${(Math.atan2(p.v,Math.max(Math.abs(p.u),.01))*180/Math.PI).toFixed(2)} deg; world (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) m`;
 for(const c of state.wheels){const row=document.querySelector('#'+c.name);row.textContent=`${c.name} | ${c.omega.toFixed(2)} | ${(c.slip||0).toFixed(3)} | ${((c.alpha||0)*180/Math.PI).toFixed(2)} | ${c.fx.toFixed(2)} | ${(c.fy||0).toFixed(2)} | ${(c.normal??cornerForces(state,state.corners[c.axle]).normal/2).toFixed(2)} | ${((c.steering||0)*180/Math.PI).toFixed(2)}`;}
 document.querySelector('#speed').textContent=`${state.v.toFixed(3)} m/s`;
 document.querySelector('#position').textContent=`${state.x.toFixed(3)} m`;
 document.querySelector('#pitch').textContent=`${(state.pitch*180/Math.PI).toFixed(3)}°; rate ${state.pitchRate.toFixed(4)} rad/s; height ${state.z.toFixed(4)} m`;
 for(const [i,c] of state.corners.entries()) {const f=cornerForces(state,c);document.querySelector(i===0?'#front':'#rear').textContent=`ω ${c.omega.toFixed(3)} rad/s | slip ${(c.radius*c.omega-state.v).toFixed(3)} m/s | Fx ${c.fx.toFixed(2)} N | Nstage ${state.wheels.filter(w=>w.axle===i).reduce((n,w)=>n+(w.normal??0),0).toFixed(2)} N | terrain contact ${state.wheels.filter(w=>w.axle===i).some(w=>w.normal>0)} | drive ${c.drive.toFixed(1)} / brake ${c.brake.toFixed(1)} Nm`;}
}
function frame(now){
 try {
 const elapsed=(now-last)/1000;last=now;
 const held=new Set([...keys,...[...pointers.values()].map(b=>b.dataset.selector)]);
 const engagement=Number(document.querySelector('#engagement').value),motor=Number(document.querySelector('#drive').value);
 clock.frame(elapsed,h=>{state.flywheel.actuator??=createPressurePlate();state.flywheel.engagement=engagement;state.gearbox.driverForce=selectorInputForce(state.gearbox,held);stepVehicle(state,{drive:held.has('w')?motor:0,throttle:held.has('w')?1:0,starter:held.has('e'),serviceBrake:held.has('s')?1:0,handbrake:held.has(' ')?1:0,steer:(Number(held.has('a'))-Number(held.has('d')))*.4},h,document.querySelector('#record-contacts').checked?observatory:null);audio.update(state.gearbox);return state.gearbox;},()=>state,document.hidden||intentionalPause);
 if(clock.fault){clearInputs();document.querySelector('#warning').textContent=({ 'gear-event':'Unsupported non-flat gear transition',nonconvergence:'Solver nonconvergence','energy-check':'Physical consistency check',runtime:'Application error'}[clock.fault.kind]||'Simulation fault')+': '+clock.fault.message+' — Reset to restart.';}
 const start=performance.now();
 try{draw();if(now-lastDiagnostics>100){diagnostics();lastDiagnostics=now;}if(document.querySelector('#inspection').open)document.querySelector('#performance').textContent=JSON.stringify({status:clock.status,frameIntervalMs:elapsed*1000,rejected:clock.rejected,wall:clock.wall,simulated:clock.simulated,slowMotionWall:clock.dilated,pausedWall:clock.pausedWall,debt:clock.debt,physicsMs:clock.physicsMs,stepsThisFrame:clock.frameSteps,accepted:clock.accepted,convexIterationsIncludingTrials:clock.candidates,eventTrials:clock.searches,worstStepMs:clock.worstStepMs,renderMs},null,2);}catch(e){clock.fail(e,state);view3d?.dispose();view3d=undefined;document.querySelector('#view').value='top';selectView();}
 renderMs=performance.now()-start;
 }catch(e){clock.fail(e,state);clearInputs();document.querySelector('#warning').textContent=({ 'gear-event':'Unsupported non-flat gear transition',nonconvergence:'Solver nonconvergence','energy-check':'Physical consistency check',runtime:'Application error'}[clock.fault.kind]||'Simulation fault')+': '+clock.fault.message+' — Reset to restart.';}finally{requestAnimationFrame(frame);}
}
requestAnimationFrame(frame);

// Read-only diagnostic snapshot, also used to verify camera isolation.
export function simulationSnapshot(){return structuredClone(state);}

export function runtimeSnapshot(){const {now,...data}=clock;return {clock:structuredClone(data),keys:[...keys],pointers:pointers.size,renderMs};}

export function rendererInfo(){return view3d?.info();}
export function recreateRenderer(){view3d?.dispose();view3d=undefined;}

export function presentationSnapshot(){return view3d?.snapshot();}

export function observatorySnapshot(includeGeometry=false){return {stats:observatory.stats(),latest:structuredClone(observatory.latest),...(includeGeometry?{marks:observatory.marks.map(r=>structuredClone([...r.values()])),paths:observatory.paths.map(r=>structuredClone([...r.values()])),center:structuredClone([...observatory.center.values()])}:{})};}

function changeTerrain(parked=false){const result=regenerate(state,{preset:document.querySelector('#terrain').value,seed:42,amplitude:.001,roughness:.1},observatory,{mode:document.querySelector('#differential').value,worn:document.querySelector('#worn').checked});if(result.status.success){state=result.state;document.querySelector('#scenario').value=state.scenario;document.querySelector('#scenario').disabled=terrainSampler().settings.preset!=='flat';if(!isAutomobile())delete state.engine;if(parked){state.gearbox.q=.025;engageDogs(state,'1');state.flywheel.engagement=0;document.querySelector('#engagement').value=0;}recover();view3d?.dispose();view3d=undefined;}else document.querySelector('#warning').textContent='Terrain reset rejected: '+result.status.message;}
document.querySelector('#terrain').addEventListener('change',()=>changeTerrain(false));document.querySelector('#regenerate').addEventListener('click',()=>changeTerrain(false));

export function terrainSnapshot(x,y){return terrainSampler().sample(x,y);}

document.querySelector('#parked-first').addEventListener('click',()=>changeTerrain(true));
