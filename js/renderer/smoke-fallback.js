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
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d"),
    shade = [150, 195, 225][index];
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, `rgba(${shade},${shade},${shade + 5},.8)`);
  gradient.addColorStop(0.5, `rgba(${shade},${shade},${shade + 5},.35)`);
  gradient.addColorStop(1, `rgba(${shade},${shade},${shade + 5},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
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
    ctx.globalAlpha =
      p.alpha *
      Math.min(1, (1 - fraction) / 0.12) *
      Math.min(1, fraction / 0.25);
    const index = p.r < 0.65 ? 0 : p.r < 0.83 ? 1 : 2;
    ctx.drawImage(
      sprite(index),
      p.pos.x - p.size * 0.5,
      p.pos.y - p.size * 0.5,
      p.size,
      p.size,
    );
  }
  ctx.restore();
  reclaimSmokeParticles(dead);
}
