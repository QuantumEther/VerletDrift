// Coupled implicit contact impulse solve in the planar velocity space.
// The chassis pose/axes are frozen over this force tick; Mission 01 still
// performs its rigid pose drift. No external-force law or vehicle gain is changed.
import { integrateWheelContact } from './wheel.js';
import { steadyContactTarget, SLIP_REFERENCE_SPEED } from './tire-model.js';

function linearSolve(matrix, rhs) {
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let j = 0; j < 3; j++) {
    let pivot = j;
    for (let i = j + 1; i < 3; i++) if (Math.abs(a[i][j]) > Math.abs(a[pivot][j])) pivot = i;
    if (Math.abs(a[pivot][j]) < 1e-14) return null;
    [a[j], a[pivot]] = [a[pivot], a[j]];
    const scale = a[j][j]; for (let k = j; k < 4; k++) a[j][k] /= scale;
    for (let i = 0; i < 3; i++) if (i !== j) {
      const factor = a[i][j]; for (let k = j; k < 4; k++) a[i][k] -= factor * a[j][k];
    }
  }
  return a.map(row => row[3]);
}

export function integrateTireContacts({ dt, velocity, contacts, mass, inertia,
  externalAcceleration = { x: 0, y: 0, yaw: 0 }, prescribedBody = false }) {
  if (![dt, mass, inertia].every(value => Number.isFinite(value) && value > 0))
    throw new RangeError('Contact timestep, mass and inertia must be finite and positive');
  const ext = [externalAcceleration.x, externalAcceleration.y, externalAcceleration.yaw];
  if (![...velocity, ...ext].every(Number.isFinite)) throw new RangeError('Contact velocities and accelerations must be finite');
  for (const c of contacts) {
    if (![c.radius, c.inertia].every(value => Number.isFinite(value) && value > 0)
      || ![c.omega, c.driveTorque, c.brakeCapacity, c.limit].every(Number.isFinite)
      || c.brakeCapacity < 0 || c.limit < 0) throw new RangeError('Invalid wheel/contact state');
  }
  const radiusOfGyration = Math.sqrt(inertia / mass);
  const norm = v => Math.max(Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]) * radiusOfGyration);
  const additive = ['contactImpulse', 'lateralImpulse', 'brakeImpulse', 'driveWork', 'brakeWork',
    'contactWork', 'contactPatchWork', 'endpointFrictionWork', 'rotorEnergyResidual', 'aligningImpulse'];

  function advance(oldVelocity, oldContacts, h) {
    let evaluations = 0;
    function evaluate(nextVelocity) {
      evaluations++;
      let fx = 0, fy = 0, torque = 0;
      const rotations = oldContacts.map(contact => {
        const vx = nextVelocity[0] - nextVelocity[2] * contact.armY;
        const vy = nextVelocity[1] + nextVelocity[2] * contact.armX;
        const vLong = vx * contact.forwardX + vy * contact.forwardY;
        const vLat = vx * contact.rightX + vy * contact.rightY;
        const targetContact = omega => steadyContactTarget({ ...contact, vLong, vLat, omega });
        const rotation = integrateWheelContact({ ...contact, dt: h, targetContact,
          targetForce: omega => targetContact(omega).lon,
          targetLateralForce: omega => targetContact(omega).lat,
          frictionLimit: contact.limit,
          relaxationTime: contact.relaxationLength / Math.max(Math.hypot(vLong, vLat), SLIP_REFERENCE_SPEED),
          relaxationMode: 'dissipative-magnitude', contactVelocity: { longitudinal: vLong, lateral: vLat },
          singleStep: true });
        const forceX = (rotation.contactImpulse * contact.forwardX + rotation.lateralImpulse * contact.rightX) / h;
        const forceY = (rotation.contactImpulse * contact.forwardY + rotation.lateralImpulse * contact.rightY) / h;
        fx += forceX; fy += forceY; torque += contact.armX * forceY - contact.armY * forceX;
        const target = targetContact(rotation.omega);
        return { ...rotation, target,
          // Pneumatic trail follows rolling direction; unlike fixed mechanical
          // caster trail it reverses with travel. Transport vanishes at rest.
          aligningImpulse: rotation.lateralImpulse * contact.pneumaticTrail * target.trailFraction
            * vLong / Math.hypot(vLong, SLIP_REFERENCE_SPEED),
          contactVelocity: { longitudinal: vLong, lateral: vLat } };
      });
      const expected = prescribedBody ? oldVelocity : [oldVelocity[0] + h * (ext[0] + fx / mass),
        oldVelocity[1] + h * (ext[1] + fy / mass), oldVelocity[2] + h * (ext[2] + torque / inertia)];
      return { residual: nextVelocity.map((v, i) => v - expected[i]), rotations,
        // Propagate the conservative impulse update, not the approximate
        // Newton iterate. Otherwise tiny accepted residuals accumulate across
        // adaptive substeps and disagree with the impulse sent to Mission 01.
        velocity: expected, impulseX: fx * h, impulseY: fy * h, angularImpulse: torque * h };
    }
    let candidate = prescribedBody ? [...oldVelocity] : oldVelocity.map((v, i) => v + h * ext[i]);
    let result = evaluate(candidate);
    const tolerance = 1e-10 * (1 + norm(oldVelocity));
    for (let iteration = 0; iteration < 20 && norm(result.residual) > tolerance; iteration++) {
      const jacobian = [[], [], []];
      for (let j = 0; j < 3; j++) {
        const epsilon = 1e-6 * Math.max(1, Math.abs(candidate[j]));
        const perturbed = [...candidate]; perturbed[j] += epsilon;
        const r = evaluate(perturbed);
        for (let i = 0; i < 3; i++) jacobian[i][j] = (r.residual[i] - result.residual[i]) / epsilon;
      }
      const delta = linearSolve(jacobian, result.residual);
      if (!delta) return null;
      let accepted = false;
      for (let line = 0; line < 10; line++) {
        const trial = candidate.map((v, i) => v - delta[i] * 2 ** -line);
        const next = evaluate(trial);
        if (norm(next.residual) < norm(result.residual)) {
          candidate = trial; result = next; accepted = true; break;
        }
      }
      if (!accepted) return null;
    }
    if (norm(result.residual) > tolerance) return null;
    return { ...result, evaluations, substeps: 1, maxBodyResidual: norm(result.residual) };
  }
  function nextContacts(oldContacts, result) {
    return oldContacts.map((c, i) => ({ ...c, omega: result.rotations[i].omega,
      previousForce: result.rotations[i].force, previousLateralForce: result.rotations[i].lateralForce }));
  }
  function combine(left, right) {
    return { ...right, impulseX: left.impulseX + right.impulseX,
      impulseY: left.impulseY + right.impulseY, angularImpulse: left.angularImpulse + right.angularImpulse,
      evaluations: left.evaluations + right.evaluations, substeps: left.substeps + right.substeps,
      maxBodyResidual: Math.max(left.maxBodyResidual, right.maxBodyResidual),
      rotations: right.rotations.map((r, i) => ({ ...r,
        ...Object.fromEntries(additive.map(key => [key, left.rotations[i][key] + r[key]])),
        substeps: left.rotations[i].substeps + r.substeps })) };
  }
  function interval(v, c, h, depth) {
    const full = advance(v, c, h);
    const left = advance(v, c, h / 2);
    const right = left ? advance(left.velocity, nextContacts(c, left), h / 2) : null;
    let resolved = full && left && right;
    if (resolved) {
      resolved = norm(full.velocity.map((value, i) => value - right.velocity[i])) <= 1e-5 + 1e-4 * norm(right.velocity);
      for (let i = 0; resolved && i < c.length; i++) {
        const f = full.rotations[i], r = right.rotations[i], l = left.rotations[i];
        const forceTolerance = .1 + 1e-3 * c[i].limit;
        resolved = Math.abs(f.omega - r.omega) <= 1e-4 + 1e-3 * Math.abs(r.omega)
          && Math.hypot(f.force - r.force, f.lateralForce - r.lateralForce) <= forceTolerance
          && Math.hypot(f.contactImpulse - l.contactImpulse - r.contactImpulse,
            f.lateralImpulse - l.lateralImpulse - r.lateralImpulse) <= h * forceTolerance;
      }
    }
    if (resolved) return combine(left, right);
    if (depth === 16) throw new Error('Coupled tire/chassis contact solve did not converge');
    const first = interval(v, c, h / 2, depth + 1);
    const second = interval(first.velocity, nextContacts(c, first), h / 2, depth + 1);
    return combine(first, second);
  }
  return interval(velocity, contacts, dt, 0);
}
