# PERFORMANCE terrain driving laboratory

New standalone page on PERFORMANCE, physics baseline **4736576**. No production
or historical laboratory changes. No new dependency, solver, physics equation,
force parameter or tolerance. This is a browser adapter for the existing isolated
vehicle, not another vehicle implementation.

## Launch

From repository root:

```sh
python3 -m http.server 8000
```

Open **http://localhost:8000/research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/**.
Use HTTP, not file://. This branch-local page is not a deployment to the main
GitHub Pages site. W throttle, S service brakes, A/D front steering, Space rear
handbrake, R reset. Pointer-hold controls also work. Clutch slider sets actual
constraint capacity. Orbit/zoom with mouse; camera selector includes top, side,
chase and contact inspection. Flat/hills/rough/road settings intentionally reset
state and histories on change. Pause is explicit; numerical failure freezes the
last accepted state and captures state, inputs and terrain in the clock fault.

## Reuse and capability inventory

Inspected Experiments 10 (`four-corner-load-transfer`) and 11
(`procedural-terrain`) before implementation. The latter reexports the former's
instruments, clock and track machinery. The mature complete renderer is coupled
to old dog gears, a mechanical steering linkage and different wheel-center
kinematics, so passing a lookalike state to it would show incorrect mechanisms.
Only its **render-only coachwork/wheel/spring construction** is retained in
`view3d.js`, with source attribution. No old application/main-loop copy.

| Capability | Reuse / adaptation |
|---|---|
| Coachwork, wheels, suspension graphics | Experiment 11 mesh construction, materials and batching; new poses read the terrain model |
| 3D camera | Existing vendored Three.js + OrbitControls; workshop/chase/top/side/contact presets and camera reset |
| Dashboards | Existing SVG `createInstrument` and `drawFrictionCircles`, imported unchanged |
| Clock | Existing `SimulationClock`, fixed 1000 Hz; 20 ms frame CPU budget / 128 tick cap; **uncapped visible debt**, no discarded time |
| W/S/A/D/Space/R and pointer holds | Same mappings/conventions; small DOM input binder, including focus-loss release and key-repeat-safe reset |
| Engine/clutch | Existing mean engine torque and exact open/slip/lock capacity; ignition checkbox is explicitly not a starter/lifecycle model |
| Gearbox/differential | Disabled selectors: fixed forward 3.5 ratio and ideal open differential; no fictional shift or reverse mechanism |
| Brakes/steering | Actual service/rear brake constraints; bounded rate-limited front steering **input**, no direct yaw manipulation |
| Contact recording / world marks | Existing bounded TireObservatory + incremental track mesh, with record/clear/visibility controls |
| Terrain | Existing analytic presets, colors and sampled display mesh; no visual height exaggeration |
| Inspection | Actual suspension, contact vectors, x-ray coachwork; old gearbox/clutch/steering-column cutaways omitted and labeled unsupported |
| Automobile / prescribed-torque rig / audio | Mean-engine driving only; independent rig torque, engine starting/stalling, selector mechanics and audio unavailable and labeled |
| 2D overlays/navigation | Top and side are camera views of the same scene; old schematic/2D path overlays omitted; links back to untouched 10/11 and model report |

`adapter.js` only calls the authoritative `step` and maps accepted states. Wheel
angles are quadratures of the exact rotor kernel's **accepted integral**, never
speed-based animations. It publishes no new display history on a rejected step.
The new model alone supplies translation, yaw, heave, pitch/roll, four hub heights,
wheel spin, tire forces/slips and normal contact. Camera movement never advances
physics. Ground and track display use identically configured pure samplers; the
old application's environment setter is used **only** for its track-mesh height
provider. No legacy vehicle is created or stepped.

For each wheel the model's carrier locator supplies world position, its linear
small-angle chassis geometry supplies the spring mount, and the terrain tangent
frame supplies the tire's displayed orientation. Tire tilt is not an additional
camber/suspension DOF. Rigid coachwork uses Euler presentation of the reduced
coordinates, not a claim of full 3D body dynamics. The known vertical-gap contact
geometry and missing rolling contact-patch renewal remain unchanged.

Marks use actual **irreversible bristle dissipation**, not -F dot slip: elastic
energy can return positive mechanical work. Existing uncalibrated deposition
appearance is reused, not asserted to predict real rubber. Contact force/load/
slip records are shared-stage values; hub positions and wheel speeds are endpoints.

## Verification and performance

Run from repository root (existing Playwright and Chromium; no installation added):

```sh
node --test research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/adapter.test.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/browser-smoke.mjs
node --test research/scientific-rebuild/fast-vehicle-poc/variable-terrain/terrain.test.mjs
```

The smoke script starts/stops its own local server. Screenshot goes to
`/tmp/performance-terrain-laboratory.png`; small numerical/browser records go to
`results/browser.json`. It uses a real headless Chromium, WebGL, actual RAF,
keyboard/pointer input, steering/braking, all terrain presets, orbit/zoom, exact
camera/state invariance, wheel-render parity, rear brake heat and focus release.
The adapter test compares **every state field exactly** against direct stepping
for 400 steps, checks actual angle integration and nonmutating reads, rejection
rollback and fixed-step/debt clock behavior.

The display measures time **around the actual model call** separately from
rendering and observational overhead. Browser `performance.now()` gives elapsed
main-thread execution time (a CPU-cost proxy, not OS CPU accounting). Mean/p95/p99
are over the latest <=1000 model steps; CPU ms/sim s is cumulative. FPS, accepted
steps per wall second, sim/wall ratio, debt, rejection count and convergence are
actual observations. The fixed clock may run slower than wall time; it never
silently enlarges h or throws away backlog. Renderer initialization occurs before
the active clock starts. Background visibility time is explicitly paused.

A first 8 ms scheduling budget limited SwiftShader runs to about .4–.6x; the final
bounded 20 ms budget gives the physics more time without changing equations or
h. Software-renderer frame rates are **not hardware GPU performance**. This small
laboratory is not a new rendering optimization campaign, an endurance test or
production integration. Unsupported mechanisms remain visible limitations.

## Executed result

**PASS:** 4 adapter/clock tests; 20 terrain-model tests; 56 prior fast-model tests;
82 strict terrain tests; Strategy A 1,080-state bit-exact replay. Original 10/11
source and the 4736576 physics modules were also compared byte-for-byte.

**Real Chromium 154.0.8037.57 smoke: PASS, zero console/page errors.**
Backend: **SwiftShader Vulkan software renderer**, auto preview at **50% pixel
resolution**. Auto uses full resolution on other backends; the selector can
override it. The terrain mesh resolution matches the reused Experiment 11 mesh.
No physics parameter or clock step changes with rendering quality.

Representative final-run observations (not a hardware benchmark):

| Phase | FPS | Sim/wall ratio | Model JS ms/sim s | Max force trials |
|---|---:|---:|---:|---:|
| acceleration | 26.0 | 1.00 | 231.3 | 8 |
| steering | 25.2 | 1.00 | 227.4 | 8 |
| braking | 28.1 | 1.00 | 221.7 | 8 |
| hills | 18.8 | 1.31 | 286.7 | 8 |
| rough | 19.4 | 1.28 | 302.5 | 8 |
| road | 18.8 | 1.16 | 295.5 | 8 |
| handbrake | 15.5 | 1.19 | 267.6 | 8 |

Ratios above 1 are short-window backlog catch-up after resetting/loading, not
a sustained speedup claim. The saved records include remaining debt and timing
windows. These are observational smoke measurements, not repeated paired timing
confidence intervals. No GPU hardware browser was available. The preview is
interactive on this software backend; native-resolution performance is not
certified. The early scheduling/graphics observations above explain why software
preview is explicit rather than being confused with desktop GPU performance.

## Frame-rate diagnosis on the RTX 5090

Open **Frame-rate diagnostics**. Keep the browser window visible, use the same
camera, terrain, window size and render scale, and allow several seconds of
warm-up. Pause physics for a stationary comparison, then repeat while driving.
For each configuration click **Start 10-second measurement**, wait for the result,
and use **Download JSON**. Collect: all enabled; rendering submission off; scene
updates off with submission on; dashboard off; and all three off. The animation
loop stays active in every mode. The no-scene mode renders the last scene if
submission remains on. Disabling submission does not wait for pending GPU work.

Compare `interval` mean/p95/p99 in milliseconds: 240 Hz corresponds to 4.167 ms
per frame. The raw samples allow calculation of the fraction of intervals meeting
that threshold; an average alone cannot establish sustained 240 Hz. Compare the
other columns to identify which switch changes the distribution: physics,
contact recording, presentation conversion, scene transforms, track updates,
WebGL submission and dashboard. `callback` includes all measured and unmeasured
JavaScript within the callback. The difference between frame interval and callback
is not proof of GPU time: it includes browser scheduling, compositor, VSync,
driver queuing and other work. WebGL timing is CPU elapsed time in `render`, not
GPU timer-query execution time. No forced synchronization is introduced. Browser
DevTools performance/GPU traces are needed if submission or scheduling remains
ambiguous. Record browser version, display refresh, driver, OS and power settings
alongside the downloaded files. Avoid background tabs or changing settings mid-run.

## Isolating WebGL presentation at 240 Hz

Use the same visible window, canvas CSS size, selected render scale, device pixel
ratio, terrain, camera, browser flags and physics state for every capture. The
JSON records context attributes, CSS and drawing-buffer dimensions, render scale,
GPU/backend string, browser, selected components and whether settings changed or
the page became hidden. Discard any run marked changed/hidden. Fix the display at
240 Hz manually if appropriate; the laboratory does not change OS settings.

In Chromium **and** Firefox, warm the page for several seconds, open Frame-rate
diagnostics and take at least three 10-second recordings of each configuration:

1. Full laboratory, all three earlier stage switches enabled.
2. Minimal WebGL clear: same renderer-owned canvas, WebGL context, framebuffer
   configuration and drawing-buffer size. This directly clears color/depth/stencil
   and resets Three.js state; it does not draw a triangle or submit a Three scene.
3. Empty Three.js scene: the same renderer and camera render only the same scene
   background; no vehicle, terrain or scene objects are submitted.
4. Incremental scene: turn all five components off, then add terrain, lighting,
   vehicle, tracks and other in that order. Capture after each addition. Tracks
   require recorded marks and the existing marks toggle; force vectors require the
   existing vector toggle. Repeat with a reproducible driving/track workload.
5. Existing submission-off control, for the rAF/browser scheduling baseline.

Repeat the sequence once with physics paused and once with the same running
workload. Do not alter resolution to obtain the result. Download every JSON and
record OS, browser build, GPU driver, display refresh and whether the display is
connected directly to the NVIDIA GPU. `estimatedDroppedPercent` counts estimated
missed refresh slots by rounding frame intervals against a **declared 240 Hz**;
it is not an OS present counter and is invalid for a different refresh rate or
variable refresh scheduling. Compare median, p95, p99 and mean frame intervals
and CPU `webgl` time; 4.167 ms is a 240 Hz interval. Instrumentation itself has
cost. The first stage to reproduce missed intervals is the next target for a
browser compositor/GPU trace, not automatic proof of the underlying root cause.

Optional asynchronous GPU timing uses `EXT_disjoint_timer_query_webgl2` when
exposed. It measures GPU elapsed execution around the clear or render submission,
not present/compositor latency or CPU time. Queries are bounded to eight in flight
and polled without waiting; unsupported, pending, dropped and disjoint counts are
reported. GPU samples can be missing; a disjoint run has no valid aggregate.
Queries are not drained after the 10 s endpoint; pending samples are reported.
`gpu.raw[].frame` is the original zero-based frame index before the initial frame
without an interval is removed from `raw`. Query instrumentation changes the
workload: capture primary frame pacing with GPU timing off, then run it separately
on. Firefox may not expose the extension. Never use GPU timing availability as
proof that all rendering or presentation work was measured.

To rerun the browser mode smoke check, use `node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/webgl-modes-smoke.mjs` from the repository root.

Local check: Chromium with the SwiftShader software renderer loaded all four
modes and completed a timed run; its timer extension was unavailable. This is a
functional test only, not evidence about the RTX 5090 or the 240 Hz bottleneck.
The existing RTX 5090 recordings show rendering submission correlates with missed
presentation intervals; these new modes require measurements on that machine to
identify the first triggering operation. If even minimal WebGL reproduces the
problem in both browsers, compare direct-NVIDIA versus hybrid routing and inspect
browser GPU/compositor traces and VSync manually; do not change system settings
without deliberately testing and recording them.
