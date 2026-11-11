# Single liquid-mass gate: REJECTED

**This is a failed research candidate, not the new balloon implementation.** The existing laboratory, vehicle physics, WebGL fallback, audio and prior liquid effect are untouched. No many-event integration was attempted.

The experiment implements a real GPU particle mass and captures low/moderate/violent impacts. It does not yet meet the mission's first deliverable: a physically acceptable, convincing water-balloon rupture. Finer resolution creates excess kinetic energy, and boundary reconstruction loses substantial represented volume. Tests that merely compile or stay finite do not override these failures.

## What was investigated

1. **Baked FLIP:** Blender 4.3.2 is installed with fluid support. `bake-flip.py` defines a released water sphere, fixed paddle, gravity, ground and a bounded FLIP bake. The installed Mantaflow/Python combination aborts during dependency-graph initialization with `PyImport_AppendInittab() may not be called after Py_Initialize()`. No cache or FLIP animation was produced. The exact failure is retained in `results/flip-pilot-failure.txt`. The script's surface-tension control is explicitly uncalibrated, not claimed SI N/m.
2. **Reduced GPU PBF:** a standalone WebGPU prototype runs neighbor construction, integration, density multipliers, Jacobi corrections and velocity reconstruction on the GPU. A bounded spatial linked grid replaces all-pairs traversal; maximum allocation is 4,096 particles. The tested populations are 323 and 1,229 particles. This is not Flex and is not claimed to be a faithful reproduction of the entire Macklin–Müller method.
3. **Surface reconstruction:** the same particle mass produces a 3D density field, from which the controlled renderer integrates optical thickness and extracts an apparent surface normal. There are no separately scripted sheets, filaments, secondary droplet emitters or decorative deposits. Fragmentation and pooling in these captures are features of the particle field. A single full-scene ray pass draws the diagnostic ground, paddle and fluid; it is not integrated into Three.js or the live vehicle renderer.

FLIP could not be compared visually because its bake failed. PBF is therefore a candidate evaluated in isolation, **not a selected production approach**.

## Source inspection and limits

- Macklin & Müller, *Position Based Fluids* (2013): attempted author preprint `https://mmacklin.com/pbf_sig_preprint.pdf`; HTTP 403 from network policy. The primary paper was **not read in this environment**.
- Lund & Dalziel, *Bursting Water Balloons* (JFM, 2014): author-site access was blocked. The full publication and high-speed supplements were **not available**. The captures cannot be claimed to match that experiment. Latex stress, membrane retraction and rupture-front dynamics are absent here.
- Independently inspected [PositionBasedDynamics fluid implementation](https://github.com/InteractiveComputerGraphics/PositionBasedDynamics/blob/master/PositionBasedDynamics/PositionBasedFluids.cpp): density constraints, Lagrange multiplier denominator, pressure correction and boundary treatment. The prototype uses poly6 instead of that implementation's cubic kernel and omits its boundary-volume support. It is an independent small implementation, not copied solver code.
- Inspected the official [NVIDIA Flex manual](https://github.com/NVIDIAGameWorks/FleX/blob/master/doc/manual.html), especially **Fluids**, **Time Stepping**, and **Collision Detection**. It discusses PBF, smoothing/rest-distance trade-offs, the distinction between cohesion and surface tension, ellipsoid/screen-space reconstruction, and missed-contact ejection artifacts. No Flex binaries/code are linked into this experiment.
- Inspected the existing VerletDrift `js/shaders/liquid/material.wgsl`, `puddles.wgsl`, liquid event history and splash topology. The new optics reuse the principles of Beer–Lambert attenuation and water Fresnel reflectance; the old radial topology is not used for this pilot.

Publication-level liquid-sheet breakup and curvature-flow verification remain unavailable. Do not infer that the sources above prove the validity of this implementation. `results/sources.json` records access status and hashes of the inspected implementation documents.

## Declared mechanical model

Coordinates are SI metres with z upward. A sphere of radius 0.12 m contains approximately 7.238 L / 7.238 kg of water at density 1,000 kg/m³. This is a large balloon, not a typical small toy balloon. The released mass has a uniform initial velocity of 0.6, 4 or 12 m/s in +x. It impacts a stationary rectangular paddle and floor. This models **released water impact**, not rubber-mediated vehicle crushing.

Each equal-mass particle carries `m = rho0*V/N`. The normalized 3D poly6 kernel defines `rho_i = sum_j m W(x_i-x_j)`. Compression constraints are `C_i=max(rho_i/rho0-1,0)`. Four Jacobi iterations use `lambda_i=-C_i/(sum_j |grad C_i|² + epsilon)` and the usual symmetric multiplier correction. Positions are constrained against the floor, finite paddle and outer box; velocities are reconstructed from displacement over dt. The floor/paddle have no motion and supply no positive mechanical work in the intended physical model.

An explicitly experimental cohesion potential is `E_sigma = sigma*A_particle*sum_i(1-rho_i/rho0)`, with `A_particle=(m/rho0)^(2/3)`. Its pairwise symmetric gradient supplies the cohesion acceleration. Sigma is set to 0.072 N/m as a water-scale estimate, but this particle potential is **not a calibrated water surface-energy model** and is not the paper's full surface-tension treatment. There is no independently validated viscosity model. Fixed density iterations do not guarantee incompressibility.

The positive result is a coherent state representation: particles and their mass are not created/deleted for visual effects; no runtime CPU per-droplet simulation or synchronous readback occurs. The negative result is decisive: particle-count conservation alone does not prove constant resolved volume or correct mechanical energy.

## Optical model

A 64³ or 96³ density field uses the same poly6 kernel. Ray integration estimates thickness, with crimson absorption coefficients `[1.5,35,19] /m`, IOR 1.333 and normal-incidence reflectance approximately 0.0204. These dye coefficients are illustrative, not calibrated measurements. The controlled lighting is an analytic HDR sky/sun/softbox, not the laboratory's HDRI. Restricted refraction traces the diagnostic floor/paddle; it is not general scene refraction. It has no production depth-buffer integration or shadow acceptance.

The renderer still has coarse rims, grid/ray sampling artifacts and overly cloudy edges. It does not meet photographic/high-speed visual acceptance. A good-looking frame could not excuse the measured energy failures.

## Reproduce

From repository root with existing Node, Playwright and Chromium:

```sh
node --test research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/*.test.mjs research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/liquid-rebuild/initial.test.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/liquid-rebuild/verify.mjs --all
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/liquid-rebuild/verify.mjs --half
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/liquid-rebuild/verify.mjs --fine
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/liquid-rebuild/assess.mjs
```

**`assess.mjs` exits 1 intentionally because physical acceptance FAILS.** The unit/regression run passes 47 tests; this is software verification, not acceptance of the fluid.

The default verification explicitly requests SwiftShader. For a real GPU capture, use `--hardware --headed` and set `CHROMIUM_EXECUTABLE_PATH` if necessary. A hardware request is rejected if the adapter identifies as software/unverified. Hardware and software results must not be compared as though they were the same machine.

Example for the user's Linux/Brave setup (no automatic system or driver changes):

```sh
CHROMIUM_EXECUTABLE_PATH=/opt/brave-bin/brave node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/liquid-rebuild/verify.mjs --all --hardware --headed
```

Serve the repository root, then open `research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/liquid-rebuild/index.html`. It is clearly labeled **REJECTED PILOT**. Native canvas presentation is not certified by offscreen readback. The former laboratory's WebGL path is linked and untouched.

To reproduce the failed bake:

```sh
blender -b -t 4 --factory-startup --python research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/liquid-rebuild/bake-flip.py -- /tmp/verlet-flip-pilot 48 36 4
```

## Measurements and gate

`results/pbf-verification.json`, `pbf-half-verification.json` and `pbf-fine-verification.json` contain fixed-time states, signed momentum, kinetic energy, nominal volume and independently integrated field volume. Particle arrays stay finite in the captures, but that is insufficient.

- At 0.6 s, the represented density volume is **33–39% below nominal** in the three coarse cases; the finer moderate case is **41.7% below**. A ±10% diagnostic volume gate fails clearly. Kernels extend below the collision floor and the field does not account for that boundary support; the particle inventory survives while the visible continuous-volume reconstruction does not. No fake wet patch or rescaling is used to mask this.
- The 12 m/s coarse run reaches **about 3,039 J** kinetic energy against a conservative initial mechanical-energy upper budget of **about 560 J**. The finer 4 m/s case reaches **536 J** against **97.5 J**. These bounds allow maximum initial gravity potential and a worst-case bound on the declared cohesion potential. A stationary obstacle cannot supply the missing work.
- The coarse 4 m/s half-step result is not enough to validate the method: modest endpoint changes there coexist with the violent/finer-case failures. No convergence or passivity claim is made.

The confirmed defects are excess energy and boundary-volume loss. The suspected mechanisms are the unvalidated coupling between density projection, hard boundary projection and velocity reconstruction, plus missing boundary support. This is **not evidence that PBF in general is unsuitable**. It is evidence that this reduced implementation is not ready.

GPU timestamps cover the complete encoded batch of solver steps plus field reconstruction and rendering; they are not isolated physics timings, frame latency or presentation. CPU encoding and queue-completion waits are reported separately. First-use and shader warmup costs are not steady-state throughput. The measured device is headless Chromium / SwiftShader; **no RTX 5090 measurements or performance improvement claims exist**. Numerical results are not bit-exact across GPU atomic neighbor insertion order.

`results/controlled-comparison.png` shows three speeds at 0, 0.1, 0.3 and 0.6 s using identical cameras/materials. Those are model captures, not experimental references. The fine/half-step images are also retained. Primary high-speed footage comparison remains NOT VERIFIED.

## Decision

**Do not integrate or scale this candidate.** Neither a verified FLIP bake nor an acceptable reduced PBF rupture has passed the first gate. Preserve the working simulator. The next justified dependency is a valid single-event fluid reference: recover the primary material and obtain a working, independently inspectable FLIP bake before using it to judge/correct the boundary and energy behavior of a GPU implementation. No multi-balloon solver campaign is authorized by this result.

## Recovery follow-up

See [the restricted recovery experiment](recovery/README-recovery.md) for independent mass/surface accounting, rest-lattice normalization, swept-boundary probes and a rest/ground-only viewer. This adds a limited supported test domain; it does not change this original impact pilot's rejected status.
