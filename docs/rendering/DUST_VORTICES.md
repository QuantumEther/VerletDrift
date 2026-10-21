# Dense airflow tracers and persistent wake vortices (v34 prototype)

Development branch: `verlet_gpt_v34_dust_vortices`, based on preserved v33 (`8db5174`). [Motion comparisons and trajectory inspection](dust-vortices/index.html).

## Why v33 could not show sustained rotation

V33 evaluated an analytical disturbance at each original seed position and added a bounded displacement. Its “swirl” therefore offset or bent a field; it did not transport tracers around a core as time accumulated. Raising opacity and adding broad patches made this easier to see, but produced the detached puffs the user rejected.

The prototype removes those broad cloud quads. The environment contains a much denser, delicate world-space seed lattice. Tracers pass through finite rotational transport maps with accumulated angular phase, so their paths can complete full revolutions. Body pressure impulses split the field around the car and entrain it in its wake. Counter-rotating cores are shed behind the sampled vehicle trajectory every .2 seconds, with strength and imbalance driven by actual speed, lateral slip and yaw. Cores persist, broaden and lose circulation after the car passes.

## Alternatives investigated

| Approach | Advantage | Cost / limitation |
|---|---|---|
| V33 bounded displacement | Cheap, stateless, easy scrubbing | Does not accumulate rotational phase; greater visibility emphasizes puffs |
| Persistent GPU Euler/RK2 tracers | Direct integration through a velocity field | Arbitrary backward seeks need checkpoints or deterministic reconstruction; spatial recycling/camera motion complicates history ownership |
| Low-resolution velocity field plus GPU tracers | Amortizes field sampling for very large tracer populations | Additional field/history infrastructure and interpolation; coarse cells can alias flow around a 2 m wide body |
| **Finite analytical vortex transport maps (chosen)** | Real accumulated orbital phase; parallel, deterministic, no particle-state checkpoints | An ordered approximation to interacting vortices, not integration of their combined Eulerian velocity field |
| Sparse volumetric puffs plus tracers | Adds broad atmospheric contrast | Risks reproducing the rejected smoke/cloud appearance; not used here |

The selected method is a Lagrangian flow-map prototype, **not** a claim to have implemented a persistent numerical particle integrator or a fluid solver. Each frozen-core radial rotation is area preserving; ordered map composition approximates interacting wakes. Moving/broadening cores and body pressure maps are intentionally simplified. Core positions are prescribed rather than mutually solved.

### Transport and determinism

`buildDustTransport` reads the existing bounded 96-observation ring without modifying it. It builds compact body-impulse and vortex lists, spatially culling distant history. Vortex pairs use the actual velocity direction; slip and yaw alter their separation, core width and signed strengths. A small deterministic shedding imbalance prevents perfectly mirrored wakes.

WGSL applies smooth-onset body deflection followed by chronologically ordered rotations. Angular phase is the difference of integrated smooth-start, exponentially decaying circulation between a tracer's birth and the displayed time. The integral saturates when circulation expires: particles do not unwind to their seed positions. Differential angular speed winds seed structure into curved streams.

Each cell has a separately phased, smoothly fading tracer cohort. Default lifetime is 4 seconds. For longer wake settings it shortens to `min(4, 9.4 − wakePersistence)`, so the full dependency window fits within the existing 9.6-second ring. This is procedural replenishment, not literal conservation of individual dust grains. Fading hides cohort replacement rather than visibly clearing the entire field. World-cell identities and random values are deterministic; no frame-to-frame integration error or random generator writes accumulate.

Exact visual reconstruction requires the same device/settings and the corresponding retained observation window. Seeking farther back than the live ring requires the replay system to restore or resimulate that window; the renderer cannot invent missing vehicle history. Cross-vendor bitwise pixel identity is not claimed.

Only the current two path samples are evaluated for normal motion strokes. The trajectory view evaluates six samples spanning .30 seconds. At ordinary zoom its coarser selection uses a subset of the same .25 m seed cells, transported by the same maps. Colours indicate weighted rotation direction/circulation, **not a measured Navier–Stokes vorticity field**. These are recent pathlines in unsteady flow, not steady-state streamlines.

## Rendering architecture and measured optimization

The first dense version drew an instanced quad for every candidate. Isolated profiling showed drawing was substantially more expensive than transport in SwiftShader. It was replaced with GPU-resident visibility classification and stable compaction:

1. Transport and per-workgroup prefix ranks (64 threads/group).
2. One small prefix pass over group totals.
3. Deterministic scatter to compact visible-index lists and indirect draw arguments.
4. One point-list indirect draw for undisturbed ambient motes, followed by one quad indirect draw for moving wake tracers. Trajectory inspection uses one quad draw with five segments per tracer.

Atomic append compaction was tried and rejected: variable append order changed blended pixels when returning to the same camera. Stable integer prefix scans preserve draw order and exact replay hashes. No tolerance was loosened to hide that defect.

Ordinary motes are one physical pixel; the wake retains antialiased short trajectory strokes. Point rendering trades ambient subpixel antialiasing for much lower vertex cost. No cloud textures, fullscreen fog passes or broad opacity patches are added. Density variations come from redistribution and activity-dependent scattering of fine tracers, not a separate smoke layer.

In the measured drift, 63,433 candidates compacted to **20,566 ambient points and 2,763 wake tracers**. That is about 31,618 submitted vertices instead of 253,732 quad vertices. There were 16 selected body observations and 16 selected vortices. These counts describe that fixture, not every driving state.

Seven fixed GPU buffers total **5,257,376 bytes (about 5.01 MiB)**:

| Resource | Bytes |
|---|---:|
| Frame uniform | 128 |
| Body observations | 3,072 |
| Vortices | 3,072 |
| Six-point tracer trajectories and appearance | 4,194,304 |
| Visible-index lists | 524,288 |
| Indirect arguments | 32 |
| Stable prefix state | 532,480 |

No per-tracer CPU updates, per-frame GPU allocations, per-frame visibility readbacks or persistent texture allocations are used. Visible counts remain GPU owned. Explicit diagnostic readbacks allocate temporary buffers, await `mapAsync`, then destroy them. Optional sparse compute timestamps own two additional 16-byte buffers and one query set; device-loss cleanup releases these too.

The normal candidate cap is 65,536; Performance quality caps it at 24,576. Trajectory inspection caps candidates at 12,288 and displays fewer, longer paths. Ambient density thinning skips transport for rejected seeds. Sustained CPU command-submission pressure can thin the field; this is **not GPU load measurement**.

### Actual measurements

`benchmark-dust-vortices.mjs` replays the same frozen real drift, at 926×696 and the ordinary 20 px/m base scale with its recorded camera zoom. Sixty measured stages interleave compute-only, draw-only and combined work; twelve warmup stages precede them. Four sparse timestamp samples per pass were collected. No screenshots or readbacks occur inside the timed stages. Visibility counts are read once afterward.

All numbers below are from **forced SwiftShader software WebGPU**, not native RTX 5090 or Mac GPU execution. Timestamp queries measure execution of those software passes; JavaScript submission and CPU-observed queue completion are separately reported.

| Version | Compute timestamp median | Draw timestamp median | Combined queue completion median | Combined JS encode median |
|---|---:|---:|---:|---:|
| Preserved v33 | 1.80 ms | 49.90 ms | 55.55 ms | .10 ms |
| Initial dense quad prototype | 97.91 ms | 882.76 ms | 1,070.60 ms | .30 ms |
| **Final stable compaction + points/strokes** | **156.96 ms** | **68.36 ms** | **212.50 ms** | **.20 ms** |

Compaction increased compute work but reduced isolated drawing time by about 13× relative to the first dense prototype in this run. Combined observed completion fell by about 5×. V34 still costs more than v33, because it transports and displays far more tracers and reconstructs real orbital phase. This is not a claim that v34 is faster than v33.

The initial scripts included a frame-uniform preparation in draw-only timing; the compacted version omits it to avoid resetting indirect arguments without running compute. This affects CPU staging, not the draw-pass timestamps. Isolated targets exclude the simulator's other rendering layers and browser presentation. These short software runs do not establish native frame rate, 1% lows, thermal behavior or high-refresh performance. Native 5090 and Mac measurements remain necessary before promoting this prototype.

For native testing, use the existing known-working NVIDIA/browser launch, add `gpuProfile=1&gpuPower=high-performance`, and inspect `getGPURenderStats().dust.gpuComputeMs` and `gpuTimestampSamples`. These timestamps cover all three dust compute dispatches, excluding drawing and upload costs. The existing top-level `gpuRenderMs` has its old base-world scope and must not be mistaken for total dust drawing time. The standalone benchmark can isolate both passes with `--native`; its output records adapter identity. A power preference is a request, not proof that the 5090 was selected.

## Visual validation

Matched v33 and new-renderer sequences use the same recorded physical trajectory, camera position, normal base scale and scene lighting. For these comparisons the camera follows the sampled chassis centre at zoom1 in both versions. The comparison renderer replays sampled chassis motion with rigid wheel anchors using the real car drawing code; it does not rerun vehicle physics. Smoke, liquid and skid drawing are suppressed in these comparative captures to isolate atmospheric transport. Production defaults and systems for those effects are unchanged.

The lossless moving crops preserve native pixels without enlarging the car. Full-frame PNGs provide the normal-zoom context. Straight acceleration, fast drifting, sudden stopping and late settling are included. The trajectory view exaggerates the recent paths and colours opposite rotation directions. The normal view keeps individual motes delicate while the collective paths bend and wind up behind the vehicle. Consecutive frames and GPU path samples were inspected; judgement was not based solely on particle counts or screenshot hashes.

A direct normal/inspection-mode check matched all **156 inspected tracer heads** at identical world coordinates. Returning to normal mode restored exactly the prior rendered hash. The comparison viewer was exercised through all eight sequence/view combinations, pause/play, forward/backward stepping and backward scrubbing; decoded frames reconstructed exactly and the WebP fallback loaded without JavaScript errors. [Control validation](dust-vortices/controls-verification.json), [viewer validation](dust-vortices/viewer-validation.json).

An isolated-pair GPU regression follows individual stable-radius tracers over 2.55 seconds. It requires sustained rotations exceeding **+360° and −360°**, then checks exact reconstruction of the earlier frame after a backward seek. This distinguishes genuine accumulated orbital motion from a curved still image or a bounded displacement.

## Controls

**Rendering → Atmospheric Dust** retains the existing appearance controls and adds **Flow trajectories** (off by default).

- Cinematic: density .80, wake visibility 1.15.
- Subtle: density .45, wake visibility .45.
- Disturbance strength changes transport; wake visibility changes scattering, independently of density.
- Wake persistence, wind speed and wind direction retain their previous roles.
- Saved v33 settings are preserved; select Cinematic to apply the new density explicitly.
- Turn Flow trajectories off for the normal material; appearance presets do not change this inspection toggle.
- `?dust=0` still disables dust. Canvas rendering is unchanged.

## Reproduction

Run `python3 serve.py` at the repository root, then:

```sh
node scripts/capture-dust-vortices.mjs --output /tmp/new-dust
node scripts/capture-dust-vortices.mjs --mode debug --output /tmp/dust-paths
node scripts/capture-dust-vortices.mjs --ref 8db5174 --output /tmp/old-dust
node scripts/benchmark-dust-vortices.mjs --output /tmp/dust-cost.json
node scripts/benchmark-dust-vortices.mjs --ref 8db5174 --output /tmp/old-cost.json
```

Scripts use software WebGPU by default for cloud reproducibility. `--native` and `CHROMIUM_EXECUTABLE` select a native browser setup; verify the recorded adapter. The comparison capture renders 12 samples per simulation second, so its playback rate is an inspection rate, not a measured simulator FPS.

## Remaining limits and next steps

This is a visually focused analytical prototype. It does not model vortex-vortex dynamics, full body boundary layers, terrain-driven turbulence, 3D buoyancy or physical dust mass conservation. Cohort replenishment, body pressure and circulation are controlled approximations. At extreme zoom-out the lattice thins; at very long persistence the tracer lifetime is shorter. Ambient point sprites can exhibit single-pixel stepping, while moving wake strokes retain subpixel smoothing.

If native compute becomes the bottleneck at larger populations or with multiple cars, a cached low-resolution velocity field plus checkpointed GPU advection is the strongest next candidate. That should follow actual hardware measurements and include explicit replay-history/resource ownership. It is separate from this completed prototype.

## Final validation and remaining test limitation

- **177 unit tests passed (22 files).** Numerical physics suites remain intact. [Log](dust-vortices/unit.log).
- **Full browser run: 110 passed, 1 failed (111 total).** All eight atmospheric tests passed, including opposite full rotations, exact backward reconstruction, camera/zoom return, bounded resources, no-density settling, presets/persistence, optional timestamps, disable/re-enable and device-release cleanup. Other liquid, smoke, input and geometry cases passed. [Full log](dust-vortices/full-browser.log).
- The failure was the existing backward-braking test: after its unchanged 15-second wall deadline, speed was .125346 m/s against the unchanged .05 m/s target. An isolated original-test retry also timed out. This is **not reported as an all-green suite**.
- Investigation confirmed that this test selected **Canvas**, with the atmospheric renderer inactive. Matched instrumented v33/current observations both reached the exact speed .04230123947195352 after **2.0 simulated seconds**, in 10.94/9.78 wall seconds. A matched comparison using the same original braking assertions/deadline, without a periodic observer, passed on both v33 and v34. Only routing and diagnostic start/end recording were added to those comparison runs. The differing runner outcomes show wall-clock sensitivity; they do not justify claiming the original full-run failure has disappeared. [v33 comparison](dust-vortices/braking-v33-comparison.log), [v34 comparison](dust-vortices/braking-v34-comparison.log), [original isolated failure](dust-vortices/braking-original-isolated.log).
- No braking algorithm, physics setting, speed/energy assertion, numerical tolerance or original test deadline was changed. A clean full-suite run on a reliably paced environment remains outstanding. The diagnostic script is retained for reproducibility.

Capacity/draw-count test fixtures were updated for the new renderer; the visual adaptive-thinning policy now retains at least .65 of selected tracers rather than .45. These are rendering policies, not relaxed numerical physics checks.

Physics algorithms, geometry, handling, inputs, gameplay paint, smoke, liquid and other visual systems were not modified. V33 remains at `8db5174`. This branch is an isolated prototype and should not be merged on the basis of these software measurements alone.


## Changed files

- `js/renderer/atmospheric-dust.js`, `js/shaders/atmospheric-dust.wgsl`: finite transport, compacted point/stroke rendering and owned GPU buffers.
- `js/renderer/dust-vortices.js`: bounded, read-only wake descriptors.
- `js/renderer/gpu-compute-timing.js`: optional asynchronous compute-pass timestamps.
- `js/gpu-renderer.js`: timestamp submission callback and on-demand tracer inspection export.
- Dust controls and workspace help: denser presets and the trajectory checkbox.
- Capture, isolated benchmark and reverse-braking diagnostic scripts; regression fixtures and orbital/lifecycle coverage; documentation and lossless motion comparisons.
