// GPU reconstruction of immutable tire transfers. No fluid solver or evolving CPU state.
struct Transfer { ends:vec4<f32>, shape:vec4<f32>, absorption:vec4<f32> }
@group(0) @binding(1) var<storage,read> transfers:array<Transfer>;
struct FilmVertex {
 @builtin(position) position:vec4<f32>, @location(0) local:vec2<f32>,
 @location(1) world:vec2<f32>, @location(2) @interpolate(flat) data:vec4<f32>,
 @location(3) @interpolate(flat) dye:vec3<f32>,
}
@vertex fn vs_transfer(@builtin(vertex_index) vertex:u32,@builtin(instance_index) id:u32)->FilmVertex {
 let t=transfers[(u32(u.counts.z)+id)%arrayLength(&transfers)];let a=t.ends.xy;let delta=t.ends.zw-a;
 let length=length(delta);let axis=delta/max(length,.00001);let side=vec2(-axis.y,axis.x);
 let radius=t.shape.x*.5;let pad=1.5/u.view.z;let corner=corners(vertex);
 let local=vec2((corner.x+1.)*.5*(length+2.*(radius+pad))-(radius+pad),corner.y*(radius+pad));
 let world=a+axis*local.x+side*local.y;
 var position=clip(vec3(world,0.));
 let age=u.view.w-t.shape.y;
 let maxDuration=u.drying.x*.78*1.35*(1.-u.drying.z*.25);
 let residueBound=select(0.,maxDuration*1.8+u.optics.w*(.13+.65+.70*u.bodyDrying.w),u.drying.w>0.);
 let horizon=1.+max(maxDuration*9.24*t.shape.z*t.shape.w,max(maxDuration*2.2,residueBound));
 let centre=(a+t.ends.zw)*.5-u.ground.zw;
 if(age<0.||(age>horizon&&u.counts.w>.5&&(u.pose.w>.5||u.drying.w<=0.))||any(abs(centre)-abs(delta)*.5>u.view.xy/(2.*u.view.z)+radius+pad)){position=vec4(2.,2.,0.,1.);}
 return FilmVertex(position,local,world,vec4(length,radius,t.shape.z*t.shape.w,age),t.absorption.xyz);
}
@fragment fn fs_transfer(in:FilmVertex)->@location(0) vec4<f32> {
 let nearest=vec2(clamp(in.local.x,0.,in.data.x),0.);
 let distance=length(in.local-nearest);let aa=max(fwidth(distance),.00001);
 let pore=noise(in.world*1.4+7.1);
 let radius=in.data.y*(.88+.12*smoothstep(.15,.8,pore));
 let coverage=1.-smoothstep(radius-aa*.5,radius+aa*.5,distance);
 let reach=max(sqrt(max(radius*radius-in.local.y*in.local.y,0.)),.00001);
 // Partition short overlapping capsules so segment sampling density adds no water.
 let weight=clamp((in.local.x+reach)/(2.*reach),0.,1.)-clamp((in.local.x-in.data.x+reach)/(2.*reach),0.,1.);
 let grain=noise(in.world*19.);
 let cross=abs(in.local.y)/max(in.data.y,.0001);
 let shoulders=exp(-pow((cross-.76)/.14,2.));
 let tread=.45+.55*smoothstep(.18,.75,noise(in.world*vec2(12.,8.)));
 // Menisci at the shoulders and spatially pinned small pools, not uniform strokes.
 let cells=in.world*13.;let cell=floor(cells);
 let beadUV=(fract(cells)-.5)/.28;
 let bead=pow(max(0.,1.-dot(beadUV,beadUV)),1.5)*step(.64,noise(cell+9.7))
  *(1.-smoothstep(.35,1.2,length(fwidth(cells))));
 let patchFilter=1.-smoothstep(.5,1.4,length(fwidth(in.world))*5.5);
 let filmPattern=mix(.5,noise(in.world*5.5+vec2(17.3,2.7)),patchFilter);
 let filling=smoothstep(.18,.40,filmPattern+shoulders*.10);
 let depth=.0035*in.data.z*(.20+.70*tread+.48*shoulders+.60*bead)*(.65+.65*pore)*filling;
 let irregular=clamp(u.drying.y,0.,1.);
 let duration=max(1.,u.drying.x)*(.42+.36*pore)*mix(1.,.65+grain*.7,irregular)*(1.-u.drying.z*.25);
 let elapsed=max(0.,in.data.w-1.);
 let progress=select(0.,elapsed/duration,u.counts.w>.5);
 let retained=max(0.,depth-.00075*progress*(.65+pore*.7));
 let dry=1.-smoothstep(.000005,max(.00001,depth*.2),retained);
 let retention=(clamp(depth/.0035,0.,1.)*.55+mix(.225,pore*.25+grain*.2,u.vehicle.w))*mix(.65,1.35,u.bodyDrying.w);
 let aging=max(0.,elapsed-duration*1.8)/max(1.,u.optics.w);
 let erosion=1.-smoothstep(retention-.13,retention+.13,aging);
 let dyeRemain=mix(1.,u.drying.w*.32,dry)*select(1.,mix(1.,erosion,dry),u.pose.w>.5&&u.counts.w>.5);
 let damp=depth*.012*(1.-smoothstep(.8,2.2,progress));
 let water=retained+damp;
 // Optical mass persists after water is gone, then erodes into stable pore patches.
 let aged=mix(in.dye,clamp(in.dye*.35+vec3(45.),vec3(45.),vec3(220.)),dry*.7);
 let film=coverage*max(weight,0.);
 return vec4(aged*depth*dyeRemain,water)*film;
}
