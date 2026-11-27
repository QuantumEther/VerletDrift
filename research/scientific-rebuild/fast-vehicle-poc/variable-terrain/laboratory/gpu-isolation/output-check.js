// Sample the submitted canvas texture before the browser takes it for presentation.
// Encode the copy synchronously in the render callback; map only during preflight.
export async function sampleCanvasTexture(canvas) {
  const context=canvas.getContext('webgpu');
  const {device,format}=context.getConfiguration();
  if(!['rgba8unorm','bgra8unorm'].includes(format))throw Error('Unsupported probe format '+format);
  const texture=context.getCurrentTexture();
  const points=[[.5,.5],[.05,.05],[.9,.1],[.2,.8],[.6,.9]];
  const buffer=device.createBuffer({size:256*points.length,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  try{
    const encoder=device.createCommandEncoder();
    points.forEach(([x,y],i)=>encoder.copyTextureToBuffer(
      {texture,origin:[Math.floor(canvas.width*x),Math.floor(canvas.height*y)]},
      {buffer,offset:i*256,bytesPerRow:256},[1,1]));
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const bytes=new Uint8Array(buffer.getMappedRange());
    return points.map((_,i)=>{
      const [a,g,b,alpha]=bytes.slice(i*256,i*256+4);
      return format==='bgra8unorm'?[b,g,a,alpha]:[a,g,b,alpha];
    });
  }finally{buffer.destroy();}
}
