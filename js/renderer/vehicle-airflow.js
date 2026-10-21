import {dustHistory} from './dust-history.js';
import {buildDustTransport,DUST_VORTICES} from './dust-vortices.js';
import {GPUComputeTiming} from './gpu-compute-timing.js';

// Same shed cores as dust, evaluated as instantaneous velocity, never dust offsets.
const ALL_WORLD=Object.freeze({left:-Infinity,right:Infinity,top:-Infinity,bottom:Infinity});
export const AIRFLOW_SIZE=96, AIRFLOW_SPACING=.75, AIRFLOW_VORTICES=48;
export const SMOKE_AIRFLOW_CONTROLS=[
 {id:'smokeAirflowEnabled',label:'Vehicle airflow',value:true,min:0,max:1,step:1,type:'checkbox'},
 {id:'smokeAirflowStrength',label:'Smoke airflow influence',value:1,min:0,max:2,step:.05,type:'range'},
].map(c=>({...c,unit:'',subsystem:'Rendering',section:'💨 Tire Smoke',group:'Rendering / Smoke airflow',groupLabel:'Smoke airflow'}));
export const SMOKE_AIRFLOW_DEFAULTS=Object.freeze(Object.fromEntries(SMOKE_AIRFLOW_CONTROLS.map(c=>[c.id,c.value])));

export class VehicleAirflow {
 constructor(device){
  this.device=device;this.resources=[];this.data=new Float32Array(16);
  this.poses=new Float32Array(DUST_VORTICES*8);this.vortices=new Float32Array(DUST_VORTICES*8);
  this.stats={active:false,vortices:0,dispatches:0,computeWorkgroups:0,uploadBytes:0,gpuFieldMs:null,gpuSamples:0};
  const buffer=(label,size,usage)=>{const b=device.createBuffer({label,size,usage:usage|GPUBufferUsage.COPY_DST});this.resources.push(b);return b;};
  this.uniform=buffer('vehicleAirflowFrame',64,GPUBufferUsage.UNIFORM);
  this.cores=buffer('vehicleAirflowCores',AIRFLOW_VORTICES*32,GPUBufferUsage.STORAGE);
  this.field=buffer('vehicleAirflowVelocity',AIRFLOW_SIZE**2*16,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC);
  this.baseBytes=64+AIRFLOW_VORTICES*32+AIRFLOW_SIZE**2*16;
 }
 get bytes(){return this.baseBytes+(this.timing?32:0);}
 get resourceCount(){return this.resources.length+(this.timing?3:0);}
 async init(){
  const r=await fetch(new URL('../shaders/vehicle-airflow.wgsl?v=1',import.meta.url));
  if(!r.ok)throw Error(`Vehicle airflow shader: ${r.status}`);
  const module=this.device.createShaderModule({label:'vehicle-airflow',code:await r.text()});
  this.pipeline=await this.device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'prepareAirflow'}});
  this.group=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[this.uniform,this.cores,this.field].map((buffer,binding)=>({binding,resource:{buffer}}))});
 }
 smokeGroup(pipeline){return this.device.createBindGroup({layout:pipeline.getBindGroupLayout(1),entries:[this.uniform,this.field].map((buffer,binding)=>({binding,resource:{buffer}}))});}
 prepare(state,profile=false,simulate=true){
  const b=state.body,p=state.params,t=state.loop.simulationTime;
  const strength=p.smokeAirflowEnabled!==false?Math.max(0,Math.min(2,p.smokeAirflowStrength??1)):0;
  const wasActive=this.stats.active;
  this.stats.active=!!this.pipeline&&strength>0&&simulate;this.stats.dispatches=0;this.stats.computeWorkgroups=0;this.stats.uploadBytes=64;
  if(profile&&this.device.features.has('timestamp-query')&&!this.timing){try{this.timing=new GPUComputeTiming(this.device);}catch{}}
  if(!profile&&this.timing){this.timing.destroy();this.timing=null;}
  this.stats.gpuFieldMs=this.timing?.milliseconds??null;this.stats.gpuSamples=this.timing?.samples??0;
  const history=dustHistory(),life=Math.max(.5,Math.min(4,p.dustPersistence??4));
  const angle=(p.dustWindDirection??25)*Math.PI/180,wind=p.dustWind??.12,disturbance=Math.max(0,Math.min(2,p.dustDisturbance??1));
  // Smoke integrates each render update; the smooth velocity field needs at most
  // 60 updates/s. Keep its world origin frozen with its samples between updates.
  const sameSettings=this.lastLife===life&&this.lastWind===wind&&this.lastAngle===angle&&this.lastDisturbance===disturbance;
  this.needsUpdate=this.stats.active&&(!wasActive||!sameSettings||history.generation!==this.lastGeneration||
    history.serial!==this.lastSerial||t<this.lastTime||t-this.lastTime>=1/60-1e-7||this.lastTime===undefined);
  if(!this.needsUpdate){
   this.data[5]=this.stats.active?strength:0;
   this.device.queue.writeBuffer(this.uniform,0,this.data);
   if(!this.stats.active)this.stats.vortices=0;
   return;
  }
  const ox=Math.floor((b.centerX-Math.max(-12,Math.min(12,b.velocityX*.5)))/AIRFLOW_SPACING)*AIRFLOW_SPACING-(AIRFLOW_SIZE-1)*AIRFLOW_SPACING/2;
  const oy=Math.floor((b.centerY-Math.max(-12,Math.min(12,b.velocityY*.5)))/AIRFLOW_SPACING)*AIRFLOW_SPACING-(AIRFLOW_SIZE-1)*AIRFLOW_SPACING/2;
  const counts=buildDustTransport(history,t,ALL_WORLD,this.poses,this.vortices);
  // At 5 pairs/s, four seconds require at most 42 cores (inclusive boundaries).
  let first=0;while(first<counts.vortices&&t-this.vortices[first*8+2]>life)first++;
  first=Math.max(first,counts.vortices-AIRFLOW_VORTICES);const n=counts.vortices-first;
  this.stats.vortices=n;
  this.data.set([b.centerX,b.centerY,b.velocityX,b.velocityY,b.heading,strength,t,n,ox,oy,AIRFLOW_SPACING,AIRFLOW_SIZE,life,Math.cos(angle)*wind,Math.sin(angle)*wind,disturbance]);
  this.device.queue.writeBuffer(this.uniform,0,this.data);
  if(n){this.device.queue.writeBuffer(this.cores,0,this.vortices,first*8,n*8);this.stats.uploadBytes+=n*32;}
  this.lastTime=t;this.lastGeneration=history.generation;this.lastSerial=history.serial;
  this.lastLife=life;this.lastWind=wind;this.lastAngle=angle;this.lastDisturbance=disturbance;
 }
 encode(encoder){
  if(!this.needsUpdate)return 0;
  const pass=encoder.beginComputePass({label:'vehicle-airflow-grid',timestampWrites:this.timing?.begin()});
  pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.group);pass.dispatchWorkgroups(AIRFLOW_SIZE/8,AIRFLOW_SIZE/8);pass.end();
  this.timing?.encode(encoder);this.stats.dispatches=1;this.stats.computeWorkgroups=(AIRFLOW_SIZE/8)**2;return this.stats.computeWorkgroups;
 }
 submitted(){this.timing?.submitted();}
 destroy(){this.timing?.destroy();for(const r of this.resources)r.destroy();this.resources.length=0;}
}
