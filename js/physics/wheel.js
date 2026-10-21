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
  let low = freeOmega - excursion;
  let high = freeOmega + excursion;
  if (direction > 0) { low = Math.max(0, low); high = Math.max(0, high); }
  else { low = Math.min(0, low); high = Math.min(0, high); }

  const equation = (speed) => residual(speed) - brakeTorque;
  if (equation(omega) === 0 && Math.sign(omega) === direction) {
    return { omega, brakeTorque };
  }

  // Continuous contact force is required here (no slip dead band). Bisection
  // remains bounded through friction saturation and the nonlinear tire curve.
  for (let iteration = 0; iteration < 40; iteration++) {
    const middle = (low + high) * 0.5;
    if (middle === low || middle === high) return { omega: middle, brakeTorque };
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
  previousLateralForce = 0, targetLateralForce = () => 0,
  targetContact, relaxationMode = 'vector', contactVelocity, singleStep = false,
}) {
  const additive = ['contactImpulse', 'lateralImpulse', 'brakeImpulse', 'driveWork',
    'brakeWork', 'contactWork', 'contactPatchWork', 'endpointFrictionWork', 'rotorEnergyResidual'];
  if (dt === 0) return { omega, force: previousForce, lateralForce: previousLateralForce,
    ...Object.fromEntries(additive.map(key => [key, 0])), substeps: 0 };

  function advance(speed, force, lateralForce, h) {
    const x = h / relaxationTime;
    const alpha = -Math.expm1(-x);
    // Exact average of a first-order lag for a frozen target. The implicit
    // rotor uses this SAME average; the force history uses the endpoint.
    const beta = x < 1e-3 ? x / 2 - x * x / 6 + x ** 3 / 24 : 1 - alpha / x;
    function relaxedAt(nextSpeed) {
      const target = targetContact ? targetContact(nextSpeed)
        : { lon: targetForce(nextSpeed), lat: targetLateralForce(nextSpeed) };
      if (relaxationMode === 'dissipative-magnitude') {
        const oldMagnitude = Math.hypot(force, lateralForce);
        const magnitude = Math.hypot(target.lon, target.lat);
        if (magnitude === 0) return { lon: 0, lat: 0, averageLon: 0, averageLat: 0 };
        // No elastic energy is represented. Lag increasing friction magnitude,
        // release decreasing demand immediately, and follow current slip
        // direction. Thus stale force cannot drive a reversed or stopped patch.
        const start = Math.min(oldMagnitude, magnitude);
        const endpoint = (start + (magnitude - start) * alpha) / magnitude;
        const average = (start + (magnitude - start) * beta) / magnitude;
        return { lon: target.lon * endpoint, lat: target.lat * endpoint,
          averageLon: target.lon * average, averageLat: target.lat * average };
      }
      return { lon: force + (target.lon - force) * alpha,
        lat: lateralForce + (target.lat - lateralForce) * alpha,
        averageLon: force + (target.lon - force) * beta,
        averageLat: lateralForce + (target.lat - lateralForce) * beta };
    }
    const forceAtOmega = nextSpeed => relaxedAt(nextSpeed).averageLon;
    const rotation = solveWheelRotation({
      omega: speed, inertia, radius, dt: h, driveTorque, brakeCapacity, forceAtOmega,
      forceBound: frictionLimit,
    });
    const next = relaxedAt(rotation.omega);
    const contactImpulse = next.averageLon * h, lateralImpulse = next.averageLat * h;
    const brakeImpulse = rotation.brakeTorque * h;
    const midpointOmega = (speed + rotation.omega) / 2;
    const driveWork = driveTorque * h * midpointOmega;
    const brakeWork = brakeImpulse * midpointOmega;
    const contactWork = -radius * contactImpulse * midpointOmega;
    const contactPatchWork = contactVelocity ? contactWork
      + contactImpulse * contactVelocity.longitudinal + lateralImpulse * contactVelocity.lateral : 0;
    const endpointFrictionWork = contactVelocity ? contactImpulse * (contactVelocity.longitudinal - radius * rotation.omega)
      + lateralImpulse * contactVelocity.lateral : 0;
    return { omega: rotation.omega, force: next.lon, lateralForce: next.lat,
      contactImpulse, lateralImpulse, brakeImpulse, driveWork, brakeWork, contactWork,
      contactPatchWork, endpointFrictionWork,
      rotorEnergyResidual: .5 * inertia * (rotation.omega ** 2 - speed ** 2) - driveWork - brakeWork - contactWork,
      substeps: 1 };
  }

  function combine(left, right) {
    return { ...right, ...Object.fromEntries(additive.map(key => [key, left[key] + right[key]])),
      substeps: left.substeps + right.substeps };
  }
  function interval(speed, force, lateralForce, h, depth) {
    const full = advance(speed, force, lateralForce, h);
    const first = advance(speed, force, lateralForce, h * 0.5);
    const second = advance(first.omega, first.force, first.lateralForce, h * 0.5);
    const speedTolerance = 1e-4 + 1e-3 * Math.max(Math.abs(speed), Math.abs(second.omega));
    const forceTolerance = 0.1 + 1e-3 * Math.max(frictionLimit, Math.abs(force));
    if (Math.abs(full.omega - second.omega) > speedTolerance ||
        Math.abs(full.force - second.force) > forceTolerance ||
        Math.abs(full.lateralForce - second.lateralForce) > forceTolerance ||
        Math.abs(full.contactImpulse - first.contactImpulse - second.contactImpulse) > h * forceTolerance ||
        Math.abs(full.lateralImpulse - first.lateralImpulse - second.lateralImpulse) > h * forceTolerance) {
      if (depth === 20) throw new Error('Wheel/contact integration did not converge');
      const left = interval(speed, force, lateralForce, h * 0.5, depth + 1);
      const right = interval(left.omega, left.force, left.lateralForce, h * 0.5, depth + 1);
      return combine(left, right);
    }
    return combine(first, second);
  }
  return singleStep ? advance(omega, previousForce, previousLateralForce, dt)
    : interval(omega, previousForce, previousLateralForce, dt, 0);
}
