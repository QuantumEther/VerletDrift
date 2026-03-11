/**
 * Gauge rendering contract
 * Inputs: gauge ctx/geometry/config.
 * Outputs: standalone gauge draw calls.
 */
export {
  drawAnalogGauge,
  drawYawStabilityGauge,
  drawFrictionCircle,
  drawSlipAngleMeter,
  drawDriftRadar,
  drawWheelSlipGauge,
} from './legacy.js';
