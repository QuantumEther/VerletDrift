import { describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { globalThis.localStorage = { getItem: () => null }; });
import { BODY_CROP, BODY_AXLES, BODY_RECT, getTireDimensions, getSkidWidth,
  getSkidRenderWidth } from '../js/renderer/vehicle-geometry.js';
import { getViewCamera, getCheckerTileMetres } from '../js/renderer/view.js';
import { getTrailArrowGeometry } from '../js/trail.js';

describe('SI vehicle and visual geometry', () => {
  it('maps all four artwork wheel arches to the authoritative 1.6 m track and 3 m wheelbase', () => {
    for (const [sourceX, targetX] of [[BODY_AXLES.left, -.8], [BODY_AXLES.right, .8]]) {
      expect(BODY_RECT.x + (sourceX - BODY_CROP[0]) / BODY_CROP[2] * BODY_RECT.width).toBeCloseTo(targetX, 12);
    }
    for (const [sourceY, targetY] of [[BODY_AXLES.front, -1.5], [BODY_AXLES.rear, 1.5]]) {
      expect(BODY_RECT.y + (sourceY - BODY_CROP[1]) / BODY_CROP[3] * BODY_RECT.length).toBeCloseTo(targetY, 12);
    }
    expect(BODY_RECT.width).toBeCloseTo(1.829, 3);
    expect(BODY_RECT.length).toBeCloseTo(4.844, 3);
  });

  it('uses physical rolling diameter and bounds mark coverage by the inferred tread width', () => {
    expect(getTireDimensions().length).toBe(.7);
    expect(getTireDimensions().width).toBeCloseTo(.29724, 5);
    for (const wheelRadius of [.15, .35, .6]) {
      const params = { wheelRadius, skidWidthMin: .5, skidWidthMax: 1.5 };
      for (const u of [0, .6, .9, 1, 2]) {
        expect(getSkidWidth(u, params)).toBeLessThanOrEqual(getTireDimensions(wheelRadius).width);
      }
    }
    expect(getSkidWidth(1, {})).toBeCloseTo(.26, 12); // Existing default appearance is retained.
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
