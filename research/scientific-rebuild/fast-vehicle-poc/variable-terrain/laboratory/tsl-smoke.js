// Instanced billboards sharing the authoritative visual particle arrays.
export async function createTSLSmokeView(scene,buffers,lighting,capacity=600){
 const T=await import('./vendor/three-r180/three.webgpu.js'),N=await import('./vendor/three-r180/three.tsl.js');
 const geometry=new T.PlaneGeometry(1,1);
 for(const [name,array,width] of [['particlePosition',buffers.positions,3],['particleOpacity',buffers.alpha,1],['particleDiameter',buffers.sizes,1],['particleTint',buffers.colors,3],['particleRotation',buffers.rotation,1]])geometry.setAttribute(name,new T.InstancedBufferAttribute(array,width));
 const material=new T.SpriteNodeMaterial({transparent:true,depthWrite:false});
 const a=N.attribute('particleOpacity','float'),spin=N.attribute('particleRotation','float'),p=N.uv().mul(2).sub(1),r=N.dot(p,p);
 const x=N.cos(spin).mul(p.x).sub(N.sin(spin).mul(p.y)),y=N.sin(spin).mul(p.x).add(N.cos(spin).mul(p.y));
 const lobes=N.float(.85).add(N.sin(x.mul(9).add(y.mul(5))).mul(.1)).add(N.cos(y.mul(13)).mul(.05));
 const fog=N.pow(N.max(0,N.float(1).sub(r.div(lobes))),2),optical=a.mul(fog).mul(3),transmission=N.exp(optical.negate());
 const direction=N.uniform(lighting.lightDirection.value),sun=N.uniform(lighting.sunColor.value),ambient=N.uniform(lighting.illumination.value);
 const n=N.normalize(N.vec3(p,N.sqrt(N.max(0,N.float(1).sub(r))))),facing=N.dot(n,direction),scattering=N.float(.3).add(N.pow(N.max(0,facing.mul(.5).add(.5)),2).mul(.7));
 material.positionNode=N.attribute('particlePosition','vec3');material.scaleNode=N.attribute('particleDiameter','float');
 material.colorNode=N.attribute('particleTint','vec3').mul(ambient.mul(N.float(.6).add(transmission.mul(.4))).add(sun.mul(scattering).mul(N.exp(optical.mul(N.float(1).sub(N.max(0,facing))).mul(-.7)))));
 material.opacityNode=N.float(1).sub(transmission);
 const mesh=new T.InstancedMesh(geometry,material,capacity);mesh.frustumCulled=false;mesh.renderOrder=3;mesh.userData.noShadow=true;mesh.visible=false;scene.add(mesh);
 mesh.onBeforeRender=(_r,_s,camera)=>direction.value.copy(buffers.sunDirection).transformDirection(camera.matrixWorldInverse);
 return {mesh,update(visible){mesh.visible=visible;for(const attr of Object.values(geometry.attributes))if(attr.isInstancedBufferAttribute)attr.needsUpdate=true;},dispose(){mesh.removeFromParent();geometry.dispose();material.dispose();}};
}
