// Diagnostic only. Run with --baseline-root pointing to an extracted 09a3e36 tree.
// Production mechanics remain untouched; supports the original and corrected harness.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
const targetRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const arg = process.argv.indexOf('--baseline-root');
if (arg < 0 || !process.argv[arg + 1]) throw Error('Pass --baseline-root /path/to/extracted/baseline');
const roots = [['baseline-3m', resolve(process.argv[arg + 1])], ['target-dmc12', targetRoot]];
const timesteps = [.02, .01, .005, .0025, .00125, .000625, .0003125];
const report = { description: 'Same production mechanical functions; original versus common-boundary input schedules',
  timesteps, configurations: [] };

function substitute(source, from, to) {
  if (!source.includes(from)) throw Error('Diagnostic source anchor changed: ' + from);
  return source.replace(from, to);
}

for (const [configuration, root] of roots) {
  const { default: state } = await import(pathToFileURL(join(root, 'js/state.js')));
  const originalState = structuredClone(state);
  const constants = await import(pathToFileURL(join(root, 'js/constants.js')));
  const source = readFileSync(join(root, 'scripts/compare-suspension.mjs'), 'utf8');
  const entry = { configuration, wheelbase: constants.CONSTRAINT_SIDE_LENGTH,
    track: constants.CONSTRAINT_AXLE_WIDTH, inertia: constants.MOMENT_OF_INERTIA,
    harnessSha256: createHash('sha256').update(source).digest('hex'), schedules: [] };
  for (const { reversal, smooth = false } of [
    { reversal: 1.75 }, { reversal: 1.74 }, { reversal: 1.76 }, { reversal: 1.78 },
    { reversal: 1.76, smooth: true },
  ]) {
    // Write a disposable copy of the TEST harness next to a JS source symlink.
    // Only the test input's reversal time and read-only measurements differ.
    const probeRoot = mkdtempSync(join(tmpdir(), 'verlet-timing-probe-'));
    mkdirSync(join(probeRoot, 'scripts'));
    symlinkSync(join(root, 'js'), join(probeRoot, 'js'), 'dir');
    const reversalExpression = source.includes('t >= steeringReversal') ? 'steeringReversal' : String(reversal);
    let probe = source.includes('t >= steeringReversal')
      ? substitute(source, 'steeringReversal = 1.75', `steeringReversal = ${reversal}`)
      : substitute(source, 't >= 1.75', `t >= ${reversal}`);
    if (smooth) {
      probe = substitute(probe, `    state.steering.frontWheelAngle = ['braking', 'acceleration'].includes(maneuver) ? 0
      : t < 0.5 ? 0 : ['transition', 'drift'].includes(maneuver) && t >= ${reversalExpression} ? -0.16 : 0.16;`,
      `    const ramp = x => { const u = Math.max(0, Math.min(1, x)); return u*u*(3-2*u); };
    state.steering.frontWheelAngle = .16 * ramp((t-.5)/.1) * (1-2*ramp((t-${reversal})/.1));`);
    }
    probe = substitute(probe, '  const samples = [];', `  const samples = [];
  const eventSchedule = { positiveStart: null, negativeStart: null, positiveSeconds: 0, negativeSeconds: 0 };
  let maxConstraintError = 0;`);
    probe = substitute(probe, '    updateSuspension(dt);', `    if (state.steering.frontWheelAngle > 0) {
      eventSchedule.positiveStart ??= t; eventSchedule.positiveSeconds += dt;
    } else if (state.steering.frontWheelAngle < 0) {
      eventSchedule.negativeStart ??= t; eventSchedule.negativeSeconds += dt;
    }
    updateSuspension(dt);`);
    probe = substitute(probe, '    maxRoll = Math.max', `    const points = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'].map(n => state.wheels[n]);
    for (const [a, b, rest] of [[0,1,2*W],[2,3,2*W],[0,2,2*L],[1,3,2*L],
      [0,3,2*Math.hypot(L,W)],[1,2,2*Math.hypot(L,W)]]) {
      maxConstraintError = Math.max(maxConstraintError, Math.abs(Math.hypot(points[a].x-points[b].x,
        points[a].y-points[b].y)-rest));
    }
    maxRoll = Math.max`);
    probe = substitute(probe, '  return { maneuver,', '  return { eventSchedule, maxConstraintError, maneuver,');
    const probePath = join(probeRoot, 'scripts/probe.mjs');
    writeFileSync(probePath, probe);
    Object.assign(state, structuredClone(originalState));
    const { compareRun } = await import(pathToFileURL(probePath));
    const runs = timesteps.map(dt => ({ dt, ...compareRun({ dt }) }));
    const reference400 = runs.find(r => r.dt === .0025);
    const reference3200 = runs.find(r => r.dt === .0003125);
    const reference6400 = !smooth && [1.75, 1.76].includes(reversal) ? compareRun({ dt: 1/6400 }) : null;
    entry.schedules.push({ requestedReversal: reversal, profile: smooth ? '100 ms smooth control ramps' : 'step control',
      reference6400,
      runs: runs.map(r => ({ ...r,
        errorVs400: { heading: Math.abs(r.finalHeading-reference400.finalHeading),
          speedFraction: Math.abs(r.finalSpeed/reference400.finalSpeed-1), yaw: Math.abs(r.maxYaw-reference400.maxYaw) },
        errorVs3200: { heading: Math.abs(r.finalHeading-reference3200.finalHeading),
          speedFraction: Math.abs(r.finalSpeed/reference3200.finalSpeed-1), yaw: Math.abs(r.maxYaw-reference3200.maxYaw) },
      })) });
  }
  Object.assign(state, structuredClone(originalState));
  const native = entry.schedules.find(s => s.requestedReversal === 1.75);
  const aligned = entry.schedules.find(s => s.requestedReversal === 1.76);
  const coarse = native.runs[0];
  const originalRef = native.runs.find(r => r.dt === .0025);
  const alignedRef = aligned.runs.find(r => r.dt === .0025);
  entry.signedHeadingDecompositionAt50Hz = {
    originalComparison: coarse.finalHeading - originalRef.finalHeading,
    sameInputNumericalDifference: coarse.finalHeading - alignedRef.finalHeading,
    referenceInputTimingDifference: alignedRef.finalHeading - originalRef.finalHeading,
  };
  report.configurations.push(entry);
}
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
