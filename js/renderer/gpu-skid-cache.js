// Stable event-to-slot mapping: immutable geometry stays resident; only source
// opacity is streamed. No mutation of simulation events and no raster cache.
export class GPUSkidCache {
  constructor(device, cameraBuffer, pipeline, capacity = 32768) {
    this.device = device;
    this.capacity = capacity;
    this.geometry = new Float32Array(capacity * 8);
    this.alpha = new Float32Array(capacity);
    this.order = new Uint32Array(capacity);
    this.seen = new Uint32Array(capacity);
    this.objects = new Array(capacity);
    this.slots = new WeakMap();
    this.free = [];
    this.count = 0;
    this.generation = 0;
    this.widthScale = NaN;
    this.geometryBuffer = device.createBuffer({
      label: "skidGeometry",
      size: capacity * 32,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.alphaBuffer = device.createBuffer({
      label: "skidOpacity",
      size: capacity * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.orderBuffer = device.createBuffer({
      label: "skidDrawOrder",
      size: capacity * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: cameraBuffer } },
        { binding: 1, resource: { buffer: this.geometryBuffer } },
        { binding: 2, resource: { buffer: this.alphaBuffer } },
        { binding: 3, resource: { buffer: this.orderBuffer } },
      ],
    });
  }
  update(events, widthScale, color) {
    const generation = ++this.generation;
    const start = Math.max(0, events.length - this.capacity);
    for (let i = start; i < events.length; i++) {
      const slot = this.slots.get(events[i]);
      if (slot !== undefined) this.seen[slot] = generation;
    }
    for (let slot = 0; slot < this.count; slot++) {
      if (this.objects[slot] && this.seen[slot] !== generation) {
        this.slots.delete(this.objects[slot]);
        this.objects[slot] = null;
        this.alpha[slot] = 0;
        this.free.push(slot);
      }
    }
    let lo = this.capacity,
      hi = -1;
    for (let i = start; i < events.length; i++) {
      const seg = events[i];
      let slot = this.slots.get(seg);
      const fresh = slot === undefined;
      if (fresh) {
        slot = this.free.length ? this.free.pop() : this.count++;
        this.slots.set(seg, slot);
        this.objects[slot] = seg;
      }
      this.order[i - start] = slot; // Source order preserves pigment overlap after slot reuse.
      this.alpha[slot] = seg.alpha ?? 0.55;
      if (fresh || widthScale !== this.widthScale) {
        const base = slot * 8;
        this.geometry[base] = seg.x1;
        this.geometry[base + 1] = seg.y1;
        this.geometry[base + 2] = seg.x2;
        this.geometry[base + 3] = seg.y2;
        this.geometry[base + 4] = (seg.width ?? 0.28) * widthScale;
        color(seg, this.geometry, base + 5);
        lo = Math.min(lo, slot);
        hi = Math.max(hi, slot);
      }
    }
    this.widthScale = widthScale;
    let uploadedBytes = 0;
    if (hi >= lo) {
      const floats = (hi - lo + 1) * 8;
      this.device.queue.writeBuffer(
        this.geometryBuffer,
        lo * 32,
        this.geometry,
        lo * 8,
        floats,
      );
      uploadedBytes += floats * 4;
    }
    if (this.count) {
      this.device.queue.writeBuffer(
        this.alphaBuffer,
        0,
        this.alpha,
        0,
        this.count,
      );
      uploadedBytes += this.count * 4;
    }
    const instances = events.length - start;
    if (instances) {
      this.device.queue.writeBuffer(
        this.orderBuffer,
        0,
        this.order,
        0,
        instances,
      );
      uploadedBytes += instances * 4;
    }
    return { uploadedBytes, instances, omitted: start };
  }
  destroy() {
    this.geometryBuffer.destroy();
    this.alphaBuffer.destroy();
    this.orderBuffer.destroy();
  }
}
