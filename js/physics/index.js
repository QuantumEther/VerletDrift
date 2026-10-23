// =============================================================
// PHYSICS — barrel re-export
// =============================================================
//   kinematics.js   — wrapAngle, initializeCarBody, computeBodyDerivedState
//   integrator.js   — verletIntegrateAllPoints
//   constraints.js  — solveRigidBodyConstraints, clampParticleDisplacements,
//                      handleBoundaryCollisions
//   suspension.js   — updateSuspension, resetSuspension
//   weight.js       — computeWeightTransfer (instant comparison mode)
//   tires.js        — computeTireForces, computeDragForces, computeBrakeForce
//   engine.js       — updateEngine, handleGearChange, applySleepIfNeeded, updateEngineSound
//   steering.js     — updateSteering
//   camera.js       — updateCamera

export { wrapAngle, initializeCarBody, computeBodyDerivedState } from './kinematics.js';
export { verletIntegrateAllPoints }                               from './integrator.js';
export { solveRigidBodyConstraints, clampParticleDisplacements,
         handleBoundaryCollisions }                               from './constraints.js';
export { computeWeightTransfer }                                   from './weight.js';
export { computeTireForces, computeDragForces, computeBrakeForce } from './tires.js';
export { updateEngine, synchronizeEngineWithWheels, handleGearChange, applySleepIfNeeded,
         updateEngineSound, requestEngineStart, requestEngineToggle } from './engine.js';
export { updateSteering }                                          from './steering.js';
export { updateCamera }                                            from './camera.js';

export { updateSuspension, resetSuspension } from './suspension.js';
