import {visualState} from './visual-state.js';
import * as THREE from '../vendor/three.module.js';
import {OrbitControls} from '../vendor/OrbitControls.js';
import {roadAt} from './vehicle.js';

// Read-only visualization. Simulation axes are retained: x forward, y left, z up.
export function createView3D(canvas,resetButton){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));
 const scene=new THREE.Scene();scene.background=new THREE.Color('#18232e');
 const camera=new THREE.PerspectiveCamera(45,620/360,.05,150);camera.up.set(0,0,1);
 const controls=new OrbitControls(camera,canvas);controls.enablePan=false;controls.minDistance=2;controls.maxDistance=30;
 function resetCamera(){camera.position.set(-4,-5,3);controls.target.set(0,0,.5);controls.update();}
 document.querySelector('#focus-clutch').addEventListener('click',()=>{camera.position.set(1.4,-1.8,1.25);controls.target.set(.4,0,.6);controls.update();});
 resetButton.addEventListener('click',resetCamera);resetCamera();
 scene.add(new THREE.HemisphereLight(0xffffff,0x304050,2));
 const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(3,-4,7);scene.add(sun);
 const gold=new THREE.MeshStandardMaterial({color:0xdfb65d,roughness:.65});
 const dark=new THREE.MeshStandardMaterial({color:0x182129,roughness:1});
 const metal=new THREE.MeshStandardMaterial({color:0x9cabb8,metalness:.5,roughness:.4});
 const body=new THREE.Group(),chassis=new THREE.Mesh(new THREE.BoxGeometry(2.3,1,.18),gold.clone());body.add(chassis);scene.add(body);
 // White nose marks positive x, independent of camera orientation.
 const nose=new THREE.Mesh(new THREE.BoxGeometry(.12,.8,.02),metal);nose.position.set(1.05,0,.1);body.add(nose);
 const axle=new THREE.Group();
 const shaft=new THREE.Mesh(new THREE.BoxGeometry(.06,1.2,.06),metal);axle.add(shaft);
 const housing=new THREE.Mesh(new THREE.BoxGeometry(.24,.24,.20),gold);axle.add(housing);scene.add(axle);
 const driveline=new THREE.Group();scene.add(driveline);
 function cylinder(radius,length,color){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,24),new THREE.MeshStandardMaterial({color,roughness:.5}));mesh.rotation.z=-Math.PI/2;return mesh;}
 function disk(color){const group=new THREE.Group();const plate=cylinder(.21,.06,color);group.add(plate);const marker=new THREE.Mesh(new THREE.BoxGeometry(.07,.3,.035),metal);marker.position.z=.04;group.add(marker);driveline.add(group);return group;}
 const housingCage=cylinder(.27,.55,0x8293a1);housingCage.position.x=.5;housingCage.material.wireframe=true;housingCage.material.transparent=true;housingCage.material.opacity=.25;driveline.add(housingCage);
 const flywheel=disk(0xdfb65d),inputDisk=disk(0x55d6be),outputDisk=disk(0xe98042);
 const transmission=cylinder(.04,.7,0xb7c5ce);transmission.position.x=-.05;driveline.add(transmission);
 const propeller=cylinder(.035,.5,0x55d6be);propeller.position.x=-.65;driveline.add(propeller);
 const carrier=new THREE.Group();carrier.add(cylinder(.13,.23,0xdfb65d));const carrierMark=new THREE.Mesh(new THREE.BoxGeometry(.24,.025,.025),metal);carrierMark.position.z=.13;carrier.add(carrierMark);carrier.position.x=0;axle.add(carrier);
 const halfShafts=[1,-1].map(side=>{const g=new THREE.Group();const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.6,12),metal);g.add(shaft);const m=new THREE.Mesh(new THREE.BoxGeometry(.1,.3,.02),gold);g.add(m);g.position.set(0,side*.3,0);axle.add(g);return g;});
 const driveShaft=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:0x55d6be}));scene.add(driveShaft);
 const gearboxHousing=new THREE.Mesh(new THREE.BoxGeometry(.55,.65,.55),new THREE.MeshStandardMaterial({color:0x8293a1,transparent:true,opacity:.12,wireframe:true}));gearboxHousing.position.set(0,-.13,0);driveline.add(gearboxHousing);
 const pairs=[3.5,2].map((ratio,i)=>{
  const x=.13-i*.27,rin=i===0?.06:.09,rout=rin*ratio;
  const input=new THREE.Group(),output=new THREE.Group();
  input.add(cylinder(rin,.05,0x9cabb8));output.add(cylinder(rout,.05,0x9cabb8));
  for(const group of [input,output]){const marker=new THREE.Mesh(new THREE.BoxGeometry(.055,.08,.015),metal);marker.position.z=.04;group.add(marker);driveline.add(group);}
  input.position.set(x,0,0);output.position.set(x,-.27,0);
  const collar=new THREE.Mesh(new THREE.BoxGeometry(.08,.12,.12),new THREE.MeshStandardMaterial({color:0x55d6be}));collar.position.set(x,-.27,0);driveline.add(collar);
  return {input,output,collar,ratio};
 });
 const hubs=[],rotors=[],links=[];
 for(let i=0;i<4;i++){
  const hub=new THREE.Group(),rotor=new THREE.Group();hub.add(rotor);scene.add(hub);
  const tire=new THREE.Mesh(new THREE.CylinderGeometry(1,1,.22,24),dark);rotor.add(tire);
  const rim=new THREE.Mesh(new THREE.CylinderGeometry(.65,.65,.225,16),metal);rotor.add(rim);
  const spoke=new THREE.Mesh(new THREE.BoxGeometry(1.7,.235,.09),gold);rotor.add(spoke);
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:0xdfb65d}));scene.add(line);
  hubs.push(hub);rotors.push(rotor);links.push(line);
 }
 const geometry=new THREE.PlaneGeometry(40,40,160,20);
 const ground=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x30444b,side:THREE.DoubleSide,roughness:1}));scene.add(ground);
 const grid=new THREE.GridHelper(40,40,0x78919a,0x4a636d);grid.rotation.x=Math.PI/2;scene.add(grid);
 function draw(state){
  const width=canvas.clientWidth,height=canvas.clientHeight;
  if(canvas.width!==Math.round(width*renderer.getPixelRatio())||canvas.height!==Math.round(height*renderer.getPixelRatio())){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
  const v=visualState(state),mode=document.querySelector('#cutaway').value;
  body.visible=mode!=='driveline';chassis.material.transparent=mode==='xray';chassis.material.opacity=mode==='xray'?.18:1;chassis.material.depthWrite=mode!=='xray';
  const p=state.planar,co=Math.cos(p.heading),si=Math.sin(p.heading);
  driveline.position.set(0,0,state.z-.18);driveline.rotation.set(0,-state.pitch,p.heading,'ZYX');
  flywheel.position.x=.72;inputDisk.position.x=.45;outputDisk.position.x=.39-v.gap*.18;
  flywheel.rotation.x=v.engineAngle;inputDisk.rotation.x=v.engineAngle;outputDisk.rotation.x=v.shaftAngle;
  outputDisk.children[0].material.color.setHex(v.heating?0xee5522:v.state==='locked'?0x55d6be:0xe98042);
  pairs.forEach((pair,i)=>{pair.input.rotation.x=v.shaftAngle;pair.output.rotation.x=v.shaftAngle/pair.ratio;pair.collar.visible=v.gear===String(i+1);pair.output.children[0].material.color.setHex(pair.collar.visible?0x55d6be:0x657886);});
  transmission.rotation.x=v.shaftAngle;propeller.rotation.x=v.carrierAngle;carrier.rotation.x=v.carrierAngle;
  // Half-shaft axes are local y; each marker follows its actual rear rotor.
  halfShafts.forEach((shaft,i)=>shaft.rotation.y=v.rearAngles[i]);
  propeller.visible=false;
  const shaftPoints=driveShaft.geometry.attributes.position;
  shaftPoints.setXYZ(0,-.4*co,-.4*si,state.z-.18-.4*state.pitch);shaftPoints.setXYZ(1,-co,-si,state.corners[1].z);shaftPoints.needsUpdate=true;
  axle.position.set(-co,-si,state.corners[1].z);axle.rotation.z=p.heading;
  body.position.set(0,0,state.z);body.rotation.set(0,-state.pitch,p.heading,'ZYX');
  state.wheels.forEach((w,i)=>{
   const x=co*w.x-si*w.y,y=si*w.x+co*w.y,z=state.corners[w.axle].z;
   hubs[i].position.set(x,y,z);hubs[i].rotation.z=p.heading+(w.steering||0);
   rotors[i].scale.set(w.radius,1,w.radius);rotors[i].rotation.y=w.angle;
   const a=links[i].geometry.attributes.position;
   a.setXYZ(0,x,y,state.z+w.x*state.pitch);a.setXYZ(1,x,y,z);a.needsUpdate=true;
  });
  const offsetX=Math.floor(p.x),offsetY=Math.floor(p.y);
  ground.position.set(offsetX-p.x,offsetY-p.y,0);
  const vertices=geometry.attributes.position;
  for(let i=0;i<vertices.count;i++)vertices.setZ(i,roadAt(state,vertices.getX(i)+offsetX).height);
  vertices.needsUpdate=true;geometry.computeVertexNormals();
  grid.position.set(offsetX-p.x,offsetY-p.y,.002);
  controls.update();renderer.render(scene,camera);
 }
 return {draw,resetCamera};
}
