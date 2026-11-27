import * as T from './vendor/three-r180/three.module.js';
import {createMotionHistory,motionDefaults,samplePresets} from './motion-history.js';

const motionVertex=`
 uniform mat4 previousVP,currentVP,previousModel;
 uniform vec3 originShift;
 varying vec4 centerClip,cameraClip,previousClip;
 varying float eyeDepth;
 void main(){
  vec4 local=vec4(position,1.);
  #ifdef USE_INSTANCING
   local=instanceMatrix*local;
  #endif
  vec4 world=modelMatrix*local;
  centerClip=currentVP*world;
  cameraClip=previousVP*vec4(world.xyz+originShift,1.);
  previousClip=previousVP*previousModel*local;
  eyeDepth=-(viewMatrix*world).z;
  gl_Position=centerClip;
 }
`;

const motionFragment=`
 uniform float cameraAmount,bodyFactor,eligible;
 varying vec4 centerClip,cameraClip,previousClip;
 varying float eyeDepth;
 vec2 project(vec4 p){return p.xy/max(p.w,.01);}
 void main(){
  if(eligible<.5)discard;
  vec2 fixedPoint=project(cameraClip);
  vec2 motion=(project(centerClip)-fixedPoint)*cameraAmount+(fixedPoint-project(previousClip))*bodyFactor;
  gl_FragColor=vec4(motion*.5,max(.001,eyeDepth),1.);
 }
`;

const outputFragment=`
 uniform sampler2D beauty,motionDepth;
 uniform vec2 resolution;
 uniform float exposure,radius,periphery;
 uniform int samples;
 uniform bool rejectDepth,solidBackground;
 varying vec2 screenPoint;
 void main(){
  vec4 center=texture2D(beauty,screenPoint);
  vec3 velocity=texture2D(motionDepth,screenPoint).xyz;
  float edge=clamp(length(screenPoint-.5)*1.7,0.,1.);
  vec2 displacement=velocity.xy*exposure*(1.+edge*edge*periphery)*resolution;
  float span=length(displacement);
  if(span>.65&&velocity.z>.001&&velocity.z<150.){
   vec2 direction=displacement*min(1.,radius/span)/resolution;
   vec4 sum=center;
   float weights=1.;
   for(int i=0;i<24;i++){
    if(i>=samples)break;
    float portion=(float(i)+.5)/float(samples)-.5;
    vec2 lookup=clamp(screenPoint+direction*portion,0.,1.);
    vec3 neighbor=texture2D(motionDepth,lookup).xyz;
    vec2 difference=neighbor.xy-velocity.xy;
    if(!rejectDepth||(abs(neighbor.z-velocity.z)<max(.32,velocity.z*.042)
       &&dot(difference,difference)<dot(velocity.xy,velocity.xy)*2.+.000008)){
     float weight=1.-abs(portion);
     sum+=weight*texture2D(beauty,lookup);weights+=weight;
    }
   }
   center=sum/weights;
  }
  gl_FragColor=center;
  if(!solidBackground||velocity.z>.001){
   #include <tonemapping_fragment>
  }
  #include <colorspace_fragment>
 }
`;

export function createWebGLMotionBlur(renderer,body,hubs,recenteredMeshes){
 const gl=renderer.getContext();
 if(!renderer.capabilities.isWebGL2||!gl.getExtension('EXT_color_buffer_float')){
  throw Error('WebGL 2 motion blur requires EXT_color_buffer_float (half-float render targets).');
 }
 const samples=gl.getParameter(gl.SAMPLES);
 if(samples>0&&!gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES).includes(samples)){
  throw Error('This GPU cannot preserve the canvas MSAA level in the HDR motion-blur target.');
 }
 const beauty=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples});
 const depthMotion=new T.WebGLRenderTarget(1,1,{
  type:T.HalfFloatType,minFilter:T.NearestFilter,magFilter:T.NearestFilter,
 });
 const check=target=>{
  renderer.setRenderTarget(target);
  return gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
 };
 const original=renderer.getRenderTarget();
 try{
  if(!check(beauty)||!check(depthMotion))throw Error('WebGL motion-blur framebuffer is incomplete.');
 }catch(error){beauty.dispose();depthMotion.dispose();throw error;}
 finally{renderer.setRenderTarget(original);}
 const history=createMotionHistory(T,body,hubs,recenteredMeshes);
 const uniform=value=>({value});
 const opaque=material=>material&&!material.transparent&&material.depthWrite;
 const vectors=new T.ShaderMaterial({
  name:'Motion vectors',vertexShader:motionVertex,fragmentShader:motionFragment,side:T.DoubleSide,
  uniforms:{currentVP:uniform(history.currentVP),previousVP:uniform(history.previousVP),originShift:uniform(history.originShift),
   previousModel:uniform(new T.Matrix4()),cameraAmount:uniform(1),bodyFactor:uniform(1),eligible:uniform(1)},
 });
 vectors.onBeforeRender=(_r,_s,_c,_g,object,group)=>{
  const material=Array.isArray(object.material)?object.material[group?.materialIndex??0]:object.material;
  const eligible=object.isMesh&&opaque(material);
  vectors.uniforms.eligible.value=Number(Boolean(eligible));
  if(eligible){
   vectors.uniforms.previousModel.value.copy(history.previousModel(object));
   vectors.uniforms.bodyFactor.value=history.bodyFactor(object);
  }
  vectors.uniformsNeedUpdate=true;
 };
 const output=new T.ShaderMaterial({
  name:'Motion blur output',depthTest:false,depthWrite:false,
  vertexShader:'varying vec2 screenPoint;void main(){screenPoint=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader:outputFragment,
  uniforms:{beauty:uniform(beauty.texture),motionDepth:uniform(depthMotion.texture),resolution:uniform(new T.Vector2()),
   exposure:uniform(0),radius:uniform(16),periphery:uniform(0),samples:uniform(4),rejectDepth:uniform(true),solidBackground:uniform(false)},
 });
 const triangle=new T.BufferGeometry();
 triangle.setAttribute('position',new T.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
 triangle.setAttribute('uv',new T.Float32BufferAttribute([0,0,2,0,0,2],2));
 const screen=new T.Scene(),screenCamera=new T.Camera(),quad=new T.Mesh(triangle,output);
 quad.frustumCulled=false;screen.add(quad);
 const color=new T.Color(),hidden=[];
 let settings=motionDefaults,passes=0,exposure=0;
 function reset(){history.reset();exposure=0;}
 function configure(next){
  if(settings.enabled!==next.enabled){
   reset();
   if(!next.enabled){beauty.setSize(1,1);depthMotion.setSize(1,1);}
  }
  settings=next;
 }
 function render(scene,camera,p,width,height,now=performance.now()){
  if(width<1||height<1)return;
  const frame=history.begin(camera,p,width,height,settings,now);
  beauty.setSize(width,height);
  const motionRatio=settings.quality==='fast'?.5:1;
  depthMotion.setSize(Math.ceil(width*motionRatio),Math.ceil(height*motionRatio));
  const restore=renderer.getRenderTarget(),background=scene.background,material=scene.overrideMaterial;
  const shadowUpdate=renderer.shadowMap.autoUpdate,clearAlpha=renderer.getClearAlpha();
  renderer.getClearColor(color);
  const autoReset=renderer.info.autoReset;
  if(autoReset)renderer.info.reset();
  renderer.info.autoReset=false;
  try{
   try{
    renderer.setRenderTarget(beauty);renderer.render(scene,camera);
    const shadowDirty=renderer.shadowMap.needsUpdate;
    try{
     renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;
     // Omit transparent-only leaves before building the opaque velocity list.
     // Mixed-material meshes are filtered per draw group in onBeforeRender.
     scene.traverseVisible(object=>{
      if(!object.material||object.children.length)return;
      const contributes=object.isMesh&&(Array.isArray(object.material)?object.material.some(opaque):opaque(object.material));
      if(!contributes){object.visible=false;hidden.push(object);}
     });
     scene.background=null;scene.overrideMaterial=vectors;
     renderer.setClearColor(0,0);renderer.setRenderTarget(depthMotion);
     vectors.uniforms.cameraAmount.value=settings.camera;
     renderer.render(scene,camera);
    }finally{
     for(const object of hidden)object.visible=true;
     hidden.length=0;
     renderer.shadowMap.autoUpdate=shadowUpdate;renderer.shadowMap.needsUpdate=shadowDirty;
     renderer.setClearColor(color,clearAlpha);scene.background=background;scene.overrideMaterial=material;
    }
   }finally{renderer.setRenderTarget(restore);}
   const u=output.uniforms;
   u.resolution.value.set(width,height);u.exposure.value=exposure=frame.exposure;
   u.radius.value=settings.radius;u.periphery.value=frame.periphery;
   u.solidBackground.value=!!background?.isColor;
   u.samples.value=samplePresets[settings.quality]??4;u.rejectDepth.value=settings.depth;
   renderer.render(screen,screenCamera);passes++;
  }finally{renderer.info.autoReset=autoReset;}
 }
 return {render,configure,reset,info:()=>({enabled:settings.enabled,quality:settings.quality,passes,exposure,samples}),
  dispose(){beauty.dispose();depthMotion.dispose();vectors.dispose();output.dispose();triangle.dispose();}};
}
