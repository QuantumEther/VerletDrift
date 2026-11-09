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
 const kind=({mountain:1,yard:2,rally:3})[mapPreset]??0;
 if(kind){const dist=N.abs(N.attribute('roadDistance','float')),width=N.attribute('roadWidth','float').mul(.5),aa=N.max(N.fwidth(N.attribute('roadDistance','float')),.015),onRoad=N.float(1).sub(N.smoothstep(width.sub(aa),width.add(aa),dist));const blend=onRoad.mul(N.float(1).sub(N.smoothstep(width.sub(.02),width.add(.02),dist)));base=N.mix(base,N.vec3(...(kind===1?[.0529,.0612,.0648]:kind===2?[.1845,.1981,.1845]:[.2502,.1301,.0578])),blend);const offset=kind===1?.24:kind===2?.28:.2,half=kind<3?.16:.12;const edge=N.float(1).sub(N.smoothstep(N.float(half).sub(aa),N.float(half).add(aa),N.abs(dist.sub(width.sub(offset)))));const along=N.mod(xy.x,kind===1?8:10),ax=N.max(N.fwidth(xy.x),.015),dash=N.smoothstep(0,ax,along).mul(N.float(1).sub(N.smoothstep(N.float(kind===1?4.2:5).sub(ax),N.float(kind===1?4.2:5).add(ax),along))),center=N.float(1).sub(N.smoothstep(N.float(.12).sub(aa),N.float(.12).add(aa),dist)).mul(dash);let marks=N.max(edge,center);if(kind===3)marks=edge.mul(N.float(1).sub(N.smoothstep(N.float(1.1).sub(ax),N.float(1.1).add(ax),N.mod(xy.x,10))));if(kind===2)marks=N.max(marks,N.float(1).sub(N.smoothstep(N.float(.17).sub(ax),N.float(.17).add(ax),N.mod(xy.x,18))).mul(N.float(1).sub(N.smoothstep(width.sub(.5).sub(aa),width.sub(.5).add(aa),dist))));base=N.mix(base,N.vec3(...(kind===1?[.701,.644,.423]:kind===2?[.617,.462,.086]:[.479,.347,.184])),marks.mul(onRoad));}
 m.colorNode=base.mul(N.float(1).add(tonal.mul(detail)));
 m.roughnessNode=N.mix(N.float(original.roughness??1),N.dot(a,N.vec3(.87,.99,.98)).add(N.dot(b,N.vec3(1,.94,.97))),detail);
 const relief=aggregate.mul(.001).add(broad.mul(.002)).add(a.y.mul(pebbles).mul(.004)).add(b.z.mul(strata).mul(.003)).mul(detail).mul(close);m.normalNode=N.bumpMap(relief);
 return {material:m,setPreset(p){detail.value=['balanced','cinematic'].includes(p)?1:0;},origin(x,y){origin.value.set(x,y);}};
}
