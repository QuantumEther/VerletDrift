# Selectable 1969 Mustang Mach 1 — PERFORMANCE

Serve the repository root: `python3 -m http.server 8000`. Open:

http://localhost:8000/research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/

Select **1969 Mustang Mach 1 · 428 CJ / 6-speed**. Open the clutch, enable ignition,
hold **R** to start, request first gear, then give some throttle with **W** before
progressively engaging the clutch. Releasing a heavily engaged clutch at idle can
stall this car; no launch assistance is supplied. The reference car and its three
drivetrain modes remain selectable. This is branch-local code, not a Pages deployment.

Controls retained: W/S/A/D/Space; number row and numpad 1–6 request forward gears,
7 requests reverse, N requests neutral, R is the held starter, Backspace resets.
Gear requests still pass through the existing synchronizer and dog controller.
Vehicle changes explicitly reset the state, crank lifecycle, shafts, clutch heat,
bristles, wheel-angle history, tracks and clock. Selecting the Mustang chooses its
lifecycle drivetrain; selecting the reference returns to the original fixed-ratio
mode, with its other research modes still available. Camera changes never reset physics.

## Evidence and historical limits

**Historical primary-source verification is incomplete in this environment.** On
2026-11-02 the configured HTTP proxy rejected requests to Ford Heritage Vault,
MustangSpecs and Wikipedia with `403 Forbidden` at CONNECT. No source page was
retrieved, and no factory document or original dyno curve is bundled locally.
The historical numbers below are nominal reference figures, not measurements
verified against those inaccessible publications. Do not treat these tests as
historical or real-world validation. The decisive next evidence task is checking
an original 1969 Ford dimensions/specification sheet and 428 CJ engine rating sheet.

Source leads (unretrieved, not claimed as inspected):

- [Ford Heritage Vault](https://www.fordheritagevault.com/): original 1969 Mustang sales/specification literature.
- [MustangSpecs, 1969 specifications](https://www.mustangspecs.com/1969-mustang-specifications/): secondary dimension/engine cross-check.
- [First-generation Mustang overview](https://en.wikipedia.org/wiki/Ford_Mustang_(first_generation)): secondary cross-check only.

| Quantity | Implemented SI value | Evidence/status |
|---|---:|---|
| Wheelbase | 2.7432 m (108 in) | Nominal historical specification; primary verification pending |
| Overall length / width / height | 4.75996 / 1.81102 / 1.28016 m | Nominal 187.4 / 71.3 / 50.4 in envelope; procedural surface approximate |
| Front / rear track | 1.49352 / 1.49352 m | Engineering estimate, not verified factory track measurements |
| Running mass | 1,660 kg | Estimated operating vehicle mass, not a certified curb weight |
| Static front / rear load | 58 / 42% | Estimated front-heavy big-block configuration |
| Sprung / per-corner unsprung mass | 1,492 / 42 kg | Reduced-model mass allocation, total = 1,660 kg |
| Yaw / sprung pitch / sprung roll inertia | 2,900 / 2,550 / 580 kg m² | Estimated mass-distribution values; no measured inertia tensor |
| Effective tire radius / width / rim diameter | .335 / .215 / .3556 m | F70-14-inspired envelope, effective radius estimated; no bias-ply calibration |
| Wheel / engine / input / output inertia | 1.9 / .65 / .12 / .18 kg m² | Engineering estimates, represented once each |
| Corner suspension k / c | 33,000 N/m / 2,600 Ns/m | Linear equivalent corner model, not factory spring/damper measurements |
| Radial tire stiffness | 220,000 N/m | Estimate, existing conservative radial contact; no added normal damping |
| Suspension free separation | .350 m | Gives estimated settled sprung COM height about .552 m |
| Contact angular lever H | .550 m | Existing reduced contact mapping; nominal COM-height estimate |
| Tangential bristle k / c | 200,000 N/m / 800 Ns/m | Uncalibrated lumped contact; shared original viscosity retained |
| Front/rear service brake capacity | 1,500 / 1,000 Nm per wheel | Estimated pressure-request capacity, existing exact holding/sliding rows |
| Rear handbrake capacity | 1,100 Nm per wheel | Estimated cable-request capacity |
| Clutch capacity / synchronizer capacity | 750 / 40 Nm | Modified-drivetrain estimates |
| Steering command limit / response | .35 rad / .8 rad/s | Retained laboratory mechanism, not measured factory steering geometry |

At 8 Hz the chosen tangential element has `c*frequency_rad/K ≈ .20`; multiplying
viscosity by vehicle mass would make that roughly 2.0 without supporting tire data.
An initial unsupported 8,000 Ns/m mass-scaled estimate was rejected. At full vehicle
loads that estimate also exposed force-closure roundoff failures. No assertion of
calibrated tire relaxation is made for the retained 800 Ns/m value. Tire law,
friction-circle construction and terrain friction values are unchanged.

The front/rear wheel x coordinates relative to the sprung origin are
+1.1274331367292225 / −1.6157668632707773 m, with y = ±.74676 m. Independent static
balance includes unsprung weight: front total support is 9,445.068 N, rear is
6,839.532 N. The aggregate COM lies about 24.7 mm behind the sprung origin; the
existing reduced shared-horizontal model omits the associated full spatial
mass-matrix cross terms. This is disclosed reduced coupling, not full 6-DOF mechanics.

## 428 Cobra Jet torque and modified transmission

The nominal advertised anchors are **440 lb ft at 3,400 rpm** (596.56 Nm) and
**335 hp at 5,200 rpm** (249.81 kW, approximately 458.74 Nm). These are period
**SAE gross-style advertised ratings**, not modern installed SAE-net dyno data.
The model treats them as idealized full-load crank brake-torque anchors, which can
be optimistic for an installed engine. No acceleration accuracy is claimed.

The inspectable piecewise-linear table in `definitions.js` passes exactly through
both anchors. All other samples (including low-speed and high-speed rolloff) are
estimates, not recovered dynamometer points. Full-load friction is added back to
infer indicated combustion torque and actual friction is then subtracted once.
At full throttle below the cut band this recovers the specified brake curve;
closed throttle leaves friction and pumping losses with explicit work accounting.

The inherited torque-based idle controller targets 750 rpm with droop, not RPM
assignment. Cranking uses at most 110 Nm with 450 rpm no-load starter speed;
firing threshold is 250 rpm, stall threshold 400 rpm with 80 ms delay. A modern
fuel-cut approximation begins at 5,700 rpm and reaches zero at 6,000 rpm. These
are declared control/operating estimates, not a period carburetor or factory ECU
reproduction. Back-driving can overspeed it; no velocity clamp or damage model.

**Intentional six-speed conversion:** 2.66, 1.78, 1.30, 1.00, .80, .63; reverse
−2.90; final drive 3.50. These are plausible modified ratios, not a claimed 1969
factory gearbox. The existing coupled six-rotor inertia, differential, clutch,
synchronizer, brake constraints and energy/work equations are shared, not copied.

## Minimal numerical prerequisite

The full-size configuration exposed two existing floating-point representation
issues: a held brake could book about −2.845e−14 J of spurious heat against the
unchanged 2.842e−14 J check, and separately accumulated engaged-shaft coordinates
could drift outside the existing dog-row roundoff classifier.

The Mustang opts into `exactConstraintCoordinates`. Within the **same rotor
kernel**, only rows already classified at zero slip by the existing roundoff
bound are reconstructed using their dependent coordinates. Wheel holding uses
zero; an engaged input uses `g*(rearLeft+rearRight)/2`; a stuck crank uses input
speed. Each reconstruction is limited to four times the existing machine-roundoff
classification bound; anything larger rejects. It cannot match an unsynchronized
shaft or engage a gear. Ideal stuck-row virtual work is zero. Actual kinetic
changes from representation are recorded as `roundingEnergy`, separately from heat;
the existing full-step work check already accepts that explicit term. The Mustang
accumulates it separately as `roundoffEnergy`; the displayed raw energy/work residual
still includes it, and `totalWork` never treats numerical error as physical fuel work. Independent
impulse/energy tests cover it and deliberately mismatched dog engagement still rejects.

This is an opt-in numerical representation fix, not a new mechanical model or
launch control. The default reference arithmetic path remains selected for all
historical configurations. Contact tolerance remains **1e−11**, maximum outer
trials **24**, rotor events **32**; no safety tolerance, friction limit, timestep
or force law was relaxed. Rejected steps remain transactional. Solver failures
retain and display the last accepted state; no fallback or hidden substep exists.

## Rendering and retained capabilities

`mustang-view.js` builds original procedural coachwork using the existing Three.js
renderer, camera, lights and batching. It includes long sculpted/blackout hood,
scoop, quad 1969-style lamps and recessed grille, sloped SportsRoof/backlight,
rear haunches, six upright taillight segments, chrome bumpers/arch trim, rocker
stripes and Mach 1 lettering. It is a stylized low-poly research model, not a
licensed CAD asset or an exact concours reproduction. Chrome, glazing, interior,
curvature and trim are simplified; no external model/texture dependency was added.

Arch centers use the physical axle coordinates. Wheel centers, effective radius,
front steering, accepted wheel travel, chassis heave/pitch/roll and spring endpoints
read the same authoritative state. The .12 m coachwork datum is fixed geometry
relative to the sprung COM, not an animated physics correction. No extra roll,
camber, suspension articulation or engine-motion animation is fabricated.

| Capability | Status |
|---|---|
| Original reference car and three drivetrain modes | Retained; reference selection restores fixed mode |
| Cold starting, stall/restart, clutch, six speeds/reverse, ideal differential | Shared existing lifecycle and coupled mechanism |
| W/S/A/D/Space, both number layouts, N, R, Backspace, pointer controls | Retained and browser tested |
| Continuous terrain, authored maps, four contacts, suspension, slip | Retained; separate local samples and normal/tangent mapping |
| Orbit/chase/top/side/contact cameras, x-ray, wheel/spring graphics | Retained; camera switching does not change physical state |
| Dashboards, accepted-stage recording, world marks, reset/clear/visibility | Same existing laboratory infrastructure; reference smoke rerun |
| Experiment navigation and historical fixtures | Retained; production and original laboratories untouched |
| Audio / selector-force / mechanical steering linkage | Already unsupported in this laboratory, not fabricated |

## Validation and reproduction

From the repository root:

```sh
node --test research/scientific-rebuild/fast-vehicle-poc/vehicles/vehicles.test.mjs
node research/scientific-rebuild/fast-vehicle-poc/vehicles/reference-replay.mjs
node research/scientific-rebuild/fast-vehicle-poc/vehicles/benchmark.mjs
node research/scientific-rebuild/fast-vehicle-poc/vehicles/browser-smoke.mjs
node research/scientific-rebuild/procedural-terrain/tools/tire-baseline.mjs
```

`reference-replay.mjs` loads predecessor `0927739` sources into temporary modules,
compares 2,000 accepted reference states exactly and removes the temporary files.
It does not regenerate historical fixtures. New tests independently calculate axle
loads, rating conversions and rotor impulse/energy balance. They cover safe
initialization, geometry, all gear requests, reverse motion, propulsion, braking,
rollback, hills/rough/mountain contact, higher-speed samples and timestep refinement.

The .5 s steer/brake refinement uses 1 / .5 / .25 ms with matched initial speed
4 m/s. Finer grids reduce error against the quarter-ms result. The frozen equations
are not asserted to be experimental truth. See raw verification and benchmark
records below; no result certifies arbitrary terrain or real Mustang handling.

**Physical limitations:** no Ackermann/caster/trail or live rear axle/leaf-spring kinematics, suspension
links, bump stops, anti-roll bar, differential friction, tire calibration, aligning
moment, pneumatic contact-patch renewal, carburetor transients, combustion pulses,
thermal effects, starter pinion/battery dynamics or damage. The four independent
corner equivalents cannot faithfully reproduce a 1969 rear axle's articulation.
No arbitrary yaw stabilizer, drift correction, grip bonus or automatic rev matching.

Supporting outputs: `results/benchmark.json`, `results/browser.json`,
`results/verification.json`, and the front/side browser screenshots. Numerical
PASS means the declared reduced mechanics passed those tests, not historical fidelity.

## Executed results (2026-11-02)

**219 Node tests passed**: 10 new Mustang tests, 71 lifecycle/coupled drivetrain/shaft/terrain/lab tests,
56 retained fast-model tests and 82 procedural-terrain tests. In addition, 2,000
predecessor lifecycle states matched exactly; the 1,080-state Strategy-A replay
passed. Chromium 154 / SwiftShader completed the Mustang browser script and the
existing reference laboratory smoke script without runtime errors. No RTX/hardware
rendering performance was measured. Screenshot rendering used 100% resolution;
the driving smoke retained the existing auto-software setting.

The browser used throttle before clutch take-up, then drove at about 5.3 m/s with
the engine running, shifted via numpad, steered and braked. All 14 number-row/numpad
requests were checked while paused without modifying physical state; camera-mode
changes likewise preserved state. Terrain selection resets the vehicle by design.
The existing lumped bristle model can return elastic energy during stopping: the
short browser brake segment included about 0.19 m/s of backward recoil, without
backward wheel driving torque. This is a declared contact-model limitation, not
masked by velocity snapping; the separate longer braking/holding test passed.

For the 1/.5/.25 ms smooth steer/brake study, terminal x-velocities were
3.249806869948334 / 3.249808938353240 / 3.249809457194282 m/s. Coarse-to-finest
and medium-to-finest differences are 2.58725e-6 and 5.18841e-7 m/s. The aggregate
state-difference diagnostic also decreased by about 5×; it mixes state units and
is not used as a physical norm. Benchmark maximum raw energy/work error was
2.96e-10 J. Higher-speed (10/20/30 m/s) braking/steering samples passed the unchanged
force/work guards; these are bounded tests, not an unlimited operating-domain claim.

Complete-step CPU results follow. Units: ms per simulated second; step latencies ms.

| Case | Reference CPU | Mustang CPU | Mustang median / p95 / p99 | Mean / max force trials |
|---|---:|---:|---|---|
| idle | 167.70 | 186.41 | 0.171 / 0.330 / 0.490 | 4.45 / 6 |
| drive | 293.94 | 270.85 | 0.229 / 0.494 / 0.678 | 5.75 / 7 |
| braking | 267.69 | 265.82 | 0.234 / 0.490 / 0.774 | 5.68 / 8 |
| uneven | 283.24 | 261.92 | 0.238 / 0.436 / 0.647 | 6.15 / 7 |

Node 24.19 / shared Xeon Platinum 8573C; five alternating repetitions of 1,000
fixed 1 ms complete steps per case, first repetition discarded. Presentation and
JSON serialization are outside step timing. No benchmark convergence failures.
Different cars produce different trajectories: this table measures workload cost,
not an equivalent-physics speedup. Worst retained Mustang step was about 2.65 ms.
The coachwork batches 495 original meshes into 8 rigid batches; the browser snapshot
reported 50 complete-scene draw calls / 24,726 triangles. A software-renderer FPS
snapshot is recorded, not offered as a controlled hardware FPS benchmark.

[Front three-quarter screenshot](results/mustang-front.png) ·
[Side screenshot](results/mustang-side.png).
