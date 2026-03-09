/**
 * Kinematics module contract
 * Inputs: dt + net accelerations/world center.
 * Outputs: body derived kinematic state and integrated wheel particle positions.
 */
export {
  wrapAngle,
  initializeCarBody,
  computeBodyDerivedState,
  verletIntegrateAllPoints,
} from './legacy.js';
