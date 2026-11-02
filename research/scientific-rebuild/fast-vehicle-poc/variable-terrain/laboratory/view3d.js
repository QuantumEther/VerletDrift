// Coachwork, wheel mesh and spring construction reused verbatim from Experiment 11
// view3d.js (4736576). Only the render-only subset is retained: no old vehicle,
// gearbox, engine lifecycle or steering-linkage simulation is instantiated.
import * as THREE from '../../../tire-road-observatory-prototype/vendor/three.module.js';
import {OrbitControls} from '../../../tire-road-observatory-prototype/vendor/OrbitControls.js';
import {batchRigidChildren} from '../../../procedural-terrain/src/render-batching.js';
import {createTrackView} from '../../../procedural-terrain/src/track-view.js';
export function createView3D(canvas,terrain,quality='auto'){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
 const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info'),backend=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);let renderScale=1;
 function setQuality(value){const scale=value==='auto'?(/SwiftShader|llvmpipe/i.test(backend)?.5:1):Number(value);if(![.5,.75,1].includes(scale))throw Error('Invalid rendering scale');renderScale=scale;renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)*scale);}setQuality(quality);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#101715');scene.fog=new THREE.Fog(0x101715,20,55);
 const camera=new THREE.PerspectiveCamera(40,1,.025,100);camera.up.set(0,0,1);
 const controls=new OrbitControls(camera,canvas);controls.minDistance=.6;controls.maxDistance=30;controls.maxPolarAngle=Math.PI*.49;
 const hemisphere=new THREE.HemisphereLight(0xffeed5,0x36483d,2);scene.add(hemisphere);const sun=new THREE.DirectionalLight(0xffebd0,3);sun.position.set(3,-4,7);scene.add(sun);
 const material=(color,metalness,roughness,extra={})=>new THREE.MeshStandardMaterial({color,metalness,roughness,...extra});
 const steel=material(0xaaaead,.88,.29),chrome=material(0xd5dad7,.95,.18),brass=material(0xb79454,.83,.33),cast=material(0x414b46,.65,.7),rubber=material(0x191c19,.05,.95),friction=material(0x554b39,.1,.95),paint=material(0x294c37,.55,.3),glass=material(0x9eb7ab,.1,.14,{transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide});
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
 const batching=batchRigidChildren(body);hubs.forEach(h=>batchRigidChildren(h));
 const tracks=createTrackView(scene),arrows=hubs.map(()=>{const a=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(),1,0xd5ba78,.06,.03);scene.add(a);return a;});
 const groundGeo=new THREE.PlaneGeometry(40,40,160,20),ground=new THREE.Mesh(groundGeo,material(0xffffff,.05,1,{vertexColors:true}));groundGeo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(groundGeo.attributes.position.count*3),3));scene.add(ground);
 const grid=new THREE.GridHelper(40,40,0x7a795b,0x444b38);grid.rotation.x=Math.PI/2;grid.position.z=.003;scene.add(grid);
 const presets={normal:[[-2.8,-3.5,2.45],[0,0,.65]],driver:[[-3.8,-.8,1.65],[.7,0,.65]],top:[[0,-.01,9],[0,0,.4]],side:[[0,-6,1.8],[0,0,.5]],contact:[[1.6,1.5,.8],[1,.6,.32]]};
 let mode='normal',ox=NaN,oy=NaN,last,terrainUpdates=0;
 const emptyScene=new THREE.Scene();emptyScene.background=scene.background;
 const contextAttributes=gl.getContextAttributes(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'),pending=[];let gpuEpoch=0,gpuDropped=0;
 function clearGpu(){gpuEpoch++;for(const q of pending)gl.deleteQuery(q.query);pending.length=0;gpuDropped=0;}
 function pollGpu(){const samples=[];if(!ext)return samples;if(gl.getParameter(ext.GPU_DISJOINT_EXT)){clearGpu();return samples;}while(pending.length&&gl.getQueryParameter(pending[0].query,gl.QUERY_RESULT_AVAILABLE)){const q=pending.shift();samples.push({frame:q.frame,ms:gl.getQueryParameter(q.query,gl.QUERY_RESULT)/1e6});gl.deleteQuery(q.query);}return samples;}
 function submit(sceneToDraw,kind,frame,timing){let q=null;if(timing&&ext&&pending.length<8){q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);}else if(timing&&ext)gpuDropped++;try{if(kind==='minimal'){renderer.resetState();gl.clearColor(.06,.09,.08,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT|gl.STENCIL_BUFFER_BIT);renderer.resetState();}else renderer.render(sceneToDraw,camera);}finally{if(q){gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push({query:q,frame,epoch:gpuEpoch});}}}
 function gpuStatus(){return {supported:!!ext,extension:ext?'EXT_disjoint_timer_query_webgl2':null,pending:pending.length,dropped:gpuDropped,epoch:gpuEpoch};}

 function resetCamera(next=mode){mode=next;const [position,target]=presets[mode];camera.position.fromArray(position);controls.target.fromArray(target);controls.update();}resetCamera();
 function draw(p,observatory,{marks=true,vectors=false,xray=false,sceneUpdates=true,submission=true,timings=null,diagnostic={mode:'full'},frameId=0,gpuTiming=false}={}){
  const start=performance.now(),d=diagnostic,incremental=d.mode==='incremental';
  const enabled=k=>!incremental||!!d[k];
  body.visible=enabled('vehicle');hubs.forEach(x=>x.visible=enabled('vehicle'));springs.forEach(x=>x.visible=enabled('vehicle'));dampers.forEach(x=>x.visible=enabled('vehicle'));arrows.forEach(x=>x.visible=enabled('other')&&x.visible);hemisphere.visible=sun.visible=enabled('lighting');
  if(!sceneUpdates){const t=performance.now();if(submission)submit(d.mode==='empty'?emptyScene:scene,d.mode,frameId,gpuTiming);if(timings){timings.scene=0;timings.tracks=0;timings.webgl=performance.now()-t;}return;}

  last=p;const width=canvas.clientWidth,height=canvas.clientHeight;if(width>0&&height>0&&(canvas.width!==Math.round(width*renderer.getPixelRatio())||canvas.height!==Math.round(height*renderer.getPixelRatio()))){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
  body.position.set(0,0,p.z);body.rotation.set(p.roll,-p.pitch,p.planar.heading,'ZYX');if(paint.transparent!==xray){paint.transparent=xray;paint.needsUpdate=true;}paint.opacity=xray?.18:1;paint.depthWrite=!xray;
  const basis=new THREE.Matrix4(),from=new THREE.Vector3(),to=new THREE.Vector3(),direction=new THREE.Vector3(),axis=new THREE.Vector3(0,1,0);
  p.wheels.forEach((w,i)=>{
   const x=w.position[0]-p.planar.x,y=w.position[1]-p.planar.y,z=w.position[2];hubs[i].position.set(x,y,z);basis.makeBasis(new THREE.Vector3(...w.tangent),new THREE.Vector3(...w.lateral),new THREE.Vector3(...w.normalAxis));hubs[i].quaternion.setFromRotationMatrix(basis);rotors[i].rotation.y=w.angle;rotors[i].scale.set(w.radius,1,w.radius);
   from.set(x,y,z);to.set(w.mount[0]-p.planar.x,w.mount[1]-p.planar.y,w.mount[2]);direction.subVectors(to,from);springs[i].position.copy(from);springs[i].quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),direction.clone().normalize());springs[i].scale.z=direction.length();dampers[i].position.copy(from).add(to).multiplyScalar(.5);dampers[i].position.x+=.055;dampers[i].quaternion.setFromUnitVectors(axis,direction.clone().normalize());dampers[i].scale.y=direction.length();
   const F=new THREE.Vector3(...w.worldForce),length=F.length()*.001;arrows[i].visible=enabled('other')&&vectors&&w.normal>0&&length>1e-8;if(arrows[i].visible){arrows[i].position.set(x,y,w.roadHeight+.04);arrows[i].setDirection(F.normalize());arrows[i].setLength(length);}
  });
  const nx=Math.floor(p.planar.x),ny=Math.floor(p.planar.y);ground.position.set(nx-p.planar.x,ny-p.planar.y,0);grid.position.set(nx-p.planar.x,ny-p.planar.y,.002);ground.visible=enabled('terrain');grid.visible=enabled('other')&&terrain.settings.preset==='flat';
  if(nx!==ox||ny!==oy){ox=nx;oy=ny;const a=groundGeo.attributes.position,col=groundGeo.attributes.color,colors={asphalt:0x44494d,gravel:0x8b8172,dirt:0x756044,grass:0x547448};for(let i=0;i<a.count;i++){const s=terrain.sample(a.getX(i)+ox,a.getY(i)+oy),color=new THREE.Color(colors[s.surface]??colors.grass);a.setZ(i,s.height);col.setXYZ(i,color.r,color.g,color.b);}a.needsUpdate=col.needsUpdate=true;groundGeo.computeVertexNormals();terrainUpdates++;}
  const trackStart=performance.now();tracks.draw(p,observatory,marks&&enabled('tracks'));const trackEnd=performance.now();controls.update();const submitStart=performance.now();if(submission)submit(d.mode==='empty'?emptyScene:scene,d.mode,frameId,gpuTiming);const end=performance.now();if(timings){timings.scene=submitStart-start-(trackEnd-trackStart);timings.tracks=trackEnd-trackStart;timings.webgl=end-submitStart;}
 }
 function snapshot(){const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');return {renderScale,backend:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,terrainUpdates,batching,mode,camera:camera.position.toArray(),wheelPositions:hubs.map(h=>h.position.toArray()),wheelAngles:rotors.map(r=>r.rotation.y),wheelQuaternions:hubs.map(h=>h.quaternion.toArray()),chassis:[body.position.z,body.rotation.x,-body.rotation.y,body.rotation.z],tracks:tracks.info(),time:last?.time};}
 return {draw,resetCamera,snapshot,setQuality,clearGpu,pollGpu,gpuStatus,contextInfo:()=>({attributes:contextAttributes,drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],cssSize:[canvas.clientWidth,canvas.clientHeight],devicePixelRatio,renderScale}),dispose(){clearGpu();controls.dispose();const geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(o.isInstancedMesh)o.dispose();});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();}};
}
