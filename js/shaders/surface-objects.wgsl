// Nine floats/instance: x,y,radius,seed,r,g,b,alpha,kind.
// kind 0 = pigment; 1 = balloon; 2/4 = contact/cast ellipse; 5/6 = cast/contact body.
struct Camera { zoom:f32, ppm:f32, width:f32, height:f32, x:f32, y:f32 }
@group(0) @binding(0) var<uniform> cam:Camera;
struct Instance {
 @location(1) x:f32, @location(2) y:f32, @location(3) radius:f32,
 @location(4) seed:f32, @location(5) r:f32, @location(6) g:f32,
 @location(7) b:f32, @location(8) alpha:f32, @location(9) kind:f32,
}
struct Out {
 @builtin(position) position:vec4<f32>, @location(0) uv:vec2<f32>,
 @location(1) @interpolate(flat) color:vec4<f32>,
 @location(2) @interpolate(flat) kind:f32, @location(3) @interpolate(flat) seed:f32,
}
@vertex fn vs_main(@builtin(vertex_index) vi:u32, inst:Instance)->Out {
 let corners=array<vec2<f32>,6>(vec2(-1.,-1.),vec2(1.,-1.),vec2(1.,1.),vec2(-1.,-1.),vec2(1.,1.),vec2(-1.,1.));
 let uv=corners[vi]; var extent=vec2(inst.radius);
 if(inst.kind>1.5){ extent=vec2(inst.radius,inst.seed); }
 if(inst.kind>.5 && inst.kind<1.5){ extent.y*=2.; }
 var offset=uv*extent;
 if(inst.kind>4.5){offset=vec2(offset.x*inst.r-offset.y*inst.g,offset.x*inst.g+offset.y*inst.r);}
 let world=vec2(inst.x,inst.y)+offset;
 let p=(world-vec2(cam.x,cam.y))*cam.zoom*cam.ppm/vec2(cam.width,cam.height)*vec2(2.,-2.);
 return Out(vec4(p,0.,1.),uv,vec4(inst.r,inst.g,inst.b,inst.alpha),inst.kind,inst.seed);
}
@fragment fn fs_main(in:Out)->@location(0) vec4<f32>{
 let uvWidth=fwidth(in.uv);
 var uv=in.uv;var alpha=0.;var rgb=in.color.rgb;
 if(in.kind>1.5){
   let falloff=select(4.,mix(6.,2.8,env.settings.y),env.settings.w>.5);
   var shadowStrength=1.;
   if(env.settings.w>.5){shadowStrength=select(.85,env.light.w/(env.settings.x+env.light.w+.001),in.kind>3.5);}
   if(in.kind>4.5){
    let q=abs(uv)-vec2(.62,.78);
    let distance=length(max(q,vec2(0.)))+min(max(q.x,q.y),0.)-.15;
    let penumbra=select(.10+env.settings.y*.10,.18,in.kind>5.5);
    let strength=select(env.light.w/(env.settings.x+env.light.w+.001),.85,in.kind>5.5);
    alpha=(1.-smoothstep(-penumbra,penumbra,distance))*in.color.a*strength;
    rgb=vec3(.008,.010,.012);
   }else{
   alpha=exp(-dot(uv,uv)*falloff)*(1.-smoothstep(.65,1.,length(uv)))*in.color.a*shadowStrength;
   }
 }else if(in.kind>.5){
   uv.y*=2.;
   let r=length(uv);let aa=max(length(uvWidth)*2.,.001);
   let body=1.-smoothstep(1.-aa,1.+aa,r);
   let z=sqrt(max(0.,1.-dot(uv,uv)));
   let light=.62+.32*z+.10*dot(uv,vec2(-.6,-.8));
   let highlight=pow(max(0.,1.-length((uv-vec2(-.30,-.38))*vec2(2.3,3.5))),3.);
   rgb=rgb*light+vec3(highlight*.42);
   if(env.settings.w>.5){
    let normal=normalize(vec3(uv,z+.0001));let view=normalize(vec3(0.,.48,1.));
    let halfway=normalize(view+env.light.xyz);
    let specular=pow(max(0.,dot(normal,halfway)),75.);
    rgb=envDisplay(envLinear(in.color.rgb)*envDiffuse(normal)*(.82+.18*z)+envColor()*specular*env.light.w*.23);
   }
   let stringX=sin(uv.y*5.+in.seed)*.09;
   let stringAA=max(uvWidth.x,.003);
   let string=(1.-smoothstep(.012,.012+stringAA,abs(uv.x-stringX)))*step(1.,uv.y)*step(uv.y,1.85);
   alpha=max(body,string*.45)*in.color.a;
 }else{
   let angle=atan2(uv.y,uv.x);
   let edge=.77+.07*sin(angle*5.+in.seed)+.05*sin(angle*9.-in.seed*1.7);
   let r=length(uv);let aa=max(length(uvWidth)*2.,.001);
   let coverage=1.-smoothstep(edge-aa,edge+aa,r);
   let filtered=1.-smoothstep(.3,1.,length(uvWidth)*7.);
   let pigment=.96+.04*sin(uv.x*7.+sin(uv.y*5.)+in.seed)*sin(uv.y*6.)*filtered;
   // Shading follows authoritative depletion; no independent deposition/aging.
   let wet=smoothstep(.35,.9,in.color.a);
   let sheen=pow(max(0.,1.-length((uv-vec2(-.2,-.25))*2.)),6.)*.12*wet;
   rgb=rgb* pigment+vec3(sheen);
   alpha=coverage*in.color.a;
 }
 return vec4(rgb*alpha,alpha);
}
