// Visual event history only. Never consumes the authoritative physics RNG.
export const MAX_LIQUID_EVENTS = 24;
let events = [],
  serial = 0,
  generation = 0,
  evictions = 0;
export function resetLiquidImpacts() {
  events = [];
  serial = 0;
  generation++;
  evictions = 0;
}
export function recordLiquidImpact(balloon, speed, body, time, hue=balloon.hue) {
  if (![balloon.x, balloon.y, speed, time].every(Number.isFinite)) return;
  const length = Math.hypot(body.velocityX, body.velocityY);
  const dx = length > 0.01 ? body.velocityX / length : Math.sin(body.heading);
  const dy = length > 0.01 ? body.velocityY / length : -Math.cos(body.heading);
  const id = ++serial;
  const seed =
    (Math.imul(id, 2654435761) ^
      Math.round(balloon.x * 997) ^
      Math.round(balloon.y * 619)) >>>
    0;
  events.push(
    Object.freeze({
      id,
      generation,
      x: balloon.x,
      y: balloon.y,
      time,
      speed: Math.max(0, Math.min(60, speed)),
      volume: Math.max(2, Math.min(40, 18 * Math.pow(balloon.radius / 0.6, 3))),
      hue,
      dx,
      dy,
      seed: seed % 1000000,
      bodyContact:
        Math.hypot(balloon.x - body.centerX, balloon.y - body.centerY) < 4.5,
    }),
  );
  if (events.length > MAX_LIQUID_EVENTS) {
    events.shift();
    evictions++;
  }
}
export function getLiquidImpacts() {
  return { events, generation, evictions };
}
