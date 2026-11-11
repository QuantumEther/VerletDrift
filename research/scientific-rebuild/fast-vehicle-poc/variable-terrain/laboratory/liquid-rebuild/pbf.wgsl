// Reduced PBF feasibility experiment. SI coordinates; fixed-count Jacobi density
// projection. Cohesion is the gradient of the declared particle deficit energy.
struct Params { p:vec4f, fluid:vec4f, origin:vec4f, extra:vec4f, motion:vec4f, reserved:vec4f }
@group(0) @binding(0) var<uniform> u:Params;
@group(0) @binding(1) var<storage,read_write> x:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> v:array<vec4f>;
@group(0) @binding(3) var<storage,read_write> predicted:array<vec4f>;
@group(0) @binding(4) var<storage,read_write> corrected:array<vec4f>;
@group(0) @binding(5) var<storage,read_write> densityLambda:array<vec2f>;
@group(0) @binding(6) var<storage,read_write> heads:array<atomic<i32>>;
@group(0) @binding(7) var<storage,read_write> next:array<i32>;
struct Ledger { force:vec4f, density:vec4f, collision:vec4f, motionWork:vec4f }
@group(0) @binding(8) var<storage,read_write> ledger:array<Ledger>;
fn kinetic(v:vec3f)->f32{return .5*u.p.w*dot(v,v);}
fn recordCollision(i:u32,before:vec3f,after:vec3f,stage:u32){let change=kinetic(after)-kinetic(before);let work=u.p.w*(after.x-before.x)*u.motion.x;ledger[i].motionWork.x+=work;ledger[i].motionWork.y+=work-change;ledger[i].motionWork.z+=min(0.,work-change);ledger[i].collision.x+=change;if(stage==0u){ledger[i].collision.y+=change;}else{ledger[i].collision.z+=change;}ledger[i].collision.w+=max(0.,change);ledger[i].force.w+=max(0.,-change);}
const G=32;
fn cell(p:vec3f)->vec3i {return clamp(vec3i(floor((p-u.origin.xyz)/u.p.z)),vec3i(0),vec3i(G-1));}
fn index(c:vec3i)->u32 {return u32(c.x+G*(c.y+G*c.z));}
fn kernel(r:vec3f)->f32 {let q=max(0.,u.p.z*u.p.z-dot(r,r));return 315./(64.*3.14159265*pow(u.p.z,9.))*q*q*q;}
fn gradient(r:vec3f)->vec3f {let q=max(0.,u.p.z*u.p.z-dot(r,r));return -945./(32.*3.14159265*pow(u.p.z,9.))*q*q*r;}
fn legacyBoundary(p:vec3f,old:vec3f)->vec3f {
 var q=p;let flags=u32(u.extra.y);let margin=u.motion.y;
 if((flags&4u)!=0u){q=clamp(q,u.origin.xyz+vec3f(margin),u.origin.xyz+vec3f(f32(G)*u.p.z-margin));}
 if((flags&1u)!=0u){q.z=max(margin,q.z);}
 let time=x[0].w-1.;let offset=u.motion.x*(time+u.p.y);let oldOffset=u.motion.x*time;
 let left=.25-margin+offset;let right=.31+margin+offset;
 if((flags&2u)!=0u&&abs(q.y)<.25+margin&&q.z<.7+margin){if(old.x<=.25-margin+oldOffset&&q.x>left){q.x=left;}else if(old.x>=.31+margin+oldOffset&&q.x<right){q.x=right;}}
 return q;
}
fn sweptPaddle(p:vec3f,old:vec3f,flags:u32)->vec3f {
 let time=x[0].w-1.;let offset=vec3f(u.motion.x*(time+u.p.y),0.,0.);let previousOffset=vec3f(u.motion.x*time,0.,0.);let margin=u.motion.y;
 let lo=vec3f(.25-margin,-.25-margin,select(-margin,-10000.,(flags&1u)!=0u));let hi=vec3f(.31+margin,.25+margin,.7+margin);
 let a=old-previousOffset;var b=p-offset;let d=b-a;
 // Starts on/inside a face: use geometric sidedness, not fragile old.x <= left
 // comparisons between differently rounded moving-plane coordinates.
 if(all(a>=lo)&&all(a<=hi)){
  var distance=1e30;var axis=0u;var face=lo.x;var inward=1.;
  for(var k=0u;k<3u;k++){if(a[k]-lo[k]<distance){distance=a[k]-lo[k];axis=k;face=lo[k];inward=1.;}if(hi[k]-a[k]<distance){distance=hi[k]-a[k];axis=k;face=hi[k];inward=-1.;}}
  if((b[axis]-face)*inward>0.){b[axis]=face;}return b+offset;
 }
 var enter=0.;var leave=1.;var axis=-1;var face=0.;
 for(var k=0u;k<3u;k++){
  if(abs(d[k])<1e-12){if(a[k]<lo[k]||a[k]>hi[k]){return p;}}
  else{let t0=(lo[k]-a[k])/d[k];let t1=(hi[k]-a[k])/d[k];let near=min(t0,t1);let far=max(t0,t1);if(near>enter||axis<0){if(near>=enter){enter=near;axis=i32(k);face=select(hi[k],lo[k],d[k]>0.);}}leave=min(leave,far);}
 }
 if(axis>=0&&enter<=leave&&enter<=1.&&leave>=0.){b[u32(axis)]=face;return b+offset;}return p;
}
fn boundary(p:vec3f,old:vec3f)->vec3f {
 if(u.motion.z<.5){return legacyBoundary(p,old);}var q=p;let flags=u32(u.extra.y);let margin=u.motion.y;
 if((flags&4u)!=0u){q=clamp(q,u.origin.xyz+vec3f(margin),u.origin.xyz+vec3f(f32(G)*u.p.z-margin));}
 if((flags&1u)!=0u){q.z=max(margin,q.z);}if((flags&2u)!=0u){q=sweptPaddle(q,old,flags);}if((flags&1u)!=0u){q.z=max(margin,q.z);}return q;
}

@compute @workgroup_size(128) fn clear(@builtin(global_invocation_id) id:vec3u){if(id.x<32768u){atomicStore(&heads[id.x],-1);}}
@compute @workgroup_size(128) fn buildCurrent(@builtin(global_invocation_id) id:vec3u){if(id.x>=u32(u.p.x)){return;}next[id.x]=atomicExchange(&heads[index(cell(x[id.x].xyz))],i32(id.x));}
@compute @workgroup_size(128) fn buildPredicted(@builtin(global_invocation_id) id:vec3u){if(id.x>=u32(u.p.x)){return;}next[id.x]=atomicExchange(&heads[index(cell(predicted[id.x].xyz))],i32(id.x));}
@compute @workgroup_size(128) fn predict(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(u.p.x)){return;}let p=x[i].xyz;let c=cell(p);var grad=vec3f(0.);
 for(var z=-1;z<=1;z++){for(var y=-1;y<=1;y++){for(var a=-1;a<=1;a++){let nc=c+vec3i(a,y,z);if(any(nc<vec3i(0))||any(nc>=vec3i(G))){continue;}var j=atomicLoad(&heads[index(nc)]);var guard=0u;loop{if(j<0||guard>=u32(u.p.x)){break;}if(u32(j)!=i){grad+=gradient(p-x[u32(j)].xyz);}j=next[u32(j)];guard++;}}}}
 // E_sigma = sigma*A_particle*sum(1-rho_i/rho0); pairwise symmetric force.
 let area=pow(u.p.w/u.fluid.x,2./3.);let capillary=2.*u.fluid.y*area/u.extra.z*grad;
 let gravitational=v[i].xyz+u.p.y*vec3f(0.,0.,u.extra.x);let velocity=gravitational+u.p.y*capillary;
 ledger[i].force.x+=kinetic(velocity)-kinetic(v[i].xyz);ledger[i].force.y+=kinetic(gravitational)-kinetic(v[i].xyz);ledger[i].force.z+=kinetic(velocity)-kinetic(gravitational);
 let q=boundary(p+u.p.y*velocity,p);recordCollision(i,velocity,(q-p)/u.p.y,0u);predicted[i]=vec4f(q,1.);
}
@compute @workgroup_size(128) fn lambdaPass(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(u.p.x)){return;}let p=predicted[i].xyz;let c=cell(p);var rho=0.;var sum=0.;var total=vec3f(0.);
 for(var z=-1;z<=1;z++){for(var y=-1;y<=1;y++){for(var a=-1;a<=1;a++){let nc=c+vec3i(a,y,z);if(any(nc<vec3i(0))||any(nc>=vec3i(G))){continue;}var j=atomicLoad(&heads[index(nc)]);var guard=0u;loop{if(j<0||guard>=u32(u.p.x)){break;}let r=p-predicted[u32(j)].xyz;rho+=u.p.w*kernel(r);if(u32(j)!=i){let g=u.p.w/u.fluid.x*gradient(r);total+=g;sum+=dot(g,g);}j=next[u32(j)];guard++;}}}}
 sum+=dot(total,total);let C=max(0.,rho/u.fluid.x-1.);densityLambda[i]=vec2f(rho,-C/(sum+1e-6));ledger[i].density.z=max(ledger[i].density.z,abs(densityLambda[i].y));
}
@compute @workgroup_size(128) fn correction(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(u.p.x)){return;}let p=predicted[i].xyz;let c=cell(p);var delta=vec3f(0.);
 for(var z=-1;z<=1;z++){for(var y=-1;y<=1;y++){for(var a=-1;a<=1;a++){let nc=c+vec3i(a,y,z);if(any(nc<vec3i(0))||any(nc>=vec3i(G))){continue;}var j=atomicLoad(&heads[index(nc)]);var guard=0u;loop{if(j<0||guard>=u32(u.p.x)){break;}if(u32(j)!=i){delta+=(densityLambda[i].y+densityLambda[u32(j)].y)*u.p.w/u.fluid.x*gradient(p-predicted[u32(j)].xyz);}j=next[u32(j)];guard++;}}}}
 let before=(p-x[i].xyz)/u.p.y;let after=(p+delta-x[i].xyz)/u.p.y;
 ledger[i].density.x+=kinetic(after)-kinetic(before);ledger[i].density.y+=kinetic(delta/u.p.y);ledger[i].density.w=max(ledger[i].density.w,length(delta));
 let q=boundary(p+delta,x[i].xyz);recordCollision(i,after,(q-x[i].xyz)/u.p.y,1u);corrected[i]=vec4f(q,1.);
}
@compute @workgroup_size(128) fn copyPredicted(@builtin(global_invocation_id) id:vec3u){if(id.x<u32(u.p.x)){predicted[id.x]=corrected[id.x];}}
@compute @workgroup_size(128) fn finish(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i<u32(u.p.x)){v[i]=vec4f((predicted[i].xyz-x[i].xyz)/u.p.y,0.);x[i]=vec4f(predicted[i].xyz,x[i].w+u.p.y);}}
