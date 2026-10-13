// Solve a rotor and its tire reaction in the same step. Longitudinal tire
// stiffness can be much faster than the chassis tick, so explicit reaction
// torque can oscillate even when the chassis itself is stable.
//
// I(omegaNew - omegaOld)/dt = drive + brakeSigned - R * forceAtOmega(omegaNew)
// Brake friction opposes omegaNew; at zero it balances torque up to capacity.
export function solveWheelRotation({
  omega, inertia, radius, dt, driveTorque, brakeCapacity,
  forceAtOmega, forceBound,
}) {
  if (dt === 0) return { omega, brakeTorque: 0 };

  const inertiaRate = inertia / dt;
  const residual = (speed) => inertiaRate * (speed - omega)
    - driveTorque + radius * forceAtOmega(speed);

  // Static brake friction: stop/hold exactly zero without overshooting into
  // reverse. This includes both drive torque and contact reaction at lockup.
  const holdingTorque = residual(0);
  if (Math.abs(holdingTorque) <= brakeCapacity) {
    return { omega: 0, brakeTorque: holdingTorque };
  }

  const direction = holdingTorque < 0 ? 1 : -1;
  const brakeTorque = -direction * brakeCapacity;
  const freeOmega = omega + driveTorque / inertiaRate;
  // With zero contact force the torque update is analytic; do not introduce
  // root-finding error into a freely rotating or torque-driven flywheel.
  if (forceBound === 0) {
    return { omega: freeOmega + brakeTorque / inertiaRate, brakeTorque };
  }
  // The contact-force bound supplies a physical bracket, not a speed clamp.
  const excursion = (brakeCapacity + radius * forceBound) / inertiaRate;
  let low = Math.min(0, freeOmega - excursion);
  let high = Math.max(0, freeOmega + excursion);
  if (direction > 0) low = 0;
  else high = 0;

  const equation = (speed) => residual(speed) - brakeTorque;
  if (equation(omega) === 0 && Math.sign(omega) === direction) {
    return { omega, brakeTorque };
  }

  // Continuous contact force is required here (no slip dead band). Bisection
  // remains bounded through friction saturation and the nonlinear tire curve.
  for (let iteration = 0; iteration < 40; iteration++) {
    const middle = (low + high) * 0.5;
    const value = equation(middle);
    if (value === 0) return { omega: middle, brakeTorque };
    if (value > 0) high = middle;
    else low = middle;
  }
  return { omega: (low + high) * 0.5, brakeTorque };
}

// Step doubling controls implicit-step error while retaining force relaxation,
// instead of choosing a fixed tiny wheel tick or adding a damping coefficient.
// Body velocity and drive torque are supplied by the chassis tick; contact and
// brake impulses are averaged back to that same tick (not just the final force).
export function integrateWheelContact({
  omega, inertia, radius, dt, driveTorque, brakeCapacity,
  previousForce, targetForce, frictionLimit, relaxationTime,
}) {
  if (dt === 0) return { omega, force: previousForce, contactImpulse: 0, brakeImpulse: 0 };

  function advance(speed, force, h) {
    const alpha = 1 - Math.exp(-h / relaxationTime);
    const forceAtOmega = (nextSpeed) => force + (targetForce(nextSpeed) - force) * alpha;
    const rotation = solveWheelRotation({
      omega: speed, inertia, radius, dt: h, driveTorque, brakeCapacity,
      forceAtOmega,
      forceBound: Math.abs(force) * (1 - alpha) + frictionLimit * alpha,
    });
    const nextForce = forceAtOmega(rotation.omega);
    return {
      omega: rotation.omega, force: nextForce,
      contactImpulse: nextForce * h, brakeImpulse: rotation.brakeTorque * h,
    };
  }

  function interval(speed, force, h, depth) {
    const full = advance(speed, force, h);
    const first = advance(speed, force, h * 0.5);
    const second = advance(first.omega, first.force, h * 0.5);
    const speedTolerance = 1e-4 + 1e-3 * Math.max(Math.abs(speed), Math.abs(second.omega));
    const forceTolerance = 0.1 + 1e-3 * Math.max(frictionLimit, Math.abs(force));
    if (Math.abs(full.omega - second.omega) > speedTolerance ||
        Math.abs(full.force - second.force) > forceTolerance) {
      if (depth === 12) throw new Error('Wheel/contact integration did not converge');
      const left = interval(speed, force, h * 0.5, depth + 1);
      const right = interval(left.omega, left.force, h * 0.5, depth + 1);
      return {
        ...right,
        contactImpulse: left.contactImpulse + right.contactImpulse,
        brakeImpulse: left.brakeImpulse + right.brakeImpulse,
      };
    }
    return {
      ...second,
      contactImpulse: first.contactImpulse + second.contactImpulse,
      brakeImpulse: first.brakeImpulse + second.brakeImpulse,
    };
  }
  return interval(omega, previousForce, dt, 0);
}
