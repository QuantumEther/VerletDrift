// Research only: fixed-ratio rear rotational solve. No production/global state.
// End-point Coulomb active sets; midpoint external work; exact force relaxation
// for a target frozen at midpoint speed. See docs/drivetrain-coupled-solver.md.
export function rotationalEnergy(s, p) {
  return .5 * (p.engineInertia * s.crank ** 2 + p.inputInertia * s.input ** 2
    + p.leftInertia * s.left ** 2 + p.rightInertia * s.right ** 2);
}

const noContact = Object.freeze({ radius: .3, speed: 0, relaxationTime: 1,
  limit: 0, targetForce: () => 0 });
const noContacts = Object.freeze([noContact, noContact]);
const MAX_NEWTON = 24, MAX_LINE_SEARCH = 10;

export function createCoupledSolver(parameters) {
  const p = { ...parameters }, g = p.gearRatio, h = g / 2;
  for (const name of ['engineInertia', 'inputInertia', 'leftInertia', 'rightInertia']) {
    if (!(p[name] > 0) || !Number.isFinite(p[name])) throw Error(`Invalid ${name}`);
  }
  if (!Number.isFinite(g)) throw Error('Invalid gearRatio');
  const engaged = g !== 0, n = engaged ? 3 : 4;
  const li = engaged ? 1 : 2, ri = engaged ? 2 : 3;
  // Fixed workspace: no per-iteration arrays, no recursive subdivision.
  const old = new Float64Array(n), next = new Float64Array(n);
  const inverse = new Float64Array(n * n), A = new Float64Array(3 * n);
  const response = new Float64Array(n * 3), W = new Float64Array(9);
  const freeVelocity = new Float64Array(n), base = new Float64Array(n);
  const q = new Float64Array(3), J = new Float64Array(3), bounds = new Float64Array(3);
  const status = new Int8Array(3), free = new Int8Array(3), mat = new Float64Array(12);
  const residual = new Float64Array(2), originalResidual = new Float64Array(2);
  const target = new Float64Array(2), F = new Float64Array(2), decay = new Float64Array(2);
  const carriedWeight = new Float64Array(2), tolerance = new Float64Array(2);
  const jacobian = new Float64Array(4), delta = new Float64Array(2);
  A[0] = 1;
  if (engaged) { A[li] = -h; A[ri] = -h; } else A[1] = -1;
  A[n + li] = 1; A[2 * n + ri] = 1;
  const rearA = p.leftInertia + p.inputInertia * h * h;
  const rearB = p.inputInertia * h * h;
  const rearD = p.rightInertia + p.inputInertia * h * h;
  let warmCode = 0, selectedCode = 0, dt, contacts, s, counters;

  function frictionSolve(leftForce, rightForce) {
    counters.frictionSolves++;
    for (let i = 0; i < n; i++) freeVelocity[i] = base[i]
      - dt * (inverse[i * n + li] * contacts[0].radius * leftForce
        + inverse[i * n + ri] * contacts[1].radius * rightForce);
    for (let k = 0; k < 3; k++) {
      q[k] = 0;
      for (let i = 0; i < n; i++) q[k] += A[k * n + i] * freeVelocity[i];
    }
    // Try the previous active set first, then every other set exactly once.
    for (let trial = -1; trial < 27; trial++) {
      if (trial === warmCode) continue;
      const code = trial < 0 ? warmCode : trial;
      counters.activeSets++;
      let count = 0;
      for (let k = 0, v = code; k < 3; k++, v = Math.floor(v / 3)) {
        status[k] = v % 3;
        J[k] = status[k] === 0 ? 0 : (status[k] === 1 ? 1 : -1) * bounds[k];
        if (status[k] === 0) free[count++] = k;
      }
      for (let row = 0; row < count; row++) {
        const k = free[row];
        for (let col = 0; col < count; col++) mat[row * 4 + col] = W[k * 3 + free[col]];
        mat[row * 4 + count] = q[k] - W[k * 3] * J[0] - W[k * 3 + 1] * J[1] - W[k * 3 + 2] * J[2];
      }
      // W is positive definite; its principal submatrices have positive pivots.
      for (let k = 0; k < count; k++) {
        const pivot = mat[k * 4 + k];
        for (let j = k; j <= count; j++) mat[k * 4 + j] /= pivot;
        for (let row = 0; row < count; row++) if (row !== k) {
          const scale = mat[row * 4 + k];
          for (let j = k; j <= count; j++) mat[row * 4 + j] -= scale * mat[k * 4 + j];
        }
      }
      for (let k = 0; k < count; k++) J[free[k]] = mat[k * 4 + count];
      let valid = true;
      for (let k = 0; k < 3; k++) {
        const end = q[k] - W[k * 3] * J[0] - W[k * 3 + 1] * J[1] - W[k * 3 + 2] * J[2];
        if (status[k] === 0 ? Math.abs(J[k]) > bounds[k] + 1e-10
          : status[k] === 1 ? end < -1e-10 : end > 1e-10) valid = false;
      }
      if (!valid) continue;
      for (let i = 0; i < n; i++) next[i] = freeVelocity[i]
        - response[i * 3] * J[0] - response[i * 3 + 1] * J[1] - response[i * 3 + 2] * J[2];
      selectedCode = code;
      return;
    }
    throw Error('No admissible friction active set');
  }

  function evaluate(f0, f1) {
    frictionSolve(f0, f1);
    for (let k = 0; k < 2; k++) {
      const c = contacts[k], midpoint = (old[k === 0 ? li : ri] + next[k === 0 ? li : ri]) / 2;
      target[k] = 0;
      if (c.limit > 0) {
        target[k] = c.targetForce(midpoint);
        counters.targetEvaluations++;
        if (!Number.isFinite(target[k]) || Math.abs(target[k]) > c.limit + 1e-7)
          throw Error('Contact callback exceeds declared physical force bound');
      }
      const previous = k === 0 ? s.forceLeft : s.forceRight;
      residual[k] = (k === 0 ? f0 : f1) - carriedWeight[k] * previous
        - (1 - carriedWeight[k]) * target[k];
    }
    return Math.max(Math.abs(residual[0]) / tolerance[0], Math.abs(residual[1]) / tolerance[1]);
  }

  return {
    step(state, forces, timestep, contactPair = noContacts) {
      s = state; dt = timestep; contacts = contactPair;
      if (!(dt > 0) || !Number.isFinite(dt)) throw Error('dt must be finite and positive');
      if (contacts.length !== 2) throw Error('Exactly two contacts required');
      counters = { iterations: 0, targetEvaluations: 0, frictionSolves: 0, activeSets: 0, lineSearches: 0 };
      const combustion = forces.combustionTorque ?? 0, starter = forces.starterTorque ?? 0;
      const drag = forces.dragTorque ?? 0, viscous = forces.viscousDrag ?? 0;
      if (![combustion, starter, drag, viscous].every(Number.isFinite) || viscous < 0)
        throw Error('Invalid external torque or viscous drag');
      old[0] = s.crank; old[li] = s.left; old[ri] = s.right;
      if (!engaged) old[1] = s.input;
      if (!old.every(Number.isFinite) || !Number.isFinite(s.input)) throw Error('Nonfinite rotor state');
      if (engaged && Math.abs(s.input - h * (s.left + s.right)) > 1e-8)
        throw Error('Initial gearbox constraint is incompatible');
      bounds[0] = (forces.clutchCapacity ?? 0) * dt;
      bounds[1] = (forces.brakeLeft ?? 0) * dt;
      bounds[2] = (forces.brakeRight ?? 0) * dt;
      if (!bounds.every(x => x >= 0 && Number.isFinite(x))) throw Error('Invalid friction capacity');
      inverse.fill(0);
      inverse[0] = 1 / (p.engineInertia + dt * viscous / 2);
      if (engaged) {
        const determinant = rearA * rearD - rearB * rearB;
        inverse[li * n + li] = rearD / determinant;
        inverse[ri * n + ri] = rearA / determinant;
        inverse[li * n + ri] = inverse[ri * n + li] = -rearB / determinant;
      } else {
        inverse[n + 1] = 1 / p.inputInertia;
        inverse[li * n + li] = 1 / p.leftInertia;
        inverse[ri * n + ri] = 1 / p.rightInertia;
      }
      base[0] = inverse[0] * ((p.engineInertia - dt * viscous / 2) * old[0]
        + dt * (combustion + starter + drag));
      for (let i = 1; i < n; i++) base[i] = old[i];
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
        response[i * 3 + k] = 0;
        for (let j = 0; j < n; j++) response[i * 3 + k] += inverse[i * n + j] * A[k * n + j];
      }
      for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) {
        W[k * 3 + j] = 0;
        for (let i = 0; i < n; i++) W[k * 3 + j] += A[k * n + i] * response[i * 3 + j];
      }
      for (let k = 0; k < 2; k++) {
        const c = contacts[k], previous = k === 0 ? s.forceLeft : s.forceRight;
        if (!(c.limit >= 0) || !(c.radius > 0) || !(c.relaxationTime > 0)
          || ![c.limit, c.radius, c.relaxationTime, c.speed, previous].every(Number.isFinite)
          || Math.abs(previous) > c.limit + 1e-7) throw Error('Invalid contact or carried force');
        const x = dt / c.relaxationTime;
        decay[k] = Math.exp(-x);
        carriedWeight[k] = -Math.expm1(-x) / x;
        tolerance[k] = 1e-7 + 1e-9 * c.limit;
        F[k] = previous;
      }
      let norm = evaluate(F[0], F[1]), converged = norm <= 1;
      for (let iteration = 0; iteration < MAX_NEWTON && !converged; iteration++) {
        counters.iterations++;
        originalResidual.set(residual);
        for (let col = 0; col < 2; col++) {
          if (contacts[col].limit === 0) {
            jacobian[col] = col === 0 ? 1 : 0;
            jacobian[2 + col] = col === 1 ? 1 : 0;
            continue;
          }
          let epsilon = 1e-4 + 1e-6 * Math.abs(F[col]);
          if (F[col] + epsilon > contacts[col].limit) epsilon = -epsilon;
          evaluate(F[0] + (col === 0 ? epsilon : 0), F[1] + (col === 1 ? epsilon : 0));
          jacobian[col] = (residual[0] - originalResidual[0]) / epsilon;
          jacobian[2 + col] = (residual[1] - originalResidual[1]) / epsilon;
        }
        const determinant = jacobian[0] * jacobian[3] - jacobian[1] * jacobian[2];
        if (Math.abs(determinant) < 1e-14) throw Error('Singular contact Jacobian');
        delta[0] = (jacobian[3] * originalResidual[0] - jacobian[1] * originalResidual[1]) / determinant;
        delta[1] = (-jacobian[2] * originalResidual[0] + jacobian[0] * originalResidual[1]) / determinant;
        let accepted = false;
        for (let line = 0; line < MAX_LINE_SEARCH; line++) {
          const alpha = 2 ** -line, f0 = F[0] - alpha * delta[0], f1 = F[1] - alpha * delta[1];
          counters.lineSearches++;
          if (Math.abs(f0) > contacts[0].limit + 1e-9 || Math.abs(f1) > contacts[1].limit + 1e-9) continue;
          const trialNorm = evaluate(f0, f1);
          if (trialNorm <= 1 || trialNorm < norm * (1 - 1e-4 * alpha)) {
            F[0] = f0; F[1] = f1; norm = trialNorm; accepted = true; break;
          }
        }
        if (!accepted) throw Error(`Contact line search failed (normalized residual ${norm})`);
        converged = norm <= 1;
      }
      if (!converged) throw Error(`Contact solve exhausted ${MAX_NEWTON} iterations`);
      // Restore the accepted point after the finite-difference evaluations.
      evaluate(F[0], F[1]); warmCode = selectedCode;
      const result = { crank: next[0], input: engaged ? h * (next[li] + next[ri]) : next[1],
        left: next[li], right: next[ri],
        forceLeft: target[0] + ((s.forceLeft - target[0]) * decay[0]),
        forceRight: target[1] + ((s.forceRight - target[1]) * decay[1]) };
      const em = (s.crank + result.crank) / 2, im = (s.input + result.input) / 2;
      const lm = (s.left + result.left) / 2, rm = (s.right + result.right) / 2;
      const clutchHeat = J[0] * (em - im);
      const brakeHeat = J[1] * lm + J[2] * rm;
      const roadLeft = dt * F[0], roadRight = dt * F[1];
      const roadWork = -roadLeft * contacts[0].radius * lm - roadRight * contacts[1].radius * rm;
      const bodyPortWork = roadLeft * contacts[0].speed + roadRight * contacts[1].speed;
      const contactHeat = -roadWork - bodyPortWork;
      const combustionWork = combustion * dt * em, starterWork = starter * dt * em;
      const dragWork = drag * dt * em - viscous * dt * em * em;
      const energyChange = rotationalEnergy(result, p) - rotationalEnergy(s, p);
      const balanceError = energyChange - combustionWork - starterWork - dragWork - roadWork + clutchHeat + brakeHeat;
      return { state: result, clutchState: bounds[0] === 0 ? 'open' : selectedCode % 3 === 0 ? 'locked' : 'slipping',
        clutchImpulse: J[0], clutchTorque: J[0] / dt,
        brakeImpulses: [-J[1], -J[2]], roadImpulses: [roadLeft, roadRight],
        work: { energyChange, combustionWork, starterWork, dragWork, roadWork, bodyPortWork,
          clutchHeat, brakeHeat, contactHeat, balanceError },
        passive: clutchHeat >= -1e-8 && brakeHeat >= -1e-8 && contactHeat >= -1e-8,
        residualForce: Math.max(Math.abs(residual[0]), Math.abs(residual[1])), counters };
    },
  };
}
