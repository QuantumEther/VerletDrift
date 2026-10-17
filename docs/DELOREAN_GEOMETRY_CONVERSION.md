# DMC-12 geometry conversion

Reference implementation: `verlet_gpt_v19_ui` at `09a3e3605c4d1890e8c4723df28d7b864dc03fc6`.
Recovery tag: `baseline-before-delorean-geometry-09a3e36`.
Working branch: `verlet_gpt_v20_delorean_geometry`.

**Current status:** the authorized Option 1 fixture correction is implemented.
All 147 unit tests and all 37 Chromium browser tests pass in the final rerun.
Steering start and reversal events are checked across
50/100/200/400 Hz for reversals at 1.74, 1.76 and 1.78 s, with the original speed,
heading and yaw tolerances unchanged. No additional production changes or solver,
timestep, friction, suspension or powertrain retuning were made to clear the gate.
The original reference branch remains unchanged; this branch is not merged.

The original fixture compared different steering timings (1.76 s at 50 Hz versus
1.75 s at 400 Hz). Correcting that comparison resolves its failure. Residual
timestep sensitivity and the artwork/specification limitations below remain.
See [the investigation and follow-up](DELOREAN_TIMESTEP_INVESTIGATION.md) and
`validation/delorean/shared-event-refinement.json` for the corrected measurements.

The implementation record below preserves the **initial conversion snapshot**,
including its original stop decision, test counts and measurements. Current
validation above and in the investigation follow-up supersedes those historical
fixture-failure counts and paused-status statements.

## Phase A: dependency audit (before physical changes)

| Dependency | Current assumption | Conversion / risk |
| --- | --- | --- |
| `constants.js`: `CAR_HALF_WIDTH/LENGTH`, three rest lengths | 1.600 m track, 3.000 m wheelbase | Change to 1.589 m / 2.408 m; retain all six rectangular constraints. |
| `physics/kinematics.js`: initialization, derived centre/heading | Wheel particles at ±half track/base; centre is axle midpoint | Derives automatically. Keep four equal particle masses and 50/50 CoM approximation. |
| `physics/constraints.js`: solver, map collisions, displacement clamp | Rest lengths imported; equal split, damping floor and iteration caps | Derives automatically. Do not change math, damping, ordering or iteration limits. Map collision uses wheel particles, not outer shell. |
| `constants.js`: `MAX_DISPLACEMENT_PER_STEP` | 0.9 × half track = 0.720 m | Becomes 0.71505 m by the same rule; extreme-speed clamp changes slightly as a direct geometry consequence. |
| `constants.js`, `main.js`, `ui.js`: yaw inertia | `mass * (halfBase² + halfTrack²) / 3` | Recalculates automatically. Keep mass and inertia approximation; do not substitute shell inertia. Faster yaw response is expected. |
| `physics/integrator.js`, `physics/tires.js`: rotational acceleration, tire velocities and torques | Actual wheel-centre lever arms | Automatic shorter arms. Keep force/rotor solvers, relaxation, slip, friction and engine reflection unchanged. |
| `physics/weight.js`: longitudinal/lateral load transfer | Imported wheelbase and track, 50/50 static axle weights | Automatic recalculation; longitudinal transfer increases. No new rear-heavy DeLorean load distribution. |
| `physics/suspension.js`: spring arms, pitch/roll inertias, bars | Corners from imported half base/track; static spring compression from mass/spring rate | Geometry-dependent values update automatically; no spring/damper/bar/travel retuning or new rest-length model. |
| `physics/steering.js`, `input.js`: steering lock, SAT column, mapping | Common angle per front axle; no Ackermann steering or stored turning radius | Keep all algorithms and settings. Turning behavior changes through shorter physical wheelbase, not input changes. |
| `physics/wheel.js`, `physics/engine.js` | Common rolling radius 0.35 m, existing rotor and powertrain parameters | Entirely unchanged. Nominal visual front/rear tire sizes must not silently replace physical rolling radius. |
| `physics/camera.js`, `main.js`: camera, snapshots, shake | Follows derived body centre; body/camera interpolation only | No changes to tracking or time stepping. Wheel interpolation remains a pre-existing limitation. |
| `balloon.js`: pop contact radius | `CAR_HALF_WIDTH * 0.5` plus balloon radius | Automatically changes 0.400 → 0.39725 m with track. Preserve gameplay rule and impulse/pop logic. |
| `renderer/vehicle-geometry.js`: shell and tires | Independently scaled shell calibrated to 3 m axle geometry, tires inferred from tread image | Replace body stretching with uniform scaling and explicit real envelope; report artwork mismatch. Define nominal visual front/rear tires without changing mechanics. |
| `renderer/vehicle-sprites.js`, `world.js`: sprites, ghosts, fallback | Physical wheel anchors; fallback shell uses half track/base | Preserve image loading, steering, ghosts and fallback. Add an optional calibration overlay, not a UI redesign. |
| `main.js`: `recordSkidMarks()` | Actual wheel endpoints; tread-bounded width | Supply wheel identity to use appropriate front/rear tread bounds. Keep generation, fading and paint behavior. |
| `renderer/sparks.js`, `smoke-system.js`, `balloon.js`: effects | Physical wheel positions and SI dimensions | No position offsets. Effects follow initialization and updated anchors automatically. |
| `gpu-renderer.js`, `trail.js`, `renderer/view.js` | Shared metre geometry, CSS viewport, independent sampling density | No renderer rewrite or new scale multipliers. Preserve the previous scale audit fixes. |
| `ui/controls.js`, `state.js`: saved settings | Version 1 saves params/audio/view, not particle coordinates | Keep format and defaults compatible. No persisted wheel state to migrate; reload constructs new geometry. Reject unknown state fields as before. |
| Tests and numerical scripts | Visual fixtures encode 1.600/3.000 m; `weight-transfer.test.js` also divides by literal 0.8 | Geometry fixtures require updates. Do not loosen handling tolerances. The discovered literal is left as a documented failing fixture after the numerical stop gate. |

No hardcoded 3 m wheelbase or 1.6 m track was found in the mechanical algorithms
outside the central constants. Numeric matches in grip, presets, spring travel,
steering speed thresholds and rendering effects are unrelated tuning and must
not be replaced. Old comments with 4/8 m dimensions are stale documentation.

Potentially unsafe dependencies are reduced yaw/pitch inertia, increased
longitudinal transfer, changed suspension torque arms, and the geometric speed
clamp. These require baseline comparisons rather than compensating tuning.

Unrelated pre-existing limitations: equal axle loading/particle masses, common
rolling radius and wheel inertia, particle-only collision, no Ackermann model,
non-interpolated wheel coordinates, and GPU smoke's magenta debug color. These
are not part of this migration.

## Verification and implementation record

### A. Geometry comparison

| Quantity | Original experiment | Draft DMC-12 conversion |
| --- | ---: | ---: |
| Half track / `CAR_HALF_WIDTH` | 0.800 m | 0.7945 m |
| Half wheelbase / `CAR_HALF_LENGTH` | 1.500 m | 1.204 m |
| Front and rear axle constraints | 1.600 m | 1.589 m |
| Left and right longitudinal constraints | 3.000 m | 2.408 m |
| Both diagonal constraints | 3.400 m | 2.885027730 m |
| Default yaw inertia at unchanged 1200 kg | 1156.000 kg m² | 832.3385 kg m² |
| Existing geometric displacement limit | 0.72000 m/step | 0.71505 m/step |
| Solver iterations, damping and integration | Existing implementation | Unchanged |

The 1.589 m rectangular track averages the requested 1.590 m front and 1.588 m
rear values. This introduces only ±1 mm relative to those axle-specific targets
and avoids changing constraint architecture. The yaw inertia falls about 28%;
the existing longitudinal transfer denominator falls from 3.000 to 2.408 m.
Changed handling is expected without changing any force/rotor/tire algorithm.

### Specification verification limits

The physical targets come from the user's DMC-12 conversion brief dated
2026-10-17. The common track approximation and body envelope use exactly those
requested values. Independent verification against a factory handbook or
technical specification **was not completed**: this environment's outbound HTTP
policy returned a proxy 403 for the DeLorean Museum technical-specification URL
and the DMC DeLorean Wikipedia page. GitHub repository searches did not yield an
authoritative primary specification. No uninspected webpage is claimed as a
verified source.

Before release, verify overall width's mirror convention and production-year
variations against a factory specification. Values rounded from imperial units
can differ: 94.8 in = 2.40792 m, whereas 95 in = 2.413 m. These are conversion
examples explaining possible rounding, not a claim that an unseen source
specifies either figure.

Tire envelope arithmetic follows the supplied size codes: 195/60 R14 gives
195 mm section width, 117 mm nominal sidewall and 355.6 mm rim diameter, hence
589.6 mm nominal outside diameter. 235/60 R15 gives 235 mm width, 141 mm sidewall
and 381 mm rim diameter, hence 663 mm nominal outside diameter. Loaded rolling
radius is not derived from those unloaded nominal sizes and was not retuned.

### B. Exact source changes

| File / functions or parameters | Modification |
| --- | --- |
| `js/constants.js` | Add frozen `DELOREAN_GEOMETRY` target/visual metadata. Derive legacy half-track/base names from symmetric target geometry. Existing rest-length, inertia and displacement-limit formulas remain unchanged. Correct obsolete dimension comments. |
| `js/renderer/vehicle-geometry.js` | Add `BODY_ENVELOPE`, use one `BODY_IMAGE_SCALE` for both axes, preserve source pivot/crops, define nominal axle-specific tire envelopes and uniform tread-image fit. `getSkidWidth()` accepts wheel identity. |
| `js/renderer/vehicle-sprites.js` | Use front/rear tire glyph dimensions; add optional calibration flag from `vehicleCalibration=1`. Wheel centres, steering, images, fallback switch and spin-selection hook are retained. |
| `js/renderer/vehicle-calibration.js` | New optional overlay: all six constraints, four physical wheel centres, target body envelope, actual undistorted art bounds, and dimensions in metres. No state writes. |
| `js/renderer/world.js` | Pass overlay view scale, identify ghosts so they do not duplicate the overlay, and support calibration while procedural fallback is active. Existing world/camera transforms are retained. |
| `js/main.js`, `recordSkidMarks()` | Pass `wheelName` to tread-width coverage. No mechanical stepping or input change. |
| `tests/visual-geometry.test.js` | Draft tests for uniform body fit, front/rear nominal envelopes and mark bounds. An exact float assertion currently fails; see results below. |
| `tests/e2e/visual-scale.spec.js` | Derive synthetic physical corner fixtures from the central half-distances instead of the old numerical dimensions. |
| `scripts/compare-vehicle-geometry.mjs` | Read-only fixed-time benchmark calling production mechanical functions in production order, without renderer/audio/gameplay effects. Records errors, energy, yaw, loads, slip, camera lag, timing and functional events. |
| `assets/vehicles/delorean/README.md` | Document draft calibration and original-art limitations. |
| This report and `docs/validation/delorean/*` | Dependency audit, comparison data and calibration captures. |

`physics/*.js`, `input.js`, powertrain settings, mass, tire friction, suspension
tuning, control definitions, GPU renderer, view transforms and time stepping are
unchanged. The benchmark's mechanical-file SHA-256 records match across old and
new configurations, as does the default settings hash. Geometry constants are
the intentionally changed mechanical input. The benchmark's test arena/input
setup is not a production tuning change.

### C. Physics compatibility and the blocking result

The original geometry passed all 145 unit tests before conversion. Both geometries
initialized within floating-point distance error and reduced a roughly 0.196 m
deliberate particle perturbation to about 1e-14 m after the unchanged solver.
Both completed the 14 benchmark maneuvers with finite positions, wheel speeds,
loads, RPM and camera positions. Rest and low-speed cases settled to zero speed.
Launch, service brakes, reverse, gear changes, clutch release and stall behavior
remain functional. Short cornering, handbrake and transition responses change as
expected with shorter lever arms, lower inertia and different load transfer.

The existing coupled transition **timestep-refinement test fails** at 50 Hz:

| Chassis dt | Baseline heading error vs 400 Hz | Target heading error vs 400 Hz | Existing limit |
| --- | ---: | ---: | ---: |
| 0.020 s / 50 Hz | 0.010630996 rad | 0.017965071 rad | < 0.015 rad |
| 0.010 s / 100 Hz | 0.000381162 rad | 0.007190372 rad | < 0.015 rad |
| 0.005 s / 200 Hz | 0.001839275 rad | 0.003965054 rad | < 0.015 rad |

The target's coarse-step error is about 1.03 degrees versus a 0.86-degree limit;
speed and yaw-error thresholds in that test remain within their limits. This is
not evidence of non-finite instability, but it is a real failure of the existing
numerical acceptance gate. Per the brief's stop instruction, implementation is
paused. No tolerance, timestep, spring, damping, force curve, grip or solver
setting was changed to hide it. Resolving or explicitly accepting that changed
numerical sensitivity needs a separate decision before this draft is ready.

An initial long-run comparison started only 100 m from the edge of a 10000 m
arena. The shorter vehicle's different trajectory eventually struck that edge,
causing a misleading 4.135 rad/s peak yaw. A read-only repeat centred **both**
vehicles at (5000,5000) removed the collision confound:

| 120 s continuous drive | Baseline | Target |
| --- | ---: | ---: |
| Maximum yaw | 0.548294 rad/s | 0.747170 rad/s |
| Final speed | 22.991858 m/s | 22.983860 m/s |
| Maximum constraint error | 1.281e-12 m | 1.283e-12 m |
| Minimum wheel load | 1093.49 N | 1044.89 N |
| Boundary overshoot | 0 m | 0 m |
| Mechanical benchmark elapsed time | 14.885 s | 14.702 s |

This yaw increase is consistent with the lower inertia/shorter wheelbase; neither
run required force-model changes or lost finite state. Timings are indicative
CPU-only measurements under shared machine load, not frame-rate guarantees.
The benchmark's mechanical state defaults can differ from HTML control defaults;
they are identical between each old/new pair. Browser tests additionally exercise
the actual app initialization and controls. The benchmark mirrors mechanical
call order but does not replace full-browser or all-driving-condition testing.

### D. Visual calibration and original-art limitations

Both original assets remain byte-for-byte unchanged, RGBA 1254 × 1254. At alpha
8/255 the body bounds are (284,26)–(971,1229), and tread bounds
(411,119)–(842,1134). These are the existing crop rectangles. Body longitudinal
axis is -Y; the pivot remains the source axle-midpoint estimate (627.5,639.5).

The body crop's width/length ratio is 687/1203 ≈ 0.5711, while the target
envelope's ratio is 1.988/4.267 ≈ 0.4659. Per the user's explicit choice, the
original artwork is uniformly fitted inside that envelope, producing visible
art **1.988 m wide × 3.481 m long**, not a falsely claimed 4.267 m shell.
There is no independent X/Y stretching and no wheel-position compensation.
The source image's illustrated arches remain about 0.126 m longitudinally and
0.075 m laterally from the new physical centres. Straight tires may be partly
or fully occluded by the uncorrected fender artwork. A correctly proportioned
replacement body with arches authored for the specified axle locations is the
proper art-only follow-up; it was not generated or substituted here.

Tire envelopes at the unchanged 0.35 m common mechanical radius are 0.195 ×
0.5896 m front and 0.235 × 0.663 m rear. The supplied tread image is also fitted
uniformly, so the visible glyphs are approximately 0.195 × 0.459 m and 0.235 ×
0.553 m. Glyphs fit within the nominal envelopes and remain undistorted; they
are not claimed to reproduce the full outside-diameter silhouette. The existing
rolling-radius control still changes mechanics and scales these visual envelopes
relative to its unchanged default. This is not per-axle wheel dynamics.

All wheel sprites are centred on actual particles. Marks, paint pickup, smoke
and sparks continue to use those same coordinates. Default mark width now clips
to 0.195 m front / 0.235 m rear; generation thresholds, opacity, aging and paint
mixing are unchanged. Ghosts use the same visual geometry. Existing view-scale,
backing-resolution, DPR and GPU-upload consistency checks still pass.

Enable the optional overlay with `?vehicleCalibration=1` (or
`&vehicleCalibration=1` alongside other query options). Cyan shows particle
centres and the six constraints, gold the requested shell envelope, and white
the actual undistorted crop bounds. The overlay also works with the old sprite
fallback switch. It is disabled by default and adds no controls or layout changes.

Captured production app views:

- [Rest](validation/delorean/calibration-rest.png)
- [Front steering](validation/delorean/calibration-steering.png)
- [Powered handbrake turn](validation/delorean/calibration-turn.png)

The turn capture used the existing clutch/throttle/gear/handbrake inputs and had
507 skid segments, finite state, about 7.1 m/s speed and rear slip ratios around
0.29/0.63 at capture. No page exceptions occurred. The original body/tread art
limitation is deliberately visible rather than concealed by distortion.

### E. Executed validation

- Baseline unit suite: **145 passed, 0 failed**.
- Draft target unit suite: **142 passed, 3 failed**. One is the blocking unchanged
  50 Hz heading gate. One is the old weight-transfer test's literal half-track
  0.8 (2250 N expected, 2265.575834 N correctly produced by 0.7945 m geometry).
  One is the new tire test's exact floating-point equality
  (`0.5895999999999999` versus `0.5896`). The latter two are fixture/assertion
  maintenance, not observed physical defects. They remain documented at the stop
  point; the numerical tolerance was not relaxed.
- Actual app Chromium suite: **37 passed, 0 failed**. Includes driving/braking,
  reverse, handbrake, gear/clutch, UI bindings, sounds startup, faults, persistence,
  sprite failure fallback, skid alignment, 27 camera/turn combinations,
  DPR 1/2, mobile/desktop and backing-resolution consistency.
- Fourteen fixed-time mechanical scenarios were measured in both configurations,
  including two-minute rest and drive cases. Initial and isolated-arena long
  results are retained separately; do not treat the near-edge yaw as a free-drive
  instability. Gear sets include first/second/reverse, clutch spans 0–1, and the
  deliberate stall case still stalls in both geometries.
- GPU JavaScript upload contract passes with a recording device. Hardware WGSL
  raster quality/performance is unverified because no hardware adapter is available.
- Test commands: `node scripts/compare-vehicle-geometry.mjs`, Vitest unit suite,
  Playwright Chromium suite. Cloud execution used Linux dependencies in
  `/workspace/VerletDrift-tools` rather than altering tracked Windows node_modules.

Machine-readable evidence:

- [Baseline geometry and maneuvers](validation/delorean/baseline-3m.json)
- [Target geometry and maneuvers](validation/delorean/target-dmc12.json)
- [Paired timestep refinement](validation/delorean/refinement-review.json)
- [Centred-arena long-run comparison](validation/delorean/isolated-long-review.json)
- [Compact comparison](validation/delorean/comparison-summary.json)

### F. Remaining issues / acceptance status

This remains a geometry conversion with documented limitations. The coarse-step
fixture mismatch and both test-maintenance items are resolved by the follow-up;
independent specification verification and body-art dimensional/arch mismatch
remain open. The requested acceptance criteria for
exact visual dimensions/arches cannot be met by this unchanged artwork with
uniform scaling; the user's preference explicitly preserves that limitation.
The mechanical approximation still uses 50/50 mass distribution, a common
rolling radius, common wheel inertia and tire model, symmetric track, existing
suspension tuning, and particle-only collision. No realistic DeLorean powertrain
or weight-distribution model was introduced. Existing interpolation and GPU
quality limitations from the prior audit remain outside scope.

Saved settings remain version 1 and contain no persisted wheel coordinates or
constraint rest distances. Fresh initialization constructs target geometry.
Sound/layout storage and parameter import/export compatibility are unchanged;
the browser suite passed them. Any externally captured ad-hoc `window.state`
snapshot should not be injected across geometries; reload the app and import
only supported settings instead.

### G. Rollback without discarding the draft

The original reference branch remains at `09a3e36` with all previously working
UI, sprites and scale-audit fixes. After committing this conversion, switch
between the preserved branches without resetting or deleting either:

```sh
git switch verlet_gpt_v19_ui
git switch verlet_gpt_v20_delorean_geometry
```

Alternatively, recover the exact baseline on a new branch using
`git switch -c recover-3m baseline-before-delorean-geometry-09a3e36`.
Preserve any new uncommitted work before switching. No forced reset or deletion
of either branch is needed. No conversion changes have been pushed.
