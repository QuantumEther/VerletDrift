# Mission 03 validation and reproduction

## Executable coverage and tolerances

There are **343 passing unit tests**: all 295 completed Mission 02 tests plus 48 Mission 03 tests. [unit-tests.log](unit-tests.log) records the final full run. No pre-existing assertion, parameter default or physics tolerance was relaxed. New method-specific tests were strengthened from backward-Euler convergence/error accounting to continuous analytic accuracy after the undamped-spring regression rejected that prototype. The moving-release test has a generous host watchdog because it is computationally expensive; its physical comparison remains 5 mrad.

All **14 selected Chromium browser tests pass**: ten existing driving/control/configuration cases and four new steering/input/import cases. See [browser-existing-tests.log](browser-existing-tests.log) and [browser-steering-tests.log](browser-steering-tests.log). This is a relevant subset, not the entire unrelated graphics/browser suite. The real browser handbrake test completes but takes the recorded duration in the final browser log: a material performance limitation.

| Test file | Unique cases | What it establishes |
| --- | ---: | --- |
| `tests/steering-recovery.test.js` | 22 | Historical high-C hold at four rates; subthreshold hold and breakaway; no friction reversal/energy increase; fixed spring; passive damping regimes and ledger; both stop sides; driver/free state transfer; sleep cache consistency with preserved force/steering state. All 22 failed before fixes. |
| `tests/steering-model.test.js` | 17 | Exact torque impulse; bounded stopping impulses; analytical viscous/spring refinement; reversal; supported column-parameter extremes; render-independent target; live parameter work; timestep changes; ten-second exact rest; exact continuous Coulomb stopping distance/work and undamped storage. |
| `tests/steering-feedback.test.js` | 2 | Reproduced delayed-feedback coarse-step runaway versus resolved fine grid; current moment replaces stale SAT; steering work and body-impulse agreement. |
| `tests/steering-exact.test.js` | 6 | Undamped energy and phase at every rate, production/sleep equivalence, and independent dense Simpson integration of viscous and driver work. |
| `tests/steering-contact.test.js` | 1 | Actual front normal-load removal/recontact, zero unsupported moment, preserved column state and closed discrete column work. |

The retained 46 Mission 01 tests still enforce free translation/spin, momentum/energy, constraints, history intervals, loaded convergence and live timestep invariants. The retained 69 Mission 02 tests cover peaks/stiffness, combined slip, load sensitivity/unloading, forward/reverse signs, transients, contact/body/rotor impulses and work, passive stiff low-speed cases, brakes and configuration. They pass unchanged. Other existing unit cases include suspension handling, wheel inertia/braking and rendering data consumers.

Exact stationary hold uses strict zero/equality assertions because it is an exact static equilibrium. Torque impulse and ledger checks use absolute numerical bounds, typically 1e-12 J for the isolated column and 1e-10 J for an accumulated shared tick. Those are roundoff/accounting bounds, not a claim of real hardware accuracy. Supported-column passivity is checked over 162 parameter combinations (3 inertias × 3 dampings × 3 friction settings × 3 normalized spring settings × 2 locks), ten steps each at 0.1 s. Each passive energy bound is 1e-11 J; ledger tolerance is 1e-10 J at the largest tested energies.

Viscous decay and under/critical/overdamped spring trajectories match independent continuous solutions within 1e-12 absolute error at all four rates. Coulomb stopping reproduces continuous distance 0.2 rad and work −0.04 J to 12 decimal places without numerical-loss compensation. Undamped energy and phase have roundoff bounds (1e-12 isolated, 1e-11 through production scheduling). An independently derived driver trajectory and dense Simpson quadrature validate actuator/damper work to ten decimal places. No broad percentage-energy loss is accepted as correct free steering.

The backward-Euler prototype's apparent convergence plateau is retained in [backward-euler-undamped.json](backward-euler-undamped.json): 93.9414% retention at every 50–400 Hz setting because the adaptive solver chose the same internal interval. [undamped-before.log](undamped-before.log) records five failing energy/phase regressions before analytic propagation. Final [undamped-refinement.json](undamped-refinement.json) preserves energy to about 1e-13 relative and phase near roundoff without rescaling state. Agreement across rates alone would not have exposed that prototype error.

Shared moving release allows at most 0.005 rad discrepancy between 50 and 400 Hz at three seconds, about 1% of default lock, against an actual pre-interface-correction discrepancy 0.2047446 rad. This gate is accompanied by full 50/100/200/400/800 trajectories and yaw/heading refinement; endpoint agreement alone is insufficient.

## Measurement protocol

[mission03-compare.mjs](../../../scripts/mission03-compare.mjs) runs 36 isolated cases and 35 vehicle cases, recording parameters, source hashes, energy/work, steering/rates/SAT, body state, accepted/attempted solver work and wall times. All eight vehicle scenarios run at 50, 100, 200 and 400 Hz; low-speed release, moving release and countersteer also run at 800 Hz. Isolated sweeps include all four rates plus 800 Hz spring/input references.

The mechanical helper reads and executes the exact main-loop mechanical prefix through sleep. Camera, rendering, sound and gameplay contacts are excluded. The unit feedback contract uses module defaults; it is not claimed to be bit-identical to the UI-control vehicle sweep. The vehicle matrix uses the recorded Mission 01 audited controls without force/steering tuning; neutral gear, large map and exact seeded velocities isolate the comparisons. “Zero-capacity recontact” sets μ=0 for 0.5 s as an explicit experimental loss-of-contact-capacity intervention; it is not a claim that suspension produced lift-off. Actual zero normal load is independently tested. Baseline data used the historical label `unload-recontact` for the same μ protocol; the published CSV corrects that terminology.

The final after-sweep and serialized final benchmark use source `d41d674`, including exact event propagation, current contact feedback and the input-button correction. Its source hashes are checked against that Git revision. No production equations changed after this evidence was collected. Test-first commits and the rejected prototype are identified separately rather than treating their measurements as final.

The legacy friction reconstruction uses a source-only archive of completed Mission 02 and verifies its steering SHA-256 before running. It records endpoint and midpoint friction-work decompositions, positive contributions, late amplitude and exact reproduction counts. The negative delayed-interface control uses final equations but explicitly restores preceding-tick SAT delivery through a separate test helper; it is never an application setting.

## Performance interpretation

The isolated steering microbenchmark warms the implementation, then records five batches of 20,000 updates in both released and driven steady states. It measures the column primitive, **not** the cost of its repeated evaluation within contact Newton iterations.

The separate performance runner uses the same physical inputs and recorded controls on baseline and final snapshots, serially, with no renderer or other experiment/test workload. It warms modules, then measures 0.8 simulated seconds each of release and rapid countersteer at every required rate; the target reverses at 0.4 s. Raw per-tick milliseconds, mean/median/p95/worst, accepted steps/evaluations, attempted evaluations, Newton iterations and rejected intervals are retained. Attempted evaluation/iteration counters did not exist on baseline; absent baseline counters are not interpreted as zero work. The long measurement sweep's times are useful context, while this serialized matched runner supplies the before/after timing comparison. Host scheduling, garbage collection, JS runtime and single-sample maneuver timing remain limitations; no universal hardware speedup or confidence interval is claimed.

A lower accepted subdivision count does not necessarily mean a faster tick: the fourth root unknown and tighter resolved steering trajectory cost more evaluations. Rejected full/two-half trials also consume work. No original physical/contact tolerance, friction capacity or damping was changed for throughput. The resulting single-vehicle cost is an explicit blocker to assuming large many-vehicle AI throughput. Analytic Jacobians, a proven elimination of steering unknowns, event-aware algorithms and compiled/vectorized batches need matched residual/convergence benchmarks in a separate optimization mission.

## Reproduction

Use normal Linux Node/Vitest/Playwright installations and Python with NumPy/Matplotlib. This managed workspace used external Linux test tooling because the repository includes Windows-built node_modules. No tracked dependency installation was replaced. Commands in a normal compatible checkout:

```bash
npm test
npx playwright test tests/e2e/steering-recovery.spec.js
node scripts/mission03-compare.mjs /tmp/mission03-after.json
node scripts/mission03-compare.mjs /tmp/mission03-delayed.json --delayed
node scripts/mission03-performance.mjs /tmp/mission03-performance.json
node scripts/mission03-historical-countersteer.mjs /tmp/mission03-historical.json
node scripts/mission03-undamped.mjs /tmp/mission03-undamped.json
MPLCONFIGDIR=/tmp/mission03-mpl python3 scripts/mission03-publish.py
```

To reconstruct baseline measurements, archive/checkout `8fba5b33d758e613e1745afab7b16bbe7bd85031`, use the original measurement script from test commit `e877b2a` (or copy the final script and mechanical helper together) into that separate source snapshot, and run there. Preserve the original main prefix and physics files. The before JSON and manifest identify exact source hashes; do not emulate baseline by reverting arbitrary final code hunks. The friction runner requires the legacy steering hash argument `06968222184d9b2da97d36e98d8e392817cf8115f1cb3a49e3ec47e9c5312e97`.

Publication integrity can be checked with `python3 scripts/mission03-verify.py`. It verifies recorded source revisions, unchanged foundational modules, independently reconstructed steering work, Markdown links, manifest hashes and byte-for-byte ZIP contents.

The included ZIP is a content-identical packaging of this unpacked report folder. Source, tests and runners remain normal versioned files outside the ZIP. All source hashes are checked against their stated Git revisions before publication. No merge is required or performed.
