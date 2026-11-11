struct Camera { inverse:mat4x4f, eye:vec4f, boxMin:vec4f, boxMax:vec4f }
@group(0) @binding(0) var<uniform> c:Camera;
@group(0) @binding(1) var density:texture_3d<f32>;
@group(0) @binding(2) var linearSampler:sampler;
struct Vertex { @builtin(position) position:vec4f,@location(0) uv:vec2f }
@vertex fn vertex(@builtin(vertex_index) i:u32)->Vertex{let p=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));return Vertex(vec4f(p[i],0.,1.),p[i]);}
fn environment(d:vec3f)->vec3f{let sky=mix(vec3f(.18,.15,.12),vec3f(.7,.85,1.1),clamp(d.z*.5+.5,0.,1.));let sun=pow(max(0.,dot(d,normalize(vec3f(-.5,-.4,1.)))),1000.)*12.;let softbox=pow(max(0.,dot(d,normalize(vec3f(.3,.5,1.)))),40.)*3.;return sky+vec3f(sun+softbox);}
fn box(o:vec3f,d:vec3f,lo:vec3f,hi:vec3f)->vec2f{let safe=select(vec3f(.000001),d,abs(d)>vec3f(.000001));let a=(lo-o)/safe;let b=(hi-o)/safe;return vec2f(max(max(min(a.x,b.x),min(a.y,b.y)),min(a.z,b.z)),min(min(max(a.x,b.x),max(a.y,b.y)),max(a.z,b.z)));}
struct SceneHit { distance:f32,color:vec3f }
fn scene(o:vec3f,d:vec3f)->SceneHit{var t=100.;var color=environment(d);if(d.z<-.0001){let z=-o.z/d.z;if(z>0.){t=z;let p=o+d*t;let grid=select(.0,.08,abs(fract(p.x*10.)-.5)>.475||abs(fract(p.y*10.)-.5)>.475);color=vec3f(.42,.40,.37)+grid;}}let wall=box(o,d,vec3f(.25,-.25,0.),vec3f(.31,.25,.7));if(wall.x>0.&&wall.x<min(t,wall.y)){t=wall.x;color=vec3f(.25,.3,.34);}return SceneHit(t,color);}
fn rho(p:vec3f)->f32{let uv=(p-c.boxMin.xyz)/(c.boxMax.xyz-c.boxMin.xyz);if(any(uv<vec3f(0.))||any(uv>vec3f(1.))){return 0.;}return textureSampleLevel(density,linearSampler,uv,0.).r;}
fn display(v:vec3f)->vec4f{let x=max(v,vec3f(0.));let mapped=clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),vec3f(0.),vec3f(1.));return vec4f(pow(mapped,vec3f(1./2.2)),1.);}
@fragment fn fragment(in:Vertex)->@location(0) vec4f{
 let far=c.inverse*vec4f(in.uv,1.,1.);let direction=normalize(far.xyz/far.w-c.eye.xyz);let hit=scene(c.eye.xyz,direction);var color=hit.color;
 let range=box(c.eye.xyz,direction,c.boxMin.xyz,c.boxMax.xyz);let start=max(0.,range.x);let end=min(range.y,hit.distance);
 if(end>start){let delta=(end-start)/128.;var thickness=0.;var first=-1.;var peak=0.;for(var i=0;i<128;i++){let t=start+(f32(i)+.5)*delta;let value=rho(c.eye.xyz+direction*t);thickness+=value*delta;peak=max(peak,value);if(first<0.&&value>.35){first=t;}}
 if(first>0.&&peak>.35){let p=c.eye.xyz+direction*first;let e=.0125;let grad=vec3f(rho(p+vec3f(e,0.,0.))-rho(p-vec3f(e,0.,0.)),rho(p+vec3f(0.,e,0.))-rho(p-vec3f(0.,e,0.)),rho(p+vec3f(0.,0.,e))-rho(p-vec3f(0.,0.,e)));let n=-normalize(grad+vec3f(1e-8));let cosine=clamp(dot(n,-direction),0.,1.);let fresnel=.0204+.9796*pow(1.-cosine,5.);let transmitted=exp(-vec3f(1.5,35.,19.)*thickness);let refracted=refract(direction,n,1./1.333);let background=scene(p+refracted*.02,refracted).color;let reflected=environment(reflect(direction,n));color=background*transmitted*(1.-fresnel)+reflected*fresnel;}}
 return display(color);
}
