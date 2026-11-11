# Fluid recovery: limited rest/ground recovery; impact mode remains rejected

Source base: `e805358`, branch `PERFORMANCE_2`. Everything here remains inside the isolated fluid pilot. The vehicle laboratory, its existing balloon effects, drivetrain, audio and WebGL fallback are unchanged. The original acceptance record remains **REJECTED**.

## What changed

- Added independent physical accounting before changing the equations: particle inventory, two density-based volume estimates, clipped-kernel integrals, geometric isosurface volume, exclusive mass classifications, energy, momentum, maximum speed, density residual and penetration.
- Added a GPU correction-energy ledger and force/boundary switches. It distinguishes force kicks, density corrections, collision projections, moving-boundary work and numerical losses. Readbacks are validation-only.
- Derived a constant discrete reference density from the rest lattice's kernel quadrature. This removes unintended initial overpressure without changing particle mass, physical density, positions or velocities. No energy reset or corrective force was added.
- Separated physical floor/paddle boundaries from the spatial hash box. Added full relative-motion swept-box collision rather than the former x-face-only test. Side entry, top entry, fast traversal and moving boundaries are tested.
- Added an opt-in floor-aware reconstruction and continuous optical-thickness path. The larger reconstruction window and floor image recover the kernel mass that was clipped away. These are renderer changes; they do not repair solver energy.
- Added a restricted rest/ground viewer. It explicitly disables surface tension and viscosity, uses 16 bounded density iterations, and stops at a 0.4 s viewer horizon. Longer one-second numerical tests are headless; inviscid spreading eventually leaves the viewer's fixed region.

No velocity clamps, energy resets, artificial viscosity, vorticity injection or hidden substeps were introduced. The original impact settings and failure records are retained.

## 1. Physical inventory versus reconstructed volume

The pilot never deleted particles. In the representative captured moderate-impact state:

| Quantity | Value |
|---|---:|
| Particle count | 323 |
| Total particle mass | 7.238229 kg |
| Nominal rest-density volume, `M / 1000 kg/m³` | 7.238229 L |
| Original GPU density-field integral | 4.621110 L |
| Independent continuous integral inside the old box | 4.485113 L |
| Kernel support below the floor | 2.034663 L |
| Support outside the other box faces | 0.718453 L |
| GPU sampling/precision difference from continuous integration | +0.135997 L |
| Original enclosed `rho/rho0 = 0.35` isosurface | 3.122352 L |

The missing 2.617119 L closes as **floor clipping + other box clipping − sampling/precision bias**. `results/acceptance-recovery.json` contains the same decomposition for moderate, violent and finer cases. An independent Gaussian quadrature integrates the compact kernel over the box; the floor cap also has a closed-form polynomial integral. Software tests check these against whole-space normalization and symmetry. Half-float quantization alone is far too small to explain the original deficit; boundary clipping and spatial quadrature dominate.

`M/rho0` is the nominal volume under the incompressibility assumption, not proof that the failed states were incompressible. `sum(m/rho_SPH)` is also reported, but is biased at free surfaces and isolated particles. Neither should be mistaken for a measured geometric surface volume.

There are no secondary emitter or puddle reservoirs in this pilot. The same particles carry all mass. Accounting tags particles exclusively as ground-band mass, airborne mass in the largest connected component, or detached-component mass. The ground-height band is a diagnostic classification, not a claim that the fluid has settled. These masses sum to the inventory; no mass is counted twice or transferred into decorative patches.

### Reconstruction repair

The **same saved particle positions and velocities**, without a simulation step, produce:

| Representative failed snapshot | Original | Floor-aware, expanded field |
|---|---:|---:|
| Density-integral volume | 4.621110 L | 7.227491 L |
| Error relative to nominal inventory volume | −36.16% | −0.15% |
| Enclosed 0.35-isosurface volume | 3.122352 L | 6.033806 L |
| Geometric isosurface error | −56.86% | −16.64% |

At matching 0.025 m voxel spacing, expanded-domain reconstruction gives 7.258924 L (+0.286%); refining it gives the value above. Thus the improvement is not solely a higher-resolution comparison. A floor-image kernel restores the fraction clipped by the physical floor. It adds no stored particles or physical mass. Other computational faces are **not** treated as reflecting walls; the reconstruction window is enlarged to contain the support. Query-cell clamping finds valid particles in border buckets outside the original hash range.

A known 3 L ground slab reconstructs to 2.998718 L at 128³ (−0.043%). A known 0.320 L thin sheet originally reconstructed to 0.167770 L and produced **zero changed pixels** because the optics required peak density above 0.35. Floor-aware reconstruction gives 0.318624 L, and continuous thickness gives 12,059 changed pixels in the same controlled view. Particle arrays are verified unchanged.

**Geometric reconstruction is still partial.** A fixed 0.35 isosurface remains absent for the thin sheet despite its nonzero mass and optical visibility. `surfaceVolume` measures a marching-tetrahedra surface from the sampled field, capped at the region boundary. The volumetric optical path has no unique sharp geometric surface; it must not be presented as exact volume-preserving liquid geometry. Screenshots in `results/reconstruction-*` demonstrate the rendering distinction, not photographic realism. Floor correction does not yet provide general body-fitted reconstruction around the finite paddle; kernel support inside that solid is reported separately.

## 2. Energy and instability diagnosis

The readback reports `K`, gravity potential and the declared cohesion potential separately. Physical viscous dissipation is **zero** because no viscosity model exists. Vorticity confinement and artificial viscosity are absent in the shader, hence disabled by construction. The tested cohesion force can be switched off independently.

For each correction, velocity reconstruction contains `deltaPosition / dt`, so its kinetic change includes a quadratic term proportional to `|deltaPosition|² / dt²`. The ledger measures these terms rather than treating every positional correction as physical work.

Confirmed findings:

1. **Rest-state inconsistency.** The old constraint used continuum density 1000 directly, while the sampled rest lattices measure 1000.943086 and 1007.035510 kg/m³. The resulting initial pressure corrections manufactured motion. The repair uses `rho_lattice = m * sum W(reference lattice)` in the constraint and its gradient. This is a constant quadrature normalization, consistent with the rest-distance-based approach described in the [Flex manual](https://github.com/NVIDIAGameWorks/FleX/blob/master/doc/manual.html#fluids). It is not a fitted handling parameter or a time-dependent density target. Physical density remains 1000 and the mass inventory remains 7.238229 kg. The optional, uncalibrated cohesion diagnostic uses the shader's reference-lattice area estimate `(m/rho_lattice)^(2/3)` with the physical density in its deficit term; the energy accounting follows that exact definition. Supported rest/ground tests use sigma=0.
2. **Invisible walls.** Clamping to the spatial hash extent turned a computational region into an unrendered rigid container. The restricted physical model uses only declared floor/paddle boundaries. Removing the hidden walls improves the violent case but does not fix every impact failure.
3. **Incomplete collider geometry.** The old paddle code checked x-face crossings only. A marker entering from a side or top penetrated about 38 mm. A fast side traversal was missed entirely. Full relative-motion slab sweeps now stop those probes at the appropriate face, with penetration below 1e-6 m. The moving-boundary test also stops penetrating.
4. **Under-resolved nonlinear projection.** Four density iterations can produce displacements much larger than the 0.05 m kernel support, then convert them into very large velocities. A small final density residual does not prove that the step was valid: particles may already have been launched apart. More iterations improve some cases, but the impact path is not uniformly stable under timestep refinement.

A remaining refined impact with swept collision and 16 iterations reaches 3,895.93 J kinetic energy. Its ledger records about **+4,097.50 J from density corrections**, −257.35 J from collision projections and −2.13 J from force kicks. The maximum positional correction is 0.1717 m at a 1/960 s step. This explains the artificial energy source; it does not make it physically acceptable. Cohesion contributes only about −0.014 J in that case.

The legacy/failing configurations are retained in the reports. No energy clamp is used to make them pass. Catastrophic legacy ledgers can subtract terms near 1e11 J in float32 and lose net-energy precision; the smaller refined failure quoted here closes its kinetic ledger to about 0.00017 J. A failed high-energy run is not used to claim accurate physical heat.

## 3. Minimal physical results and tolerances

| Test | Measured result |
|---|---|
| Rest, 323 particles | K reduced from about 1.24e-4 J to 1.3e-10 J |
| Rest, 1,229 particles | K reduced from about 0.266 J to 6.8e-9 J |
| Repeated rest initialization | Stable within the declared float-precision tolerances |
| Uniform translation, no force/contact | Momentum and kinetic energy agree within float-integration tolerance |
| Gravity without contact | Energy error agrees with the known symplectic-Euler expression; about −0.145 J at 0.1 s |
| Ground-only runs | Finite, bounded energy; no large positive mechanical-energy source in the tested 0.4–1 s interval |
| Moving paddle, 16 iterations | ΔE ≈ +17.206 J with ≈ +25.988 J supplied by the moving wall; signed relative-contact heat is recorded |
| Ground refinement, 1/240, 1/480, 1/960 s | Endpoint K ≈ 9.934, 10.545, 10.885 J; successive differences decrease |

The selected gates use rest K <1e-6 J (RMS speed about 0.53 mm/s for this inventory), COM drift <1e-5 m, maximum positive density residual <0.1% relative to the discrete reference, penetration <1e-6 m, and kinetic-ledger closure <0.001 J. These bounds are well above float roundoff but far below the failed impact energies. Freefall is compared with its discrete analytic result, not exact Hamiltonian conservation. Dissipative PBF pressure/contact behavior is allowed and labeled; it is not assigned a fictitious calibrated viscosity.

The layer can continue spreading horizontally because the minimal model is inviscid and has no surface tension. Bounded energy does not imply a settled real-water puddle. After it becomes thinner than the particle spacing, the method is under-resolved. The 1 s cases therefore establish numerical bounds, not calibrated thin-film physics.

**Refinement is not complete for impacts.** The endpoint changes and failed half-step impact prevent a general convergence claim. `controlled-normalized-only.json`, `impacts-normalized-only.json` and the corresponding 16-iteration records preserve intermediate diagnostic stages. The stricter full-impact acceptance remains rejected.

## 4. Reproduction

Run from repository root with the existing Node/Playwright/Chromium installation:

```sh
node --test research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/*.test.mjs research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/liquid-rebuild/initial.test.mjs research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/liquid-rebuild/recovery/accounting.test.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/liquid-rebuild/recovery/controlled.mjs --minimal
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/liquid-rebuild/recovery/boundary-cases.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/liquid-rebuild/recovery/reconstruction.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/liquid-rebuild/recovery/assess.mjs
```

The unit/regression run passes **55 tests**. The optional cohesion potential is derived from the actual shader area estimate; `update-cohesion-accounting.mjs` records the linear correction to earlier derived potential fields without changing measured positions, velocities, kinetic or gravitational energy. The physical assessment reports **LIMITED RECOVERY**, not full acceptance. `assess.mjs --require-impacts` exits 1 deliberately because the impact path remains rejected. Old four-iteration diagnostic failures remain visible in the report and do not become supported configurations merely because the restricted rest/ground gate passes.

Additional controlled investigations, when needed:

```sh
# Instrumented old settings; then constant rest-lattice normalization and swept boundaries
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/liquid-rebuild/recovery/controlled.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/liquid-rebuild/recovery/controlled.mjs --repair
# Different fixed steps / iteration budgets; impact failures remain explicit
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/liquid-rebuild/recovery/controlled.mjs --refine
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/liquid-rebuild/recovery/controlled.mjs --verify16
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/liquid-rebuild/recovery/controlled.mjs --collision
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/liquid-rebuild/recovery/controlled.mjs --verify-boundary
```

These scripts regenerate recovery reports only. Preserve a copy of that folder before rerunning if comparing executions. GPU atomic insertion order is not bit-exact; highly unstable impact cases can diverge substantially. The frozen `baseline-pbf.wgsl` has SHA256 `fb2f8552f5f0865826c21f546b58f50bbbf6774c35eeea296746310cb5085a02`, matching the shader at `e805358`. `audit.mjs --baseline` replays that shader; `audit.mjs` uses the instrumented path.

For the viewer, serve the repository root and open:

`research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/liquid-rebuild/recovery/minimal.html`

The controls initialized and completed GPU work in the automated offscreen test (`minimal-browser.mjs`). Native canvas presentation failed in this cloud environment with **“A valid external Instance reference no longer exists.”** The test therefore uses the explicit `?presentation=offscreen` mode; that is not presented as screen-presentation success. The normal URL still requests native WebGPU. There is no silent WebGL fallback. A fixed display region is used, so the viewer stops at 0.4 s while headless numerical tests can run longer.

All captures and completion waits here use headless Chromium / SwiftShader. Completion wait includes queue/scheduling time and is not a GPU timestamp, physics-throughput measure or RTX result. For a real device, `controlled.mjs --minimal --hardware --headed` accepts `CHROMIUM_EXECUTABLE_PATH`; it rejects a software/unverified adapter. **No RTX performance, speedup or real-time readiness claim is made.** Sixteen density iterations cost more work than four; no claim is made that this expense meets the intended runtime budget.

## 5. Blender and the hybrid alternative

`blender-minimal.py` creates one cube, assigns a liquid-domain modifier and requests a dependency-graph update. It contains no flow geometry, collision settings or bake parameters. Blender 4.3.2+dfsg-2 with Python 3.13.5 aborts at that update with `PyImport_AppendInittab() may not be called after Py_Initialize()`. The log is retained in `results/blender-minimal-failure.txt`. This isolates the fault to fluid/Python initialization in the installed runtime; it does not establish a defect in the FLIP equations. No unrelated simulation parameters were cycled. A compatible Blender/Mantaflow/Python build is required before the bake can be evaluated.

The hybrid alternative remains plausible but unverified:

- Bake the coherent phase with an actual physical solver and retain mass, velocity and boundary-work records. A mesh sequence alone is not sufficient accounting.
- Derive secondary particles from that coherent state, subtract their mass from the coherent inventory, and inherit momentum. Do not superimpose an independently invented spray.
- Deposit actual arriving mass into world-space finite-volume cells, with `sum(area*depth)=depositedMass/rho`. Track evaporation separately if drying is added. Dye residue is not remaining water mass.
- Do not reuse a flat-ground bake as though it automatically handles arbitrary terrain. Do not rescale size, time and impact velocity independently without checking the dimensionless dynamics.

No working FLIP asset exists in this environment, so neither appearance nor runtime cost can be compared honestly against it. PBF is retained only for the restricted minimal experiment. General rupture, settling optics, many simultaneous balloons and laboratory integration remain blocked by the unresolved impact instability, surface reconstruction limitations and missing hardware/reference measurements.
