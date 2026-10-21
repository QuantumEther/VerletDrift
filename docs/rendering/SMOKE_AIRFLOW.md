# Tire smoke and the vehicle wake — v35 experiment

Branch: `verlet_gpt_v35_smoke_airflow`, based on preserved v34 `acd64ac`. No merge into the previous branches. [Synchronized on/off motion comparison](smoke-airflow/index.html).

## Investigation and design

The existing smoke emitter (`renderer/smoke-system.js`) seeds particles at wheel contacts using slip and the existing random stream. `gpu-renderer.js` uploads those seeds; `smoke-compute.wgsl` applies curl-noise forcing, buoyancy, drag, lifetime and size growth. `smoke.wgsl` supplies the existing neutral, detailed translucent billboards. Those spawning and rendering systems remain unchanged.

Dust samples real chassis position, velocity, heading and yaw into a 96-observation ring (`dust-history.js`). `dust-vortices.js` builds opposing cores every .2 seconds. Core strength and imbalance depend on actual velocity, lateral slip and yaw. Dust transports seeds through an ordered composition of **accumulated finite displacement/rotation maps**. Those maps are not instantaneous velocity and cannot simply be added to smoke velocity.

The new reusable `VehicleAirflow` layer reads the same ring and calls the **same vortex descriptor builder**. It evaluates a separate instantaneous velocity approximation:

- Near-body pressure splitting in chassis coordinates and entrainment in the actual travel direction.
- Tangential velocity around the shared, moving, broadening cores, with matching signs and radial falloff.
- A circulation envelope derived from the time derivative of dust's smooth-start circulation integral, with a smooth terminal taper.
- Shared ambient wind, disturbance strength and wake lifetime, with a four-second smoke lifetime cap to bound work.

This is compatible underlying wake information, **not a claim that smoke exactly follows dust's composed analytical paths**. Superposed velocity fields, moving cores, interpolation and inertial entrainment differ from dust's ordered finite maps. No vehicle physics, constraints, controls, wheel geometry or gameplay paint code changes.

## GPU path and bounded cost

1. CPU selects at most 48 vortex descriptors from the existing observation ring, without changing that ring, vehicle state or RNG.
2. One WGSL compute pass evaluates a 96×96 velocity/coverage grid at .75 m spacing: a 71.25 m square, snapped in world space and biased behind the car.
3. Each smoke substep bilinearly samples four grid nodes. There is no vortex-history loop per smoke particle.
4. Smoke receives exponential local entrainment toward the field velocity, retaining the original curl-noise, buoyancy and drag calculation. The response time is about .083 s at full coverage/default strength. A smooth influence envelope avoids damping smoke outside the wake.
5. Bounded substeps, at most 1/120 s within the renderer's existing .1 s elapsed-time cap, resolve rotation without changing production physics timesteps. Field speed is bounded at 18 m/s before the existing disturbance multiplier (0–2).

The grid updates at most 60 Hz in ordinary motion, while smoke integrates at every render update. Its origin and samples remain together between updates. History changes, rewinds, re-enabling and physical airflow settings can force an early refresh. The minimum refresh interval is 16.7 ms; the sample age can exceed that by one available render/simulation update. This avoids redundant grid work at 120/240 Hz. Empty/paused smoke and disabled coupling dispatch no field compute. Domain edges taper smoothly; outside the finite grid smoke retains its usual motion.

Three persistent GPU buffers total **149,056 bytes (~146 KiB)**:

| Resource | Bytes |
|---|---:|
| Field frame | 64 |
| 48 shared-core descriptors | 1,536 |
| Velocity XY + influence + padding, 96×96 | 147,456 |

One field update uses 144 workgroups of 8×8. Normal preparation uploads 64 bytes plus up to 1,536 bytes of descriptors. Reused-field frames upload only the uniform. No particle CPU advection, per-frame GPU allocation or new particle readback is introduced. Optional sparse timestamps add two 16-byte buffers and a query set. The class owns and destroys its resources; existing renderer device-loss fallback also releases it.

A grid has a fixed update cost and is not automatically cheaper than a few direct evaluations for a very sparse smoke population. It bounds history evaluation independently of particle count, supports four cheap samples per particle, and amortizes field updates at high refresh rates. Native profiling is still needed before changing grid quality or adopting more complex spatial indexing.

## Controls and fallback

Under **Rendering → Smoke airflow**:

- **Vehicle airflow**: on/off comparison (default on in this experiment).
- **Smoke airflow influence**: 0–2, default 1; zero takes the original motion branch.

These use the existing persistence/reset/settings export/import registry. Enable **Smoke** separately as before. Existing smoke emission thresholds, spawn/lifetime/size/opacity controls, and smoke's stationary-wheelspin minimum-speed gate are unchanged. A car at true rest does not invent a vehicle wake; low-speed wheelspin retains its existing turbulence plus whatever body/wake flow is present.

Dust visibility, density and Flow Trajectories do not control smoke coupling. The observation ring remains active while smoke is enabled even if dust is hidden or coupling is temporarily disabled, so comparisons do not lose their wake history. The existing dust disturbance, wind and persistence settings describe shared airflow; persistence above four seconds is currently capped for smoke.

If the optional field shader fails, the renderer logs the failure and continues the original smoke motion. Disabling coupling skips its compute dispatch. The Canvas smoke path remains unchanged and does not gain this coupling. The v34 branch is an additional recoverable baseline.

## Determinism and replay limits

The field reconstructs from simulation time, settings and retained observations. Cache invalidation includes the observation generation and serial, rewinds and settings changes. It does not consume random numbers. Fixed seed/emission and the same sequence of update times reproduce smoke trajectories exactly in the tested backend.

Smoke itself remains the existing stateful GPU integration. Scrubbing to an arbitrary time requires restoring/replaying its particle state; it is **not** made an analytical seekable simulation by this change. Different render timestep histories need not produce bit-identical smoke, and cross-vendor floating-point pixel identity is not promised. There is no change to deterministic vehicle physics.

## Motion inspection

The comparison page provides synchronized playback, stepping and seeking through the captured frames:

- Straight travel.
- Low-speed wheelspin.
- Recorded physical drift trajectory from the v33/v34 validation fixture.
- Controlled countersteering/slip/yaw probe.
- Sudden stopping and post-stop wake evolution.
- Full smoke/wake dissipation.

Each pair starts fresh and uses the same deterministic emitter seed, wheel positions, slip input, timestamps, default smoke materials and normal 20 px/m scale. The existing emitter and complete GPU world renderer run; the normal Canvas car renderer draws the sprite afterward. Dust, skids and liquid are hidden only in these isolation captures. Straight/wheelspin/countersteer are controlled visual probes, not new physics runs; stop holds the recorded pose after two seconds. Emitter observations run at 120 Hz, smoke at 24 Hz, inspection frames at 12 Hz. The 24 Hz update cadence is identical on both sides and does not exercise the high-refresh field cache.

The on/off sequence shows rolls and lateral curling developing along the recorded drift's asymmetric wake, rather than only a uniform plume translation. Smoke remains delicate and neutral, distinct from fine dust. The isolated controlled-core regression follows individual smoke particles around cores with opposite signs through more than half a revolution, checks finite state, then repeats the seeded run. It measures actual particle motion, not just shaded noise or pixel differences.

Full-frame PNG comparisons are lossless; WebP motion clips use quality 90 compression for practical repository size. These are visual inspection recordings, not gameplay FPS measurements.

## Measurements

`benchmark-smoke-airflow.mjs` alternates preserved v34, current disabled and current enabled kernels under identical seeds and a frozen recorded drift. It measures 8,000 live particles, 24 samples per mode after six warmups, with actual pass timestamps. Rendering and browser presentation are excluded. The script separately records CPU encoding and CPU-observed queue completion; those are not GPU execution time. No particle readbacks occur inside timed stages; baseline comparison snapshots occur after untimed warmups.

The final frozen fixture selected 26 cores. Median values in this local batch:

| Mode | Grid execution per refresh | Smoke execution | CPU-observed queue completion |
|---|---:|---:|---:|
| Preserved v34 | 0 | .673 ms | 2.45 ms |
| Current, disabled | 0 | .972 ms | 2.50 ms |
| Current, enabled | 3.853 ms | 1.340 ms | 6.55 ms |

Coupling therefore adds about .368 ms of integration cost over the current disabled kernel, plus the grid refresh. The disabled kernel itself has overhead relative to the preserved shader in this software batch. The benchmark deliberately refreshes the field in every enabled sample; the production 60 Hz cache amortizes refreshes at higher update rates. These medians describe one short software batch, not native frame rates or guaranteed upper bounds. JavaScript encoding medians quantized to 0 ms at this browser's timer resolution, so they do not establish zero CPU cost. Earlier local batches varied; no speedup claim is made.

All local GPU measurements use **SwiftShader software WebGPU**, not native RTX 5090 or Apple hardware. See [raw measurements](smoke-airflow/performance.json). Native performance, full-scene frame pacing and high-refresh behavior have not been demonstrated here.

For native testing use your known-working NVIDIA/browser launch with `?renderer=gpu&gpuPower=high-performance&gpuProfile=1`, enable smoke, and compare the new toggle at the same driving input. `getGPURenderStats().smokeAirflow.gpuFieldMs` measures the grid pass; top-level `gpuComputeMs` measures the smoke integration pass separately. Neither is total application frame time. `gpuSamples`/`gpuTimestampSamples` establish whether a timestamp sample exists. Timings retain the last measured value when paused/disabled; inspect active/dispatch counters and sample-count changes before interpreting them as fresh work. The script also supports `--native` and `CHROMIUM_EXECUTABLE`; verify its adapter identity rather than assuming high-performance preference chose the 5090.

## Automated validation

Checkpoint validation: **180 unit tests pass**. The initial full browser run passed 112 tests and found four failures: three count fixtures made outdated by the new pass/controls, and one missing persistence registration. Those are corrected; the targeted reload/reset/live-observation test passes. The final full browser rerun is in progress. Initial and targeted logs are retained alongside this report. Coverage includes original-motion equality against preserved v34, opposite particle rotation, repeatable seeded integration, optional shader failure, shared wake with dust hidden, field decay after stopping, zero strength, UI settings persistence, field update caching, read-only bounded observations and resource cleanup/device loss.

The existing GPU-world fixture now counts the additional 144-workgroup field dispatch in its total; its original 32-workgroup smoke assertion and numerical assertions remain intact. The exhaustive UI fixture now expects 222 controls (one additional range and one additional checkbox); it still checks every binding. No numerical tolerances or existing test assertions are weakened. Existing numerical and browser regressions remain in place.

## Files and remaining limits

- `renderer/vehicle-airflow.js`: shared observation/core selection, grid ownership, caching, settings and timings.
- `shaders/vehicle-airflow.wgsl`: instantaneous wake velocity grid.
- `shaders/smoke-compute.wgsl`: read-only sampling and local entrainment; old branch retained.
- `gpu-renderer.js`: optional initialization, dispatch ordering, binding, telemetry and lifecycle.
- `main.js`: keep read-only airflow observations when smoke needs them and dust is hidden.
- `state.js` / `ui/control-data.js` / `ui/controls.js`: the two visual controls and their existing registry persistence path.
- Unit/browser tests, capture/benchmark scripts, this report and motion evidence.

The model is a bounded 2D graphical approximation. It does not conserve fluid momentum or smoke mass, model vertical vortices, solve body boundary conditions or simulate actual tire-generated air jets. The existing billboard size/lifetime limits how much fine filamentary structure can be resolved. Smoke beyond the finite field or beyond its four-second vortex horizon uses its original turbulence. The shader uses baseline WebGPU buffer operations and 64-thread field workgroups; no subgroup, float-atomic or hardware filtering extension is needed. Native Mac/5090 correctness and performance still need testing. Nothing is merged into the simulator's earlier branches.
