// Rendering coordinates are vehicle-centred, Z-up. This layer never accesses physics.
export function propagation(distance,frontCos,{reference=1,maxDistance=100,temperature=20,humidity=50,distanceEnabled=true,atmosphere=true,direction=true,cabin=false}={}){
 const r=Math.max(0,distance),ref=Math.max(.1,reference),amplitude=distanceEnabled?ref/Math.max(ref,r):1;
 // Smooth cutoff beyond the declared audible range. A bounded two-band approximation,
 // not ISO 9613-1: humidity and temperature affect an empirical HF loss coefficient.
 const fade=distanceEnabled?1-Math.min(1,Math.max(0,(r-maxDistance*.8)/(maxDistance*.2)))**2:1;
 const excess=Math.max(0,r-ref),hfDb=atmosphere?excess*.012*(1+.005*Math.abs(humidity-50))*(293.15/(temperature+273.15)):0;
 const rear=Math.max(0,-frontCos),front=Math.max(0,frontCos),direct=direction?1+.12*rear-.06*front:1;const directionalHfDb=direction?.6*front-1.4*rear:0;
 return {distance:r,gain:amplitude*fade*direct*(cabin?.72:1),attenuationDb:20*Math.log10(Math.max(1e-8,amplitude*fade)),hfDb,directionalHfDb,cabin,frontCos};
}
export function dopplerRatio(sourceVelocity,listenerVelocity,unitToListener,speed=343){
 const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],source=dot(sourceVelocity,unitToListener),listener=dot(listenerVelocity,unitToListener);
 return Math.max(.8,Math.min(1.25,(speed-listener)/(speed-source)));
}
export function createSpatialAudio(ctx,input){
 let panner;try{panner=ctx.createPanner();}catch(e){input.connect(ctx.destination);return {output:input,configure(){},update(){},info:()=>({settings:{mode:'off'},diagnostics:null,error:'Spatial audio unavailable: '+e.message}),dispose(){input.disconnect(ctx.destination);}};}
 const output=ctx.createGain(),dry=ctx.createGain(),wet=ctx.createGain(),gain=ctx.createGain(),filter=ctx.createBiquadFilter(),cab=ctx.createBiquadFilter();
 dry.gain.value=1;wet.gain.value=0;filter.type='highshelf';filter.frequency.value=4000;cab.type='lowpass';cab.frequency.value=22000;panner.distanceModel='inverse';panner.rolloffFactor=0;panner.panningModel='equalpower';
 input.connect(dry);dry.connect(output);input.connect(gain);gain.connect(filter);filter.connect(cab);cab.connect(panner);panner.connect(wet);wet.connect(output);output.connect(ctx.destination);
 let settings={mode:'off',distanceEnabled:true,atmosphere:true,direction:true,cabin:true,reference:1,maxDistance:100,temperature:20,humidity:50},diagnostics=null;
 function configure(s){Object.assign(settings,s);for(const [key,lo,hi,fallback] of [['reference',.1,20,1],['maxDistance',20,500,100],['temperature',-30,50,20],['humidity',0,100,50]])settings[key]=Number.isFinite(settings[key])?Math.max(lo,Math.min(hi,settings[key])):fallback;if(!['off','stereo','hrtf'].includes(settings.mode))settings.mode='off';const now=ctx.currentTime,on=settings.mode!=='off';dry.gain.setTargetAtTime(on?0:1,now,.03);wet.gain.setTargetAtTime(on?1:0,now,.03);panner.panningModel=settings.mode==='hrtf'?'HRTF':'equalpower';}
 function update(frame){if(!frame)return;const {source,listener,forward,up,heading,interior,worldOffset=[0,0,0]}=frame;const d=listener.map((v,i)=>v-source[i]),r=Math.hypot(...d),frontCos=r?(Math.cos(heading)*d[0]+Math.sin(heading)*d[1])/r:0;diagnostics=propagation(r,frontCos,{...settings,cabin:interior&&settings.cabin});const toSource=d.map(v=>-v),right=[forward[1]*up[2]-forward[2]*up[1],forward[2]*up[0]-forward[0]*up[2],forward[0]*up[1]-forward[1]*up[0]],dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);diagnostics.bearingDegrees=Math.atan2(dot(toSource,right),dot(toSource,forward))*180/Math.PI;diagnostics.sourceWorld=source.map((v,i)=>v+worldOffset[i]);diagnostics.listenerWorld=listener.map((v,i)=>v+worldOffset[i]);const now=ctx.currentTime;
  // Keep positions in the renderer's common vehicle-relative frame. Web Audio uses
  // the same numerical vectors; orientation explicitly supplies Z-up.
  for(const [param,v] of [[panner.positionX,source[0]],[panner.positionY,source[1]],[panner.positionZ,source[2]],[ctx.listener.positionX,listener[0]],[ctx.listener.positionY,listener[1]],[ctx.listener.positionZ,listener[2]],[ctx.listener.forwardX,forward[0]],[ctx.listener.forwardY,forward[1]],[ctx.listener.forwardZ,forward[2]],[ctx.listener.upX,up[0]],[ctx.listener.upY,up[1]],[ctx.listener.upZ,up[2]]])param.setTargetAtTime(v,now,.03);
  gain.gain.setTargetAtTime(diagnostics.gain,now,.04);filter.gain.setTargetAtTime(diagnostics.directionalHfDb-diagnostics.hfDb,now,.05);cab.frequency.setTargetAtTime(diagnostics.cabin?4500:22000,now,.05);
 }
 configure(settings);
 return {output,configure,update,info:()=>({settings:{...settings},diagnostics}),dispose(){input.disconnect(dry);input.disconnect(gain);for(const n of [dry,wet,gain,filter,cab,panner,output])n.disconnect();}};
}
