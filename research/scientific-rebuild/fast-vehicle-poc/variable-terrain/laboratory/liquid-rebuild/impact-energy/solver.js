// REJECTED physical experiment. Not enabled in the application. See README.md.
import {createPBF} from '../pbf.js';
import {instrument} from './shader.js';
const extras=['startSearch','trial','clearTrial','buildTrial','trialDensity','chooseTrial','requireTrial','commitCorrection','validateDensity'];
export async function createImpactSolver(device,config={},safeguard=false){
 const source=await(await fetch(new URL('../pbf.wgsl',import.meta.url))).text(),base=await createPBF(device,{...config,shaderSource:instrument(source,safeguard),ledgerFloats:24,statusSlots:safeguard?8:0,extraEntries:safeguard?extras:[]});
 const dispatch=base.debug.dispatch;
 function schedule(encoder){dispatch(encoder,'clear',32768);dispatch(encoder,'buildCurrent');dispatch(encoder,'predict');for(let i=0;i<base.iterations;i++){
  dispatch(encoder,'clear',32768);dispatch(encoder,'buildPredicted');dispatch(encoder,'lambdaPass');dispatch(encoder,'correction');
  if(safeguard){dispatch(encoder,'startSearch',1);for(let j=0;j<6;j++){dispatch(encoder,'trial');dispatch(encoder,'clearTrial',32768);dispatch(encoder,'buildTrial');dispatch(encoder,'trialDensity');dispatch(encoder,'chooseTrial',1);}dispatch(encoder,'requireTrial',1);dispatch(encoder,'commitCorrection');}dispatch(encoder,'copyPredicted');
 }if(safeguard){dispatch(encoder,'clear',32768);dispatch(encoder,'buildPredicted');dispatch(encoder,'lambdaPass');dispatch(encoder,'validateDensity',1);}dispatch(encoder,'finish');base.debug.attempt();}
 async function snapshot(){const buffers=base.debug.buffers,fields=['positions','velocities','predicted','corrected','lambda','ledger'],sizes=fields.map(k=>k==='lambda'?base.count*8:k==='ledger'?base.count*96:base.count*16),total=sizes.reduce((a,b)=>a+b,0),out=device.createBuffer({size:total,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),encoder=device.createCommandEncoder();let offset=0;for(let i=0;i<fields.length;i++){encoder.copyBufferToBuffer(buffers[fields[i]],0,out,offset,sizes[i]);offset+=sizes[i];}device.queue.submit([encoder.finish()]);await out.mapAsync(GPUMapMode.READ);const mapped=out.getMappedRange(),result={};offset=0;for(let i=0;i<fields.length;i++){result[fields[i]]=new Float32Array(mapped.slice(offset,offset+sizes[i]));offset+=sizes[i];}out.unmap();out.destroy();return result;}
 async function traceStep(capture){
  // Validation only: asynchronous stage readback is never used by the live loop.
  const submit=async names=>{const encoder=device.createCommandEncoder();for(const [name,n]of names)dispatch(encoder,name,n??base.count);device.queue.submit([encoder.finish()]);return snapshot();};
  const start=await snapshot();await capture('before',start,{iteration:-1});let state=await submit([['clear',32768],['buildCurrent'],['predict']]);await capture('force-and-predictor-collision',state,{iteration:-1});
  for(let i=0;i<base.iterations;i++){
   state=await submit([['clear',32768],['buildPredicted'],['lambdaPass']]);await capture('density-linearization',state,{iteration:i});
   state=await submit([['correction']]);await capture(safeguard?'jacobi-direction':'density-and-collision',state,{iteration:i});
   if(safeguard){await submit([['startSearch',1]]);for(let j=0;j<6;j++){state=await submit([['trial'],['clearTrial',32768],['buildTrial'],['trialDensity'],['chooseTrial',1]]);await capture('line-search-trial',state,{iteration:i,trial:j});}state=await submit([['requireTrial',1],['commitCorrection']]);await capture('accepted-or-rejected-correction',state,{iteration:i});}
   await submit([['copyPredicted']]);
  }
  if(safeguard)await submit([['clear',32768],['buildPredicted'],['lambdaPass'],['validateDensity',1]]);
  state=await submit([['finish']]);base.debug.attempt();await capture('finish-velocity-reconstruction',state,{iteration:base.iterations});return {start,end:state,status:(await base.readback()).status};
 }
 return {...base,step:schedule,snapshot,traceStep,info:()=>({...base.info(),safeguardedProjection:safeguard,maxLineSearchTrials:safeguard?6:0})};
}
