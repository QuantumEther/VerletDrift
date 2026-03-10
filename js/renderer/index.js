// =============================================================
// RENDERER — barrel re-export
// =============================================================
//   world.js    — applyCameraTransform, removeCameraTransform, drawCheckerboard,
//                  drawMapBoundary, drawCarGhosts, drawCar, drawSplatDecals,
//                  drawSkidMarks, drawBalloons, drawSplatParticles, drawKinematicArrows
//   sparks.js   — updateSparks, getSparkPool, drawSparks
//   hud.js      — drawSteeringWheelHud, drawThrottleBar, drawBrakeBar, drawHandbrakeBar,
//                  drawClutchBar, drawGearIndicator, drawScoreHud
//   gauges.js   — drawAnalogGauge, drawYawStabilityGauge, drawFrictionCircle,
//                  drawSlipAngleMeter, drawDriftRadar, drawWheelSlipGauge
//   debug.js    — drawDebugOverlays

export { applyCameraTransform, removeCameraTransform, drawCheckerboard,
         drawMapBoundary, drawCarGhosts, drawCar, drawSplatDecals,
         drawSkidMarks, drawBalloons, drawSplatParticles,
         drawKinematicArrows }                                   from './world.js';
export { updateSparks, getSparkPool, drawSparks }               from './sparks.js';

// --- Not yet migrated: re-exported from legacy monolith ---
export {
  drawSteeringWheelHud,
  drawThrottleBar,
  drawBrakeBar,
  drawHandbrakeBar,
  drawClutchBar,
  drawGearIndicator,
  drawScoreHud,
  drawAnalogGauge,
  drawYawStabilityGauge,
  drawFrictionCircle,
  drawSlipAngleMeter,
  drawDriftRadar,
  drawWheelSlipGauge,
  drawDebugOverlays,
} from '../renderer.js';
