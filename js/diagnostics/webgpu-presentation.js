// Isolated GPU image-import probe: no simulator imports, shaders or readbacks.
const pause = () => new Promise(resolve => requestAnimationFrame(resolve));
async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('Probe timed out (keep this tab visible)')), 6000);
    })]);
  } finally { clearTimeout(timer); }
}

export async function probePresentation(canvas, {
  powerPreference = 'high-performance', alphaMode = 'premultiplied',
  width = 960, height = 720, offscreen = false,
} = {}) {
  const result = { powerPreference, alphaMode, width, height, offscreen,
    passed: false, errors: [], frames: 0 };
  let adapter, device, context, texture, active = true;
  const fail = message => {
    if (active && !result.errors.includes(message)) result.errors.push(message);
  };
  try {
    if (!navigator.gpu) throw Error('WebGPU is unavailable in this browser/context');
    adapter = await bounded(navigator.gpu.requestAdapter({ powerPreference }));
    if (!adapter) throw Error('Browser returned no WebGPU adapter');
    const info = adapter.info;
    result.adapter = { vendor: info?.vendor, architecture: info?.architecture,
      device: info?.device, description: info?.description,
      isFallbackAdapter: info?.isFallbackAdapter ?? adapter.isFallbackAdapter ?? null };
    device = await bounded(adapter.requestDevice().then(value => {
      if (!active) { value.destroy(); throw Error('Probe expired'); }
      return value;
    }));
    device.addEventListener('uncapturederror', event => {
      event.preventDefault();
      fail(event.error.message);
    });
    device.lost.then(info => fail(`Device lost: ${info.reason}: ${info.message}`));
    const format = navigator.gpu.getPreferredCanvasFormat();
    result.format = format;
    if (offscreen) {
      texture = device.createTexture({ size: [width, height], format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT });
    } else {
      canvas.width = width;
      canvas.height = height;
      context = canvas.getContext('webgpu');
      if (!context) throw Error('WebGPU canvas context unavailable');
      context.configure({ device, format, alphaMode });
    }
    for (let i = 0; i < 12 && !result.errors.length; i++) {
      await bounded(pause());
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [{
        view: (texture || context.getCurrentTexture()).createView(),
        clearValue: { r: 0.08, g: 0.25 + i / 120, b: 0.18, a: 1 },
        loadOp: 'clear', storeOp: 'store',
      }] });
      pass.end();
      device.queue.submit([encoder.finish()]);
      // Completion waits are confined to this tiny diagnostic, never production.
      await bounded(device.queue.onSubmittedWorkDone());
      result.frames++;
    }
    // Give asynchronous validation/device-loss notifications time to arrive.
    await bounded(pause());
    await new Promise(resolve => setTimeout(resolve, 100));
    result.passed = result.frames === 12 && !result.errors.length;
  } catch (error) { fail(String(error.message || error)); }
  finally {
    active = false; // Deliberate cleanup is not a test failure.
    context?.unconfigure();
    texture?.destroy();
    device?.destroy();
    adapter = null;
  }
  return result;
}
