/**
 * Tire model module contract
 * Inputs: dt + current derived body/wheel state.
 * Outputs: tire/brake/drag force vectors and wheel traction state updates.
 */
export {
  computeWeightTransfer,
  computeTireForces,
  computeDragForces,
  computeBrakeForce,
} from './legacy.js';
