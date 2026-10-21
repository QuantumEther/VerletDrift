// Peak-normalized empirical contact law. This is synthetic calibration, not a
// fitted Magic Formula dataset. Forces are on the chassis, in wheel axes.
export const TIRE_MODEL_VERSION = 2;
export const SLIP_REFERENCE_SPEED = 0.5; // m/s, rolling-to-creep regularization
export const TIRE_PARAMETER_DOMAINS = {
  tireFrictionCoeff: [0, 2.5], peakSlipAngleDeg: [2, 20], peakSlipRatio: [.05, .3],
  tireSlidingFrictionRatio: [.5, 1], tireLoadSensitivity: [0, .3], tireRelaxationLength: [.05, 1],
};
export function validateTireParameters(params) {
  for (const [key, [low, high]] of Object.entries(TIRE_PARAMETER_DOMAINS)) {
    const value = params[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) {
      throw new RangeError(`${key} must be finite and between ${low} and ${high}`);
    }
  }
}

// Brush-like cubic buildup to a prescribed peak, C1-connected to an empirical
// post-peak transition; q>=2 is kinetic sliding. Pure small-slip stiffness is 3*D/peakSlip; peak force is D.
// Sliding Grip is the fully sliding/peak ratio in BOTH directions (q>=2).
export function tireForceFraction(q, slidingRatio) {
  if (!(q >= 0) || !Number.isFinite(q)) throw new RangeError('Tire severity must be finite and nonnegative');
  if (q <= 1) return q * (3 - q * (3 - q));
  const t = Math.min(1, q - 1);
  return 1 - (1 - slidingRatio) * t * t * (3 - 2 * t);
}

export function contactSlips(vLong, vLat, omega, radius) {
  const surface = radius * omega;
  return {
    alpha: Math.atan2(vLat, Math.hypot(vLong, SLIP_REFERENCE_SPEED)),
    // Symmetric rolling slip, including opposite rotation (range [-2,2]).
    kappa: surface / Math.max(Math.abs(surface), Math.abs(vLong), SLIP_REFERENCE_SPEED)
      - vLong / Math.max(Math.abs(surface), Math.abs(vLong), SLIP_REFERENCE_SPEED),
    slipLong: vLong - surface, slipLat: vLat,
  };
}

export function steadyContactTarget({ vLong, vLat, omega, radius, limit,
  peakAngle, peakRatio, slidingRatio }) {
  const slip = contactSlips(vLong, vLat, omega, radius);
  const x = slip.kappa / peakRatio, y = slip.alpha / peakAngle;
  const severity = Math.hypot(x, y);
  if (severity === 0 || !(limit > 0)) return { ...slip, severity, lon: 0, lat: 0, trailFraction: limit > 0 ? 1 : 0 };
  const force = limit * tireForceFraction(severity, slidingRatio);
  // In the buildup regime relative demands share a single friction circle.
  // Over one peak-width beyond q=1, transition to isotropic sliding opposite
  // actual patch velocity. Both directions oppose slip component by component.
  const t = Math.min(1, Math.max(0, severity - 1));
  const blend = t * t * (3 - 2 * t);
  const patchSpeed = Math.hypot(slip.slipLong, slip.slipLat);
  let lon = (x / severity) * (1 - blend) - (patchSpeed > 0 ? slip.slipLong / patchSpeed : 0) * blend;
  let lat = (-y / severity) * (1 - blend) - (patchSpeed > 0 ? slip.slipLat / patchSpeed : 0) * blend;
  // Normalize the convex direction blend so the prescribed magnitude retains
  // its peak/tail definition. No component changes sign in this normalization.
  const directionNorm = Math.hypot(lon, lat);
  if (directionNorm > 0) { lon *= force / directionNorm; lat *= force / directionNorm; }
  return { ...slip, severity, lon, lat,
    // Brush-inspired moment/force ratio: if small-slip trail t0=a/3,
    // Mz/Fy / t0 = 3*(1-q)^3/(3-3q+q^2) in partial adhesion.
    // The kinetic point-contact model has no pneumatic moment beyond q=1.
    trailFraction: severity < 1 ? 3 * (1 - severity) ** 3 / (3 - 3 * severity + severity ** 2) : 0 };
}
