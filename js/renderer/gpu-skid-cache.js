// Stable event-to-slot mapping: immutable geometry stays resident; only source
// opacity is streamed. No mutation of simulation events and no raster cache.
export class GPUSkidCache {
  constructor(device, cameraBuffer, pipeline, capacity = 32768) {
    this.device = device;
    this.capacity = capacity;
    this.geometry = new Float32Array(capacity * 8);
    this.alpha = new Float32Array(capacity);
    this.order = new Uint32Array(capacity);
    this.eventSlots = new Int32Array(capacity);
    this.seen = new Uint32Array(capacity);
    this.objects = new Array(capacity);
    this.slots = new WeakMap();
    this.free = [];
    this.count = 0;
    this.generation = 0;
    this.widthScale = NaN;
    this.lastInstances = -1;
    try {
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
    } catch (error) {
      this.destroy();
      throw error;
    }
  }
  update(events, widthScale, color) {
    const generation = ++this.generation;
    const start = Math.max(0, events.length - this.capacity);
    let alphaLo = this.capacity, alphaHi = -1, orderChanged = false;
    for (let i = start; i < events.length; i++) {
      const slot = this.slots.get(events[i]);
      this.eventSlots[i - start] = slot ?? -1;
      if (slot !== undefined) this.seen[slot] = generation;
    }
    for (let slot = 0; slot < this.count; slot++) {
      if (this.objects[slot] && this.seen[slot] !== generation) {
        this.slots.delete(this.objects[slot]);
        this.objects[slot] = null;
        if (this.alpha[slot] !== 0) {
          this.alpha[slot] = 0;
          alphaLo = Math.min(alphaLo, slot);
          alphaHi = Math.max(alphaHi, slot);
        }
        this.free.push(slot);
      }
    }
    let lo = this.capacity,
      hi = -1;
    for (let i = start; i < events.length; i++) {
      const seg = events[i];
      const knownSlot = this.eventSlots[i - start];
      // Resolve each retained event only once; newly duplicated source objects
      // still share a slot when inserted earlier in this same update.
      let slot = knownSlot < 0 ? this.slots.get(seg) : knownSlot;
      const fresh = slot === undefined;
      if (fresh) {
        slot = this.free.length ? this.free.pop() : this.count++;
        this.slots.set(seg, slot);
        this.objects[slot] = seg;
      }
      if (this.order[i - start] !== slot) orderChanged = true;
      this.order[i - start] = slot; // Preserve pigment overlap after slot reuse.
      const alpha = Math.fround(seg.alpha ?? 0.55);
      if (this.alpha[slot] !== alpha) {
        this.alpha[slot] = alpha;
        alphaLo = Math.min(alphaLo, slot);
        alphaHi = Math.max(alphaHi, slot);
      }
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
    if (alphaHi >= alphaLo) {
      const count = alphaHi - alphaLo + 1;
      this.device.queue.writeBuffer(this.alphaBuffer, alphaLo * 4,
        this.alpha, alphaLo, count);
      uploadedBytes += count * 4;
    }
    const instances = events.length - start;
    if (instances && (orderChanged || this.lastInstances !== instances)) {
      this.device.queue.writeBuffer(
        this.orderBuffer,
        0,
        this.order,
        0,
        instances,
      );
      uploadedBytes += instances * 4;
    }
    this.lastInstances = instances;
    return { uploadedBytes, instances, omitted: start };
  }
  destroy() {
    this.geometryBuffer?.destroy();
    this.alphaBuffer?.destroy();
    this.orderBuffer?.destroy();
  }
}
