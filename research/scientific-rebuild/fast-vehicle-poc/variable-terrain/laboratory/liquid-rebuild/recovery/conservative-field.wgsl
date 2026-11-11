struct FieldParams { p:vec4f, origin:vec4f, hashOrigin:vec4f }
@group(0) @binding(0) var<uniform> u:FieldParams;
@group(0) @binding(1) var<storage,read> x:array<vec4f>;
@group(0) @binding(2) var<storage,read> heads:array<i32>;
@group(0) @binding(3) var<storage,read> next:array<i32>;
@group(0) @binding(4) var field:texture_storage_3d<rgba16float,write>;
fn W(r:vec3f)->f32{let q=max(0.,u.p.z*u.p.z-dot(r,r));return 315./(64.*3.14159265*pow(u.p.z,9.))*q*q*q;}
// Physical floor image only. Computational x/y/upper bounds are not walls.
// Readback validation must verify that the reconstruction box covers the mass.
fn reflectedKernel(p:vec3f,center:vec3f)->f32{
 let base=p-center;var sum=W(base);if(center.z>=0.&&center.z<u.p.z){sum+=W(vec3f(base.xy,p.z+center.z));}return sum;
}
@compute @workgroup_size(4,4,4) fn densityField(@builtin(global_invocation_id) id:vec3u){
 if(any(id>=vec3u(64))){return;}let p=u.origin.xyz+(vec3f(id)+.5)*u.p.y;let c=clamp(vec3i(floor((p-u.hashOrigin.xyz)/u.p.z)),vec3i(0),vec3i(31));var density=0.;
 for(var z=-1;z<=1;z++){for(var y=-1;y<=1;y++){for(var a=-1;a<=1;a++){let nc=c+vec3i(a,y,z);if(any(nc<vec3i(0))||any(nc>=vec3i(32))){continue;}var j=heads[u32(nc.x+32*(nc.y+32*nc.z))];var guard=0u;loop{if(j<0||guard>=u32(u.p.x)){break;}density+=u.p.w*reflectedKernel(p,x[u32(j)].xyz)/1000.;j=next[u32(j)];guard++;}}}}
 textureStore(field,vec3i(id),vec4f(density,0.,0.,1.));
}
