// Optional, asynchronous pass timestamps. No queue waits or synchronous readbacks.
export class GPUComputeTiming {
 constructor(device){
  this.device=device;this.frame=0;this.pending=false;this.active=false;this.closed=false;this.samples=0;this.milliseconds=null;
  try{
   this.query=device.createQuerySet({type:'timestamp',count:2});
   this.resolve=device.createBuffer({size:16,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC});
   this.readback=device.createBuffer({size:16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  }catch(e){this.destroy();throw e;}
 }
 begin(){this.active=!this.pending&&++this.frame%10===0;return this.active?{querySet:this.query,beginningOfPassWriteIndex:0,endOfPassWriteIndex:1}:undefined;}
 encode(encoder){if(!this.active)return;encoder.resolveQuerySet(this.query,0,2,this.resolve,0);encoder.copyBufferToBuffer(this.resolve,0,this.readback,0,16);this.pending=true;}
 submitted(){
  if(!this.active)return;this.active=false;
  this.readback.mapAsync(GPUMapMode.READ).then(()=>{
   if(!this.closed){const v=new BigUint64Array(this.readback.getMappedRange());this.milliseconds=Number(v[1]-v[0])/1e6;this.samples++;this.readback.unmap();}
  }).catch(()=>{}).finally(()=>{this.pending=false;});
 }
 destroy(){this.closed=true;this.query?.destroy();this.resolve?.destroy();this.readback?.destroy();}
}
