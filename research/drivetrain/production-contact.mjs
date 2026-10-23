// Node-only research adapter: extract the actual production closures without
// importing the state singleton or changing/exporting any production function.
import { readFileSync } from 'node:fs';
import { PACEJKA_B, PACEJKA_C, TIRE_PEAK_SLIP_RATIO } from '../../js/constants.js';
const source = readFileSync(new URL('../../js/physics/tires.js', import.meta.url), 'utf8');
function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw Error(`Production contact boundary missing: ${name}`);
  const begin = source.indexOf('{', start);
  let depth = 1;
  for (let i = begin + 1; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw Error(`Unclosed production function: ${name}`);
}
const code = ['pacejkaForce', 'slipAtOmega', 'longitudinalTarget', 'contactTarget'].map(extract).join('\n');

export function productionContact({ speed = 10, lateralSpeed = 0, lateralForce = 0,
  normalLoad = 3000, friction = 1, radius = .3, relaxationLength = .3 } = {}) {
  const env = {
    normalLoad, effectiveFriction: friction, safePeakSlipRatio: TIRE_PEAK_SLIP_RATIO,
    wheelRad: radius, wheelLongitudinalSpeed: speed, wheelLateralSpeed: lateralSpeed,
    fadedLateralForceMag: Math.abs(lateralForce), lateralForceSign: lateralSpeed > 0 ? -1 : 1,
    frictionLimit: normalLoad * friction,
    params: { pacejkaB: PACEJKA_B, pacejkaC: PACEJKA_C, tireSlidingFrictionRatio: .85 },
    clamp: (x, lo, hi) => Math.max(lo, Math.min(hi, x)),
    clamp01: x => Math.max(0, Math.min(1, x)),
  };
  const targetForce = new Function(...Object.keys(env), `${code}\nreturn omega => contactTarget(omega).lon;`)(...Object.values(env));
  return { radius, speed, limit: normalLoad * friction,
    relaxationTime: Math.max(Math.max(relaxationLength, .02) / Math.max(Math.abs(speed), .5), 1e-4), targetForce };
}

export const constantContact = (force, { radius = .3, speed = 0, relaxationTime = .03 } = {}) => ({
  radius, speed, relaxationTime, limit: Math.abs(force), targetForce: () => force,
});
