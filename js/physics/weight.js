// =============================================================
// PHYSICS / WEIGHT TRANSFER
// Normal load distribution across four tyres based on static
// weight plus dynamic transfer from longitudinal and lateral accel.
// =============================================================

import { physicsState as state } from '../state.js';
import { GRAVITY, CAR_HALF_LENGTH, CAR_HALF_WIDTH } from '../constants.js';

// --------------- private helpers ---------------

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

// -----------------------------------------------


// Computes the normal load (Newtons, pixel-scaled) on each of the four tyres
// based on the car's static weight distribution plus dynamic transfer from
// longitudinal (fore-aft) and lateral (left-right) acceleration.
//
// These loads scale the peak grip force in the Pacejka tire model.
// More load on a tyre → more grip, but with diminishing returns
// (Pacejka's D parameter scales linearly, so doubling load doubles peak force).
//
// Weight transfer requires CoG height: a higher CoG transfers more load
// for the same acceleration. That's why SUVs feel more tippy than sports cars.
export function computeWeightTransfer() {
  const body      = state.body;
  const loads     = state.wheelLoads;
  const params    = state.params;

  const massKg       = params.carMassKg;
  const gravity      = GRAVITY;
  const cogHeight    = params.cogHeight;
  const wheelbase    = CAR_HALF_LENGTH * 2;  // FL↔RL distance
  const trackWidth   = CAR_HALF_WIDTH  * 2;  // FL↔FR distance

  // Total weight equally split front/rear (assumed 50/50 CoG position).
  const totalWeight    = massKg * gravity;
  const halfWeight     = totalWeight * 0.5;

  // Longitudinal transfer: braking shifts load forward; acceleration shifts it rearward.
  // Transfer = mass × longitudinal_accel × CoG_height / wheelbase
  // Clamp to ±2 g to prevent constraint-solver transients from causing runaway
  // weight transfer that would amplify tire forces on the next step.
  const clampedLongAccel = clamp(body.longitudinalAccel, -2 * GRAVITY, 2 * GRAVITY);
  const longitudinalTransfer = massKg * clampedLongAccel * cogHeight / wheelbase;

  // Lateral transfer: cornering shifts load to the outside wheels.
  // Transfer = mass × lateral_accel × CoG_height / trackWidth
  const clampedLatAccel = clamp(body.lateralAccel, -2 * GRAVITY, 2 * GRAVITY);
  const lateralTransfer = massKg * clampedLatAccel * cogHeight / trackWidth;

  // Each axle gets half the total weight, then longitudinal transfer shifts
  // weight between front and rear axles. Within each axle, lateral transfer
  // shifts weight between left and right.
  //
  // Sign convention:
  //   longitudinalAccel > 0 (accelerating forward) → weight shifts rearward
  //   lateralAccel > 0 (rightward cornering force) → weight shifts to right wheels
  const frontAxleLoad = halfWeight - longitudinalTransfer;
  const rearAxleLoad  = halfWeight + longitudinalTransfer;

  loads.frontLeft  = Math.max(0, frontAxleLoad * 0.5 - lateralTransfer);
  loads.frontRight = Math.max(0, frontAxleLoad * 0.5 + lateralTransfer);
  loads.rearLeft   = Math.max(0, rearAxleLoad  * 0.5 - lateralTransfer);
  loads.rearRight  = Math.max(0, rearAxleLoad  * 0.5 + lateralTransfer);
}
