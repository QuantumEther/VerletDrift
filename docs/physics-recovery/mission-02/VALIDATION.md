# Validation record and reproducibility

## Executed checks

- **295 unit tests passed across 28 files.** This includes all 46 unchanged Mission 01 numerical regressions, the pre-existing physics/UI-support suites, and 69 Mission 02 tests. [Full log](unit-tests.log).
- **21 model/configuration tests rerun after the final version-2 import guard passed.** This is a focused follow-up, not 21 additional unique tests. [Final configuration log](config-final-tests.log).
- **10 Chromium browser tests passed**: three control/migration checks and seven suspension, launch, forward/reverse braking, low-traction wheelspin, shifting and handbrake checks. [Browser log](browser-tests.log). The final run was taken against the committed source fix.
- **53 controlled handling runs**: 13 maneuvers at 50/100/200/400 Hz, plus an 800 Hz cornering reference. All produced finite body/wheel states and nonnegative normal loads. [Run log](experiment-run.log).
- **Steady force and load matrices**, prescribed-body relaxation/reversal histories, pure rolling/reverse cases, a 600-point deterministic combined-motion/shape grid, stiff valid-parameter production cases, zero-load/recontact tests, and independent body-plus-wheel passivity/work checks.
- **A reproducible negative control**: applying a frozen-body tire solve to a moving chassis creates energy; the production coupled path under the same settings does not produce that growth. [Data](split-contact-control.json).

The initial test-first commit `10d39d2` preceded implementation: 14 of its 25 tire regression contracts failed on Mission 01. The original failures concern peak semantics, supported C values, pure lateral Sliding Grip, pure yaw/local contact, stale unloading SAT, stacked lags and reversed-slip work. [Baseline log](baseline-tests.log). The later mathematical, transient and coupled-energy tests extend coverage; they are not claimed to have existed in that initial commit.

### Existing test changes

Mission 01's numerical test file and rigid integrator/history implementations are unchanged. The original suspension-handling convergence tests also remain unchanged and pass.

The fixed-body `tire-unloading` suite now explicitly uses the `prescribedBody` fixture API, because its test velocities are externally held. Its force magnitudes, locked sliding direction, load, unload and recontact expectations were not weakened. The wheel constant-drive endpoint refinement assertion permits a 1e-9 m/s floor when all grids already agree at coordinate/root roundoff; the physical reference and other accuracy requirements remain. That floor is smaller than Mission 01's 1e-7 velocity invariant bound. The UI count changes only for two retired B/C sliders, and a new test checks visible, atomic versioned migration.

## Quantities and tolerances

The isolated passive tests include chassis translation, chassis yaw and all four physical wheel rotor energies. They omit drive, drag, yaw damping, sleep and the column's external actuator/spring work. For both a slow held-angle turn and a pure yaw pivot, at dt=0.1, 0.02, 0.01, 0.005 and 0.0025 s, each step must not increase this kinetic energy beyond 1e-7 J. Independent midpoint body/contact work plus rotor-contact work must close within 1e-5 J per outer step. Applied velocity must reproduce the shared contact impulse prediction within 5e-8 in its velocity component units. The stiff valid-domain cases also exercise this endpoint consistency.

Pure mathematical peaks are checked to 1e-8 N; small-slip stiffness is checked to 2e-6 relative in finite-difference probes. A frozen-target lag's endpoint and **integrated force** are checked to 1e-7 in their force/impulse units at all four frequencies. Rotor torque balance is checked to 1e-7 N·m·s, rotor-work residual to 1e-6 J, and endpoint friction work cannot be positive beyond 1e-7 J in those unit tests. The combined force grid must stay within capacity plus 1e-8 N and must oppose actual slip to the stated roundoff bound. No percentage-scale artificial rotational damping or arbitrary energy injection is admitted as a passing numerical tolerance.

These tolerances are tests of the chosen discrete model. They are not a statement that the empirical model is accurate to those tolerances against a real tire.

## Measured contact and work accounting

Across the 53 final handling cases, the largest measured per-wheel contact impulse residual is **1.204e-9 N·m·s**. The largest absolute accumulated effective-rotor work residual per run is **1.462e-8 J**. All accumulated endpoint-friction-work diagnostics are nonpositive (zero for motionless contacts). This does not turn endpoint quadrature into measured tire heat.

The table below uses 100 Hz. Body contact work uses applied forces, actual arms, and measured midpoint translation/yaw. Resolved rotor work uses the kernel's accepted substeps. Positive rotor-contact work is legitimate transfer from the chassis through the road contact; it is not free energy. The normal column/drag/yaw parameters were not changed.

| Run | Body tire work (J) | Resolved rotor contact work (J) | Resolved rotor drive+brake work (J) | Body residual after tire/drag/yaw work (J) |
| --- | --- | --- | --- | --- |
| cornering | -67318.224253 | -2658.903339 | 0.000000 | 7.131e-07 |
| handbrake | -177133.428972 | 5299.524491 | -11398.420672 | 1.046e-06 |
| pure-yaw | -1333.697086 | -49.467840 | 0.000000 | -5.970e-09 |
| steering-release | 19.572129 | -19.591837 | 0.000000 | -2.220e-01 |
| slow-turn | 0.028630 | -0.195918 | 0.000000 | -2.175e-01 |
| accel-turn | -144831.536491 | -352771.378792 | 408271.904668 | -2.200e-06 |

Neutral cornering, handbrake and pure-yaw work close tightly. For example, positive wheel contact work in the handbrake case is accompanied by greater negative chassis contact work and negative brake work. It must not be assessed from chassis energy alone.

Near rest, the larger negative body residuals (about 0.22 J in the release/slow-turn cases) include the inherited application sleep/history/cache behavior. Sleep happens after derived-state calculation; cached body velocity need not immediately equal the snapped history. These losses are **not attributed to tire heat**, and the isolated passive-contact tests exclude that intervention. Small remaining full-application stop motion at 50/100 Hz also involves unchanged rolling drag and sleep thresholds. Exact standstill/stiction and consistent sleep-cache reset are remaining application limitations.

Drive cases use the original locked-drivetrain reflected inertia and engine synchronization. Their rotor residual is an **effective-coordinate** torque/work check; it is not complete physical crank energy conservation across clutch transitions. The physical wheel-only midpoint approximation and the substep-resolved rotor ledger are both recorded, with different field names. They are not silently substituted for one another.

`resolvedEndpointFrictionWork` evaluates force against implicit endpoint slip. `resolvedPatchWork` uses accepted wheel work and the contact solver's frozen local chassis velocity. Neither is an exact calorimetric integral along the actual moving contact patch. Their difference from midpoint body-plus-rotor work can include endpoint quadrature, implicit integration, moving-geometry splitting, and external-force timing. The formal nonpositive-work inequality is a passivity check; only analytical controls and refinement establish numerical accuracy. No completely closed vehicle-plus-suspension-plus-column-plus-engine thermodynamic ledger is claimed.

## Convergence and performance

[BEFORE_AFTER.md](BEFORE_AFTER.md) and [refinement.csv](refinement.csv) give the production cornering comparison against an 800 Hz numerical reference. At 100 Hz the endpoint relative speed error is about 0.0529%; at 400 Hz it is 0.0142%. Heading and yaw-rate errors also decrease with refinement. The 800 Hz result is a numerical reference, not a physical measurement. The outer geometry update remains first order, and fixed internal error tolerances eventually limit further refinement gains.

A fixed tire target has an analytically known first-order magnitude lag and impulse integral, both reproduced in independent tests. Force-free Mission 01 rotation/translation invariants remain at their original strict tolerances. Other handling scenarios have raw results at all four required rates; nonlinear oversteer and release should not be assigned one universal fitted convergence order.

The coupled solve costs more than the former split force call. The largest observed accepted internal contact-step count in this matrix is **1016 in one outer tick** (a 50 Hz countersteer transition), versus only a few in many smooth ticks. This is an important limitation for large AI-training throughput. No isolated hardware benchmark or target frame-rate guarantee was established. Analytic Jacobians, event-aware stepping and vectorized batches are defensible optimization work if they preserve these residual and convergence checks. Loosening physical grip or hiding failed intervals is not an optimization.

## Reproduction

Source baseline is Mission 01 `74440cd9204d2cd5a1aedd9f45bed5c152d514a2`; corrected source is `dbd2d1eedab9236faa6c26b9e9820cc624ccc3b5`. The manifest and both main data files record hashes. Baseline source was checked out separately, not reconstructed by undoing code in the working branch.

With suitable Linux Node dependencies installed in a normal checkout:

```bash
npm ci
npx vitest run
node scripts/mission02-compare.mjs docs/physics-recovery/mission-02/after.json
node scripts/mission02-split-control.mjs
MPLCONFIGDIR=/tmp/mission02-matplotlib python3 docs/physics-recovery/mission-02/plot-results.py
```

Matplotlib and NumPy are needed only for plotting. In this managed checkout, tracked node_modules contain Windows native binaries, so Linux Vitest dependencies are installed externally and tests used:

```bash
node /workspace/.verletdrift-tools/node_modules/vitest/vitest.mjs run   --config /workspace/.verletdrift-tools/vitest.config.mjs
```

That configuration uses the repository test root, Node environment, `tests/**/*.test.js`, excludes e2e tests, places Vite cache outside the checkout, and limits workers to two. Physics is not mocked; browser storage is stubbed for state imports.

Browser validation used the repository's Playwright CLI consistently with its own test imports, system Chromium `/usr/bin/chromium`, and the existing Python server at port 8000. Using the external Playwright CLI with repository test imports initially caused a duplicate-runner collection error; the recorded final log is the successful consistent-runner run. Commands:

```bash
node node_modules/@playwright/test/cli.js test   --config /workspace/.verletdrift-tools/playwright.config.mjs   tests/e2e/ui-integration.spec.js --grep 'every control|presets, converted|tire v1'
node node_modules/@playwright/test/cli.js test   --config /workspace/.verletdrift-tools/playwright.config.mjs   tests/e2e/suspension.spec.js tests/e2e/wheel-braking.spec.js tests/e2e/handbrake-drift.spec.js
```

To regenerate the baseline, create a checkout of Mission 01 and copy only the current `scripts/mission02-compare.mjs`, `tests/helpers/tire-probe.js`, and initial `tests/tire-recovery.test.js` into it. The inherited Mission 01 numerical/mechanical helpers and audited control fixture are already present. Run the experiment script and initial regression suite with that checkout as root; do not copy corrected production files. The old tire API ignores the extra prescribed-fixture option, matching its original frozen-body behavior. This produces the 14-failure baseline and before-data on the proper Mission 01 source.

The runner executes the actual main-loop mechanical source prefix through sleep, stopping before camera/audio/graphics/game calls. It fails if its source boundaries move. The source itself supplies drag and yaw inputs to the new contact interface; the experiment does not duplicate the vehicle force equations. Curve fixtures intentionally prescribe motion with infinite rotor inertia. Free-motion and work tests use ordinary inertia and a consistent pose history.

## Not executed or not established

- No real tire force/moment dataset, skidpad, brake test, tire machine or vehicle telemetry calibration.
- No quantitative validation of pressure, temperature, camber, road texture, tire wear or load-dependent patch geometry.
- No exact static tire-friction complementarity, elastic-bristle energy or stationary steering-scrub model.
- No complete rack/chassis reaction-moment or steering/driver work closure, and no complete suspension/crank/clutch energy balance.
- No correction to original column Coulomb chatter, yaw assistance, sleep/cache ordering, wall collision approximations, grip-state telemetry hysteresis, or drivetrain lock inertia approximation.
- No full renderer/GPU visual regression matrix and no unrelated visual changes. Ten selected real-browser integration tests were run.
- No exhaustive nonlinear solver verification for every possible physical input; validated primary domains, extreme valid cases and fail-hard refinement bounds define the supported evidence.
- No claim that a stable default released-steering run proves stability for every column parameter/preset or that altered handbrake behavior is calibrated to a real vehicle.

The model is ready for review as a mathematically coherent tire/contact baseline within these limits. It is not a claim that all remaining standstill, steering, drivetrain or AI-training physics are recovered.
