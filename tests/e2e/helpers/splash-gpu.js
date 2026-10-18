// Test/capture instrumentation only: real WGSL into a readable GPU texture.
// Avoids this cloud's unsupported native swapchain; never changes app shaders.
export async function offscreenSplash(page) {
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){
      if(type!=='webgpu'||this.id!=='splash')return original.call(this,type,...args);
      const canvas=this;let device,format,texture,width,height;
      return {
        configure(options){device=options.device;format=options.format;window.__splashGPU={device,get texture(){return texture;}};},
        getCurrentTexture(){
          if(!texture||width!==canvas.width||height!==canvas.height){
            texture?.destroy();width=canvas.width;height=canvas.height;
            texture=device.createTexture({label:'test-readable-splash-target',size:[width,height],format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
          }
          return texture;
        },
        unconfigure(){texture?.destroy();},
      };
    };
  });
}
export async function splashPixels(page,paint=false) {
  return page.evaluate(async paint=>{
    const {device,texture}=window.__splashGPU;
    const width=texture.width,height=texture.height,stride=Math.ceil(width*4/256)*256;
    const read=device.createBuffer({size:stride*height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    const encoder=device.createCommandEncoder();encoder.copyTextureToBuffer({texture},{buffer:read,bytesPerRow:stride},[width,height]);
    device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);
    const source=new Uint8Array(read.getMappedRange()),pixels=new Uint8ClampedArray(width*height*4);
    for(let y=0;y<height;y++)pixels.set(source.subarray(y*stride,y*stride+width*4),y*width*4);
    if(texture.format==='bgra8unorm')for(let i=0;i<pixels.length;i+=4){const r=pixels[i];pixels[i]=pixels[i+2];pixels[i+2]=r;}
    read.unmap();read.destroy();let hash=2166136261,red=0,bright=0;
    for(let i=0;i<pixels.length;i++){hash=Math.imul(hash^pixels[i],16777619)>>>0;if(i%4===0){if(pixels[i]>pixels[i+1]*1.6&&pixels[i]>pixels[i+2]*1.5&&pixels[i]>48)red++;if(pixels[i]>180&&pixels[i+1]>140)bright++;}}
    if(paint){const ctx=document.getElementById('splash').getContext('2d');ctx.putImageData(new ImageData(pixels,width,height),0,0);}
    return {hash,red,bright,width,height};
  },paint);
}
export async function seekSplash(page,time) {
  const before=await page.evaluate(()=>window.splashLab.renderer.stats.frames);
  await page.evaluate(time=>window.splashLab.seek(time),time);
  await page.waitForFunction(before=>window.splashLab.renderer.stats.frames>before,before);
}
