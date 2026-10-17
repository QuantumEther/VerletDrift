import { DELOREAN_GEOMETRY, WHEEL_RADIUS } from '../constants.js';

// Original PNG bounds and wheel-arch centres, in source pixels (front = -Y).
// Artwork measurements are distinct from physical axle dimensions.
export const BODY_CROP = Object.freeze([284, 26, 687, 1203]);
export const WHEEL_CROP = Object.freeze([411, 119, 431, 1015]);
export const BODY_AXLES = Object.freeze({ left: 327, right: 928, front: 267, rear: 1012 });
export const BODY_ENVELOPE = Object.freeze({
  x: -DELOREAN_GEOMETRY.bodyWidth / 2, y: -DELOREAN_GEOMETRY.bodyLength / 2,
  width: DELOREAN_GEOMETRY.bodyWidth, length: DELOREAN_GEOMETRY.bodyLength,
});
// Preserve the supplied artwork: uniform fit inside the target shell envelope.
// Its proportions/arch positions do not exactly match DMC-12 geometry; the
// calibration overlay exposes the mismatch instead of stretching or moving tires.
export const BODY_IMAGE_SCALE = Math.min(BODY_ENVELOPE.width / BODY_CROP[2], BODY_ENVELOPE.length / BODY_CROP[3]);
export const BODY_RECT = Object.freeze({
  x: (BODY_CROP[0] - (BODY_AXLES.left + BODY_AXLES.right) / 2) * BODY_IMAGE_SCALE,
  y: (BODY_CROP[1] - (BODY_AXLES.front + BODY_AXLES.rear) / 2) * BODY_IMAGE_SCALE,
  width: BODY_CROP[2] * BODY_IMAGE_SCALE,
  length: BODY_CROP[3] * BODY_IMAGE_SCALE,
});

// Nominal front/rear tire dimensions are VISUAL only; the common mechanical
// rolling radius stays unchanged. Preserve the existing radius control's relative
// visual sizing, with specified tire sizes at its unchanged 0.35 m default.
export function getTireDimensions(radius = WHEEL_RADIUS, wheelName = 'rearLeft') {
  const nominal = wheelName.startsWith('front') ? DELOREAN_GEOMETRY.frontTire : DELOREAN_GEOMETRY.rearTire;
  const scale = radius / WHEEL_RADIUS;
  return { length: nominal.diameter * scale, width: nominal.width * scale };
}

// Fit the tread artwork uniformly inside its physical-size visual envelope.
export function getTireSpriteDimensions(radius = WHEEL_RADIUS, wheelName = 'rearLeft') {
  const tire = getTireDimensions(radius, wheelName);
  const scale = Math.min(tire.width / WHEEL_CROP[2], tire.length / WHEEL_CROP[3]);
  return { width: WHEEL_CROP[2] * scale, length: WHEEL_CROP[3] * scale };
}

// Existing metre-valued width controls describe coverage within the tire tread.
export function getSkidWidth(utilization, params, wheelName = 'rearLeft') {
  const excess = Math.max(0, Math.min(1, utilization) - (params.skidGripThreshold ?? 0.6));
  const min = params.skidWidthMin ?? 0.12;
  const max = params.skidWidthMax ?? 0.47;
  return Math.min(getTireDimensions(params.wheelRadius, wheelName).width, min + excess * (max - min));
}

// Legacy settings key: artistic width exaggeration, NOT texture resolution.
// Apply equally to Canvas and GPU; the default 1 preserves physical mark width.
export function getSkidRenderWidth(width, params) {
  return width * (params.gpuSkidResolution ?? 1);
}
