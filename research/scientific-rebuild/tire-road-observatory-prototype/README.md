# Mission 40 — The Tire–Road Observatory

Current branch **scientific-rebuild/12-braking-and-tire-contact**, starting commit **d419189dda7fc698d5364e0a1f91d2c9718c9113**. This independent sibling copies `../braking-and-tire-contact-prototype/`; every predecessor remains byte-for-byte unchanged. `mission40-provenance.json` records the initial tree. `mission40-file-inventory.json` lists exact copied/modified/new paths and hashes. Copied result files without the mission40 prefix are historical evidence, not new measurements. `SOURCE-LIVING-AUTOMOBILE-README.md` preserves the preceding README.

## Launch

From repository root run `python3 serve.py`, then open:

<http://localhost:8000/research/scientific-rebuild/tire-road-observatory-prototype/>

Existing controls remain: E starter, I ignition, W accelerator, S service brake, Space rear handbrake, A/D steer, 1/N/2 physical selector forces, R reset, B bump, H experimental body impulse. Engine/clutch/unsynchronized gearbox/differential, vintage laboratory and all mechanical camera modes remain. Use the labelled 8 m/s rolling fixture for controlled braking trials; it is an initial condition, not a driving force.

**Rubber marks** toggles 2D/3D visibility without discarding or stopping recording. **COM path**, **projected tire paths**, and **slip vectors** are independent 2D toggles. **Clear tracks & paths** clears visual history without changing the vehicle or its cumulative measured work. Reset/reinitialization breaks links but leaves existing road marks until cleared. New observation can be disabled in the collapsible **Tire–Road Observatory**; existing data remains and resuming starts a disconnected history section.

The new **Tire–Road Observatory** camera frames the retained world-space marks. Normal, driver, X-ray and contact views also show them. Numerical observations and force/slip circles stay in a collapsible panel. Brass is normalized force F/(mu*N); pale is normalized slip direction (arrows below 1e-6 m/s are omitted as numerical direction noise; raw values remain recorded). Saturation is not “probability of losing grip.” Unloaded or zero-capacity wheels receive no percentage.

## What is implemented

`contact-observation.js` captures detached coherent force-stage data and true four-wheel world coordinates:

`(X,Y)=(p.x,p.y)+R(heading)*(wheel.x,wheel.y)`.

Each actual tire footprint samples analytical road height at its own world x. Its force-stage angular speed, slip, force, load, brake torque, force heading and time are retained. Current angular speed is shown separately because a subsequent dog impulse can change it. Shared axle loads can disagree with a footprint on a yawed bump; that limitation is warned and does not paint unsupported ground.

`vehicle.js` adds only an optional observer at the accepted-step boundary. No governing equation is changed. Bisection probes are discarded; a split master step emits its actual accepted dt values. A failed whole step emits no observation. Contact work is integrated once:

`Pslip=-(Fx*sx+Fy*sy) [W]`, `dEslip=Pslip*dt [J]`.

Physical work retains its signed floating-point value. Meaningful negative dissipation raises a diagnostic warning; only the visual exposure ignores round-off-sized negative values. Source contact/energy guards are unchanged. Physics-state equivalence against the predecessor is tested through real dog searches and all handling cases.

`tracks.js` stores four independent deterministic FIFO histories, plus independent projected tire and COM paths. Marks have no access to controls and feed no force back to physics. Deposition requires solved positive support, local footprint overlap, load >=5 N, sliding speed >=.5 m/s and >=.5 J of continuous eligible work. Those **visual thresholds are legibility choices**, not a tire failure/abrasion law.

Opacity is `0.7*(1-exp(-work/(200*area)))*min(1,N/250)`; work is J, area m² and the exposure scale 200 J/m² is uncalibrated. The .18 m rubber width lies inside the existing .22 m visual tire. Distance resampling is .04 m. Stationary wheelspin builds a .12 m localized imprint, without exporting old stationary heat along a new trail. Low-slip rolling does not continually paint. Friction saturation and significant sliding are reported separately from the decision to deposit.

Continuity breaks across missing accepted time, resets, >20 ms observational stages or >1 m stage jumps. These limits break *visual links*, never clip physical velocities. No render frame deposits work. Identical physics at 30/60/144/240 presentation rates yields identical CPU records, Float32 vertices/colors and active triangle sets. The presentation-rate test requires zero difference in retained records and Float32 vertices/colors/active vertex identities; continuous curves are still .04 m chord samples of accepted motion, not an exact continuous solution. Index submission order may differ; all marks use the same color, so alpha composition is order-independent. Normal continuous joins share strip edges; abrupt bends use bounded bevel sections rather than unbounded miter spikes.

`track-view.js` uses **one batched indexed mesh / one material**, dirty vertex uploads and append-only active indices until the fixed budget fills. No per-step meshes/materials exist. Default budget: **1024 primitives per wheel (4096 total)**, **2048 projected path points per wheel and COM (10,240 points)**, 4096 event slots. Geometry/index/color/UV/occupancy buffers total **937,984 bytes**; the CPU event ring is 16,384 bytes. Object histories are separately bounded; this number is not total browser/GPU heap usage.

Only active primitives are submitted. FIFO eviction reuses fixed slots. Hiding defers GPU synchronization; overflow triggers one bounded resynchronization when shown again. Clearing, terrain changes and rare 1 km origin rebases rebuild the fixed buffer once, not each frame. Fragments outside the finite 40×40 m rendered road patch are clipped, so old marks cannot float beyond its edge; their world-space records remain and reappear when the patch covers them again. Geometry is relative to a nearby origin; renderer translation follows the car while x/y records remain world-fixed. Road vertices use the source road mesh's .25 m interpolation plus a .006 m offset to avoid Z-fighting. Terrain changes reproject rendering height without changing measured x/y or physics.

## Handling evidence

The baseline retains the .3 kg m² crank, finite 8 Nm starter port, speed/throttle-dependent mean combustion and separate friction/pumping losses. Its zero-load idle root is about 653.800 RPM, with no imposed RPM floor; fresh inherited tests exercised starting, stalls, back-driving, throttle and engine braking. Case F records actual engine RPM/mode and wheel response. Full equations/parameters remain in the preserved `engine.js` and `SOURCE-LIVING-AUTOMOBILE-README.md`, rather than a newly fitted engine.

`results/mission40-handling.json` records parameters, controls, wheel states, yaw, acceleration, reduced energy, stopping threshold, work, utilization, numerical residuals and exact source-state comparisons. `mission40-traces.json.gz` contains 50 Hz numerical traces and full retained mark/path geometry. `mission40-handling.svg` plots the actual records.

|Case|Observed result|
|---|---|
|A rolling, 8 m/s|No marks; stable straight motion; U approximately zero|
|B progressive service brake|Front marks 57/57, rear 0/0; speed <.02 m/s at 1.596 s and 7.784 m from start|
|C progressive rear handbrake|Rear lock at .856 s while travelling 6.293 m/s; rear marks 176/176, front none|
|D ordinary low-slip turn, 4 m/s|No marks; peak utilization .384|
|E same turn + rear brake|Rear-only marks 45/48; force-derived yaw/path change; rear lock while translating|
|F actual engine/clutch torque, both rear mu=.08|Rear wheelspin and short/local deposition; front none; no assigned wheel RPM|
|G low-grip rear-left braking|Asymmetric marks 87/87/120/0 and solved chassis yaw|
|H steering reversal|High-grip transient can saturate without a visible mark; low-grip version deposits front marks and changes yaw response|

**Every complete final physical state is bit-identical to the predecessor** under identical inputs. These are newly executed before/after comparisons; they do not claim a handling improvement. The old force laws, default mass/inertias, geometry, suspension and drivetrain are unchanged. Stopping distance uses a declared .02 m/s threshold because the regularized creep law approaches rest continuously; it is not an exact static-stop event.

## Verification and performance

New exhibit: **74/74 Node tests passed**, including all 60 inherited tests. Predecessor baseline: **60/60 passed**. The added checks cover coordinates, four histories, stationary spin, curves, unloaded/low-slip contacts, measured opacity, resets/teleports, presentation-rate independence, bounded FIFO/GPU buffers, coherent accepted work, source-state identity and complete predecessor preservation.

Chromium functional tests passed rolling/no-marks, actual rear lock while moving, curved deposition, independent toggles, unchanged frozen physics/history under camera/view switching, clearing, all required 3D views and bounded resource recreation. The inherited engine/starter/first-gear and all mechanical-camera browser regression also passed, as did input/focus clearing, injected-fault recovery and renderer-recreation reliability. The latter uses fillRect for its injected top-view failure because the new top view paints a road background; it does not loosen failure expectations. Screenshots are committed as `mission40-top.png`, `mission40-road-3d.png`, `mission40-friction-circles.png` and were visually inspected for alignment/clipping/spikes. The new panel shows stage/current load distinctions; the top-view COM path is genuinely populated.

Node 24.19 / AMD EPYC 9V74 / five exposed CPUs: a 500-warmup/2000-step handbrake/steer workload measured mean/p95/worst **0.237/0.414/2.022 ms without observation**, **0.231/0.403/1.647 ms with observation**. Sequential JIT/GC/host noise prevents attributing the difference solely to recording overhead. Separately timed synthetic sliding-history recording averaged **0.00127 ms per four-wheel stage**; dirty CPU geometry packing averaged **0.01257 ms per 16-stage presentation batch**. These work units are not full ODE steps or GPU execution. Even this benign Node workload exceeds 1 ms in its worst sample; no hard deadline is certified, and the inherited worst-case dog-search workload was not re-profiled here.

For 30,000 warm-up plus 200,000 additional prescribed-telemetry stages (not simulated driving), mark/path counts remained capped. Node forced-GC retained-heap deltas were about **24 KiB** for sustained sliding, **49 KiB** rolling, **29 KiB** stationary; fixed buffers did not grow. Chrome's raw shared heap rose during its burst without forced GC; it includes garbage/JIT/app state and is **not** evidence of a fixed whole-browser heap cap. Reliable bounds are retained record counts, fixed typed buffers, resource counts and the Node post-GC observation.

Real RAF at 1280×850 on **SwiftShader** measured approximately **2.83 / 3.25 / 3.21 FPS** for disabled / enabled-empty / active-sliding tracks. Physics throughput was **78.8 / 87.8 / 59.1 steps per wall second**. These short host-dependent workloads differ physically; they are not a speedup comparison. Runtime had no faults, but **full-app real-time performance FAILS on this software renderer**, with explicit clock slowdown. No accelerated-desktop or 240 FPS claim is made.

The separate 480×320 road/mark drawing workload submitted **1 draw call without marks, 2 with maximum history**, 8194 total triangles at full history. CPU submissions averaged **0.120/0.112/0.149 ms**, with p95 **.2/.2/.3 ms** for disabled/empty/full. Its 120 real RAF frames per mode were approximately 60 Hz, a presentation cap rather than peak GPU throughput. The paused app's 2D loop was still present; this is not the full mechanical exhibit. GPU timer queries were unavailable: **GPU milliseconds NOT MEASURED**. Maximum-history geometry/material counts stayed at 2/2 including the road. Detailed machine-readable timing and caveats are in both `mission40-performance-*.json` files.

## Reproduce

From repository root (baseline comparison tests require the preserved sibling and Git history):

```bash
node --test research/scientific-rebuild/braking-and-tire-contact-prototype/tests/*.test.js
node --test research/scientific-rebuild/tire-road-observatory-prototype/tests/*.test.js
node research/scientific-rebuild/tire-road-observatory-prototype/tests/handling-experiments.mjs
node --expose-gc research/scientific-rebuild/tire-road-observatory-prototype/tests/observatory-benchmark.mjs
MPLCONFIGDIR=/tmp/observatory-mpl XDG_CACHE_HOME=/tmp/observatory-cache python3 research/scientific-rebuild/tire-road-observatory-prototype/tests/plot-observatory.py
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/tire-road-observatory-prototype/tests/browser-observatory.mjs
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/tire-road-observatory-prototype/tests/browser-track-performance.mjs
```

Uses existing Node, Playwright, Chromium and offline Matplotlib. No new application dependencies. Functional browser replay uses controlled timestamps and is distinct from the real-RAF performance command. Historical copied scripts can overwrite their historical output filenames; new observatory commands use mission40 names.

## Scientific verdict and deliberate boundaries

See **vehicle-realism-audit.md** for confirmed defects versus model/visual limitations and future work. It covers the actual 104 kg fixture, an inconsistent bare-wheel mass/radius/inertia interpretation, absent longitudinal/lateral load transfer, the unchanged isotropic law versus the recorded TMeasy investigations, steering geometry versus dynamics, and the missing gear-shock pitch/housing port.

See **full-size-parameter-proposal.md** for a conditional published-dimensional 1400 kg benchmark and explicit missing manufacturer data. It is not a new preset. No tyre calibration, mass replacement, full-corner suspension, body roll, steering self-alignment, new engine/drivetrain, forced drift, fake jerk or production change was introduced.

The marks make the existing experiment observable; they do not validate real rubber abrasion or automobile realism. No previous exhibit is modified, no branch is created or switched, and nothing is merged.
