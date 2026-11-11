// One deterministic thickness atlas, shared by every deposit. No runtime textures.
export function thicknessAt(x,y){
 const a=Math.atan2(y,x),r=Math.hypot(x,y),edge=.68+.11*Math.sin(a*5+.8)+.07*Math.sin(a*9+2.1)+.045*Math.sin(a*17);
 const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
 const body=smooth((edge-r)/.13),grain=.88+.12*Math.sin(x*43+Math.sin(y*27))*Math.sin(y*39);
 return Math.max(0,body*grain);
}
export async function createLiquidMaterials(T,backend='webgl'){
 const size=128,data=new Uint8Array(size*size*4),normals=new Uint8Array(data.length);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const u=x/(size-1)*2-1,v=y/(size-1)*2-1,t=thicknessAt(u,v),i=(y*size+x)*4;data.set([255,255,255,Math.round(255*t)],i);const dx=(thicknessAt(u+.015,v)-thicknessAt(u-.015,v))*.28,dy=(thicknessAt(u,v+.015)-thicknessAt(u,v-.015))*.28;normals.set([128-dx*100,128-dy*100,255,255],i);}
 const map=new T.DataTexture(data,size,size),normalMap=new T.DataTexture(normals,size,size);for(const t of [map,normalMap]){t.needsUpdate=true;t.magFilter=T.LinearFilter;t.minFilter=T.LinearMipmapLinearFilter;t.generateMipmaps=true;}
 let N,Node;if(backend==='webgpu'){N=await import('./vendor/three-r180/three.tsl.js');Node=(await import('./vendor/three-r180/three.webgpu.js')).MeshPhysicalNodeMaterial;}
 const physical=options=>Node?new Node(options):new T.MeshPhysicalMaterial(options);
 const drop=physical({color:0xb61139,roughness:.12,metalness:0,clearcoat:1,clearcoatRoughness:.1});
 const patch=physical({color:0x8b1031,roughness:.18,metalness:0,clearcoat:1,transparent:true,opacity:.85,depthWrite:false,side:T.DoubleSide,map,normalMap,normalScale:new T.Vector2(.3,.3),vertexColors:true,polygonOffset:true,polygonOffsetFactor:-1});
 const clock={value:0},persistence={value:90};
 if(N){
  const time=N.uniform(0),life=N.uniform(90),wet=N.exp(N.max(0,time.sub(N.attribute('liquidBorn','float'))).div(life).negate());
  patch.roughnessNode=N.mix(.85,.12,wet);patch.clearcoatNode=wet;
  patch.opacityNode=N.texture(map).a.mul(N.mix(.20,.83,wet));
  patch.colorNode=N.vec3(.29,.012,.035).mul(N.mix(.55,1,wet)).mul(N.attribute('color','vec3'));
  patch.userData.update=(t,l)=>{time.value=t;life.value=l;};
 }else{
  patch.onBeforeCompile=shader=>{shader.uniforms.liquidTime=clock;shader.uniforms.liquidLife=persistence;shader.vertexShader='attribute float liquidBorn; varying float vLiquidBorn;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvLiquidBorn=liquidBorn;');shader.fragmentShader='uniform float liquidTime; uniform float liquidLife; varying float vLiquidBorn;\n'+shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nfloat wet=exp(-max(0.,liquidTime-vLiquidBorn)/liquidLife);roughnessFactor=mix(.85,.12,wet);').replace('#include <alphamap_fragment>','#include <alphamap_fragment>\ndiffuseColor.a*=mix(.24,1.,exp(-max(0.,liquidTime-vLiquidBorn)/liquidLife));');};
  patch.customProgramCacheKey=()=> 'crimson-liquid-2';patch.userData.update=(t,l)=>{clock.value=t;persistence.value=l;};
 }
 return {drop,patch,physical,node:N,dispose(){drop.dispose();patch.dispose();map.dispose();normalMap.dispose();}};
}
