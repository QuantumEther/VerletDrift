# Reference-guided scene materials — v30

Developed on `verlet_gpt_v30_reference_rendering`, starting from v29 `745ca62`.
The v28 and v29 branches, artwork, vehicle geometry, physics, controls, gameplay
paint logic, and shared airborne/puddle/body-liquid shaders remain unchanged.

The user authorized proceeding after the [initial investigation](REFERENCE_AUDIT.md)
could not identify the reported settings trigger. **This iteration does not claim
to fix that unidentified native-GPU disappearance.**

## Matched visual comparisons

All pairs use identical saved vehicle/wheel positions, actual skid trajectories,
collision data, camera, lighting and resolution. The fixture was recorded from the
actual simulator during a handbrake turn and balloon collision: 655 tire segments,
247 with picked-up pigment, one liquid impact, final speed 11.49 m/s.

| Scene | v29 | v30 |
|---|---|---|
| Default 20 px/m, impact | [Before](reference-rendering/normal-before/impact.png) | [After](reference-rendering/normal-after/impact.png) |
| Default 20 px/m, settled liquid | [Before](reference-rendering/normal-before/wet.png) | [After](reference-rendering/normal-after/wet.png) |
| Close view, warm low sun, impact | [Before](reference-rendering/close-before/impact.png) | [After](reference-rendering/close-after/impact.png) |
| Close view, warm low sun, settled liquid | [Before](reference-rendering/close-before/wet.png) | [After](reference-rendering/close-after/wet.png) |
| Late residue, close view | [Before](reference-rendering/close-before/residue.png) | [After](reference-rendering/close-after/residue.png) |

These are actual simulator WGSL renders through an offscreen test target, not
mockups. They replay a **frozen driving snapshot** at different liquid ages; they
are not screenshots of four successive car positions. Three framing balloons are
explicit fixtures. Smoke and motion blur are disabled for these comparisons.
The `dry` frames retain the snapshot's already-recorded pigment tracks.

## What changed and why

### Asphalt

The previous 42/m and 115/m noise was largely filtered out at ordinary zoom.
Early experiments with larger smooth noise looked like camouflage and were rejected.

The final material uses irregular mineral chips in a warmer, darker binder, with
low-contrast broad wear, restrained surface normals and a weak rough dielectric
reflection. Two world-space aggregate scales preserve some detail at the default
20 px/m as well as close views. A bounded nearest-cell search generates chips;
subpixel octaves fade to their mean and skip the search once unresolved. There are
no camera-relative texture coordinates or per-frame random noise.

### Tire marks and wet tracks

Rubber retains its actual world-space segment geometry, physical tire widths,
source opacity and optical-density partitioning across segment joins. Ground-fixed
porosity varies coverage, irregular boundaries break up the edges, and symmetric
longitudinal grooves remain aligned with the stroke instead of forming beads at
every short segment.

Coloured gameplay tracks get a restrained water-film reflection with the existing
lighting direction, water IOR and GGX specular geometry. Ordinary rubber stays
matte. Film strength follows the existing pigment opacity/depletion; it introduces
no independent clock, paint state or new water transport. Normal variance broadens
subpixel highlights. This is an optical proxy, **not** measured water thickness or
a new wet-tire simulation. Existing liquid puddles still composite over the real
road/tracks using their unchanged transmission, drying and residue model.

### Vehicle grounding

Two rounded, rotated body footprints replace six circular body-shadow blobs.
The footprint uses the artwork's calibrated bounds and offset, not a substituted
physical chassis. The directional component follows the shared light and softness;
a tighter contact component and four compact wheel contacts remain underneath.
The vehicle artwork itself is unchanged. Canvas retains its functional existing
shadow implementation; the new shadow shape is specific to WebGPU.

## Architecture and cost

Changed production files:

- `js/shaders/environment.wgsl`: stable mineral aggregate and dielectric reflection helpers.
- `js/shaders/background.wgsl`: multiscale asphalt material.
- `js/shaders/skid-vector.wgsl`: coverage, grooves and coloured-track film shading.
- `js/shaders/surface-objects.wgsl`: rotated body shadow support.
- `js/gpu-renderer.js`: shadow instances anchored to the existing artwork envelope.

No new textures, GPU buffers, render passes, compute dispatches, readbacks or
per-frame CPU particle updates were added. Body shadow instances decrease from
six to two. Existing shadow-instance RGB slots carry rotation for shadow-only
kinds; their fragment material supplies the shadow colour.

At 960×720, the matched settled-liquid captures report **40,308,776 resident bytes
and 10 draw calls** for both versions. Three framing balloons give 13 versus 9
shadow instances. These are application-owned resource counters, not total driver
or browser GPU memory measurements.

Asphalt and tire shading use additional ALU work per covered pixel. Aggregate
searches are bounded and skipped below resolution, but this is not a zero-cost
change. No native RTX 5090 timing is available in the cloud environment.
CPU command submission and CPU-observed queue completion must not be described as
native GPU execution time. Earlier timing samples taken alongside test runs were
not used to claim a performance improvement.

## Isolated software-backend timing

After the suites finished, ran the same frozen 960×720, 20 px/m, settled-liquid
scene sequentially on v29 and v30: four warmup frames, 20 measured frames each,
no screenshot or readback during the measured loop. Each iteration waits for
`queue.onSubmittedWorkDone()` to bound the work being observed.

| CPU-observed metric | v29 | v30 |
|---|---:|---:|
| Encoding median (ms) | 0.40 | 0.40 |
| Encoding p95 (ms) | 0.70 | 0.50 |
| Submit-to-completion iteration median (ms) | 677.75 | 689.65 |
| Submit-to-completion iteration p95 (ms) | 746.80 | 844.50 |

The completion interval starts before encoding and includes software GPU work,
queue waiting and scheduling. It is **not** a native GPU execution measurement,
interactive frame time or a 5090 benchmark. The small sequential sample does not
establish a hardware performance improvement. Software completion median increased
about 1.8%, and p95 increased about 13.1%; added shader work and host scheduling
may both contribute. This is an observed cost, not evidence of a native speedup. No test suite or other capture job
ran concurrently with this pair. Raw [before](reference-rendering/timing-before.json)
and [after](reference-rendering/timing-after.json) observations are retained.

## Validation

- Unit suite: **169 passed, 20 files**.
- Focused GPU regression run: **30 passed**.
- Full browser suite: **96 passed** (9.4 minutes), including Canvas fallback,
  fault handling, UI/input, scale alignment, sprite fallback, smoke, liquid,
  laboratory lifecycle, braking, clutch and reverse.
- Together with the additional live-settings case, **97 distinct browser tests passed**.
- Additional full-main-loop live-settings test: **1 passed**. Uses real drifting,
  collisions and DOM bindings with a real GPU texture target; only browser swap-chain
  presentation is replaced to avoid the known headless software-backend failure.
- New contact-shadow test checks that the anisotropic footprint rotates with the
  vehicle without resource growth.
- Matched default/close captures cover airborne, settled and late residue stages;
  all report no GPU validation or liquid initialization errors.
- No numerical tolerances or physics fixtures were weakened.

The original v29 disappearance trigger remains unknown. Offscreen control tests
and the new integrated main-loop test pass. This does not certify native browser
presentation, driver behaviour, or the previously reported RTX issue.

## Reproducing comparisons

Run the existing development server and use Playwright/Chromium from the prepared
workspace. No separate checkout or worktree is required:

```bash
node scripts/capture-reference-rendering.mjs \
  --fixture docs/rendering/reference-rendering/driving-fixture.json \
  --zoom 20 --output /tmp/v30-capture

node scripts/capture-reference-rendering.mjs \
  --ref 745ca62 \
  --fixture docs/rendering/reference-rendering/driving-fixture.json \
  --zoom 20 --output /tmp/v29-capture
```

`--ref` substitutes the five historical rendering sources through test routing;
it does not switch or reset the checkout. For close views add `--zoom 58 --height 900
--preset sunset`. `--samples 20` optionally records CPU encoding and CPU-observed
queue-completion samples after warmup, without instrumentation readbacks. The
capture setup forces SwiftShader and is unsuitable for RTX performance claims.
`CHROMIUM_EXECUTABLE` and `--url` override the browser and development server.

Use the existing Environment Lighting controls and presets in the actual app.
The Crimson balloon palette is useful for comparison with the reference; Colorful
remains available. No new interface parameters were added.

## Scope and remaining limits

The reference's material separation, fine asphalt detail, textured tire coverage,
and directional grounding are approximated more closely. This remains a 2D scene
with artwork and procedural optical proxies; it is not a photorealistic 3D road.
No road mesh, lane markings, real reflection environment, occlusion ray tracing or
new splash geometry was added. Wet-track film is coupled to existing pigment
opacity rather than a separate thickness history. GPU/native-driver performance,
long-run memory and the unknown disappearance need validation on the target system.

The established liquid renderer was deliberately preserved. Its broad membrane
style remains different from the reference's more fragmented photographed sheets.
No stable-branch merge is part of this work.
