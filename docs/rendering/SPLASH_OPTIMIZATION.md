# Splash Laboratory optimization audit

Baseline: `a53e272` (`verlet_gpt_v24_vehicle_liquid`), preserved on
`baseline/splash-v24-a53e272`. Development: `verlet_gpt_v25_splash_optimization`.
This experiment changes only laboratory rendering, diagnostics and tests. It does
not merge into or change simulator vehicle physics, gameplay paint, or artwork.

## Findings and implementation decisions

| Subsystem | Finding | Decision |
| --- | --- | --- |
| Membranes | Indexed polar mesh with three procedural position evaluations per vertex for normals. Perforation uses seeded FBM; a zero-coverage fragment still ran the full optical model. | Keep successful topology and motion; skip optical work at zero coverage, after computing derivatives in uniform control flow. |
| Filaments | Analytic branching curves remain cheap in memory, but repeat root calculations. Endpoints and landing are approximations, not a connected mass-conserving fluid. | Preserve geometry; prioritize measured larger costs. |
| Droplets, splashlets, shadows, deposition | Several passes independently reconstruct the same analytic ballistic state; six billboard vertices repeat calculations. Splashlets also repeat parent trajectories. | Tested a shared compute cache; rejected it after inconsistent end-to-end gains. Keep analytic trajectories and stable indices. |
| Asphalt | Three seeded noise bands, road markings and vignette recomputed across the entire screen on every frame despite a fixed road/view. | Cache only the expensive scalar grain in a screen-sized `r16float` texture. Invalidate for backing dimensions, projection scale, camera position and seed. Dynamic puddles, shadows and car remain live. |
| Compositing | Once airborne liquid disappears, the full scene still renders offscreen and is copied through a fullscreen blit. | Render directly to the presentation target outside the airborne interval. Retain the refraction source for backward scrubbing. |
| Puddles/drying | World-space deposition is already cached after settlement and reconstructed exactly on backward seeks. Good existing architecture. However, even fully evaporated water attenuated the substrate by water Fresnel. | Preserve deposition and drying fields. Remove the absent water interface when dry; bypass atlas-gradient reads and wet BRDF work for dry residue. |
| Vehicle wetness | Analytic car-local film, beads and runoff with no frame-history dependency; surface coverage is a coarse proxy. | Preserve material and contact geometry; move expensive car shading out of the fullscreen fragment shader into a bounded quad. |
| CPU | One uniform upload and bounded pass encoding; no per-frame CPU particle simulation. | Keep this division. Add diagnostic pass timing rather than moving work back to JavaScript. |

## GPU execution and ownership

The main cost was fullscreen execution of the expensive car material, even
though the vehicle covers a small part of the view. The road/puddle pass now omits
that material. A bounded car quad evaluates the original combined compositing
locally, preserving body alpha, balloons and highlights. It reconstructs UVs from
actual pixel centres: interpolating quad UVs introduced subpixel snapping errors
in an early prototype. A one-pixel guard band preserves the silhouette. The
original combined pipeline remains available for missing artwork and regression
comparisons.

The static asphalt grain cache costs two bytes per backing pixel: up to 2.8 MB,
4.8 MB, or 8 MB at the performance/balanced/high pixel caps. These are decimal
texture payload bounds, not measured driver VRAM. Cache invalidation includes
backing dimensions, projection scale, camera position and seed. Road colour,
markings and vignette remain inexpensive live calculations. Dynamic material
controls and time do not invalidate the cache. Resize destroys replaced textures;
disposal and initialization failure release owned resources.

The scene-refraction texture remains allocated for allocation-free backward
seeking. Settled frames use two draws (ground and bounded car) in one render pass,
instead of the previous two draws in two passes with a fullscreen blit. Airborne
frames retain refraction and add one bounded car draw. Particle counts, mesh
detail and quality resolution caps are unchanged. There is no new compute
pipeline or per-frame CPU particle simulation.

`getStats()` reports dispatch count, cache rebuild count and owned texture/buffer
payload bytes. Optional GPU timestamps remain sparsely sampled in the application.
Owned bytes exclude driver alignment, compiled pipelines, browser presentation
surfaces and transient command storage; they are not total VRAM.

## Optical correction

When water has evaporated, there is no water/air interface to reflect incident
light. The previous shader still multiplied dry, unstained asphalt by
`1 - waterFresnel`. The revised shader applies that factor according to remaining
wet coverage, and returns dyed substrate alone once both standing water and
wetness are zero. Setting both residue controls to zero now restores the dry
surface (within display conversion rounding). Dye retention, absorption and
all wet-material constants remain unchanged.

## Alternatives evaluated or deferred

- **Full fluid simulation:** not justified for a deterministic single-event lab;
  adds state reconstruction, compute and memory costs without a demonstrated
  benefit to the existing look. Not implemented.
- **Lower resolution or reduced droplet counts:** would trivially improve timings
  but change visual detail. Existing quality presets and particle counts retained.
- **Caching dynamic puddle colour:** rejected in the design review because drying,
  light response and optical controls would require frequent invalidation or
  cause stale shading. Only static asphalt is cached.
- **RGB8 asphalt cache:** not selected; quantizing substrate before absorption can
  introduce avoidable banding. The scalar half-float cache keeps the optical
  input precise without storing a full RGBA colour texture.
- **Particle compute cache:** implemented and visually verified, then rejected. At
  high quality, peak fenced median was 1679 ms with compute versus 1676 ms with
  analytic reconstruction; landing was 1734 versus 1785 ms. The small, inconsistent
  end-to-end benefit did not justify another 288 KB buffer, pipeline and dispatch.
  These are software-GPU experiment results, not RTX measurements.
- **Particle compaction / indirect draws:** worth measuring at much larger counts,
  but current counts are small and compaction adds scans/atomics and ordering
  concerns. Existing particles retain stable deterministic indices.
- **Order-independent transparency / multilayer refraction:** deferred. Current
  premultiplied optical compositing absorbs overlapping layers approximately;
  every layer samples the same underlying scene. A replacement needs separate
  optical comparisons and additional render targets, not an unmeasured rewrite.

## Remaining limitations, prioritized

1. Run the benchmark on the actual RTX 5090/browser configuration. Shader occupancy,
   cache efficiency, memory bandwidth, native presentation and high-refresh frame
   pacing cannot be established with a software adapter.
2. The splash is not volume conserving. Membranes, filaments, droplets, deposition
   and body wetness share a visual event but do not exchange measured liquid mass.
   Improving this requires a coordinated emission/deposition model, not merely a
   different BRDF.
3. Vehicle contact is a local geometric proxy. It does not model full 3D collision,
   occlusion or conserved runoff into ground puddles. Wheel spray remains deferred
   because the scripted vehicle stops near the event.
4. Droplet billboards have approximate curvature/refraction and a stylized elongated
   silhouette; membrane perforations do not physically shed all missing liquid.
   Preserve the current look until an alternative demonstrates a better slow-motion
   sequence at comparable cost.
5. Deposition resolution limits small isolated pools at high zoom. Footprint floors
   prevent disappearance but are not physical droplet-volume conservation.
6. Lighting uses a fixed virtual luminaire and approximate environment rather than
   scene geometry. Ground colour now returns correctly to dry substrate, but the
   entire pipeline is still an artistic optical approximation.

## Reproducing validation

Serve the repository, then use the existing Playwright/Vitest workflow. For an
isolated offscreen benchmark:

```sh
CHROMIUM_EXECUTABLE=/usr/bin/chromium node scripts/benchmark-splash-lab.mjs \
  --url http://localhost:8000 --quality balanced --samples 9 \
  --output /tmp/splash-benchmark.json
```

Use `--backend hardware` with a Chromium executable that actually selects the
hardware adapter. Verify the adapter recorded in the output. The test replaces
native presentation with a readable offscreen target; even hardware runs do not
measure browser compositor/presentation latency or monitor FPS. `--phases peak,wet` narrows a run.

The benchmark requests dense pass timestamps, waits for GPU completion and maps
timestamp data asynchronously. These waits are diagnostic-only. CPU encoding,
completed-frame latency, and per-pass execution are reported separately. Warmup
frames are excluded. Do not equate CPU command-submission time with GPU work.

## Measured results

Chromium/SwiftShader offscreen, balanced preset, seed 1337, 1440 × 1000 viewport,
1143 × 795 backing target. Nine samples per phase after two warmups; fixed time
sequence advancing 2 ms per sample. Runs were sequential without competing GPU
work. Values below are milliseconds, not display FPS.

| Phase | Baseline completed median | Optimized A / B median | Baseline / optimized A scene timestamp | Optimized A CPU encoding |
| --- | ---: | ---: | ---: | ---: |
| approach | 705.1 | 209.7 / 187.1 | 694.0 / 181.5 | 0.4 |
| peak | 1054.7 | 577.2 / 550.9 | 730.4 / 229.2 | 0.2 |
| landing | 1099.6 | 597.6 / 579.5 | 733.5 / 225.2 | 0.2 |
| wet | 720.8 | 208.5 / 209.8 | 702.0 / 193.1 | 0.2 |
| drying | 728.4 | 211.0 / 206.9 | 700.9 / 192.2 | 0.3 |
| dry | 731.4 | 196.7 / 199.1 | 704.9 / 157.9 | 0.2 |

Raw results, including p95, adapter identity, resource payloads and individual pass
timestamps: [baseline](splash-optimization/control.json),
[optimized A](splash-optimization/optimized-a.json),
[optimized B](splash-optimization/optimized-b.json). No resource allocations were
added during any sampled phase. This does not measure long-running browser VRAM.

The scene pass improves substantially on this software adapter. Airborne and
deposition pass costs remain similar, with small timing regressions/noise in some
phases. CPU encoding remains around fractions of a millisecond; these samples do
not demonstrate a meaningful CPU improvement. Cache construction and shader
compilation are excluded from warmed measurements. More pipelines increase
initialization work; camera/seed changes require one cache rebuild.

No RTX 5090 timing, occupancy, hardware bandwidth, native frame pacing, 1% low
display FPS or hardware memory consumption was measured. These results establish
a local software-GPU improvement only. Hardware validation remains necessary.

## Visual comparisons and validation

Matched seed 1337, settings and camera at 0.75, 1.25, 1.85, 5, 18 and 45 seconds;
also peak and settled views at 3× zoom. Render-area comparisons differ by at most
one 8-bit channel level, with identical deposition-atlas hashes throughout.
[Pixel comparison data](splash-optimization/visual-comparison.json).

| Stage | Before | After |
| --- | --- | --- |
| Peak | [image](splash-optimization/baseline-before-1.25.png) | [image](splash-optimization/baseline-after-1.25.png) |
| Glossy pools | [image](splash-optimization/baseline-before-5.png) | [image](splash-optimization/baseline-after-5.png) |
| Late residue | [image](splash-optimization/baseline-before-45.png) | [image](splash-optimization/baseline-after-45.png) |
| Peak, 3× | [image](splash-optimization/zoom-before-before-1.25.png) | [image](splash-optimization/zoom-before-after-1.25.png) |
| Pools/body film, 3× | [image](splash-optimization/zoom-before-before-5.png) | [image](splash-optimization/zoom-before-after-5.png) |

Additional captures cover performance quality/seed 77/5 m/s/3 L and high
quality/seed 48291/45 m/s/40 L/breakup 2, at peak, settled and late drying stages.
[Small event](splash-optimization/small-5.png),
[large event](splash-optimization/large-1.25.png). No page or shader errors occurred.
The close-ups retain curved highlights, asphalt transmission and body streaks.
They also expose existing artistic limitations: broad procedural sheets, elongated
billboard droplets and coarse body runoff. This change does not claim to solve them.

The visual improvement is deliberately subtle: correctly removing the final
water interface during drying. The major demonstrated benefit is lower rendering
cost while preserving the established appearance. The zero-dye regression checks
full evaporation at 72 seconds and backward replay, rather than treating a dark
dye stain at 45 seconds as remaining water.

Automated validation:

- Unit suite: 162 passed across 17 files; numerical tolerances unchanged.
- Focused offscreen WebGPU suite: 20 passed, exercising actual WGSL, controls,
  presets, replay, deposition, body wetness, resize, quality changes, missing
  artwork, device loss and allocation-failure cleanup.
- Three added regressions cover cache invalidation/replay, fully dry substrate,
  and bounded-car equivalence to the combined shader at four animation times.
- Complete normal-browser suite: 44 passed, 26 capability-gated tests skipped.
  The normal cloud browser lacks a usable WebGPU adapter; the separate 20-test
  laboratory run above executes its GPU coverage with SwiftShader. Other existing
  hardware-only GPU tests remain unqualified in this environment.
- `git diff --check` passed. Production `js/` and `assets/` have no changes;
  the original feature branch and backup both remain at `a53e272`.
