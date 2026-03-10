// =============================================================
// PHYSICS — barrel re-export
// =============================================================
// Submodules with real code:
//   kinematics.js   — wrapAngle, initializeCarBody, computeBodyDerivedState
//   integrator.js   — verletIntegrateAllPoints
//   constraints.js  — solveRigidBodyConstraints, clampParticleDisplacements,
//                      handleBoundaryCollisions
//   weight.js       — computeWeightTransfer
//   tires.js        — computeTireForces, computeDragForces, computeBrakeForce
//   engine.js       — (pending P2-d)
//   steering.js     — (pending P2-d)
//   camera.js       — (pending P2-d)
//
// Functions not yet moved are re-exported from the legacy monolith.
// Each "pending" line will be replaced with a real submodule import as
// that phase is completed.

export { wrapAngle, initializeCarBody, computeBodyDerivedState } from './kinematics.js';
export { verletIntegrateAllPoints }                               from './integrator.js';
export { solveRigidBodyConstraints, clampParticleDisplacements,
         handleBoundaryCollisions }                               from './constraints.js';
export { computeWeightTransfer }                                   from './weight.js';
export { computeTireForces, computeDragForces, computeBrakeForce } from './tires.js';

// --- Not yet migrated: re-exported from legacy monolith ---
export {
  updateSteering,
  updateEngine,
  updateCamera,
  handleGearChange,
  applySleepIfNeeded,
  updateEngineSound,
} from '../physics.js';
