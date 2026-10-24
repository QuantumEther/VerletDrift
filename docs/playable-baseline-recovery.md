# Mission 11 — Playable baseline recovery

Branch `recovery/playable-baseline`, created directly from `recovery/realtime` at `b23935b2b98b3474bf7d178283a0450724febb81`. Protected branches remain unchanged. No merge. This is an incremental recovery candidate; human-confirmed playability is still pending.

## Transfers and scope

- `62418de`: manually adapted steering ownership/re-grab fixes from `e3cb371dc992a3457beec414eede2e9673ddce8c`. Changed `js/input.js`, `js/state.js`, and the synchronous drawing scope in `js/main.js`. Render restores live steering even on exceptions; drag starts from the current command and remembers its owning button. The original pending-command browser test failed before this change. Held-command trajectories intentionally differ where rendering previously erased input.
- `98067fd`: isolated lighting cache from `52c6385bb4dd4c3f36756bf592468e35ef1b5015`, in `js/renderer/vehicle-sprites.js`. A bounded single base image avoids heading-dependent repeated filtering. Exact artwork comparison passes 140 cases each with OffscreenCanvas and HTML Canvas. No reduction of resolution, effects, particle count or quality.
- `2c6c654`: extends the already-existing `?gpuProfile=1` recorder in `js/diagnostics/performance-capture.js` and timing hooks in `js/main.js`. Adds bounded per-tick samples and canvas dimensions; removes page URL from exported metadata. Disabled by default. CPU timing does not measure GPU completion or presentation.

Each transfer is independently revertible. No engine, gearbox, clutch, tire, steering dynamics, suspension, geometry or chassis-integration code was changed. No starter shortcut was imported: this branch retains its Engine ON/OFF button and unbound R key. Ctrl+R and Ctrl+Shift+R remain browser shortcuts. The Mission 9 torque model, finite starter, experimental gear-state machine and coupled rotational solver were rejected as incompatible dependencies.

## Baseline behavior and regression method

Before production edits, ran the original branch with actual browser RAF and keyboard/mouse events, and 33 deterministic mechanical driving scenarios plus 50/100/200/400 Hz launch, reversal and handbrake samples. Baseline results are in `research/playable-baseline/data/baseline-driving`. The scripts distinguish scripted attempts from successful completed maneuvers. Mechanical replays prescribe commands; the separate browser tests verify real input delivery.

Original outcomes include aggressive launch to 11.78 m/s, acceleration to 29.85 m/s, upshift to third, downshift to second, braking to rest, reversal ending at 12.45 m/s and handbrake ending at 10.20 m/s. Gentle no-throttle launch reaches only 0.15 m/s. Start/idle and neutral throttle remain running. The generic stall/restart script ends stopped, and its two-click variant ends stalled: these are historical controls/state limitations, not successful restart demonstrations. A button test separately verifies the actual historical ON/OFF semantics. Never describe the script's newer restart action as a modeled starter on this branch.

Donut, power-oversteer, drift-transition and countersteer scripts stay finite; their names do not certify sustained drifting. Full telemetry contains yaw, sideslip, RPM, wheel speeds, gear and force histories. Existing browser tests establish that handbrake locks the rear wheels, increases sideslip in a matched turn and reduces speed. They do not validate real-world drifting fidelity.

A mechanical adapter initially tried to run a rear-order probe requiring the newer `drivetrain-rotation.js`. It was removed from this historical-model harness, without importing that module or suppressing a physics assertion. The first input-test adaptation also used the wrong gear field; corrected to historical `currentGear`. Baseline test failures and these harness corrections remain recorded in validation notes.

## Validation

- Historical unit suite: 226/226 passed, including 46 Mission 01 numerical tests. Invoked with `node node_modules/vitest/vitest.mjs run` because the checked-in executable shim lacks execution permission in this cloud.
- Steering/input/render ownership: 15/15 passed, including 60/120/240 Hz schedules, re-grab, Shift-left release, blur/visibility, simultaneous throttle and steering, draw exceptions, Canvas and software WebGPU.
- Artwork: 2/2 passed, 280 exact pixel comparisons.
- Existing driving browser tests: 6/6 passed: handbrake sideslip, launch and stop, reverse braking, shifting/reverse, wheelspin braking and number-row gears.
- Engine button/browser shortcuts and recorder export: 2/2 passed.

All 33 mechanical replays match the baseline exactly excluding timers, and both runs are deterministic and finite. The unchanged physics therefore preserves baseline outcomes under equivalent commands; actual mouse-driven trajectories intentionally improve when pending input is retained.

These tests support the transferred fixes; they do not repair or validate all historical drivetrain mechanics. Baseline straight symmetry, energy accounting, low-speed launch and restart limitations must not be confused with correct physics merely because before/after trajectories match.

## Performance measurement

Serial real-RAF comparisons use identical default effects, 1280×900/DPR1 and 1920×1080/DPR2. Extended countersteering uses 400 mouse events at 150 ms intervals (at least 60 seconds plus dispatch/evaluation overhead). Instrumentation is research-only and records CPU tick/frame/render distributions, RAF cadence, dropped steps, input delivery, heap change and GC traces. The first exploratory browser capture is retained separately; use the serial comparison for performance conclusions. No concurrent benchmark jobs are included in the serial measurements.

Short-run results: normal countersteering p95 CPU frame time 14.6 → 10.7 ms, high-DPI countersteering 20.4 → 16.6 ms, normal straight 15.0 → 11.5 ms. Candidate short runs sustain approximately 100 steps/s with zero dropped steps. High-DPI baseline countersteering drops one tick; the candidate drops none. Tail samples remain noisy (for example high-DPI straight mean tick 2.09 → 2.23 ms); these single runs do not establish a statistical guarantee. Rendering improves without a mechanical trajectory change under equivalent commands.

See `research/playable-baseline/data/performance.md` and `performance.json` for distributions and measured regressions. Software Canvas timings are not RTX 5090 measurements. Software WebGPU was tested for rendering/state correctness, not hardware throughput. No physical 120/240 Hz display, end-to-end input latency or long-session memory-leak certification is claimed.

## Human validation

Run `python3 serve.py` on this branch, then open `http://localhost:8000/`. GitHub Pages does not automatically deploy a branch merely because it exists.

1. Confirm idle; turn the engine off and on using its button. Rev in neutral and release throttle.
2. Hold A (clutch), select first with 1, hold D (throttle), release A and accelerate. Shift with A plus a number key. Compare with the old branch.
3. Hold right mouse to steer, release and re-grab; rapidly countersteer. Also test Shift-left steering and releasing Shift before the button.
4. Release D and brake with S; test F handbrake and release. Verify no control stays held after tab switching.
5. Attempt a circular slide, throttle lift/reapplication and countersteer recovery. Report whether it feels controllable; a failed attempt alone does not diagnose a physics bug.
6. Repeat at your usual resolution/backend. Append `?gpuProfile=1`, click **Record 30s performance**, drive through straight/turn/countersteer, and retain the downloaded JSON. Keep the tab visible. Capture the original branch with the same settings for comparison.

Human validation remains required. If stalls/restarts remain disruptive, report the exact gear, clutch, throttle and engine-button sequence; do not use toggling as evidence that the mechanics are fixed.

## Next development stage

Keep architectural research separate: order-independent rear contact/clutch coupling, physical tire force/storage contract, bounded contact cost, consistent steering/suspension feedback timing, calibrated engine/drivetrain, then complete-vehicle validation. None is implemented here. Preserve this runnable candidate and its original baseline as rollback references.

## Reproduction

Run from the repository root, serializing performance jobs:

```sh
BASELINE_ONLY=1 node research/playable-baseline/driving.mjs
node research/playable-baseline/driving.mjs
bash research/playable-baseline/performance.sh
node research/playable-baseline/summarize.mjs
node node_modules/vitest/vitest.mjs run
CORNERING_SOFTWARE_GPU=1 node node_modules/@playwright/test/cli.js test -c research/cornering-performance/playwright.config.mjs tests/e2e/steering-input-continuity.spec.js tests/e2e/steering-render-paths.spec.js tests/e2e/cornering-artwork-parity.spec.js tests/e2e/playable-controls.spec.js tests/e2e/wheel-braking.spec.js tests/e2e/handbrake-drift.spec.js
```

Research adapters are copied from Mission 10 (`2cc0771`), serving archived refs read-only. Long runs disable CDP tracing to bound trace retention; short runs include GC observation. The opt-in production recorder remains bounded to 15,000 frames/tick samples and stops after approximately 30 seconds. Neither recorder collects unrelated browsing information.

## Acceptance status

A (protected baseline) and F (scope) are satisfied: protected refs are untouched and no physics modules were imported. B is supported by the automated input/render tests; real hardware overload behavior remains a user test. D is supported for ordinary acceleration, shifting, steering and braking by the real-input tests; historical no-throttle launch/stall-restart limitations remain explicit. E is supported by exact mechanical parity over 33 replays and Mission 01 tests. C is supported by measured short-run distributions, subject to cloud/software-rendering limits and the recorded extended-run result. G requires the user's manual assessment. This is an **automated-test validated incremental candidate**, not human-confirmed playable or a completed physical recovery.

The first extended benchmark jobs accidentally overlapped; their samples were discarded and the runs repeated serially. They are not used for the performance conclusion.

The inherited research profiler also threw after 2,000 ticks during the first minute-long run. Its bounded capacity was raised to 20,000 samples for extended recording; interrupted results were rejected and rerun. This affects research instrumentation only.

## Extended-run result and delivery

Serial sustained countersteering lasted 83.63 seconds before and 82.19 seconds after, with no browser errors or frozen physics. CPU frame median/p95/p99/worst improved from 11.0/20.1/30.8/62.6 ms to 10.3/17.4/26.2/53.0 ms. Mean/p95 physics ticks were 2.99/4.80 ms before and 2.80/4.60 ms after; worst tick increased from 32.1 to 36.7 ms. Throughput was 99.94 → 99.97 steps/s; dropped ticks 3 → 1. Occasional stalls remain, so this is a measured incremental improvement, not complete performance restoration or a no-dropped-time guarantee. Profiling overhead and short sample counts limit tail comparisons.

Source branch URL: https://github.com/QuantumEther/VerletDrift/tree/recovery/playable-baseline . The measured production candidate is `2c6c654`; subsequent delivery commits contain tests, scripts, data and this report. No GitHub Pages deployment or merge is performed.
