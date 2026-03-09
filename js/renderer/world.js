/**
 * World rendering contract
 * Inputs: ctx + viewport and camera/world state from state.js.
 * Outputs: world-space draw calls only (camera transform domain).
 */
export {
  applyCameraTransform,
  removeCameraTransform,
  drawCheckerboard,
  drawMapBoundary,
  drawCar,
  drawCarGhosts,
  drawSkidMarks,
  drawSplatDecals,
  drawBalloons,
  drawSplatParticles,
  drawKinematicArrows,
} from './legacy.js';
