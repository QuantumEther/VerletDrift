// =============================================================
// PHYSICS / WEIGHT TRANSFER
// Normal load distribution across four tyres based on static
// weight plus dynamic transfer from longitudinal and lateral accel.
// =============================================================

import { physicsState as state } from '../state.js';
import { GRAVITY } from '../constants.js';
import { physicalGeometry } from './vehicle-geometry.js';

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
// The tire module applies load sensitivity when converting these loads to grip.
//
// Weight transfer requires CoG height: a higher CoG transfers more load
// for the same acceleration. That's why SUVs feel more tippy than sports cars.
export function computeWeightTransfer() {
  const body      = state.body;
  const loads     = state.wheelLoads;
  const params    = state.params;
  const geometry  = physicalGeometry(state.physicalGeometry);

  const massKg       = params.carMassKg;
  const gravity      = GRAVITY;
  const cogHeight    = params.cogHeight;
  const wheelbase    = geometry.wheelbase;

  const totalWeight    = massKg * gravity;
  const frontStaticFraction = geometry.frontStaticLoadFraction;
  const frontStaticWeight = totalWeight * frontStaticFraction;
  const rearStaticWeight = totalWeight - frontStaticWeight;

  // Longitudinal transfer: braking shifts load forward; acceleration shifts it rearward.
  // Transfer = mass × longitudinal_accel × CoG_height / wheelbase
  // Clamp to ±2 g to prevent constraint-solver transients from causing runaway
  // weight transfer that would amplify tire forces on the next step.
  const clampedLongAccel = clamp(body.longitudinalAccel, -2 * GRAVITY, 2 * GRAVITY);
  // This is the total load shifted from one axle to the other. Keep it within
  // the static axle load so the receiving axle gains exactly what the other
  // axle loses, including at wheel lift-off.
  const longitudinalTransfer = clamp(
    massKg * clampedLongAccel * cogHeight / wheelbase,
    -rearStaticWeight,
    frontStaticWeight,
  );

  // Lateral transfer: cornering shifts load to the outside wheels.
  // Transfer = mass × lateral_accel × CoG_height / trackWidth
  const clampedLatAccel = clamp(body.lateralAccel, -2 * GRAVITY, 2 * GRAVITY);
  // The total outside-vs-inside shift is shared evenly by both axles, so each
  // wheel changes by half this amount. Limit it to the lighter axle's wheel
  // load so lateral transfer cannot create negative normal loads.
  const frontLateralTransfer = clamp(
    massKg * clampedLatAccel * cogHeight * frontStaticFraction / geometry.frontTrack,
    -Math.max(0, frontStaticWeight - longitudinalTransfer) * 0.5,
    Math.max(0, frontStaticWeight - longitudinalTransfer) * 0.5,
  );
  const rearLateralTransfer = clamp(
    massKg * clampedLatAccel * cogHeight * (1 - frontStaticFraction) / geometry.rearTrack,
    -Math.max(0, rearStaticWeight + longitudinalTransfer) * 0.5,
    Math.max(0, rearStaticWeight + longitudinalTransfer) * 0.5,
  );

  // Each axle gets half the total weight, then longitudinal transfer shifts
  // weight between front and rear axles. Within each axle, lateral transfer
  // shifts weight between left and right.
  //
  // Sign convention:
  //   longitudinalAccel > 0 (accelerating forward) → weight shifts rearward
  //   lateralAccel > 0 (rightward cornering force) → outside LEFT wheels gain load
  const frontAxleLoad = frontStaticWeight - longitudinalTransfer;
  const rearAxleLoad  = rearStaticWeight + longitudinalTransfer;
  const lateralLimit = Math.max(0, Math.min(frontAxleLoad, rearAxleLoad) * 0.5);
  const boundedFrontLateralTransfer = clamp(frontLateralTransfer, -lateralLimit, lateralLimit);
  const boundedRearLateralTransfer = clamp(rearLateralTransfer, -lateralLimit, lateralLimit);

  loads.frontLeft  = frontAxleLoad * 0.5 + boundedFrontLateralTransfer;
  loads.frontRight = frontAxleLoad * 0.5 - boundedFrontLateralTransfer;
  loads.rearLeft   = rearAxleLoad  * 0.5 + boundedRearLateralTransfer;
  loads.rearRight  = rearAxleLoad  * 0.5 - boundedRearLateralTransfer;
}
