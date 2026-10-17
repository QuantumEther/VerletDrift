import { CAR_HALF_WIDTH, CAR_HALF_LENGTH, WHEEL_RADIUS } from '../constants.js';

// Original PNG bounds and wheel-arch centres, in source pixels (front = -Y).
// These calibrate the shell around the physical axles; they never move an anchor.
export const BODY_CROP = Object.freeze([284, 26, 687, 1203]);
export const WHEEL_CROP = Object.freeze([411, 119, 431, 1015]);
export const BODY_AXLES = Object.freeze({ left: 327, right: 928, front: 267, rear: 1012 });
const scaleX = CAR_HALF_WIDTH * 2 / (BODY_AXLES.right - BODY_AXLES.left);
const scaleY = CAR_HALF_LENGTH * 2 / (BODY_AXLES.rear - BODY_AXLES.front);
export const BODY_RECT = Object.freeze({
  x: (BODY_CROP[0] - (BODY_AXLES.left + BODY_AXLES.right) / 2) * scaleX,
  y: (BODY_CROP[1] - (BODY_AXLES.front + BODY_AXLES.rear) / 2) * scaleY,
  width: BODY_CROP[2] * scaleX,
  length: BODY_CROP[3] * scaleY,
});

// The model supplies rolling radius, but no tire width. Retain the tread image's
// aspect ratio and use the physical diameter for its top-down rolling length.
export function getTireDimensions(radius = WHEEL_RADIUS) {
  const length = radius * 2;
  return { length, width: length * WHEEL_CROP[2] / WHEEL_CROP[3] };
}

// Existing metre-valued width controls describe coverage within the tire tread.
export function getSkidWidth(utilization, params) {
  const excess = Math.max(0, Math.min(1, utilization) - (params.skidGripThreshold ?? 0.6));
  const min = params.skidWidthMin ?? 0.12;
  const max = params.skidWidthMax ?? 0.47;
  return Math.min(getTireDimensions(params.wheelRadius).width, min + excess * (max - min));
}

// Legacy settings key: artistic width exaggeration, NOT texture resolution.
// Apply equally to Canvas and GPU; the default 1 preserves physical mark width.
export function getSkidRenderWidth(width, params) {
  return width * (params.gpuSkidResolution ?? 1);
}
