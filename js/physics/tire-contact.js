// Coupled implicit contact impulse solve in the planar velocity space.
// Chassis pose and arms stay frozen over this tick; front axes follow the
// optional implicit road-wheel coordinate. Mission 01 performs rigid drift.
// Tire constitutive laws and contact tolerances are unchanged.
import { integrateSteering } from './steering-model.js';
import { integrateWheelContact } from './wheel.js';
import { steadyContactTarget, SLIP_REFERENCE_SPEED } from './tire-model.js';

function linearSolve(matrix, rhs) {
  const size=rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let j = 0; j < size; j++) {
    let pivot = j;
    for (let i = j + 1; i < size; i++) if (Math.abs(a[i][j]) > Math.abs(a[pivot][j])) pivot = i;
    if (Math.abs(a[pivot][j]) < 1e-14) return null;
    [a[j], a[pivot]] = [a[pivot], a[j]];
    const scale = a[j][j]; for (let k = j; k <= size; k++) a[j][k] /= scale;
    for (let i = 0; i < size; i++) if (i !== j) {
      const factor = a[i][j]; for (let k = j; k <= size; k++) a[i][k] -= factor * a[j][k];
    }
  }
  return a.map(row => row[size]);
}

export function integrateTireContacts({ dt, velocity, contacts, mass, inertia,
  externalAcceleration = { x: 0, y: 0, yaw: 0 }, prescribedBody = false, steering = null }) {
  if (![dt, mass, inertia].every(value => Number.isFinite(value) && value > 0))
    throw new RangeError('Contact timestep, mass and inertia must be finite and positive');
  const ext = [externalAcceleration.x, externalAcceleration.y, externalAcceleration.yaw];
  if (![...velocity, ...ext].every(Number.isFinite)) throw new RangeError('Contact velocities and accelerations must be finite');
  for (const c of contacts) {
    if (![c.radius, c.inertia].every(value => Number.isFinite(value) && value > 0)
      || ![c.omega, c.driveTorque, c.brakeCapacity, c.limit].every(Number.isFinite)
      || c.brakeCapacity < 0 || c.limit < 0) throw new RangeError('Invalid wheel/contact state');
  }
  const counters={attemptedEvaluations:0,nonlinearIterations:0,rejectedIntervals:0,attemptedSubsteps:0};
  const radiusOfGyration = Math.sqrt(inertia / mass);
  const norm = v => Math.max(Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]) * radiusOfGyration);
  const additive = ['contactImpulse', 'lateralImpulse', 'brakeImpulse', 'driveWork', 'brakeWork',
    'contactWork', 'contactPatchWork', 'endpointFrictionWork', 'rotorEnergyResidual', 'aligningImpulse','worldImpulseX','worldImpulseY'];

  function advance(oldVelocity, oldContacts, h, oldSteering) {
    counters.attemptedSubsteps++;
    const residualNorm = v => Math.max(norm(v),oldSteering ? Math.abs(v[3])/h : 0);
    let evaluations = 0;
    function evaluate(nextVelocity) {
      evaluations++;counters.attemptedEvaluations++;
      let fx = 0, fy = 0, torque = 0;
      const rotations = oldContacts.map(original => {
        const theta = oldSteering && original.steered ? original.baseHeading+nextVelocity[3] : null;
        const contact=theta===null ? original : {...original,forwardX:Math.sin(theta),forwardY:-Math.cos(theta),rightX:Math.cos(theta),rightY:Math.sin(theta)};
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
        return { ...rotation, target, worldImpulseX:forceX*h, worldImpulseY:forceY*h,
          // Pneumatic trail follows rolling direction; unlike fixed mechanical
          // caster trail it reverses with travel. Transport vanishes at rest.
          aligningImpulse: rotation.lateralImpulse * contact.pneumaticTrail * target.trailFraction
            * vLong / Math.hypot(vLong, SLIP_REFERENCE_SPEED),
          contactVelocity: { longitudinal: vLong, lateral: vLat } };
      });
      const expected = prescribedBody ? [...oldVelocity] : [oldVelocity[0] + h * (ext[0] + fx / mass),
        oldVelocity[1] + h * (ext[1] + fy / mass), oldVelocity[2] + h * (ext[2] + torque / inertia)];
      const nextSteering = oldSteering ? integrateSteering({...oldSteering,dt:h,
        tireTorque:-rotations.reduce((sum,r,i)=>sum+(oldContacts[i].steered ? r.aligningImpulse/h : 0),0)}) : null;
      if(nextSteering)expected.push(nextSteering.angle);
      return { steering:nextSteering,residual: nextVelocity.map((v, i) => v - expected[i]), rotations,
        // Propagate the conservative impulse update, not the approximate
        // Newton iterate. Otherwise tiny accepted residuals accumulate across
        // adaptive substeps and disagree with the impulse sent to Mission 01.
        velocity: expected.slice(0,3), impulseX: fx * h, impulseY: fy * h, angularImpulse: torque * h };
    }
    let candidate = prescribedBody ? [...oldVelocity] : oldVelocity.map((v, i) => v + h * ext[i]);
    if(oldSteering)candidate.push(oldSteering.angle);
    let result = evaluate(candidate);
    const tolerance = 1e-10 * (1 + norm(oldVelocity));
    for (let iteration = 0; iteration < 20 && residualNorm(result.residual) > tolerance; iteration++) {
      counters.nonlinearIterations++;
      const size=candidate.length,jacobian=Array.from({length:size},()=>[]);
      for (let j = 0; j < size; j++) {
        const epsilon = 1e-6 * Math.max(1, Math.abs(candidate[j]));
        const perturbed = [...candidate]; perturbed[j] += epsilon;
        const r = evaluate(perturbed);
        for (let i = 0; i < size; i++) jacobian[i][j] = (r.residual[i] - result.residual[i]) / epsilon;
      }
      const delta = linearSolve(jacobian, result.residual);
      if (!delta) return null;
      let accepted = false;
      for (let line = 0; line < 10; line++) {
        const trial = candidate.map((v, i) => v - delta[i] * 2 ** -line);
        const next = evaluate(trial);
        if (residualNorm(next.residual) < residualNorm(result.residual)) {
          candidate = trial; result = next; accepted = true; break;
        }
      }
      if (!accepted) return null;
    }
    if (residualNorm(result.residual) > tolerance) return null;
    return { ...result, evaluations, substeps: 1, maxBodyResidual: norm(result.residual), maxSteeringResidual:oldSteering ? Math.abs(result.residual[3]) : 0 };
  }
  function nextContacts(oldContacts, result) {
    return oldContacts.map((c, i) => ({ ...c, omega: result.rotations[i].omega,
      previousForce: result.rotations[i].force, previousLateralForce: result.rotations[i].lateralForce }));
  }
  function combine(left, right) {
    let combinedSteering=right.steering;
    if(combinedSteering) {
      const l=left.steering.ledger,r=right.steering.ledger;
      const ledger={...r,initialEnergy:l.initialEnergy};
      for(const key of ['driverWork','tireWork','externalWork','viscousWork','frictionWork','stopWork','numericalWork','configurationWork','frictionImpulse','stopImpulse','residual'])ledger[key]+=l[key];
      combinedSteering={...combinedSteering,ledger};
    }
    return { ...right,steering:combinedSteering, impulseX: left.impulseX + right.impulseX,
      impulseY: left.impulseY + right.impulseY, angularImpulse: left.angularImpulse + right.angularImpulse,
      evaluations: left.evaluations + right.evaluations, substeps: left.substeps + right.substeps,
      maxBodyResidual: Math.max(left.maxBodyResidual, right.maxBodyResidual),
      maxSteeringResidual:Math.max(left.maxSteeringResidual,right.maxSteeringResidual),
      rotations: right.rotations.map((r, i) => ({ ...r,
        ...Object.fromEntries(additive.map(key => [key, left.rotations[i][key] + r[key]])),
        substeps: left.rotations[i].substeps + r.substeps })) };
  }
  function interval(v, c, h, depth, steer) {
    const nextSteering = r => steer ? {...steer,angle:r.steering.angle,rate:r.steering.rate} : null;
    const full = advance(v, c, h, steer);
    const left = advance(v, c, h / 2, steer);
    const right = left ? advance(left.velocity, nextContacts(c, left), h / 2, nextSteering(left)) : null;
    let resolved = full && left && right;
    if (resolved) {
      resolved = norm(full.velocity.map((value, i) => value - right.velocity[i])) <= 1e-5 + 1e-4 * norm(right.velocity);
      if(steer)resolved = resolved
        && Math.abs(full.steering.angle-right.steering.angle)<=1e-7+1e-4*Math.abs(right.steering.angle)
        && Math.abs(full.steering.rate-right.steering.rate)<=1e-5+1e-4*Math.abs(right.steering.rate);
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
    counters.rejectedIntervals++;
    if (depth === 16) throw new Error('Coupled tire/chassis contact solve did not converge');
    const first = interval(v, c, h / 2, depth + 1, steer);
    const second = interval(first.velocity, nextContacts(c, first), h / 2, depth + 1, nextSteering(first));
    return combine(first, second);
  }
  const result=interval(velocity, contacts, dt, 0, steering);
  if(result.steering)result.steering.ledger.frictionTorque=result.steering.ledger.frictionImpulse/dt;
  return {...result,...counters};
}
