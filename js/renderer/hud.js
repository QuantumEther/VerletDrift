/**
 * HUD rendering contract
 * Inputs: screen-space ctx and canvas dimensions.
 * Outputs: overlay UI draw calls only (no world transforms).
 */
export {
  drawSteeringWheelHud,
  drawThrottleBar,
  drawBrakeBar,
  drawHandbrakeBar,
  drawClutchBar,
  drawGearIndicator,
  drawScoreHud,
} from './legacy.js';
