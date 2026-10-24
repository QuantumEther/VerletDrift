export const DEFAULT_DT = 0.001;

export function createWheel({ inertia = 2, mass = 12, radius = 0.32, friction = 0.9, slipStiffness = 18000, gravity = 9.81 } = {}) {
  if (!(Number.isFinite(inertia) && inertia > 0)) throw new RangeError('Inertia must be finite and positive');
  if (!(Number.isFinite(mass) && mass > 0 && Number.isFinite(radius) && radius > 0)) throw new RangeError('Mass and radius must be finite and positive');
  if (!(Number.isFinite(friction) && friction >= 0 && Number.isFinite(slipStiffness) && slipStiffness >= 0)) throw new RangeError('Contact parameters must be finite and nonnegative');
  if (!(Number.isFinite(gravity) && gravity >= 0)) throw new RangeError('Gravity must be finite and nonnegative');
  return { inertia, mass, radius, friction, slipStiffness, normalLoad: mass * gravity, x: 0, velocity: 0, theta: 0, omega: 0, time: 0 };
}

// Brake input is a nonnegative magnitude. Its torque opposes the current
// rotation and is limited so it cannot reverse the wheel during this step.
export function stepWheel(wheel, { driveTorque = 0, brakeTorque = 0 }, dt = DEFAULT_DT) {
  if (!(Number.isFinite(dt) && dt > 0)) throw new RangeError('dt must be finite and positive');
  if (!(Number.isFinite(driveTorque) && Number.isFinite(brakeTorque) && brakeTorque >= 0)) {
    throw new RangeError('Torques must be finite; brakeTorque must be nonnegative');
  }
  const afterDrive = wheel.omega + driveTorque / wheel.inertia * dt;
  const brakeTorqueSigned = afterDrive === 0 ? 0 : -Math.sign(afterDrive) * Math.min(brakeTorque, Math.abs(afterDrive) * wheel.inertia / dt);
  const shaftTorque = driveTorque + brakeTorqueSigned;
  const slipVelocity = wheel.radius * wheel.omega - wheel.velocity;
  const forceLimit = wheel.friction * wheel.normalLoad;
  // Solve the linear slip law implicitly across this step, including the
  // contact force's equal/opposite translational and rotational effects.
  const slipFreeEnd = slipVelocity + dt * wheel.radius * shaftTorque / wheel.inertia;
  const slipCompliance = dt * (wheel.radius ** 2 / wheel.inertia + 1 / wheel.mass);
  const unconstrainedForce = wheel.slipStiffness * slipFreeEnd / (1 + wheel.slipStiffness * slipCompliance);
  const contactForce = Math.max(-forceLimit, Math.min(forceLimit, unconstrainedForce));
  const alpha = (shaftTorque - wheel.radius * contactForce) / wheel.inertia;
  const acceleration = contactForce / wheel.mass;
  wheel.omega = wheel.omega + alpha * dt;
  wheel.velocity += acceleration * dt;
  wheel.lastContactForce = contactForce;
  wheel.theta += wheel.omega * dt;
  wheel.x += wheel.velocity * dt;
  wheel.time += dt;
  return { netTorque: wheel.inertia * alpha, brakeTorqueSigned, angularAcceleration: alpha, acceleration, contactForce, normalLoad: wheel.normalLoad, slipVelocity };
}

export function rotationalEnergy(wheel) {
  return 0.5 * wheel.inertia * wheel.omega ** 2;
}

export function translationalEnergy(wheel) { return 0.5 * wheel.mass * wheel.velocity ** 2; }
export function totalKineticEnergy(wheel) { return translationalEnergy(wheel) + rotationalEnergy(wheel); }
