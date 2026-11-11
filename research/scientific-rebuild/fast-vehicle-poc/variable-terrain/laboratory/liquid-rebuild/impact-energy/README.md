# Impact-energy gate: FAIL — stop extending live PBF

Work based on `PERFORMANCE_2` / `188a0c5`. The existing vehicle, working balloon renderer, original `pbf.wgsl`, density normalization and boundary equations are unchanged. `../pbf.js` adds optional diagnostic buffers/shader entry points; its default sizes, dispatches and shader remain the baseline. No experimental correction is enabled in the application.

## Confirmed mechanism

`../pbf.wgsl` computes a diagonal Jacobi density correction, projects collisions and finally assigns `v = (predicted - oldPosition)/dt`. Near coincident compressed markers, the kernel gradient approaches zero while positive density error remains. The diagonal becomes small, multipliers become large, and an unchecked linearized correction overshoots. Its velocity increment is `deltaPosition/dt`:

`ΔK = Σ m v·δ/h + Σ m |δ|²/(2 h²)`.

An almost zero **net** internal impulse therefore does not imply bounded energy. The density constraint has no modeled elastic-energy reservoir that could supply this gain.

The reproducible counterexample uses four markers, the **same per-marker mass and derived rest density as the recovered coarse sphere**, no initial compression, gravity zero, cohesion zero, a static swept paddle and 16 iterations. Their known initial speeds are 10.080–18.713 m/s; total mass is 0.0896375 kg. This adversarial collinear packet is a minimal numerical counterexample, **not** a resolved water balloon or a prediction of real-fluid motion. At the first predicted endpoint it compresses to 12.24% above the constraint density.

| First step at 1/240 s | Energy/change (J) |
|---|---:|
| Initial kinetic energy | 9.752878 |
| Gravity/cohesion kick | 0 |
| Density projection | +140984.325282 |
| Collision projection | −71616.227769 |
| Static-wall work | 0 |
| Float32/proxy-to-actual accounting remainder | −0.017554 |
| Final actual kinetic energy | **69377.832838** |

The first multiplier reaches 269.38; maximum correction is **8.71249 m**, against a 0.05 m kernel radius. Internal momentum change is only 5.13e−6 kg·m/s before the wall reaction. The wall removes energy. Actual stored velocity stays unchanged during projection; the reported intermediate energies use the explicitly labeled reconstruction-equivalent velocity. `finish` makes that already-created proxy energy actual—it is not a second energy source. No viscosity, vorticity force, capillary force or gravity is present in this counterexample.

An independent double-precision all-pairs transcription (`independent.mjs`, no shader/grid/kernel helper imports) reproduces the first correction to within 0.1% relative tolerance. Float32 summation and subtraction explain a small accounting remainder, not the 69 kJ gain. Static penetration is zero; moving-case penetration is below 1.1e−7 m.

A separately moving paddle supplies **156.103 J** of signed `wallVelocity·collisionImpulse` work, yet final kinetic energy is **69464.637 J**. Moving-boundary work cannot explain that gain. Positive work from a moving wall is not automatically a failure: the ordinary moving-paddle control receives about 17.2 J and ends near 10.44 J, with dissipation. See the signed budgets rather than classifying every energy increase as artificial.

## One correction tested, then rejected

`shader.js` adds bounded projected Armijo backtracking to the **existing** Jacobi direction: at most six trials (1 through 1/32), frozen diagonal weighted objective `½ Σ C_i²/D_i`, sufficient-decrease coefficient 1e−4, explicit float32 accumulation allowance, and final maximum compression ≤0.001. It changes no velocity, mass, density target or boundary equation. If search or final density acceptance fails, `x/v` remain at the last accepted state and the trajectory stops. The diagnostic ledger includes attempted stages and is **not** falsely presented as an accepted-state work budget after rejection.

This is mathematically a density-descent safeguard, not an energy controller. **It accepts the same 69 kJ counterexample**: dispersing the markers by meters reduces the density objective to zero. The final residual gate passes too. Therefore this correction is scientifically rejected; no tuning or second live-solver campaign follows.

Matched initial positions, velocities and 1/240 s elapsed time give:

| Static packet | Baseline final K (J) | Safeguarded final K (J) |
|---|---:|---:|
| h = 1/240 | 69377.8328 | 69377.8328 |
| h = 1/480, 2 steps | 4.79525 | 4.79525 |
| h = 1/960, 4 steps | 3.48275 | 3.48275 |

Substepping avoids this particular compression catastrophe, but the tested results are **not converged** and do not establish safe general impacts. Do not present smaller timesteps as a validated fix.

## Controls, resolution and rollback

`results/controlled.json` contains both variants for rest, gravity/ground, static 0.6 and 4 m/s impact, a −2 m/s moving wall, 12 m/s scene impact, half-step impact and a 1229-marker case. Rest and ground complete; resting K is about 1.3e−10 J. The fine safeguarded case rejects after **2 of 72 accepted steps**, and exact equality of positions/velocities against the immediately preceding state is checked. It is a failed trajectory, not 72 stable steps. Reported completion/rejection is not visual or physical acceptance.

Exploratory full-sphere 4 and 12 m/s searches (`search-4.json`, `search-12.json`) did **not** reproduce the previous mission's 3895.93 J explosion within 0.6 s under instrumented execution. GPU atomic neighbor insertion changes accumulation order; instrumenting/compiling can alter trajectories. The old numerical value is historical evidence, not newly reproduced evidence. The small packet isolates the same projection/reconstruction failure reproducibly without relying on an unstable full-sphere trajectory.

Physical particle mass remains conserved; no marker is transferred to spray or deposited-liquid inventory in these tests. The recovered **0.15% density-integral error** and remaining **16.6% geometric-isosurface-volume error** are separate historical reconstruction results. They are neither recalculated nor fixed by this impact experiment.

## Execution and performance limits

Executed with Node 24.19.0 ES modules, Chromium 154.0.8037.57, Linux AMD EPYC 9V74, and **SwiftShader**, not an RTX GPU. Offscreen compute/readback succeeds; no new native canvas-presentation or visually credible rupture claim is made. No graphical complexity is added after the failed physical gate.

Queue-completion timings include CPU encoding plus software-GPU execution/wait, exclude readback/accounting, and are **not GPU timestamps or RTX runtime estimates**. No warm-cache production throughput claim is made. In the recorded rest control, baseline mean/median/p95 was approximately 45.05/46.60/48.80 ms per step; the safeguard was 103.08/102.20/117.20 ms. It adds hundreds of dispatches and fails correctness anyway. Full distributions and failed-attempt timing are retained in `controlled.json`. Diagnostic per-stage readback timings are not usable runtime benchmarks. No performance improvement is claimed.

## Reproduce from repository root

Uses existing Playwright and system Chromium; no new dependencies:

```sh
P=research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/liquid-rebuild
node --test "$P/initial.test.mjs" "$P/recovery/accounting.test.mjs" "$P/impact-energy/impact.test.mjs"
node "$P/impact-energy/minimal.mjs"
node "$P/impact-energy/controlled.mjs"
node "$P/impact-energy/controlled.mjs" --original
node "$P/impact-energy/assess.mjs"
node "$P/impact-energy/assess.mjs" --require-physical-pass # deliberately exits 1
```

`controlled.mjs --original` exercises the **uninstrumented default shader** for rest and ground. Optional `probe.mjs --smoke` checks compilation/one accepted safeguarded rest step; `probe.mjs` and `--violent` reproduce the bounded sphere searches. `--local-rise` enables per-stage replay at the first >2% +0.01 J local rise. These probe thresholds are capture triggers, not acceptance tolerances. Regeneration overwrites only this experiment's results; copy them before comparing captures. Set `CHROMIUM_EXECUTABLE_PATH` if needed. The scripts serve localhost themselves. Do not run timing captures concurrently.

The complete laboratory Node regression suite plus new impact fixtures passes **61 software tests**. This is explicitly compatible with **physical impact acceptance FAIL**. `assess.mjs` preserves that failure and validates rejected-state rollback.

## Production decision

**Do not promote or extend this live PBF pilot.** The one targeted correction fails energy acceptance and finer/resolution behavior is not robust. Preserve recovered rest/ground and existing balloon effects. [HYBRID-NEXT.md](HYBRID-NEXT.md) and [hybrid-bake-contract.json](hybrid-bake-contract.json) prepare one physically simulated offline bulk-motion experiment, GPU playback, inherited-velocity spray and mass-accounted world deposits, independent of Blender. That alternative is **not yet baked, rendered or validated**. The existing Blender initialization crash is a separate environment issue; it was not retried or “fixed” here.
