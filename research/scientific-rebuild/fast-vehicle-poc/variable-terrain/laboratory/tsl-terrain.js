// Research terrain detail in TSL; uses the existing classified terrain attributes.
export async function createTSLTerrain(original,mapPreset='flat'){
 const T=await import('./vendor/three-r180/three.webgpu.js'),N=await import('./vendor/three-r180/three.tsl.js');
 const {surfaceNames,surfacePalette}=await import('./surface-palette.js'),palette=surfacePalette(mapPreset),m=new T.MeshStandardNodeMaterial();
 m.roughness=original.roughness??1;m.metalness=original.metalness??0;m.side=original.side;m.vertexColors=false;
 const detail=N.uniform(1),origin=N.uniform(new T.Vector2()),a=N.attribute('surfaceA','vec3'),b=N.attribute('surfaceB','vec3'),xy=N.positionLocal.xy.add(origin);
 const noise=p=>N.fract(N.sin(N.dot(p,N.vec2(127.1,311.7))).mul(43758.5453));
 const aggregate=noise(xy.mul(35)),broad=noise(xy.mul(.65)),pebbles=noise(xy.mul(17));
 const close=N.float(1).sub(N.smoothstep(.15,1,N.max(N.abs(N.dFdx(xy.x)),N.abs(N.dFdy(xy.y))).mul(35)));
 const fibres=N.sin(xy.x.mul(90).add(noise(xy.mul(2)).mul(8))),strata=N.sin(xy.x.mul(3).add(xy.y.mul(7)).add(broad.mul(5)));
 const joint=N.abs(N.fract(xy.div(4)).sub(.5)),seam=N.smoothstep(.497,.4995,N.max(joint.x,joint.y));
 const tonal=aggregate.sub(.5).mul(.15).mul(close).add(broad.sub(.5).mul(.12)).add(a.z.mul(broad.sub(.5)).mul(.1)).add(b.x.mul(fibres).mul(.025).mul(close)).sub(b.y.mul(seam).mul(.1).mul(N.sqrt(close))).add(a.y.mul(pebbles.sub(.5)).mul(.3).mul(close)).add(b.z.mul(strata).mul(.065).mul(close)).add(a.z.mul(noise(xy.mul(N.vec2(.7,9))).sub(.5)).mul(.08).mul(close));
 const weights=[a.x,a.y,a.z,b.x,b.y,b.z];let base;
 // Weighted palette, rather than an extra texture or terrain sampler.
 base=N.vec3(0);for(let i=0;i<6;i++)base=base.add(N.color(new T.Color(palette[surfaceNames[i]])).mul(weights[i]));
 m.colorNode=base.mul(N.float(1).add(tonal.mul(detail)));
 m.roughnessNode=N.mix(N.float(original.roughness??1),N.dot(a,N.vec3(.87,.99,.98)).add(N.dot(b,N.vec3(1,.94,.97))),detail);
 const relief=aggregate.mul(.001).add(broad.mul(.002)).add(a.y.mul(pebbles).mul(.004)).add(b.z.mul(strata).mul(.003)).mul(detail).mul(close);m.normalNode=N.bumpMap(relief);
 return {material:m,setPreset(p){detail.value=['balanced','cinematic'].includes(p)?1:0;},origin(x,y){origin.value.set(x,y);}};
}
