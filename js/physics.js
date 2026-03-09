// Physics public API surface grouped by responsibility.
// This file is intentionally a thin barrel so callers depend on stable contracts
// while implementation lives in focused submodules under js/physics/.

export * from './physics/kinematics.js';
export * from './physics/engine.js';
export * from './physics/tires.js';
export * from './physics/constraints.js';
export * from './physics/collision.js';
