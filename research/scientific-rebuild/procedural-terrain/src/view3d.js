import {terrainSampler} from './application-vehicle.js';
import {createTrackView} from './track-view.js';
import {createAutomobileView} from './automobile-view.js';
import * as THREE from '../../tire-road-observatory-prototype/vendor/three.module.js';
import {OrbitControls} from '../../tire-road-observatory-prototype/vendor/OrbitControls.js';
import {roadAt} from './application-vehicle.js';
import {GEOMETRY} from './gearbox.js';
import {mechanicalPresentation,AXIS_DISTANCE,PRIMARY,GEAR_PAIRS,DOG_RADIUS,DOG_FACE,SLEEVE_HALF} from './mechanical-layout.js';
import {gearGeometry,dogGeometry} from './mechanical-geometry.js';

// All dimensions below belong to the exhibit. The scene never writes physics.
export const CAMERA_PRESETS={
 engine:{position:[1.8,-1.15,1.5],target:[1.13,0,.78]},
 brakes:{position:[1.35,1.35,.65],target:[1,.6,.32]},
 handbrake:{position:[-1.9,-1.4,1.1],target:[-.75,0,.48]},
 column:{position:[-.9,1.2,1.25],target:[-.15,.15,.8]},
 steeringbox:{position:[.9,-.95,.9],target:[.65,-.15,.46]},
 linkage:{position:[1.4,-1.6,1.4],target:[.85,0,.45]},
 contact:{position:[1.55,.95,.35],target:[1,.6,.07]},
 road:{position:[-6,-7,8],target:[0,0,0]},
 normal:{position:[-2.8,-3.5,2.45],target:[0,0,.65]},
 driver:{position:[-3.8,-.8,1.65],target:[.7,0,.65]},
 xray:{position:[2.7,-3.2,2.7],target:[0,0,.6]},
 driveline:{position:[.65,1.7,1.65],target:[.04,.13,.65]},
 clutch:{position:[.75,-1.3,1.35],target:[.92,0,.65]},
 exploded:{position:[1.8,-2,2],target:[.4,.25,.75]}
};
export function createView3D(canvas,resetButton) {
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#101715');scene.fog=new THREE.Fog(0x101715,16,60);
 const camera=new THREE.PerspectiveCamera(40,1,.025,100);camera.up.set(0,0,1);
 const controls=new OrbitControls(camera,canvas);controls.enablePan=true;controls.minDistance=.35;controls.maxDistance=15;controls.maxPolarAngle=Math.PI*.49;
 const desiredPosition=new THREE.Vector3(),desiredTarget=new THREE.Vector3();let transitioning=false,mode='normal',disposed=false,lastState,lastObservatory;
 const setCamera=()=>{const preset=CAMERA_PRESETS[mode]||CAMERA_PRESETS.normal;desiredPosition.fromArray(preset.position);desiredTarget.fromArray(preset.target);
  if(lastState&&['brakes','handbrake','column','steeringbox','linkage','contact'].includes(mode)){
   const s=lastState,angle=s.planar.heading,co=Math.cos(angle),si=Math.sin(angle),offset=desiredPosition.clone().sub(desiredTarget);
   const points={brakes:[s.wheels[0].x,s.wheels[0].y,s.corners[0].z],contact:[s.wheels[0].x,s.wheels[0].y,.04],handbrake:[-.65,0,s.z-.04],column:[-.35,.25,s.corners[0].z+.69],steeringbox:[.65,-.15,s.corners[0].z+.14],linkage:[.85,0,s.corners[0].z+.14]};
   const [x,y,z]=points[mode];desiredTarget.set(co*x-si*y,si*x+co*y,z);desiredPosition.set(co*offset.x-si*offset.y,si*offset.x+co*offset.y,offset.z).add(desiredTarget);
  }
  if(mode==='road'&&lastState&&lastObservatory){let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;for(const ring of lastObservatory.marks)for(const m of ring.values())for(const p of [m.a,m.b]){xmin=Math.min(xmin,p.x);xmax=Math.max(xmax,p.x);ymin=Math.min(ymin,p.y);ymax=Math.max(ymax,p.y);}if(Number.isFinite(xmin)){const offset=desiredPosition.clone().sub(desiredTarget);desiredTarget.set((xmin+xmax)/2-lastState.planar.x,(ymin+ymax)/2-lastState.planar.y,0);desiredPosition.copy(desiredTarget).add(offset);}}
  transitioning=true;};
 function resetCamera(){setCamera();}
 const cutaway=document.querySelector('#cutaway'),focusButton=document.querySelector('#focus-clutch');
 const choose=()=>{mode=cutaway.value;setCamera();};
 const focus=()=>{cutaway.value='clutch';cutaway.dispatchEvent(new Event('change'));};
 cutaway.addEventListener('change',choose);focusButton.addEventListener('click',focus);resetButton.addEventListener('click',resetCamera);
 const stop=()=>transitioning=false;controls.addEventListener('start',stop);choose();camera.position.copy(desiredPosition);controls.target.copy(desiredTarget);controls.update();
 scene.add(new THREE.HemisphereLight(0xffeed5,0x36483d,2));
 const sun=new THREE.DirectionalLight(0xffebd0,3);sun.position.set(3,-4,7);sun.castShadow=true;sun.shadow.mapSize.set(512,512);Object.assign(sun.shadow.camera,{left:-4,right:4,top:4,bottom:-4});sun.shadow.normalBias=.015;scene.add(sun);
 const rim=new THREE.DirectionalLight(0xc1d5dd,2);rim.position.set(-3,3,4);scene.add(rim);
 const studio=new THREE.Scene(),panelGeo=new THREE.BoxGeometry(7,2,.2),panelMat=new THREE.MeshBasicMaterial({color:0xffffff});
 for(const p of [[0,0,5],[-4,0,2],[3,2,3]]){const panel=new THREE.Mesh(panelGeo,panelMat);panel.position.set(...p);studio.add(panel);}
 studio.background=new THREE.Color(0x5c625c);
 const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromScene(studio,.12);scene.environment=environment.texture;pmrem.dispose();panelGeo.dispose();panelMat.dispose();
 const material=(color,metalness,roughness,extra={})=>new THREE.MeshStandardMaterial({color,metalness,roughness,...extra});
 const steel=material(0xaaaead,.88,.29),chrome=material(0xd5dad7,.95,.18),brass=material(0xb79454,.83,.33),cast=material(0x414b46,.65,.7),rubber=material(0x191c19,.05,.95),friction=material(0x554b39,.1,.95),paint=material(0x294c37,.55,.3);
 const gearBody=material(0x58615c,.85,.4),free=material(0x8a9290,.85,.3),engaged=material(0xd5b87b,.85,.29),shock=material(0xb77647,.65,.3,{emissive:0x351409});
 const glass=material(0x9eb7ab,.1,.14,{transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide});
 const housingMat=material(0x5b6258,.65,.58,{transparent:true,opacity:.16,depthWrite:false,side:THREE.DoubleSide});
 const boxes=new Map(),cylinders=new Map();
 function mesh(parent,geometry,mat,pos=[0,0,0]){const m=new THREE.Mesh(geometry,mat);m.position.set(...pos);parent.add(m);return m;}
 function box(parent,size,pos,mat){const k=size.join();if(!boxes.has(k))boxes.set(k,new THREE.BoxGeometry(...size));return mesh(parent,boxes.get(k),mat,pos);}
 function cyl(parent,r,length,pos,mat,axis='x'){
  const k=[r,length].join();if(!cylinders.has(k))cylinders.set(k,new THREE.CylinderGeometry(r,r,length,32));const m=mesh(parent,cylinders.get(k),mat,pos);
  if(axis==='x')m.rotation.z=-Math.PI/2;if(axis==='z')m.rotation.x=Math.PI/2;return m;
 }
 function ring(parent,r,t,pos,mat,axis='x'){const m=mesh(parent,new THREE.TorusGeometry(r,t,8,40),mat,pos);if(axis==='x')m.rotation.y=Math.PI/2;if(axis==='y')m.rotation.x=Math.PI/2;return m;}
 function group(parent,pos=[0,0,0]){const g=new THREE.Group();g.position.set(...pos);parent.add(g);return g;}
 function instanced(parent,geometry,mat,transforms){const m=new THREE.InstancedMesh(geometry,mat,transforms.length),o=new THREE.Object3D();transforms.forEach((fn,i)=>{o.position.set(0,0,0);o.rotation.set(0,0,0);o.scale.set(1,1,1);fn(o,i);o.updateMatrix();m.setMatrixAt(i,o.matrix);});parent.add(m);return m;}
 const body=group(scene),exterior=group(body),frame=group(body);
 for(const y of [-.38,.38])box(frame,[2.6,.075,.12],[0,y,-.1],cast);
 for(const x of [-.85,.25,.9])box(frame,[.08,.84,.08],[x,0,-.1],steel);
 function coachPanel(size,pos,mat){
  const [a,b,c]=size,r=.06,shape=new THREE.Shape();shape.moveTo(-a/2+r,-b/2);shape.lineTo(a/2-r,-b/2);shape.quadraticCurveTo(a/2,-b/2,a/2,-b/2+r);shape.lineTo(a/2,b/2-r);shape.quadraticCurveTo(a/2,b/2,a/2-r,b/2);shape.lineTo(-a/2+r,b/2);shape.quadraticCurveTo(-a/2,b/2,-a/2,b/2-r);shape.lineTo(-a/2,-b/2+r);shape.quadraticCurveTo(-a/2,-b/2,-a/2+r,-b/2);
  const g=new THREE.ExtrudeGeometry(shape,{depth:c-.04,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.02,bevelThickness:.02,curveSegments:4});g.translate(0,0,-c/2+.02);return mesh(exterior,g,mat,pos);
 }
 coachPanel([.94,.74,.30],[.65,0,.12],paint);coachPanel([.42,.8,.21],[-.85,0,.1],paint);
 for(const side of [-1,1])instanced(exterior,new THREE.BoxGeometry(.012,.012,.15),cast,Array.from({length:9},(_,i)=>o=>o.position.set(.46+i*.055,side*.387,.12)));
 box(exterior,[.1,.78,.4],[-.25,0,.16],paint);box(exterior,[.5,.6,.07],[-.48,0,.04],friction);
 const windscreen=box(exterior,[.025,.78,.28],[.13,0,.39],glass);windscreen.rotation.y=-.18;
 for(const y of [-.43,.43]){box(exterior,[2.45,.055,.11],[0,y,-.02],paint);box(exterior,[2.3,.02,.025],[0,y,.04],brass);}
 box(exterior,[.09,.72,.38],[1.17,0,.1],chrome);box(exterior,[.1,.65,.3],[1.22,0,.1],cast);
 instanced(exterior,new THREE.BoxGeometry(.015,.014,.27),chrome,Array.from({length:15},(_,i)=>o=>o.position.set(1.28,(i-7)*.039,.1)));
 for(const y of [-.4,.4])cyl(exterior,.095,.1,[1.15,y,.16],chrome);
 const archShape=new THREE.Shape();archShape.absarc(0,0,.39,0,Math.PI,false);archShape.absarc(0,0,.35,Math.PI,0,true);archShape.closePath();
 const archGeometry=new THREE.ExtrudeGeometry(archShape,{depth:.22,bevelEnabled:false,curveSegments:24});archGeometry.translate(0,0,-.11);archGeometry.rotateX(Math.PI/2);
 for(const x of [-1,1])for(const y of [-.59,.59])mesh(exterior,archGeometry,paint,[x,y,-.44]);
 const powertrain=group(scene),clutch=group(powertrain),gearbox=group(powertrain),lay=group(gearbox,[0,AXIS_DISTANCE,0]);
 const engine=group(clutch,[.985,0,0]),disc=group(clutch,[.94,0,0]),pressure=group(clutch,[.88,0,0]);
 cyl(engine,.235,.065,[0,0,0],steel);ring(engine,.21,.01,[.035,0,0],chrome);
 cyl(disc,.19,.024,[0,0,0],friction);cyl(disc,.07,.038,[0,0,0],steel);
 cyl(pressure,.218,.04,[0,0,0],steel);ring(pressure,.18,.012,[-.026,0,0],chrome);
 const boltsGeo=new THREE.SphereGeometry(.013,6,4);
 for(const rotor of [engine,pressure])instanced(rotor,boltsGeo,brass,Array.from({length:8},(_,i)=>o=>o.position.set(-.04,.15*Math.cos(i*Math.PI/4),.15*Math.sin(i*Math.PI/4))));
 instanced(pressure,new THREE.BoxGeometry(.025,.11,.012),chrome,Array.from({length:12},(_,i)=>o=>{const a=i*Math.PI/6;o.position.set(-.035,.1*Math.cos(a),.1*Math.sin(a));o.rotation.x=a;}));
 const bell=group(clutch);cyl(bell,.27,.30,[.97,0,0],housingMat);
 const input=group(gearbox);cyl(input,.026,.48,[.80,0,0],steel);
 instanced(input,new THREE.BoxGeometry(.22,.009,.009),chrome,Array.from({length:12},(_,i)=>o=>{const a=i*Math.PI/6;o.position.set(.87,.029*Math.cos(a),.029*Math.sin(a));o.rotation.x=a;}));
 const output=group(gearbox);cyl(output,.026,.99,[-.16,0,0],steel);
 const layshaft=group(lay);cyl(layshaft,.024,1.04,[.13,0,0],steel);
 const gearCache=new Map();
 function gear(parent,teeth,pos){if(!gearCache.has(teeth))gearCache.set(teeth,gearGeometry(teeth));const g=group(parent,pos);const teethMesh=mesh(g,gearCache.get(teeth),[gearBody,chrome]);cyl(g,teeth*.008/2*.72,.058,[0,0,0],gearBody);cyl(g,.039,.074,[0,0,0],chrome);return {node:g,teeth:teethMesh};}
 gear(input,PRIMARY.teeth,[PRIMARY.x,0,0]);
 gear(layshaft,PRIMARY.teeth,[PRIMARY.x,0,0]);
 const sleeve=group(gearbox);cyl(sleeve,.087,.1,[0,0,0],steel);ring(sleeve,.088,.006,[0,0,0],chrome);
 // Sleeve dogs fit the source's angular openings. Gear dogs occupy the rest of
 // each 60-degree period; phase=0 aligns sleeve teeth with the open windows.
 const period=2*Math.PI/GEOMETRY.teeth,dogWidth=GEOMETRY.gap*.5;
 const sleeveDog=dogGeometry(DOG_RADIUS-.013,DOG_RADIUS+.013,dogWidth,.035);
 const gearDog=dogGeometry(DOG_RADIUS-.013,DOG_RADIUS+.013,period-GEOMETRY.gap-dogWidth,.1125);
 for(const side of [-1,1])instanced(sleeve,sleeveDog,chrome,Array.from({length:6},(_,i)=>o=>{o.position.x=side*(SLEEVE_HALF-.0175);o.rotation.x=i*period;}));
 const pairs=GEAR_PAIRS.map(p=>{
  const driven=gear(gearbox,p.drivenTeeth,[p.x,0,0]),driver=gear(layshaft,p.driverTeeth,[p.x,0,0]),dogs=group(gearbox,[Math.sign(p.x)*(DOG_FACE+.05625),0,0]);
  instanced(dogs,gearDog,chrome,Array.from({length:6},(_,i)=>o=>{o.rotation.x=(i+.5)*period;}));
  // Bronze bushing makes the free gear / output shaft separation legible.
  ring(driven.node,.046,.005,[0,0,0],brass);return {driven,driver,dogs};
 });
 const fork=group(gearbox);ring(fork,.109,.013,[0,0,0],brass);box(fork,[.035,.027,.16],[0,0,.18],brass);cyl(gearbox,.013,.8,[0,0,.26],steel);
 const lever=group(fork);box(lever,[.022,.024,.16],[0,0,.34],steel);cyl(lever,.035,.06,[0,0,.43],brass,'z');
 const casing=group(gearbox);box(casing,[1.06,.64,.54],[.12,.14,-.015],housingMat);
 for(const x of [-.39,.66])for(const y of [0,AXIS_DISTANCE]){ring(gearbox,.046,.012,[x,y,0],chrome);box(gearbox,[.045,.10,.08],[x,y,-.075],cast);}
 const axle=group(scene),carrier=group(axle),halfShafts=[];
 cyl(axle,.155,.31,[0,0,0],housingMat,'y');cyl(carrier,.12,.24,[0,0,0],brass,'y');
 for(const side of [-1,1]){const shaft=group(axle);cyl(shaft,.028,.58,[0,side*.30,0],steel,'y');cyl(shaft,.078,.04,[0,side*.13,0],chrome,'y');box(shaft,[.015,.035,.14],[0,side*.15,0],brass);halfShafts.push(shaft);}
 ring(carrier,.135,.016,[0,0,0],chrome,'y');box(carrier,[.2,.025,.025],[0,0,.1],steel);
 const shaftTube=cyl(scene,.025,1,[0,0,0],steel,'y'),shaftAxis=new THREE.Vector3(0,1,0),dir=new THREE.Vector3(),start=new THREE.Vector3(),end=new THREE.Vector3();
 box(shaftTube,[.005,.9,.005],[.025,0,0],brass);
 const hubs=[],rotors=[],springs=[],dampers=[];
 const tireGeo=new THREE.CylinderGeometry(1,1,.22,48),rimGeo=new THREE.CylinderGeometry(.67,.67,.226,32),treadGeo=new THREE.BoxGeometry(.045,.21,.012);
 const springPoints=Array.from({length:97},(_,i)=>{const t=i/96,a=t*12*Math.PI;return new THREE.Vector3(.035*Math.cos(a),.035*Math.sin(a),t);});
 const springGeo=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(springPoints),96,.006,5,false);
 for(let i=0;i<4;i++){
  const hub=group(scene),rotor=group(hub);mesh(rotor,tireGeo,rubber);mesh(rotor,rimGeo,cast);
  instanced(rotor,treadGeo,rubber,Array.from({length:48},(_,j)=>o=>{const a=j*Math.PI/24;o.position.set(Math.cos(a),0,Math.sin(a));o.rotation.y=-a+Math.PI/2;}));
  for(const side of [-1,1]){ring(rotor,.82,.025,[0,side*.113,0],rubber,'y');ring(rotor,.62,.035,[0,side*.12,0],chrome,'y');
   instanced(rotor,new THREE.BoxGeometry(1.22,.014,.025),chrome,Array.from({length:12},(_,j)=>o=>{o.position.y=side*.118;o.rotation.y=j*Math.PI/12;}));
  }
  cyl(rotor,.17,.25,[0,0,0],brass,'y');hubs.push(hub);rotors.push(rotor);springs.push(mesh(scene,springGeo,brass));dampers.push(cyl(scene,.017,1,[0,0,0],chrome,'z'));
 }
 const automobile=createAutomobileView(scene,powertrain,hubs);
 const arrows=Array.from({length:4},()=>[0xbba575,0xa5b6b2].map(color=>{const a=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(),1,color,.05,.025);scene.add(a);return a;}));
 const tracks=createTrackView(scene);
 const groundGeo=new THREE.PlaneGeometry(40,40,160,20),ground=mesh(scene,groundGeo,material(0x303a32,.05,1));ground.receiveShadow=true;ground.material.vertexColors=true;ground.material.color.set(0xffffff);groundGeo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(groundGeo.attributes.position.count*3),3));
 const grid=new THREE.GridHelper(40,40,0x7b7961,0x485146);grid.rotation.x=Math.PI/2;scene.add(grid);
 // Silhouette casters only. Rim spokes, tread instances, lamps and trim do not
 // need separate shadow passes; the solid tire and coachwork already occlude them.
 exterior.traverse(o=>{if(o.isMesh){const p=o.geometry.parameters||{};o.castShadow=o.geometry.type==='ExtrudeGeometry'||(p.width*p.height*p.depth>.015);o.receiveShadow=true;}});
 hubs.forEach(h=>h.traverse(o=>{if(o.isMesh)o.castShadow=o.geometry===tireGeo;}));
 const inspectables=[{object:engine,name:'Flywheel · engine angle'},{object:disc,name:'Friction disc · input shaft'},{object:sleeve,name:'Dog sleeve · output angle / selector q'},...pairs.map((p,i)=>({object:p.driven.node,name:`Gear ${i+1} · free on output until dogs engage`}))];
 const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let hovered;
 const hover=e=>{const r=canvas.getBoundingClientRect();pointer.set(2*(e.clientX-r.left)/r.width-1,1-2*(e.clientY-r.top)/r.height);ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(inspectables.map(v=>v.object),true)[0];hovered=hit&&inspectables.find(v=>{let o=hit.object;while(o){if(o===v.object)return true;o=o.parent;}return false;});canvas.title=hovered?.name||'Orbit · drag | Pan · right-drag | Zoom · wheel';};
 const focusComponent=()=>{if(hovered){hovered.object.getWorldPosition(desiredTarget);desiredPosition.copy(desiredTarget).add(new THREE.Vector3(.8,-.85,.65));transitioning=true;}};
 canvas.addEventListener('pointermove',hover);canvas.addEventListener('dblclick',focusComponent);
 const geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
 // Include both alternate dog materials before the first update.
 for(const m of [free,engaged,shock])materials.add(m);
 let terrainSource=null,terrainX=NaN,terrainY=NaN,terrainUpdates=0,terrainUpdateMs=0,lastMapping;
 const terrainColors={asphalt:new THREE.Color(0x44494d),gravel:new THREE.Color(0x8b8172),dirt:new THREE.Color(0x756044),grass:new THREE.Color(0x547448)};
 function draw(state,observatory){
  if(disposed)throw new Error('Renderer disposed');const initial=!lastState;lastState=state;lastObservatory=observatory;
  if(initial&&['road','brakes','handbrake','column','steeringbox','linkage','contact'].includes(mode)){setCamera();camera.position.copy(desiredPosition);controls.target.copy(desiredTarget);transitioning=false;}
  const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight);
  if(canvas.width!==Math.round(width*renderer.getPixelRatio())||canvas.height!==Math.round(height*renderer.getPixelRatio())){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
  const v=mechanicalPresentation(state,mode==='exploded');lastMapping=v;
  const inspection=['driveline','clutch','exploded','engine'].includes(mode),xray=['xray','brakes','handbrake','column','steeringbox','linkage','contact'].includes(mode);
  // The bench hides every shadow caster; avoid clearing a needless shadow map.
  sun.castShadow=!inspection;
  const mechanismCloseup=['brakes','handbrake','column','steeringbox','linkage','contact'].includes(mode);
  powertrain.visible=!['column','steeringbox','linkage'].includes(mode);
  body.visible=!inspection&&!mechanismCloseup;axle.visible=!inspection;shaftTube.visible=!inspection;hubs.forEach(h=>h.visible=!inspection);springs.forEach(h=>h.visible=!inspection);dampers.forEach(h=>h.visible=!inspection);
  if(paint.transparent!==xray){paint.transparent=xray;paint.needsUpdate=true;}paint.opacity=xray?.12:1;paint.depthWrite=!xray;exterior.visible=true;
  frame.visible=true;bell.visible=mode==='normal'||mode==='xray'||mode==='driver';casing.visible=mode!=='clutch';casing.position.z=v.offsets.casing;
  clutch.position.x=v.offsets.clutch;lay.position.y=AXIS_DISTANCE+v.offsets.layshaft;
  engine.rotation.x=v.engineAngle;pressure.rotation.x=v.engineAngle;disc.rotation.x=v.inputAngle;
  engine.position.x=.985+v.offsets.clutch*.45;disc.position.x=.94-v.clutchGap*.15+v.plateCompression/2+v.offsets.clutch*.12;disc.children[0].scale.y=1-v.plateCompression/.024;pressure.position.x=.908-v.clutchGap+v.plateCompression-v.offsets.clutch*.12;pressure.children[0].material=v.heating?shock:steel;
  input.rotation.x=v.inputAngle;layshaft.rotation.x=v.layshaftAngle;output.rotation.x=v.outputAngle;
  pairs.forEach((pair,i)=>{pair.driven.node.rotation.x=v.pairs[i].drivenAngle;pair.dogs.rotation.x=v.pairs[i].freeAngle;pair.driven.teeth.material=[gearBody,v.pairs[i].engaged?engaged:free];});
  sleeve.position.x=v.selectorX;sleeve.rotation.x=v.outputAngle;fork.position.x=v.selectorX;sleeve.children[0].material=v.impact?shock:steel;
  const p=state.planar,co=Math.cos(p.heading),si=Math.sin(p.heading);
  body.position.set(0,0,state.z);body.rotation.set(state.roll,-state.pitch,p.heading,'ZYX');
  // Inspection cameras follow a local bench frame. Vehicle modes show actual yaw/pitch/heave.
  powertrain.position.set(0,0,inspection?.65:state.z-.18);powertrain.rotation.set(inspection?0:state.roll,inspection?0:-state.pitch,inspection?0:p.heading,'ZYX');
  const rearX=state.corners[1].arm;axle.position.set(rearX*co,rearX*si,state.corners[1].z);axle.rotation.z=p.heading;carrier.rotation.y=v.carrierAngle;
  halfShafts.forEach((shaft,i)=>shaft.rotation.y=v.rearAngles[i]);
  start.set(-.65,0,0);powertrain.localToWorld(start);end.copy(axle.position);dir.subVectors(end,start);shaftTube.position.copy(start).add(end).multiplyScalar(.5);shaftTube.scale.y=dir.length();shaftTube.quaternion.setFromUnitVectors(shaftAxis,dir.normalize());shaftTube.rotateY(v.carrierAngle);
  state.wheels.forEach((w,i)=>{const delta=w.steering||0,t=i<2?state.steering.dynamics.trail:0,px=w.x+t*(1-Math.cos(delta))+.5*state.pitch,py=w.y-t*Math.sin(delta)+.5*state.roll,x=co*px-si*py,y=si*px+co*py,z=state.vertical.q[3+i],top=state.z+w.x*state.pitch+w.y*state.roll;
   rotors[i].visible=!((mode==='brakes'&&i===0)||(mode==='handbrake'&&i===2));
   if(mode==='brakes'&&i===0){springs[i].visible=false;dampers[i].visible=false;}
   hubs[i].position.set(x,y,z);hubs[i].rotation.z=p.heading+(w.steering||0);rotors[i].rotation.y=w.angle;rotors[i].scale.set(w.radius,1,w.radius);
   springs[i].position.set(x,y,z);springs[i].scale.z=top-z;dampers[i].position.set(x+.055*co,y+.055*si,(top+z)/2);dampers[i].scale.y=top-z;
  });
  automobile.draw(state,mode);
  const overlay=document.querySelector('#contact-overlay').checked&&!inspection;
  state.wheels.forEach((w,i)=>{const angle=w.forceHeading??(p.heading+(w.steering||0)),ca=Math.cos(angle),sa=Math.sin(angle);for(let k=0;k<2;k++){const a=arrows[i][k],x=k?(w.slipX||0):w.fx,y=k?(w.slipY||0):(w.fy||0),scale=k?.1:.001,length=Math.hypot(x,y)*scale;a.visible=overlay&&w.normal>0&&length>1e-8;if(a.visible){a.position.copy(hubs[i].position);a.position.z=.04;a.setDirection(new THREE.Vector3(ca*x-sa*y,sa*x+ca*y,0).normalize());a.setLength(length,Math.min(.05,length*.25),Math.min(.025,length*.12));}}});
  const ox=Math.floor(p.x),oy=Math.floor(p.y);ground.position.set(ox-p.x,oy-p.y,0);grid.position.set(ox-p.x,oy-p.y,.002);
  const sampler=terrainSampler();terrainUpdateMs=0;
  if(ox!==terrainX||oy!==terrainY||sampler!==terrainSource){
   const begin=performance.now(),a=groundGeo.attributes.position,colors=groundGeo.attributes.color;
   terrainX=ox;terrainY=oy;terrainSource=sampler;
   for(let i=0;i<a.count;i++){
    const sample=sampler.sample(a.getX(i)+ox,a.getY(i)+oy),color=terrainColors[sample.surface]||terrainColors.grass;
    a.setZ(i,sample.height);colors.setXYZ(i,color.r,color.g,color.b);
   }
   a.needsUpdate=true;colors.needsUpdate=true;groundGeo.computeVertexNormals();terrainUpdates++;terrainUpdateMs=performance.now()-begin;
  }
  tracks.draw(state,observatory,document.querySelector('#show-marks').checked);
  if(transitioning){camera.position.lerp(desiredPosition,.16);controls.target.lerp(desiredTarget,.16);if(camera.position.distanceTo(desiredPosition)<.0001){camera.position.copy(desiredPosition);controls.target.copy(desiredTarget);transitioning=false;}}
  controls.update();renderer.render(scene,camera);
 }
 return {draw,resetCamera,
  info:()=>({terrain:{updates:terrainUpdates,lastUpdateMs:terrainUpdateMs,vertices:groundGeo.attributes.position.count},tracks:tracks.info(),geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,sceneGeometries:geometries.size,materials:materials.size}),
  snapshot:()=>({terrainSamples:[0,80,160].map(i=>({x:groundGeo.attributes.position.getX(i)+ground.position.x+lastState.planar.x,y:groundGeo.attributes.position.getY(i)+ground.position.y+lastState.planar.y,z:groundGeo.attributes.position.getZ(i)})),chassisRoll:body.rotation.x,powertrainRoll:powertrain.rotation.x,suspensionEndpoints:springs.map(m=>[new THREE.Vector3(0,0,0).applyMatrix4(m.matrixWorld).toArray(),new THREE.Vector3(0,0,1).applyMatrix4(m.matrixWorld).toArray()]),tracks:tracks.info(),automobile:automobile.snapshot(),mode,bodyOpacity:paint.opacity,bodyTransparent:paint.transparent,camera:camera.position.toArray(),target:controls.target.toArray(),mapping:structuredClone(lastMapping),sleeveX:sleeve.position.x,forkX:fork.position.x,engineAngle:engine.rotation.x,inputAngle:input.rotation.x,outputAngle:output.rotation.x,layshaftAngle:layshaft.rotation.x,gearAngles:pairs.map(p=>p.driven.node.rotation.x),dogAngles:pairs.map(p=>p.dogs.rotation.x),engagedMaterials:pairs.map(p=>p.driven.teeth.material[1]===engaged),halfShaftAngles:halfShafts.map(s=>s.rotation.y),wheelAngles:rotors.map(r=>r.rotation.y),steering:hubs.map(h=>h.rotation.z),wheelHeights:hubs.map(h=>h.position.z),chassisHeight:body.position.z,chassisPitch:-body.rotation.y,chassisYaw:body.rotation.z,layshaftY:lay.position.y,pressureX:pressure.position.x,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles}),
  dispose(){if(disposed)return;disposed=true;canvas.removeEventListener('pointermove',hover);canvas.removeEventListener('dblclick',focusComponent);cutaway.removeEventListener('change',choose);focusButton.removeEventListener('click',focus);resetButton.removeEventListener('click',resetCamera);controls.removeEventListener('start',stop);controls.dispose();tracks.geometry.dispose();tracks.material.dispose();scene.traverse(o=>{if(o.isInstancedMesh)o.dispose();});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());sun.shadow.dispose();environment.dispose();renderer.dispose();}
 };
}
