// =============================================================
// CAMERA — Verlet spring-damper camera follow
// =============================================================
// Exports: updateCamera
//
// Verlet-integrated spring-damper camera that follows the car's centre of mass.
// Parameterized as natural frequency ω₀ (rad/s) and damping ratio ζ (zeta):
//   ζ < 1 → underdamped (oscillates around car, feels alive)
//   ζ = 1 → critically damped (fastest settle, no overshoot)
//   ζ > 1 → overdamped (slow, heavy follow)
// Internally converts: stiffness = ω₀², damping = 2×ζ×ω₀

import { physicsState as state } from '../state.js';
import {
  CAMERA_MIN_ZOOM,
  CAMERA_MAX_ZOOM,
  CAMERA_ZOOM_SPEED_THRESHOLD_KPH,
  KPH_TO_MPS,
} from '../constants.js';


export function updateCamera(dt) {
  const cam    = state.camera;
  const body   = state.body;
  const params = state.params;

  // Decay the jerk offset exponentially each physics step.
  const JERK_DECAY_RATE = 12.0;
  cam.jerkOffsetX *= Math.exp(-JERK_DECAY_RATE * dt);
  cam.jerkOffsetY *= Math.exp(-JERK_DECAY_RATE * dt);

  // Spring target is body centre plus the decaying jerk offset.
  const targetX = body.centerX + cam.jerkOffsetX;
  const targetY = body.centerY + cam.jerkOffsetY;

  // Derive stiffness and damping from ω₀ and ζ.
  const omega0 = params.cameraOmega;   // natural frequency (rad/s), e.g. 4.0
  const zeta   = params.cameraZeta;    // damping ratio, e.g. 0.7
  const springK  = omega0 * omega0;    // stiffness = ω₀²
  const damping2 = 2.0 * zeta * omega0; // viscous damping coeff = 2ζω₀

  // Spring force pulling camera toward the (offset) target.
  const springForceX = (targetX - cam.x) * springK;
  const springForceY = (targetY - cam.y) * springK;

  // Exponential damping applied to implicit velocity (Verlet history gap).
  const dampingFactor = Math.exp(-damping2 * dt);

  // Verlet integration: new position from current, previous, and spring force.
  const newCamX = cam.x + (cam.x - cam.prevX) * dampingFactor + springForceX * dt * dt;
  const newCamY = cam.y + (cam.y - cam.prevY) * dampingFactor + springForceY * dt * dt;

  cam.prevX = cam.x;
  cam.prevY = cam.y;
  cam.x     = newCamX;
  cam.y     = newCamY;

  // Zoom out as speed increases.
  const speedKph = body.speed / KPH_TO_MPS;
  const speedAboveThreshold = Math.max(0, speedKph - CAMERA_ZOOM_SPEED_THRESHOLD_KPH);
  cam.targetZoom = Math.max(
    CAMERA_MIN_ZOOM,
    CAMERA_MAX_ZOOM - speedAboveThreshold * params.cameraZoomSensitivity * 0.01
  );

  // Smooth zoom transitions.
  cam.zoom += (cam.targetZoom - cam.zoom) * 2.0 * dt;
}
