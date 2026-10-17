// Optional asynchronous render-pass timestamps. Never infer GPU duration from
// JS encode time and never wait for the queue on the frame's critical path.
export class GPUTiming {
  constructor(device) {
    this.device = device;
    this.pending = false;
    this.frame = 0;
    this.active = false;
    this.closed = false;
    this.milliseconds = null;
    this.queries = device.createQuerySet({ type: "timestamp", count: 2 });
    this.resolve = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    this.readback = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
  }
  begin() {
    this.active = !this.pending && ++this.frame % 30 === 0;
    return this.active
      ? {
          querySet: this.queries,
          beginningOfPassWriteIndex: 0,
          endOfPassWriteIndex: 1,
        }
      : undefined;
  }
  encode(encoder) {
    if (!this.active) return;
    encoder.resolveQuerySet(this.queries, 0, 2, this.resolve, 0);
    encoder.copyBufferToBuffer(this.resolve, 0, this.readback, 0, 16);
    this.pending = true;
  }
  submitted() {
    if (!this.active) return;
    this.readback
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        const values = new BigUint64Array(this.readback.getMappedRange());
        if (!this.closed)
          this.milliseconds = Number(values[1] - values[0]) / 1e6;
        this.readback.unmap();
      })
      .catch(() => {})
      .finally(() => {
        this.pending = false;
      });
  }
  destroy() {
    this.closed = true;
    this.queries.destroy();
    this.resolve.destroy();
    this.readback.destroy();
  }
}
