# Custom Blender Mustang integration

In the existing PERFORMANCE terrain laboratory, select the 1969 Mustang and choose
**Custom Blender Mustang** under Mustang appearance. It is preferred when loading
succeeds. **Original procedural Mustang** stays available. The reference vehicle,
physics, terrain, controls, cameras, tire recording and diagnostics are unchanged.
Appearance switching changes visibility only; it never resets the laboratory.

The supplied `Mustang_Foundation_7_EXPORT_3.glb` is loaded with Three.js r160's
GLTFLoader and BufferGeometryUtils, vendored with the Three.js MIT license. Their
`three` imports point at the existing r160 vendor module; no second Three.js or
renderer is created. No CDN is needed at runtime. The GLB file is unchanged.

## Coordinates and mechanical interface

The explicit right-handed conversion is Rx(+pi/2): `(x,y,z) -> (x,-z,y)`.
Converted full asset bounds are about 4.70010 × 1.80577 × 1.31342 m. Unit scale
is retained. The body is translated to match the source and physical axle midpoints;
its ground origin is placed below the existing body COM by the declared 0.55 m
height. This is a fixed visual registration, not a physics correction.

Converted wheel centers, sorted by position rather than name, map as follows:

| Physical corner | GLB name |
|---|---|
| FL | Wheel_FR |
| FR | Wheel_FL |
| RL | Wheel_RR |
| RR | Wheel_RL |

Wheels are detached with their original world transforms baked into their render
node matrices, then centered in independent spin groups. These groups are children
of the existing authoritative hubs. Hub positions and terrain frames remain exactly
the existing ones; spin uses accepted rotor angles, front steering uses the actual
contact orientation. Body yaw/pitch/roll follows the existing chassis parent.
Suspension springs/dampers, tracks, force vectors and terrain are retained. Imported
objects bypass procedural rigid batching so moving wheels cannot be merged into
the chassis. The original procedural mesh builder is unmodified.

## Materials, resources and fallback

Original vertex positions, mesh topology, material colors/roughness/anisotropy and
texture data are retained. Missing anisotropy tangents are computed from existing
UVs; degenerate tangents receive a finite orthogonal normal basis. This reduces
r160 derivative-tangent speckling without changing paint parameters. The asset's
very glossy, anisotropic, white-sheen paint still produces strong highlights;
this is not a material-calibration exercise. X-ray uses cloned body materials and
restores their original transparency/opacity/depth-write settings afterwards.

Load errors are displayed explicitly and leave the procedural appearance visible.
Changing the selector remains possible. A view disposed during an asynchronous
load disposes the late result rather than attaching it. GLB geometries, materials
and textures are deduplicated for disposal, including detached wheels. Appearance
toggling allocates no new model and the browser test checks stable renderer geometry/
texture counters after warmup. These counters are not a full driver-memory leak proof.

## Known fit limits

The native visual wheel radius is about **0.302513 m**, while the unchanged physical
radius is **0.335 m**. Native wheelbase is about **2.715556 m**, compared with the
physical **2.7432 m**. Native wheel-center track is about **1.481350 m**, compared
with **1.49352 m** physically. We preserve the supplied wheel geometry at scale 1
and position it at physical hubs. Consequently the tires can show a roughly 1–2 cm
static clearance and the wheel-arch centers differ by about 14 mm longitudinally.
Exact mesh/contact coincidence would require a corrected export or explicitly
approved geometry/physics changes. No scaling or hidden hub displacement is used.
The existing small-angle body/terrain-wheel-frame approximations remain.

## Verification

Commands from the repository root:

```sh
node --test research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/custom-mustang.test.mjs research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/adapter.test.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/custom-glb-browser.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/browser-smoke.mjs
```

Seven Node tests passed: real GLB parsing, coordinate conversion, actual wheel
mapping, unchanged position buffers/material parameters, centered wheel pivots,
missing-wheel rejection and retained adapter/clock tests. Browser checks use actual
Chromium rendering with SwiftShader, not an RTX hardware performance claim. They
exercise starting, driving, steering, upshift, reverse request, braking, hills,
camera/state parity, imported rotor-angle parity, appearance/state invariance,
stable renderer resource counters and simulated asset-load failure. The retained
reference smoke also passed driving, terrain, tracks and handbrake checks.
Screenshots and a new run record are under `results/custom-glb-*`; historical
browser results are preserved. Visual assessment confirms the actual blue Blender
car is rendered, not the procedural red car. No physics test fixture was changed.
