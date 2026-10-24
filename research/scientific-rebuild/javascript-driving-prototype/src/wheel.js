export const DEFAULT_DT = 0.001;

export function createWheel({ inertia = 2 } = {}) {
  if (!(Number.isFinite(inertia) && inertia > 0)) throw new RangeError('Inertia must be finite and positive');
  return { inertia, theta: 0, omega: 0, time: 0 };
}

// Brake input is a nonnegative magnitude. Its torque opposes the current
// rotation and is limited so it cannot reverse the wheel during this step.
export function stepWheel(wheel, { driveTorque = 0, brakeTorque = 0 }, dt = DEFAULT_DT) {
  if (!(Number.isFinite(dt) && dt > 0)) throw new RangeError('dt must be finite and positive');
  if (!(Number.isFinite(driveTorque) && Number.isFinite(brakeTorque) && brakeTorque >= 0)) {
    throw new RangeError('Torques must be finite; brakeTorque must be nonnegative');
  }
  const driveDeltaOmega = driveTorque / wheel.inertia * dt;
  const afterDrive = wheel.omega + driveDeltaOmega;
  const brakeDeltaOmega = afterDrive === 0 ? 0 : -Math.sign(afterDrive) * Math.min(Math.abs(afterDrive), brakeTorque / wheel.inertia * dt);
  const netTorque = wheel.inertia * (driveDeltaOmega + brakeDeltaOmega) / dt;
  wheel.omega = afterDrive + brakeDeltaOmega;
  wheel.theta += wheel.omega * dt;
  wheel.time += dt;
  return { netTorque };
}

export function rotationalEnergy(wheel) {
  return 0.5 * wheel.inertia * wheel.omega ** 2;
}
