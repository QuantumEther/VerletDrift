import {getWetTireTransfers,MAX_WET_TRANSFERS} from './wet-trail-events.js';
import {dyeAbsorption} from './liquid-settings.js';
import {liquidShaderSource} from './liquid-shader-source.js';
// Conservative envelope of the shader's maximum local retention, not a fade clock.
function lifetime(s,e){
 const duration=s.dryingDuration*.78*1.35*(1.-s.surfaceAbsorption*.25);
 return 1+Math.max(duration*9.24*e.dose*e.saturation,duration*2.2,
  s.dyeResidue>0?duration*1.8+s.residueLifetime*(.13+.65+.70*s.residuePersistence):0);
}
export class WetTrails {
 constructor(device,frame){this.device=device;this.frame=frame;this.count=0;this.serial=-1;this.generation=-1;}
 async init(common){
  const d=this.device;
  const module=d.createShaderModule({label:'wet-tire-deposition',code:common+await liquidShaderSource('wet-trails')});
  const errors=(await module.getCompilationInfo()).messages.filter(m=>m.type==='error');
  if(errors.length)throw Error(errors.map(e=>e.message).join('\n'));
  this.pipeline=await d.createRenderPipelineAsync({label:'wet-tire-field',layout:'auto',vertex:{module,entryPoint:'vs_transfer'},fragment:{module,entryPoint:'fs_transfer',targets:[{format:'rgba16float',blend:{color:{srcFactor:'one',dstFactor:'one',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one',operation:'add'}}}]},primitive:{topology:'triangle-list'}});
  this.buffer=d.createBuffer({label:'wet-tire-history',size:MAX_WET_TRANSFERS*48,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  this.group=d.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.frame}},{binding:1,resource:{buffer:this.buffer}}]});
  this.data=new Float32Array(MAX_WET_TRANSFERS*12);
 }
 get bytes(){return (this.buffer?.size??0)+(this.width??0)*(this.height??0)*8;}
 get resourceCount(){return (this.buffer?1:0)+(this.texture?1:0);}
 active(time,s){const {events}=getWetTireTransfers();return events.some(e=>time>=e.time&&(!s.dryingEnabled||(s.dyeResidue>0&&!s.residueAging)||time<e.time+lifetime(s,e)));}
 prepare(width,height,widthScale=1){
  const {events,generation,serial}=getWetTireTransfers();this.uploadBytes=0;
  if(serial!==this.serial||generation!==this.generation||widthScale!==this.widthScale){
   const reset=generation!==this.generation||widthScale!==this.widthScale;
   const start=reset?0:Math.max(0,this.serial-(events[0]?.id??1)+1);
   const ranges=[];let range;
   for(let i=start;i<events.length;i++){
    const e=events[i],slot=(e.id-1)%MAX_WET_TRANSFERS;
    this.data.set([e.x1,e.y1,e.x2,e.y2,e.width*widthScale,e.time,e.dose,e.saturation,...dyeAbsorption(e.hue),0],slot*12);
    if(!range||slot!==range.end){range={start:slot,end:slot+1};ranges.push(range);}else range.end++;
   }
   for(const r of ranges){const n=(r.end-r.start)*12;this.device.queue.writeBuffer(this.buffer,r.start*48,this.data,r.start*12,n);this.uploadBytes+=n*4;}
   this.count=events.length;this.serial=serial;this.generation=generation;this.firstSlot=((events[0]?.id??1)-1)%MAX_WET_TRANSFERS;this.widthScale=widthScale;
  }
  // Empty scenes need a valid binding, not a full-resolution unused field.
  if(!this.count){width=1;height=1;}
  if(this.width===width&&this.height===height)return;
  const texture=this.device.createTexture({label:'wet-tire-optical-field',size:[width,height],format:'rgba16float',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});
  this.texture?.destroy();this.texture=texture;this.view=texture.createView();this.width=width;this.height=height;this.empty=false;
 }
 encode(encoder){
  const count=this.enabled===false?0:this.count;
  if(!count&&this.empty)return 0;
  const p=encoder.beginRenderPass({label:'wet-tire-film-deposition',colorAttachments:[{view:this.view,loadOp:'clear',storeOp:'store',clearValue:[0,0,0,0]}]});
  if(count){p.setPipeline(this.pipeline);p.setBindGroup(0,this.group);p.draw(6,count);}
  p.end();this.empty=!count;return count?1:0;
 }
 destroy(){this.texture?.destroy();this.buffer?.destroy();}
}
