// Browser-only TSL equivalents of the road/contact overlays. No physics imports.
export async function createTSLOverlays(){
 const T=await import('./vendor/three-r180/three.webgpu.js'),N=await import('./vendor/three-r180/three.tsl.js');
 function track(roadCenter){const material=new T.MeshBasicNodeMaterial({transparent:true,depthWrite:false,side:T.DoubleSide});const shade=N.attribute('shade','vec4'),xy=N.positionWorld.xy,center=N.uniform(roadCenter),u=N.uv().x;const edge=N.smoothstep(0,.1,u).mul(N.smoothstep(0,.1,N.float(1).sub(u)));const inside=N.max(N.abs(xy.x.sub(center.x)),N.abs(xy.y.sub(center.y))).lessThanEqual(20);material.colorNode=shade.rgb;material.opacityNode=shade.a.mul(edge).mul(inside);return material;}
 function contact(strength){const material=new T.MeshBasicNodeMaterial({transparent:true,depthWrite:false});const p=N.uv().mul(2).sub(1),a=N.max(0,N.float(1).sub(N.dot(p,p)));material.colorNode=N.vec3(0);material.opacityNode=a.mul(a).mul(strength);return material;}
 function cloudShadow(lobes,strength){const material=new T.MeshBasicNodeMaterial({transparent:true,depthWrite:false});const p=N.uv().mul(2).sub(1);let optical=N.float(0);for(const lobe of lobes){const l=N.uniform(lobe),d=p.sub(l.xy).div(N.max(.01,l.z));optical=optical.add(l.w.mul(N.exp(N.dot(d,d).mul(-2))));}material.colorNode=N.vec3(0);material.opacityNode=N.float(1).sub(N.exp(optical.negate())).mul(strength);return material;}
 return {track,contact,cloudShadow,uniform:N.uniform};
}
