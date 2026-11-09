# Physics-driven tire smoke and dust

Implemented on PERFORMANCE above baseline `eed9a9c`. Production physics, contact solver, drivetrain, audio and historical laboratories are unchanged. The capture adapter only exposes the surface name from its existing terrain sample.

## Use

Serve the repository with `python3 -m http.server 8000` and open
`http://localhost:8000/research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/`.
Select Schweinemotorwerke and Performance, Balanced or Cinematic graphics. Expand **Tire Smoke** to enable/disable emission, adjust density and inspect per-wheel diagnostics. Baseline deliberately disables smoke. Existing driving, clutch, gear, engine-start and camera controls remain in force.

## Physical signal and visual approximation

Each accepted step supplies actual contact-patch position, supported normal load N, signed longitudinal/lateral slip velocities (m/s), and irreversible power `(viscous loss + plastic loss)/h` (W). Mechanical contact work, including recoverable bristle energy, is not treated as heat. Emission requires N > 10 N, sliding speed > 0.15 m/s and positive irreversible power. It is independent of RPM, throttle and slip sign, including reverse.

The bounded rate is `35*(1-exp(-max(0,P-P0)/Ps))*(1-exp(-(slidingSpeed-0.15)))` particles/s per wheel, multiplied by the density control. Asphalt/concrete use P0=400 W, Ps=5000 W; dirt/gravel use 80 W and 1800 W. Grass, rock and unknown surfaces emit nothing. These are visual onset/response choices, not measured tire-temperature or smoke-mass calibration. No water state exists, so no spray is fabricated.

Four independent accepted-step accumulators feed one pooled Three.js Points draw. Birth positions are actual world contact positions; Float64 world coordinates are converted to vehicle-relative Float32 attributes only for drawing. Camera motion and terrain recentering do not relocate old particles. Particles inherit 20% of contact-patch translation, decay horizontal momentum, rise, expand and fade. Dust uses brown tint, lower rise and shorter lifetime; smoke uses restrained gray-white. Procedural soft irregular opacity, fixed birth variation and ordinary alpha blending avoid additive glow. No new texture dependency, scene per particle, terrain query per particle, physics loop or animation loop is introduced.

Budgets: Baseline 0, Performance 120, Balanced 320, Cinematic 600. Particle arrays occupy 53,400 CPU bytes (excludes JS objects/GPU copies). One additional draw when visible. Zero-live/no-pending frames skip pool updates. Accepted steps accumulate births; graphical frames advance particles, capped at 50 ms visual aging per frame. Pause, hidden tab and physics fault freeze particles and discard pending births. Reset/vehicle replacement disposes the pool; disable/quality changes clear it. No rejected step emits.

## Executed verification

From repository root:

```sh
node --test research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/*.test.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/tire-smoke-browser.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/tire-smoke-stationary-browser.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/tire-smoke-scenarios-browser.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/tire-smoke-stress-browser.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/spatial-browser.mjs
```

Browser scripts require the existing Playwright installation and `/usr/bin/chromium`; they start their own HTTP server. No new dependency was added.

All 32 Node tests passed, including physical trajectory equality bit-for-bit over 5,000 actual vehicle steps with/without smoke; emission gates, reverse-sign invariance, million-metre world anchoring, pause, disable, budgets, disposal and approximately 100 simulated seconds of controlled emission. Browser checks passed with no critical page errors: real manual takeoff/moving rear slip, near-stationary braked burnout, gentle acceleration/rolling (zero particles), braking, lateral sliding/handbrake and dirt dust. The braked burnout moved about -0.0155 m/s and produced 72 particles, all from rear tires; powered moving slip produced 84 rear particles. These counts describe captured instants, not fixed emission guarantees. Existing audio/spatial browser regression passed. Airborne suppression is automated constitutive coverage, not an airborne live-driving capture.

Raw records and uncomposited screenshots are `results/tire-smoke-browser.*`, `tire-smoke-stationary.*`, `tire-smoke-scenarios.json`, `tire-smoke-{rolling,braking,lateral,dust}.png`, and `tire-smoke-stress.json`. Screenshots show actual renderer output. Browser scenarios use real controls and accepted vehicle physics; only the separately labeled stress fixture supplies controlled dissipation inputs.

## Performance evidence and limits

Environment: Linux cloud, Node 24, Chromium 154, ANGLE/Vulkan **SwiftShader software renderer**. No RTX 5090 or 240 Hz hardware claim is made. Full-lab paused-pose smoke-on/off runs retained identical physical state. Stationary scene median frame interval was 316.6 ms both ways; p95 333.4 ms both; p99 383.3 ms on / 349.9 ms off. Moving-scene measurements were noisy (median 316.6 ms both). These software full-scene runs cannot isolate a credible GPU overhead or speedup.

Separate production-particle-renderer stress fixture: 960×540, identical renderer/camera, 15 warmup + 60 measured frames per mode, controlled high dissipation, no vehicle physics claim:

| Budget/live | Mean frame ms | Median | p95 | p99 | Mean CPU submission ms |
|---|---:|---:|---:|---:|---:|
| Cinematic / 597 | 37.57 | 33.4 | 50.0 | 66.6 | 0.145 |
| Balanced / 320 | 16.67 | 16.7 | 16.7 | 16.8 | 0.080 |
| Performance / 120 | 16.67 | 16.7 | 16.8 | 16.8 | 0.083 |
| Hidden / 597 | 16.67 | 16.7 | 16.8 | 16.8 | 0.043 |

CPU submission is not measured GPU execution. Software overdraw makes Cinematic measurably expensive; lower tiers are the safer starting point. Five create/render/dispose cycles returned renderer geometry count to baseline. Particle storage/counts remained bounded. This is not an hours-long heap/vehicle soak. Budgets need local hardware profiling; no guarantee of 240 Hz.

## Remaining limitations

This is a dissipation-driven visual approximation, not thermal chemistry or fluid simulation. Dust has simplified upward dispersion, no terrain collision/settling. No soft-particle depth fading, per-particle depth sorting, volumetric self-shadowing or lighting integration; intersections/order artifacts remain possible. No prolonged controlled drift or all camera/terrain combinations were independently captured. The existing bounded terrain-contact convergence fault remains unchanged: the laboratory pauses, and emission freezes. No solver tolerance, physical parameter, timestep or safeguard was changed to make smoke work.
