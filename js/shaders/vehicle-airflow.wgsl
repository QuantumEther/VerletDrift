struct AirflowFrame {body:vec4<f32>,motion:vec4<f32>,grid:vec4<f32>,options:vec4<f32>}
struct AirflowCore {place:vec4<f32>,shape:vec4<f32>}
@group(0) @binding(0) var<uniform> air:AirflowFrame;
@group(0) @binding(1) var<storage,read> cores:array<AirflowCore>;
@group(0) @binding(2) var<storage,read_write> velocityGrid:array<vec4<f32>>;

@compute @workgroup_size(8,8) fn prepareAirflow(@builtin(global_invocation_id) id:vec3<u32>){
 let size=u32(air.grid.w);if(id.x>=size||id.y>=size){return;}
 let point=air.grid.xy+vec2<f32>(id.xy)*air.grid.z;
 let speed=length(air.body.zw);let f=vec2(sin(air.motion.x),-cos(air.motion.x));let right=vec2(-f.y,f.x);
 let delta=point-air.body.xy;let side=dot(delta,right);let ahead=dot(delta,f);
 // Near-body pressure splitting plus downstream entrainment, in metres/second.
 let near=exp(-pow(side/1.6,2.)-pow(ahead/2.7,2.));
 var velocity=air.options.yz+(right*side/(abs(side)+.3)*min(speed*.22,5.)+air.body.zw*.12)*near;
 var coverage=near*min(speed/3.,1.);
 for(var i=0u;i<u32(air.motion.w);i++){
  let v=cores[i];let age=air.motion.z-v.place.z;let life=air.options.x;
  if(age<0.||age>=life){continue;}
  let center=v.place.xy+(v.shape.xy*.25+air.options.yz)*age;
  let d=point-center;let core=v.shape.z+.12*age;let r2=dot(d,d);let c2=core*core;
  if(r2>16.*c2){continue;}
  let influence=(1.-smoothstep(9.*c2,16.*c2,r2))/(1.+r2/c2);
  // Time derivative of dust's circulation integral, NOT its accumulated map.
  let tau=max(.18,life*.45);let envelope=exp(-age/tau)*(1.-exp(-10.*age))*(1.-smoothstep(.75,1.,age/life));
  let angular=v.place.w*envelope*influence;
  velocity+=vec2(-d.y,d.x)*angular;
  coverage=max(coverage,abs(v.place.w)*envelope*influence*.25);
 }
 let magnitude=length(velocity);velocity*=min(1.,18./max(.001,magnitude));
 // Fade before the domain boundary so smoke outside the finite grid is unchanged.
 let edge=min(min(f32(id.x),f32(id.y)),min(f32(size-1u-id.x),f32(size-1u-id.y)));
 let taper=smoothstep(0.,4.,edge);
 velocityGrid[id.y*size+id.x]=vec4(velocity*taper*air.options.w,clamp(coverage*air.options.w,0.,1.)*taper,0.);
}
