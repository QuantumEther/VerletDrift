// Optional, sparsely sampled GPU execution timestamps. Render and smoke compute
// are measured separately; neither includes Canvas or browser presentation.
export class GPUTiming {
  constructor(device) {
    this.device = device;
    this.pending = false;
    this.frame = 0;
    this.active = false;
    this.closed = false;
    this.milliseconds = null;
    this.computeMilliseconds = null;
    this.sampleCount = 0;
    try {
      this.queries = device.createQuerySet({ type: 'timestamp', count: 4 });
      this.resolve = device.createBuffer({ size: 32,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
      this.readback = device.createBuffer({ size: 32,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    } catch (error) { this.destroy(); throw error; }
  }
  startFrame() {
    this.active = !this.pending && ++this.frame % 30 === 0;
    this.computeWritten = false;
  }
  begin(stage = 'render') {
    if (!this.active) return undefined;
    const offset = stage === 'compute' ? 0 : 2;
    if (stage === 'compute') this.computeWritten = true;
    return { querySet: this.queries, beginningOfPassWriteIndex: offset,
      endOfPassWriteIndex: offset + 1 };
  }
  encode(encoder) {
    if (!this.active) return;
    // Unwritten query values are ignored when no compute pass was dispatched.
    encoder.resolveQuerySet(this.queries, 0, 4, this.resolve, 0);
    encoder.copyBufferToBuffer(this.resolve, 0, this.readback, 0, 32);
    this.pending = true;
  }
  submitted() {
    if (!this.active) return;
    const computed = this.computeWritten;
    this.readback.mapAsync(GPUMapMode.READ).then(() => {
      const values = new BigUint64Array(this.readback.getMappedRange());
      if (!this.closed) {
        this.milliseconds = Number(values[3] - values[2]) / 1e6;
        this.computeMilliseconds = computed ? Number(values[1] - values[0]) / 1e6 : 0;
        this.sampleCount++;
      }
      this.readback.unmap();
    }).catch(() => {}).finally(() => { this.pending = false; });
  }
  destroy() {
    this.closed = true;
    this.queries?.destroy(); this.resolve?.destroy(); this.readback?.destroy();
  }
}
