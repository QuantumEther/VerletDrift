import * as THREE from '../vendor/three.module.js';
import {brakeActuation,BRAKE_MECHANISM} from './brakes.js';
import {createSteering} from './steering.js';
// Massless mechanism display. Shared state/geometry supplies every moving joint.
// No springs, solvers, or angle interpolation run inside the renderer.
export function createAutomobileView(scene,powertrain,hubs){
 const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,metalness:.75,roughness:.36,...extra});
 const brass=mat(0xba9858),steel=mat(0xaeb6b4),dark=mat(0x29372e),lining=mat(0x6b4d32),shell=mat(0x718078,{transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide});
 const circle=new THREE.CylinderGeometry(1,1,1,16),axis=new THREE.Vector3(0,1,0),zaxis=new THREE.Vector3(0,0,1);
 const group=(parent,pos=[0,0,0])=>{const o=new THREE.Group();o.position.set(...pos);parent.add(o);return o;};
 const mesh=(parent,g,m,pos=[0,0,0])=>{const o=new THREE.Mesh(g,m);o.position.set(...pos);parent.add(o);return o;};
 const box=(p,size,pos,m)=>mesh(p,new THREE.BoxGeometry(...size),m,pos);
 const cylinder=(p,r,l,pos,m)=>{const o=mesh(p,circle,m,pos);o.scale.set(r,l,r);return o;};
 const ring=(p,r,t,pos,m)=>mesh(p,new THREE.TorusGeometry(r,t,6,32),m,pos);
 const segment=(parent,r,material)=>{const m=mesh(parent,circle,material);m.userData.radius=r;return m;};
 const a=new THREE.Vector3(),b=new THREE.Vector3(),d=new THREE.Vector3();
 function connect(o,from,to){a.fromArray(from);b.fromArray(to);d.subVectors(b,a);o.position.copy(a).add(b).multiplyScalar(.5);o.scale.set(o.userData.radius,d.length(),o.userData.radius);o.quaternion.setFromUnitVectors(axis,d.normalize());}
 const engine=group(powertrain,[1.14,0,0]),crank=group(engine),housing=box(engine,[.32,.29,.29],[.02,0,.07],shell);
 const crankShaft=cylinder(crank,.024,.32,[0,0,0],steel);crankShaft.rotation.z=Math.PI/2;
 for(const x of [-.1,0,.1]){box(crank,[.025,.11,.018],[x,.035,.02],brass);const journal=cylinder(crank,.018,.035,[x,.07,.04],steel);journal.rotation.z=Math.PI/2;}
 const carb=group(engine,[.02,0,.25]);cylinder(carb,.045,.10,[0,0,0],brass);const butterfly=box(carb,[.075,.005,.075],[0,0,0],steel);
 const throttleArm=segment(carb,.007,brass);
 const starter=group(engine,[-.20,-.23625,0]);const motor=cylinder(starter,.042,.12,[0,0,0],dark);motor.rotation.z=Math.PI/2;const starterRotor=group(starter);box(starterRotor,[.06,.006,.04],[.04,0,0],brass);
 const pinion=cylinder(starterRotor,.02625,.025,[.085,0,0],steel);pinion.rotation.z=Math.PI/2;
 const chassis=group(scene),pedal=group(chassis,[-.25,.18,-.105]);const pedalPivot=cylinder(pedal,.014,.09,[0,0,0],steel);const pedalArm=box(pedal,[.018,.025,.22],[0,0,.1],brass);box(pedal,[.09,.065,.016],[0,0,.22],dark);
 const master=group(chassis,[-.05,.18,-.05]);const masterBody=cylinder(master,.032,.16,[0,0,0],brass);masterBody.rotation.z=Math.PI/2;const masterPiston=box(master,[.07,.012,.012],[-.09,0,0],steel);
 const pedalRod=segment(chassis,.006,steel);
 const hand=group(chassis,[-.45,-.15,.03]);cylinder(hand,.014,.09,[0,0,0],steel);box(hand,[.02,.025,.25],[0,0,.12],steel);ring(hand,.025,.009,[0,0,.27],brass);const cableSpool=ring(hand,.03,.006,[0,0,0],brass);cableSpool.rotation.x=Math.PI/2;
 const equalizer=group(chassis,[-.75,0,-.12]);box(equalizer,[.025,.19,.025],[0,0,0],brass);
 const handCable=segment(chassis,.004,steel),hydraulicLines=hubs.map(()=>segment(scene,.0035,brass)),rearCables=[segment(scene,.004,steel),segment(scene,.004,steel)];
 const coilPoints=Array.from({length:65},(_,i)=>new THREE.Vector3(Math.cos(i/64*12*Math.PI),i/64,Math.sin(i/64*12*Math.PI)));
 const coilGeometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPoints),64,.12,4,false);
 const brakeAssemblies=[],drums=[],shoes=[],shoeMaterials=[],returnSprings=[],cylinders=[];
 hubs.forEach((hub,i)=>{
  const assembly=group(hub);brakeAssemblies.push(assembly);
  const backing=cylinder(assembly,.14,.008,[0,(i%2===0?-1:1)*.025,0],dark);
  const drum=group(assembly);const wall=ring(drum,.128,.007,[0,0,0],shell);wall.rotation.x=Math.PI/2;
  const mark=box(drum,[.08,.008,.008],[.065,-.015,0],brass);drums.push(drum);
  const padMat=lining.clone();shoeMaterials.push(padMat);
  const pair=[-1,1].map(side=>{const shoe=group(assembly);const arc=mesh(shoe,new THREE.TorusGeometry(.117,.008,5,24,Math.PI*.76),padMat);arc.rotation.x=Math.PI/2;arc.rotation.z=side===1?-.38:Math.PI-.38;return shoe;});shoes.push(pair);
  const wheelCylinder=cylinder(assembly,.014,.085,[0,0,.085],brass);wheelCylinder.rotation.z=Math.PI/2;const pistons=[-1,1].map(side=>box(assembly,[.016,.01,.012],[side*.05,0,.085],steel));cylinders.push(pistons);
  const springs=[-.067,.067].map(z=>{const spring=mesh(assembly,coilGeometry,steel);spring.userData.radius=.004;connect(spring,[-.055,0,z],[.055,0,z]);return spring;});returnSprings.push(springs);
 });
 const steering=group(scene),wheel=group(steering,[-.35,.25,.55]);
 const columnEnd=[-.35,.25,.55],boxPoint=[.65,-.15,0];
 const direction=new THREE.Vector3(...columnEnd).sub(new THREE.Vector3(...boxPoint)).normalize();
 const columnSupport=group(wheel);columnSupport.quaternion.setFromUnitVectors(zaxis,direction);
 const wheelRotor=group(columnSupport);ring(wheelRotor,.15,.009,[0,0,0],brass);for(const angle of [0,2*Math.PI/3,4*Math.PI/3]){const spoke=box(wheelRotor,[.15,.008,.008],[.075*Math.cos(angle),.075*Math.sin(angle),0],steel);spoke.rotation.z=angle;}
 const wormPoint=[boxPoint[0],boxPoint[1]-.072,0];
 const column=segment(steering,.012,steel);connect(column,wormPoint,columnEnd);
 const steeringBox=box(steering,[.12,.10,.12],boxPoint,shell);
 const worm=group(steering,wormPoint);const wormBody=cylinder(worm,.016,.10,[0,0,0],steel);wormBody.rotation.z=Math.PI/2;
 // Left-hand worm: positive input advances the sector at its -Y contact.
 const helix=Array.from({length:97},(_,i)=>{const t=i/96,phase=-t*.09/.01414*2*Math.PI;return new THREE.Vector3(-.045+t*.09,.018*Math.cos(phase),.018*Math.sin(phase));});
 mesh(worm,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix),96,.0025,4,false),brass);
 const sector=group(steering,boxPoint),sectorArc=mesh(sector,new THREE.TorusGeometry(.054,.004,6,24,Math.PI/2),brass);sectorArc.rotation.z=-Math.PI*.75;
 for(let i=-3;i<=3;i++){const a=-Math.PI/2+i*Math.PI/12,tooth=box(sector,[.012,.007,.022],[.054*Math.cos(a),.054*Math.sin(a),0],brass);tooth.rotation.z=a;}
 // Ideal articulated input at the box: no universal-joint inertia or cyclic
 // speed ripple is claimed by this planar position-controlled mechanism.
 mesh(steering,new THREE.SphereGeometry(.023,10,6),steel,wormPoint);
 const pitman=segment(steering,.012,brass),drag=segment(steering,.009,steel),tie=segment(steering,.009,steel),arms=[segment(steering,.014,brass),segment(steering,.014,brass)];
 const kingpins=[cylinder(steering,.018,.14,[1,.6,0],steel),cylinder(steering,.018,.14,[1,-.6,0],steel)];kingpins.forEach(k=>k.rotation.x=Math.PI/2);
 let mapping;
 const point=new THREE.Vector3(),world=(object,xyz)=>{point.fromArray(xyz);object.localToWorld(point);return point.toArray();};
 function draw(s,mode){
  const e=s.engine,br=s.brakes||brakeActuation(),st=s.steering||createSteering(s.wheelbase,s.track),p=s.planar;
  crank.rotation.x=s.flywheel.angle;butterfly.rotation.y=(e?.throttleOpening||0)*Math.PI/2;
  connect(throttleArm,[0,.06,0],[.04*Math.sin(butterfly.rotation.y),.06,.04*Math.cos(butterfly.rotation.y)]);
  starterRotor.rotation.x=-(e?.starterAngle||0);starterRotor.position.x=e?.starterTorque>0?-.04:0;
  chassis.position.set(0,0,s.z);chassis.rotation.set(0,-s.pitch,p.heading,'ZYX');pedal.rotation.y=br.pedalTravel/.22;masterPiston.position.x=-.09+br.masterTravel;hand.rotation.y=-br.handAngle;
  connect(pedalRod,[-.25+.055*Math.sin(pedal.rotation.y),.18,-.105+.055*Math.cos(pedal.rotation.y)],[-.14+br.masterTravel,.18,-.05]);
  connect(handCable,[-.45,-.15,0],[-.75+br.cableTravel,0,-.12]);equalizer.position.x=-.75+br.cableTravel;
  steering.position.z=s.corners[0].z+.14;steering.rotation.z=p.heading;
  wheelRotor.rotation.z=st.wheelAngle;worm.rotation.x=st.wheelAngle;column.rotateY(st.wheelAngle-(column.userData.lastAngle||0));column.userData.lastAngle=st.wheelAngle;sector.rotation.z=st.boxAngle;
  const flat=p=>[p[0],p[1],0];connect(pitman,flat(st.box),flat(st.tip));connect(drag,flat(st.tip),flat(st.leftEnd));connect(tie,flat(st.leftEnd),flat(st.rightEnd));connect(arms[0],flat(st.leftPin),flat(st.leftEnd));connect(arms[1],flat(st.rightPin),flat(st.rightEnd));
  kingpins.forEach((pin,i)=>pin.position.set(...flat(i?st.rightPin:st.leftPin)));
  chassis.updateMatrixWorld(true);hubs.forEach(h=>h.updateMatrixWorld(true));
  s.wheels.forEach((w,i)=>{
   // These internals lie wholly behind the opaque wheel rim in vehicle views.
   // Expose the SAME assembly when its wheel artwork is sectioned for inspection.
   brakeAssemblies[i].visible=(mode==='brakes'&&i===0)||(mode==='handbrake'&&i===2);
   const bw=br.wheels[i],travel=bw.shoeTravel;drums[i].rotation.y=w.angle;shoes[i][0].position.x=-travel;shoes[i][1].position.x=travel;shoeMaterials[i].emissive.setHex(bw.normalPerShoe>0?0x302010:0);cylinders[i][0].position.x=-.05-travel;cylinders[i][1].position.x=.05+travel;
   for(const [j,z]of [-.067,.067].entries())connect(returnSprings[i][j],[-.055-travel,0,z],[.055+travel,0,z]);
   connect(hydraulicLines[i],world(chassis,[-.05,.18,-.05]),world(hubs[i],[0,0,.085]));if(i>=2)connect(rearCables[i-2],world(chassis,[-.75+br.cableTravel,(i===2?1:-1)*.08,-.12]),world(hubs[i],[0,0,-.06]));
  });
  // Existing exploded bench remains readable; new vehicle-mounted mechanisms
  // are inspected separately, not stretched across the gearbox exploded offsets.
  const bench=['clutch','driveline','exploded','engine'].includes(mode);
  steering.visible=!!s.steering&&!bench;chassis.visible=!bench;hydraulicLines.forEach(o=>o.visible=!bench);rearCables.forEach(o=>o.visible=!bench);engine.visible=!!e&&!['clutch','driveline','exploded'].includes(mode);
  const handCableEnd=new THREE.Vector3(0,.5,0).multiply(handCable.scale).applyQuaternion(handCable.quaternion).add(handCable.position).toArray();
  mapping={handCableEnd,equalizerPosition:equalizer.position.toArray(),engineAvailable:!!e,steeringAvailable:!!s.steering,brakeMechanismAvailable:!!s.brakes,engineAngle:crank.rotation.x,throttleAngle:butterfly.rotation.y,starterAngle:starterRotor.rotation.x,starterEngaged:starterRotor.position.x<0,
   drumAngles:drums.map(d=>d.rotation.y),shoeTravel:shoes.map(p=>p[1].position.x),pedalAngle:pedal.rotation.y,masterTravel:masterPiston.position.x+.09,handAngle:-hand.rotation.y,
   cableTravel:br.cableTravel,cableTension:br.cableTension,columnAngle:wheelRotor.rotation.z,sectorAngle:sector.rotation.z,
   tieLength:tie.scale.y,dragLength:drag.scale.y,frontAngles:[st.leftAngle,st.rightAngle],steeringHeight:steering.position.z};
 }
 return {draw,snapshot:()=>structuredClone(mapping)};
}
