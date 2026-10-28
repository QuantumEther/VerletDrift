import {visualState} from './visual-state.js';
import * as THREE from '../vendor/three.module.js';
import {OrbitControls} from '../vendor/OrbitControls.js';
import {roadAt} from './vehicle.js';

// Read-only visualization. Simulation axes are retained: x forward, y left, z up.
export function createView3D(canvas,resetButton){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
 const scene=new THREE.Scene();scene.background=new THREE.Color('#131c23');scene.fog=new THREE.Fog(0x131c23,18,65);
 const camera=new THREE.PerspectiveCamera(45,620/360,.05,150);camera.up.set(0,0,1);
 const controls=new OrbitControls(camera,canvas);controls.enablePan=true;controls.minDistance=2;controls.maxDistance=30;
 const desiredPosition=new THREE.Vector3(-3.6,-4.2,2.5),desiredTarget=new THREE.Vector3(0,0,.5);let transitioning=false;
 function resetCamera(){desiredPosition.set(-3.6,-4.2,2.5);desiredTarget.set(0,0,.5);transitioning=true;}
 const focus=()=>{desiredPosition.set(1.15,-1.45,1.05);desiredTarget.set(.25,-.15,.55);transitioning=true;};
 const inspection=()=>{if(document.querySelector('#cutaway').value==='driveline')focus();else resetCamera();};
 document.querySelector('#focus-clutch').addEventListener('click',focus);document.querySelector('#cutaway').addEventListener('change',inspection);
 const stopTransition=()=>transitioning=false;controls.addEventListener('start',stopTransition);
 resetButton.addEventListener('click',resetCamera);camera.position.copy(desiredPosition);controls.target.copy(desiredTarget);controls.update();
 scene.add(new THREE.HemisphereLight(0xffffff,0x304050,2));
 const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(3,-4,7);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-5;sun.shadow.camera.right=5;sun.shadow.camera.top=5;sun.shadow.camera.bottom=-5;sun.shadow.normalBias=.03;scene.add(sun);
 const rimLight=new THREE.DirectionalLight(0xaac7df,2);rimLight.position.set(-4,3,4);scene.add(rimLight);
 const studio=new THREE.Scene();const studioGeo=new THREE.BoxGeometry(8,2,1),studioMat=new THREE.MeshBasicMaterial({color:0xffffff});
 for(const [x,y,z]of [[0,0,5],[-4,0,2],[4,0,2]]){const panel=new THREE.Mesh(studioGeo,studioMat);panel.position.set(x,y,z);studio.add(panel);}
 const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromScene(studio,.08);scene.environment=environment.texture;studioGeo.dispose();studioMat.dispose();pmrem.dispose();
 const gold=new THREE.MeshStandardMaterial({color:0xb79759,metalness:.85,roughness:.28});
 const dark=new THREE.MeshStandardMaterial({color:0x182129,roughness:1});
 const metal=new THREE.MeshStandardMaterial({color:0xb7c2c7,metalness:.95,roughness:.25});
 const body=new THREE.Group(),chassis=new THREE.Mesh(new THREE.BoxGeometry(2.3,1,.18),gold.clone());body.add(chassis);scene.add(body);
 const paint=new THREE.MeshStandardMaterial({color:0x233a3b,metalness:.55,roughness:.3});
 function block(parent,size,pos,material){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.position.set(...pos);parent.add(m);return m;}
 const exterior=new THREE.Group();body.add(exterior);
 block(exterior,[.85,.92,.28],[.55,0,.22],paint);block(exterior,[.35,1.08,.12],[1.12,0,.12],metal);
 for(const y of [-.48,.48]){block(exterior,[2.05,.09,.22],[0,y,.13],paint);block(exterior,[1.9,.055,.055],[0,y,.3],gold);}
 block(exterior,[.5,.85,.15],[-.7,0,.18],paint);block(exterior,[.08,.85,.35],[-.4,0,.25],paint);
 // White nose marks positive x, independent of camera orientation.
 const nose=new THREE.Mesh(new THREE.BoxGeometry(.12,.8,.02),metal);nose.position.set(1.05,0,.1);body.add(nose);
 const axle=new THREE.Group();
 const shaft=new THREE.Mesh(new THREE.BoxGeometry(.06,1.2,.06),metal);axle.add(shaft);
 const housing=new THREE.Mesh(new THREE.BoxGeometry(.24,.24,.20),gold.clone());axle.add(housing);scene.add(axle);
 const driveline=new THREE.Group();scene.add(driveline);
 const cylinderGeometries=new Map();
 function cylinder(radius,length,color){const key=radius+':'+length;if(!cylinderGeometries.has(key))cylinderGeometries.set(key,new THREE.CylinderGeometry(radius,radius,length,24));const mesh=new THREE.Mesh(cylinderGeometries.get(key),new THREE.MeshStandardMaterial({color,metalness:.9,roughness:.24}));mesh.rotation.z=-Math.PI/2;return mesh;}
 function disk(color){const group=new THREE.Group();const plate=cylinder(.21,.06,color);group.add(plate);const marker=new THREE.Mesh(new THREE.BoxGeometry(.07,.3,.035),metal);marker.position.z=.04;group.add(marker);driveline.add(group);return group;}
 const housingCage=cylinder(.27,.55,0x8293a1);housingCage.position.x=.5;housingCage.material.wireframe=true;housingCage.material.transparent=true;housingCage.material.opacity=.25;driveline.add(housingCage);
 const flywheel=disk(0xdfb65d),inputDisk=disk(0xabb6b9),outputDisk=disk(0x98694b);
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
 const sleeve=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.06,12),new THREE.MeshStandardMaterial({color:0x9cabb8}));sleeve.rotation.z=-Math.PI/2;driveline.add(sleeve);
 for(let i=0;i<6;i++){const tooth=new THREE.Mesh(new THREE.BoxGeometry(.04,.06,.04),metal);tooth.position.set(.12*Math.cos(i*Math.PI/3),.05,.12*Math.sin(i*Math.PI/3));sleeve.add(tooth);}
 const linkage=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:0xe8eef4}));driveline.add(linkage);
 for(const pair of pairs){for(let tooth=0;tooth<6;tooth++){const dog=new THREE.Mesh(new THREE.BoxGeometry(.045,.04,.04),metal);const angle=tooth*Math.PI/3;dog.position.set(.04,.12*Math.cos(angle),.12*Math.sin(angle));pair.output.add(dog);}}
 const fork=new THREE.Mesh(new THREE.TorusGeometry(.16,.025,8,32,Math.PI*1.5),gold);fork.rotation.y=Math.PI/2;driveline.add(fork);
 const toothGeometry=new THREE.BoxGeometry(.05,.035,.035);
 for(const pair of pairs)for(const gear of [pair.input,pair.output]){
  const radius=gear.children[0].geometry.parameters.radiusTop;
  for(let t=0;t<20;t++){const tooth=new THREE.Mesh(toothGeometry,metal);const angle=t*Math.PI/10;tooth.position.set(0,Math.cos(angle)*(radius+.01),Math.sin(angle)*(radius+.01));tooth.rotation.x=angle;gear.add(tooth);}
 }
 const housingPaint=new THREE.MeshStandardMaterial({color:0x626c69,metalness:.65,roughness:.65,transparent:true,opacity:.22});
 gearboxHousing.material.dispose();gearboxHousing.material=housingPaint;housingCage.material.wireframe=false;housingCage.material.opacity=.12;
 const shaftTube=new THREE.Mesh(new THREE.CylinderGeometry(.028,.028,1,16),metal);scene.add(shaftTube);const shaftDirection=new THREE.Vector3(),shaftAxis=new THREE.Vector3(0,1,0);
 const tireGeometry=new THREE.CylinderGeometry(1,1,.22,24),rimGeometry=new THREE.CylinderGeometry(.65,.65,.225,16),sidewallGeometry=new THREE.TorusGeometry(.83,.08,8,24),boltGeometry=new THREE.SphereGeometry(.055,8,6),spokeGeometry=new THREE.BoxGeometry(1.7,.235,.09);
 const hubs=[],rotors=[],links=[];
 for(let i=0;i<4;i++){
  const hub=new THREE.Group(),rotor=new THREE.Group();hub.add(rotor);scene.add(hub);
  const tire=new THREE.Mesh(tireGeometry,dark);rotor.add(tire);
  const rim=new THREE.Mesh(rimGeometry,metal);rotor.add(rim);
  for(const side of [-1,1]){const sidewall=new THREE.Mesh(sidewallGeometry,dark);sidewall.rotation.x=Math.PI/2;sidewall.position.y=side*.105;rotor.add(sidewall);}
  for(let bolt=0;bolt<6;bolt++){const stud=new THREE.Mesh(boltGeometry,gold);stud.position.set(Math.cos(bolt*Math.PI/3)*.35,.12,Math.sin(bolt*Math.PI/3)*.35);rotor.add(stud);}
  const spoke=new THREE.Mesh(spokeGeometry,gold);rotor.add(spoke);
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:0xdfb65d}));scene.add(line);
  hubs.push(hub);rotors.push(rotor);links.push(line);
 }
 const geometry=new THREE.PlaneGeometry(40,40,160,20);
 const ground=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x30444b,side:THREE.DoubleSide,roughness:1}));scene.add(ground);
 const grid=new THREE.GridHelper(40,40,0x78919a,0x4a636d);grid.rotation.x=Math.PI/2;scene.add(grid);
 scene.traverse(o=>{if(o.isMesh){o.castShadow=o===chassis||o===housing||(o.geometry.type==='CylinderGeometry'&&o.geometry.parameters.radiusTop>=.25);o.receiveShadow=true;}});ground.castShadow=false;
 const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),hits=[];
 const inspectables=[sleeve,flywheel.children[0],inputDisk.children[0],outputDisk.children[0],housing,...pairs.flatMap(p=>[p.input.children[0],p.output.children[0]])];let highlighted;
 const hover=e=>{if(highlighted)highlighted.material.emissive.setHex(0);highlighted=null;const rect=canvas.getBoundingClientRect();pointer.set(2*(e.clientX-rect.left)/rect.width-1,1-2*(e.clientY-rect.top)/rect.height);ray.setFromCamera(pointer,camera);hits.length=0;ray.intersectObjects(inspectables,false,hits);if(hits[0]){highlighted=hits[0].object;highlighted.material.emissive.setHex(0x30220d);}};
 const leave=()=>{if(highlighted)highlighted.material.emissive.setHex(0);highlighted=null;};canvas.addEventListener('pointermove',hover);canvas.addEventListener('pointerleave',leave);
 const geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
 let terrainKey='',disposed=false;
 function draw(state){
  if(disposed)throw new Error('Renderer disposed');
  const width=canvas.clientWidth,height=canvas.clientHeight;
  if(canvas.width!==Math.round(width*renderer.getPixelRatio())||canvas.height!==Math.round(height*renderer.getPixelRatio())){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
  const v=visualState(state),mode=document.querySelector('#cutaway').value;
  exterior.visible=mode==='normal';
  body.visible=mode!=='driveline';chassis.material.transparent=mode==='xray';chassis.material.opacity=mode==='xray'?.18:1;chassis.material.depthWrite=mode!=='xray';
  const p=state.planar,co=Math.cos(p.heading),si=Math.sin(p.heading);
  driveline.position.set(0,0,state.z-.18);driveline.rotation.set(0,-state.pitch,p.heading,'ZYX');
  flywheel.position.x=.72;inputDisk.position.x=.45;outputDisk.position.x=.39-v.gap*.18;
  flywheel.rotation.x=v.engineAngle;inputDisk.rotation.x=v.engineAngle;outputDisk.rotation.x=v.shaftAngle;
  outputDisk.children[0].material.color.setHex(v.heating?0xbb6037:v.state==='locked'?0xbda66b:0x98694b);
  fork.position.set(state.gearbox.q*5.3,-.27,0);
  sleeve.position.set(state.gearbox.q*5.3,-.27,0);sleeve.rotation.x=v.carrierAngle;
  const lever=linkage.geometry.attributes.position;lever.setXYZ(0,state.gearbox.q*5.3,-.27,.05);lever.setXYZ(1,state.gearbox.q*8,-.27,.5);lever.needsUpdate=true;
  sleeve.material.color.setHex(state.time-(state.gearbox.lastEventTime??-1)<.15&&(state.gearbox.lastEventEnergy||0)>.01?0xe98042:0x9cabb8);
  pairs.forEach((pair,i)=>{pair.input.rotation.x=v.shaftAngle;pair.output.rotation.x=v.shaftAngle/pair.ratio;pair.collar.visible=v.gear===String(i+1);pair.output.children[0].material.color.setHex(pair.collar.visible?0xbda66b:0x657886);});
  transmission.rotation.x=v.shaftAngle;propeller.rotation.x=v.carrierAngle;carrier.rotation.x=v.carrierAngle;
  // Half-shaft axes are local y; each marker follows its actual rear rotor.
  halfShafts.forEach((shaft,i)=>shaft.rotation.y=v.rearAngles[i]);
  propeller.visible=false;
  const shaftPoints=driveShaft.geometry.attributes.position;
  shaftPoints.setXYZ(0,-.4*co,-.4*si,state.z-.18-.4*state.pitch);shaftPoints.setXYZ(1,-co,-si,state.corners[1].z);shaftPoints.needsUpdate=true;
  shaftDirection.set(-co-(-.4*co),-si-(-.4*si),state.corners[1].z-(state.z-.18-.4*state.pitch));shaftTube.position.set(-.7*co,-.7*si,(state.corners[1].z+state.z-.18-.4*state.pitch)/2);shaftTube.scale.y=shaftDirection.length();shaftTube.quaternion.setFromUnitVectors(shaftAxis,shaftDirection.normalize());driveShaft.visible=false;
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
  const key=offsetX+':'+state.bump;
  if(key!==terrainKey){terrainKey=key;
  for(let i=0;i<vertices.count;i++)vertices.setZ(i,roadAt(state,vertices.getX(i)+offsetX).height);
  vertices.needsUpdate=true;geometry.computeVertexNormals();}
  grid.position.set(offsetX-p.x,offsetY-p.y,.002);
  if(transitioning){camera.position.lerp(desiredPosition,.12);controls.target.lerp(desiredTarget,.12);if(camera.position.distanceTo(desiredPosition)<.002)transitioning=false;}
  controls.update();renderer.render(scene,camera);
 }
 return {draw,resetCamera,info:()=>({geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,sceneGeometries:geometries.size,materials:materials.size}),dispose(){if(disposed)return;disposed=true;canvas.removeEventListener('pointermove',hover);canvas.removeEventListener('pointerleave',leave);document.querySelector('#focus-clutch').removeEventListener('click',focus);document.querySelector('#cutaway').removeEventListener('change',inspection);resetButton.removeEventListener('click',resetCamera);controls.removeEventListener('start',stopTransition);controls.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());sun.shadow.dispose();environment.dispose();renderer.dispose();}};
}
