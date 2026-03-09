/**
 * Constraint solver module contract
 * Inputs: current wheel particle positions.
 * Outputs: corrected wheel particle positions preserving rigid-body distances.
 */
export {
  solveRigidBodyConstraints,
  clampParticleDisplacements,
} from './legacy.js';
