import {makeSheetMesh,makeStrandMesh} from '../../../../../js/renderer/liquid-mesh.js';
// Fixed topology, GPU analytic deformation on both backends. No per-frame vertices.
export function createSplashSheets(T,scene,materials){
 const max=16,N=materials?.node,time={value:0},matrix=new T.Matrix4(),pos=new T.Vector3(),q=new T.Quaternion(),scale=new T.Vector3(1,1,1),batches=[];let active=0;
 for(const strand of [false,true]){
  const topology=strand?makeStrandMesh(12):makeSheetMesh(48,8),geometry=new T.BufferGeometry(),points=new Float32Array(topology.vertices.length/2*3);
  for(let i=0;i<topology.vertices.length/2;i++)points.set([topology.vertices[i*2],topology.vertices[i*2+1],0],i*3);
  geometry.setAttribute('position',new T.BufferAttribute(points,3));geometry.setAttribute('uv',new T.BufferAttribute(topology.vertices,2));geometry.setIndex(new T.BufferAttribute(topology.indices,1));geometry.setAttribute('normal',new T.BufferAttribute(new Float32Array(points.length).map((_,i)=>i%3===2?1:0),3));
  const capacity=max*(strand?12:1),data=new Float32Array(capacity*4),attr=new T.InstancedBufferAttribute(data,4).setUsage(T.DynamicDrawUsage);geometry.setAttribute('splashData',attr);
  const options={color:0xb41139,roughness:.15,metalness:0,clearcoat:1,transparent:true,opacity:.68,depthWrite:false,side:T.DoubleSide};const material=materials?materials.physical(options):new T.MeshPhysicalMaterial(options);let clock;
  if(N){clock=N.uniform(0);const d=N.attribute('splashData','vec4'),age=N.max(0,clock.sub(d.x)),u=N.uv().x,v=N.uv().y,a=strand?d.w.add(u.mul(.38).mul(N.sin(u.mul(7).add(d.w)))):u.mul(Math.PI*2),r=strand?u.mul(.95).add(.18):v,extent=d.y.add(d.z.mul(age).mul(.25)),width=strand?v.mul(d.y).mul(.035).mul(N.float(1).sub(u).add(.08)):N.float(0),radial=r.mul(extent),z=age.mul(d.y.sqrt()).mul(2.5).sub(age.mul(age).mul(4.905)).add(N.sin(a.mul(5).add(age.mul(4))).mul(d.y).mul(r).mul(.3));
   material.colorNode=N.color(0xb41139);material.roughnessNode=N.float(.28);material.clearcoatNode=N.float(.35);
   material.normalNode=N.normalize(N.cross(N.dFdx(N.positionView),N.dFdy(N.positionView)));
   material.positionNode=N.vec3(N.cos(a).mul(radial).sub(N.sin(a).mul(width)),N.sin(a).mul(radial).add(N.cos(a).mul(width)),z);
   const fade=N.float(1).sub(N.smoothstep(.45,.8,age)),rim=N.smoothstep(.04,.18,r).mul(N.float(1).sub(N.smoothstep(.85,1,r))),holes=N.smoothstep(.05,.26,N.sin(a.mul(9).add(r.mul(12))).mul(N.sin(a.mul(5).sub(r.mul(17)))).add(N.float(.9).sub(age.mul(1.1))));
   material.opacityNode=fade.mul(strand?N.float(.8):rim.mul(holes).mul(.65));
  }else{
   material.onBeforeCompile=shader=>{shader.uniforms.splashTime=time;shader.vertexShader='attribute vec4 splashData;uniform float splashTime;varying float vSplashAge;varying float vSplashRadial;varying float vSplashAngle;\n'+shader.vertexShader.replace('#include <begin_vertex>',`float age=max(0.,splashTime-splashData.x);float u=position.x;float v=position.y;float a=${strand?'splashData.w+u*.38*sin(u*7.+splashData.w)':'u*6.283185307'};float radial=${strand?'(.18+u*.95)':'v'};float extent=splashData.y+splashData.z*age*.25;float width=${strand?'v*splashData.y*.035*(1.-u+.08)':'0.'};vec3 transformed=vec3(cos(a)*radial*extent-sin(a)*width,sin(a)*radial*extent+cos(a)*width,age*sqrt(splashData.y)*2.5-4.905*age*age+sin(a*5.+age*4.)*splashData.y*radial*.3);vSplashAge=age;vSplashRadial=radial;vSplashAngle=a;`);
    shader.fragmentShader='varying float vSplashAge;varying float vSplashRadial;varying float vSplashAngle;\n'+shader.fragmentShader.replace('#include <alphamap_fragment>',`#include <alphamap_fragment>\nfloat fade=1.-smoothstep(.45,.8,vSplashAge);float r=vSplashRadial;float a=vSplashAngle;diffuseColor.a*=fade*${strand?'1.':'smoothstep(.04,.18,r)*(1.-smoothstep(.85,1.,r))*smoothstep(.05,.26,sin(a*9.+r*12.)*sin(a*5.-r*17.)+.9-vSplashAge*1.1)'};`);};material.customProgramCacheKey=()=>`splash-analytic-${strand}`;
  }
  const mesh=new T.InstancedMesh(geometry,material,capacity);mesh.frustumCulled=false;mesh.renderOrder=4;scene.add(mesh);batches.push({strand,mesh,geometry,material,data,attr,clock});
 }
 function draw(p,events){time.value=p.time;active=0;const live=events.filter(e=>p.time>=e.time&&p.time-e.time<.8).slice(-max);active=live.length;for(const b of batches){let n=0;for(const e of live)for(let j=0;j<(b.strand?12:1);j++){pos.set(e.x-p.planar.x,e.y-p.planar.y,e.z);matrix.compose(pos,q,scale);b.mesh.setMatrixAt(n,matrix);b.data.set([e.time,e.r,Math.min(40,e.speed)+3,j*2.399963],n*4);n++;}b.mesh.count=n;b.mesh.visible=n>0;if(n){b.mesh.instanceMatrix.needsUpdate=true;b.attr.needsUpdate=true;}if(b.clock)b.clock.value=p.time;}}
 return {draw,info:()=>({active}),dispose(){for(const b of batches){b.mesh.dispose();b.geometry.dispose();b.material.dispose();b.mesh.removeFromParent();}}};
}
