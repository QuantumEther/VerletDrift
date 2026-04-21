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
export { updateSmoke, getSmokePool, consumeSpawnedSmokeIndices, reclaimSmokeParticles, getSmokeAliveCount, getMaxSpawnedSmokeIndex, MAX_SMOKE } from './smoke-system.js';
export { drawSteeringWheelHud, drawThrottleBar, drawBrakeBar,
         drawHandbrakeBar, drawClutchBar, drawGearIndicator,
         drawScoreHud }  from './hud.js';
export { drawAnalogGauge, drawYawStabilityGauge, drawFrictionCircle,
         drawSlipAngleMeter, drawDriftRadar, drawWheelSlipGauge } from './gauges.js';
export { drawDebugOverlays }                                     from './debug.js';
