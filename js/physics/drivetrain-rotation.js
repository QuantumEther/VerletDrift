// Bounded rotational mechanics. Torques/impulses are signed at their own shaft.
// Gearbox housing reactions mean conserved momentum is generalized by ratio.
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function gearRatio(gear, p) {
  if (gear === 'N') return 0;
  if (gear === 'R') return -p.gearRatio1 * p.finalDriveRatio;
  return /^[1-6]$/.test(gear) ? p[`gearRatio${gear}`] * p.finalDriveRatio : 0;
}

// Equal/opposite friction impulse, including static hold without slip reversal.
export function frictionImpulse(slip, mobility, capacity, dt) {
  const required = slip / mobility;
  const impulse = clamp(required, -capacity * dt, capacity * dt);
  return { impulse, locked: capacity > 0 && Math.abs(required) <= capacity * dt,
    heat: impulse * slip - .5 * mobility * impulse * impulse };
}

// Inverse of Iw*Identity + Jshaft*g²/4 * ones(2,2).
// Differential motion sees only wheel inertia, never a fictitious half engine.
export function rearMobility(wheelInertia, shaftInertia, g) {
  const common = 1 / (wheelInertia + shaftInertia * g * g / 2);
  const differential = 1 / wheelInertia;
  return { diagonal: (common + differential) / 2,
    offDiagonal: (common - differential) / 2 };
}

export function clutchImpulse(crank, input, Ie, Js, capacity, dt) {
  if(capacity===0)return { impulse:0,heat:0,locked:false,crank,input };
  const result = frictionImpulse(crank - input, 1 / Ie + 1 / Js, capacity, dt);
  return { ...result, crank: crank - result.impulse / Ie,
    input: input + result.impulse / Js };
}
