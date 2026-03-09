/**
 * Physics Engine module contract
 * Inputs: mutable simulation state from state.js + dt/newGear values.
 * Outputs: deterministic state mutations on steering/engine/camera channels.
 */
export {
  updateEngine,
  updateSteering,
  updateCamera,
  handleGearChange,
  applySleepIfNeeded,
  updateEngineSound,
} from './legacy.js';
