struct Camera {zoom:f32,ppm:f32,width:f32,height:f32,x:f32,y:f32}
struct Settings {dt:f32,count:u32,curl:f32,time:f32,camera:vec2<f32>,detail:f32,pad:f32}
struct Particle {pos:vec2<f32>,vel:vec2<f32>,life:f32,maxLife:f32,size:f32,sizeBase:f32,color:vec4<f32>}
@group(0) @binding(0) var<uniform> camera:Camera;
@group(0) @binding(1) var<uniform> settings:Settings;
@group(0) @binding(2) var<storage,read> particles:array<Particle>;
@group(0) @binding(3) var<storage,read> alive:array<u32>;
@group(0) @binding(4) var<storage,read_write> bounds:array<atomic<u32>>;
@group(0) @binding(5) var<uniform> smokeLight:SmokeLighting;
@compute @workgroup_size(256) fn smoke_bounds(@builtin(global_invocation_id) id:vec3<u32>){
 if(id.x>=settings.count||alive[id.x]==0u){return;}
 let p=particles[id.x];if(p.life<=0.||p.color.a<=0.){return;}
 let extent=smokeLight.view.xy;let scale=smokeLight.view.z;
 let center=(p.pos-vec2(camera.x,camera.y))*scale+extent*.5;
 let radius=p.size*.65*scale+4.;let lo=clamp(floor(center-vec2(radius)),vec2(0.),extent);let hi=clamp(ceil(center+vec2(radius)),vec2(0.),extent);
 if(any(hi<=lo)){return;}
 atomicMin(&bounds[0],u32(lo.x));atomicMin(&bounds[1],u32(lo.y));atomicMax(&bounds[2],u32(hi.x));atomicMax(&bounds[3],u32(hi.y));
}
