import { describe, it, expect } from "vitest";
import { GPUSkidCache } from "../js/renderer/gpu-skid-cache.js";
globalThis.GPUBufferUsage ??= { STORAGE: 1, COPY_DST: 2 };
function fixture(capacity = 4) {
  const writes = [];
  const device = {
    createBuffer: (desc) => ({ ...desc, destroy() {} }),
    createBindGroup: () => ({}),
    queue: {
      writeBuffer(buffer, offset, data, start = 0, count = data.length) {
        writes.push({
          label: buffer.label,
          offset,
          data: Array.from(data.slice(start, start + count)),
        });
      },
    },
  };
  const cache = new GPUSkidCache(
    device,
    {},
    { getBindGroupLayout: () => ({}) },
    capacity,
  );
  const color = (_seg, data, base) => {
    data[base] = 0.1;
    data[base + 1] = 0.2;
    data[base + 2] = 0.3;
  };
  return {
    cache,
    writes,
    update: (events, width = 1) => cache.update(events, width, color),
  };
}
const segment = (x = 1) => ({
  x1: x,
  y1: 2,
  x2: x + 1,
  y2: 3,
  width: 0.195,
  alpha: 0.7,
  hue: -1,
});
describe("resident GPU skid event geometry", () => {
  it("uploads geometry once, streams exact source opacity and never mutates events", () => {
    const { cache, writes, update } = fixture();
    const seg = segment(),
      before = structuredClone(seg);
    update([seg]);
    expect(seg).toEqual(before);
    expect(writes.filter((w) => w.label === "skidGeometry")).toHaveLength(1);
    writes.length = 0;
    seg.alpha = 0.21;
    update([seg]);
    expect(writes.map((w) => w.label)).toEqual([
      "skidOpacity",
    ]);
    expect(cache.alpha[0]).toBeCloseTo(0.21, 7);
    expect(cache.geometry.slice(0, 4)).toEqual(new Float32Array([1, 2, 2, 3]));
  });
  it("clears removed marks and reuses slots without stale marks, including a full replacement", () => {
    const { cache, update } = fixture(2);
    const a = segment(),
      b = segment(5);
    update([a, b]);
    update([]);
    expect([...cache.alpha]).toEqual([0, 0]);
    const c = segment(8),
      d = segment(10);
    update([c, d]);
    expect(cache.count).toBe(2);
    expect(cache.slots.has(a)).toBe(false);
    expect(cache.slots.has(b)).toBe(false);
    expect(cache.order.slice(0, 2)).toEqual(
      new Uint32Array([cache.slots.get(c), cache.slots.get(d)]),
    );
    expect([...cache.objects].sort((a, b) => a.x1 - b.x1)).toEqual([c, d]);
  });
  it("invalidates resident widths when the existing visual multiplier changes", () => {
    const { cache, writes, update } = fixture();
    const seg = Object.freeze(segment());
    update([seg]);
    writes.length = 0;
    update([seg], 2);
    expect(cache.geometry[4]).toBeCloseTo(0.39, 7);
    expect(seg.width).toBe(0.195);
    expect(writes.some((w) => w.label === "skidGeometry")).toBe(true);
  });
});

it("releases partial GPU allocations if initialization exhausts resources", () => {
  const destroyed = [];
  let count = 0;
  const device = {
    createBuffer: () => {
      if (++count === 2) throw Error("exhausted");
      return {
        destroy() {
          destroyed.push(count);
        },
      };
    },
  };
  expect(() => new GPUSkidCache(device, {}, {})).toThrow("exhausted");
  expect(destroyed).toHaveLength(1);
});

it("does not re-upload static opacity or draw order, including nonexact f32 values", () => {
  const { writes, update } = fixture();
  const a = segment(), b = segment(4);
  update([a,b]);
  writes.length = 0;
  expect(update([a,b]).uploadedBytes).toBe(0);
  b.alpha = .3;
  update([a,b]);
  expect(writes).toHaveLength(1);
  expect(writes[0].label).toBe('skidOpacity');
  expect(writes[0].offset).toBe(4);
  expect(writes[0].data).toHaveLength(1);
  writes.length=0;
  update([b,a]);
  expect(writes.map(w=>w.label)).toEqual(['skidDrawOrder']);
});
it('retains duplicate event references and source order when new slots are assigned', () => {
  const { cache, update } = fixture(2);
  const a = segment();
  update([a,a]);
  expect(cache.count).toBe(1);
  expect([...cache.order.slice(0,2)]).toEqual([0,0]);
  expect(update([a,a]).uploadedBytes).toBe(0);
});
