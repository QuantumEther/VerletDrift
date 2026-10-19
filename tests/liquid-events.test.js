import { beforeEach, describe, it, expect } from "vitest";
import {
  recordLiquidImpact,
  resetLiquidImpacts,
  getLiquidImpacts,
  MAX_LIQUID_EVENTS,
} from "../js/renderer/liquid-events.js";
const balloon = Object.freeze({ x: 12, y: 9, radius: 0.6, hue: 330 });
const body = Object.freeze({
  centerX: 12,
  centerY: 10,
  heading: 0,
  velocityX: 0,
  velocityY: -22,
});
describe("liquid visual event history", () => {
  beforeEach(resetLiquidImpacts);
  it("records immutable impact state without reading randomness or changing inputs", () => {
    const random = Math.random;
    Math.random = () => {
      throw Error("Visual event consumed randomness");
    };
    try {
      recordLiquidImpact(balloon, 22, body, 3);
    } finally {
      Math.random = random;
    }
    expect(getLiquidImpacts().events[0]).toMatchObject({
      x: 12,
      y: 9,
      time: 3,
      speed: 22,
      volume: 18,
      hue: 330,
      dx: 0,
      dy: -1,
      bodyContact: true,
    });
    expect(Object.isFrozen(getLiquidImpacts().events[0])).toBe(true);
  });
  it("reconstructs stable seeds after a new session and keeps bounded history", () => {
    recordLiquidImpact(balloon, 22, body, 3);
    const seed = getLiquidImpacts().events[0].seed;
    const generation = getLiquidImpacts().generation;
    resetLiquidImpacts();
    recordLiquidImpact(balloon, 22, body, 3);
    expect(getLiquidImpacts().events[0].seed).toBe(seed);
    expect(getLiquidImpacts().generation).toBe(generation + 1);
    for (let i = 0; i < MAX_LIQUID_EVENTS; i++)
      recordLiquidImpact(balloon, 22, body, i + 4);
    expect(getLiquidImpacts().events).toHaveLength(MAX_LIQUID_EVENTS);
    expect(getLiquidImpacts().evictions).toBe(1);
  });
  it("rejects nonfinite impact data and uses heading at rest", () => {
    recordLiquidImpact({ ...balloon, x: NaN }, 22, body, 0);
    expect(getLiquidImpacts().events).toHaveLength(0);
    recordLiquidImpact(
      balloon,
      0,
      { ...body, velocityX: 0, velocityY: 0, heading: Math.PI / 2 },
      0,
    );
    expect(getLiquidImpacts().events[0].dx).toBeCloseTo(1);
    expect(getLiquidImpacts().events[0].dy).toBeCloseTo(0);
  });
});
