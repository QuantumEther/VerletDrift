// Visual-only fallback. Emission remains in smoke-system.js, unchanged.
import { renderState as state } from "../state.js";
import {
  getSmokePool,
  consumeSpawnedSmokeIndices,
  reclaimSmokeParticles,
} from "./smoke-system.js";
let lastTime = 0;
const dead = [];
const sprites = [];
function sprite(index) {
  if (sprites[index]) return sprites[index];
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(128, 128);
  const shade = [158, 202, 226][index];
  // Cached, neutral density billboards; deterministic lobes avoid perfect discs.
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const u = (x + 0.5) / 64 - 1, v = (y + 0.5) / 64 - 1;
    const angle = index * 2.399;
    const a = u * Math.cos(angle) - v * Math.sin(angle);
    const b = u * Math.sin(angle) + v * Math.cos(angle);
    const warp = 0.10 * Math.sin(a * 5 + Math.sin(b * 4));
    const radius = Math.hypot(a + warp, b + 0.08 * Math.sin(a * 6));
    const edge = Math.max(0, 1 - radius * radius);
    const billow = 0.72 + 0.18 * Math.sin(a * 7 + Math.sin(b * 5))
      + 0.10 * Math.cos(b * 9 - a * 3);
    const density = edge * edge * billow;
    const offset = (y * 128 + x) * 4;
    const light = shade * (0.90 + 0.10 * billow);
    image.data[offset] = image.data[offset + 1] = image.data[offset + 2] = light;
    image.data[offset + 3] = 255 * density * 0.65;
  }
  ctx.putImageData(image, 0, 0);
  return (sprites[index] = canvas);
}
export function drawFallbackSmoke(ctx) {
  const now = state.loop.simulationTime,
    dt = Math.max(0, Math.min(0.1, now - lastTime));
  lastTime = now;
  consumeSpawnedSmokeIndices();
  dead.length = 0;
  const pool = getSmokePool();
  ctx.save();
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    if (!p.alive) continue;
    p.life -= dt;
    if (p.life <= 0) {
      dead.push(i);
      continue;
    }
    // Coherent low-cost flow; no physics RNG and no vehicle-state writes.
    p.vel.x += Math.sin(p.pos.y * 2.1 + now) * dt * 0.4;
    p.vel.y += (Math.cos(p.pos.x * 1.9 + now) * 0.3 - 0.8) * dt;
    const drag = Math.pow(0.96, dt * 60);
    p.vel.x *= drag;
    p.vel.y *= drag;
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    const fraction = p.life / p.maxLife;
    p.size = p.sizeBase * (1 + (1 - fraction) * 2);
    if (!state.params.smokeEnabled) continue;
    // Expansion dilutes the cloud instead of building opaque overlapping dots.
    ctx.globalAlpha =
      p.alpha / (1 + (1 - fraction) * 0.8) *
      Math.min(1, (1 - fraction) / 0.12) *
      Math.min(1, fraction / 0.25);
    const index = p.r < 0.65 ? 0 : p.r < 0.83 ? 1 : 2;
    ctx.save();
    ctx.translate(p.pos.x, p.pos.y);
    ctx.rotate(i * 2.399 + (1 - fraction) * 0.25);
    ctx.drawImage(sprite(index), -p.size * 0.65, -p.size * 0.65,
      p.size * 1.3, p.size * 1.3);
    ctx.restore();
  }
  ctx.restore();
  reclaimSmokeParticles(dead);
}
