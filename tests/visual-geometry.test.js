import { describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { globalThis.localStorage = { getItem: () => null }; });
import { BODY_CROP, BODY_RECT, BODY_ENVELOPE, getTireDimensions, getTireSpriteDimensions,
  getSkidWidth, getSkidRenderWidth } from '../js/renderer/vehicle-geometry.js';
import { getViewCamera, getCheckerTileMetres } from '../js/renderer/view.js';
import { getTrailArrowGeometry } from '../js/trail.js';

describe('SI vehicle and visual geometry', () => {
  it('preserves original body proportions within the specified DMC-12 envelope', () => {
    expect(BODY_ENVELOPE.width).toBe(1.988);
    expect(BODY_ENVELOPE.length).toBe(4.267);
    expect(BODY_RECT.width / BODY_CROP[2]).toBeCloseTo(BODY_RECT.length / BODY_CROP[3], 12);
    expect(BODY_RECT.width).toBeCloseTo(1.988, 12);
    expect(BODY_RECT.length).toBeLessThan(BODY_ENVELOPE.length); // Known artwork mismatch, not hidden stretching.
  });

  it('uses nominal front/rear tire envelopes without retuning the common rolling radius', () => {
    const front = getTireDimensions(.35, 'frontLeft');
    expect(front.length).toBeCloseTo(.5896, 12);
    expect(front.width).toBe(.195);
    expect(getTireDimensions().length).toBeCloseTo(.663, 12);
    expect(getTireDimensions().width).toBe(.235);
    for (const wheelRadius of [.15, .35, .6]) {
      const params = { wheelRadius, skidWidthMin: .5, skidWidthMax: 1.5 };
      for (const name of ['frontLeft', 'rearLeft']) for (const u of [0, .6, .9, 1, 2]) {
        expect(getSkidWidth(u, params, name)).toBeLessThanOrEqual(getTireDimensions(wheelRadius, name).width);
        const sprite = getTireSpriteDimensions(wheelRadius, name);
        expect(sprite.width).toBeCloseTo(getTireDimensions(wheelRadius, name).width, 12);
        expect(sprite.length).toBeLessThanOrEqual(getTireDimensions(wheelRadius, name).length);
      }
    }
    expect(getSkidWidth(1, {}, 'frontLeft')).toBe(.195);
    expect(getSkidWidth(1, {})).toBe(.235);
    expect(getSkidRenderWidth(.26, {})).toBe(.26);
    expect(getSkidRenderWidth(.26, { gpuSkidResolution: 2 })).toBe(.52);
  });

  it('uses one shake convention and leaves a metre-valued grid and trail independent of view scale', () => {
    expect(getViewCamera({ x: 100, y: 200 }, { magnitude: 1, shakeX: .2, shakeY: -.4 }))
      .toEqual({ x: 99.8, y: 200.4 });
    expect(getViewCamera({ x: 100, y: 200 }, { magnitude: 0, shakeX: 9, shakeY: 9 }))
      .toEqual({ x: 100, y: 200 });
    expect(getCheckerTileMetres(80)).toBe(4);
    expect(getTrailArrowGeometry(25)).toEqual({ length: 1.1, lineWidth: .2 });
  });
});
