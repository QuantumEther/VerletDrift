# Rendering overhaul: actual delivery status

The v21 branch is an incremental development checkpoint, **not the completed
next-generation rendering overhaul**. Correctness tests do not establish artistic
quality or native hardware speed. The requested substantial visual transformation
has not been fully delivered.

| Original brief | Delivered | Remaining / limitation |
| --- | --- | --- |
| 1, 3: GPU architecture and audit | CPU/GPU map, source audit, controlled baseline captures, prioritized architecture | Native hardware qualification |
| 2: Preserve simulation | Rendering-only changes; protected physics/geometry/art/UI retained | Shared smoke RNG/pool saturation replay equivalence not proven |
| 4: Skid marks | Resident vector geometry, analytic AA, caps, optical-density joins, filtered grain; removed 108 MiB map texture | Native profiling, stronger art direction/edge variation; no tiled accumulation texture |
| 5: Paint | Instanced splats, procedural edges, pigment variation and wet highlight; corrected layer order | No GPU-resident persistent paint accumulation or new surface-aging model; CPU still packs instances |
| 6: Smoke/particles | Corrected state layout/timing; GPU smoke compute, persistent state, turbulence, domain-warped fractal-density billboards and approximate scattering; Canvas smoke | No volumetric smoke, scene-depth soft intersections, self-shadowing, GPU allocator/compaction or GPU spark integration; alive flags still read back asynchronously |
| 7: Ground | GPU asphalt, checker, studio and diagnostic materials; world-stable filtered noise | No physically based normal/roughness lighting; fallback retains original ground |
| 8: Lighting/compositing | Premultiplied blending, soft footprint/balloon shadows, shaded balloons, layer fixes | No unified lighting system, screen-space lighting, depth-aware smoke/vehicle compositing, HDR/color pipeline or post-processing |
| 9: Temporal quality | Simulation-time smoke updates, DPR/resolution budgets, retained existing interpolation | No new wheel/GPU interpolation, TAA, adaptive resolution or revised motion blur; 120/240 Hz unverified |
| 10: Residency | Persistent skid/smoke storage, dirty seed uploads, instancing, resource reuse, asynchronous flag recycling | Paint/sparks remain CPU-packed; no indirect draws, spatial bins or general suballocator |
| 11: Presets | Four URL-selectable resolution/detail presets | No integrated preset selector; no particle-density/shadow/post-process preset matrix |
| 12, 15: Fallback/reliability | Canvas path, init/device-loss fallback, partial-resource cleanup, allocation/resize tests | Native live presentation, resource-exhaustion and hours-long soak still unqualified |
| 13: Performance | Controlled software-adapter CPU encode/GPU-pass/completion measurements; optional GPU timestamps | Software GPU regressed materially; no native acceleration claim, full-app GPU/CPU breakdown, reliable VRAM, input latency or high-refresh results |
| 14: Consistency | Existing coordinate/state conventions, alignment regression coverage, frozen-time smoke test | Raw wheel interpolation and cross-vendor visual determinism remain limitations |
| 16: Artistic coherence | Initial ground/material/mark/shadow treatment | Full visual direction and requested immediately noticeable leap remain incomplete |
| 17: Phases | Audit, foundation and portions of trails/paint/smoke/material phases; recoverable commits | Later lighting, temporal, optimization and full native checkpoints incomplete |
| 18: Validation | Unit/browser/GPU tests and controlled screenshots retained | Native visual acceptance and long-run performance qualification pending |
| 19: Deliverables | Architecture report, evidence, controls, measured limitations and future work | Comprehensive final native performance/visual report pending |
| 20–22: Success criteria | Simulation preservation and incremental branch isolation | Overall mission success **not yet achieved**; no stable-branch merge |

## Smoke follow-up

WebGPU now uses filtered fractal density noise, domain-warped rolling billows,
animated flow, soft edge erosion, Beer–Lambert extinction and a directional
density-gradient lighting approximation. This is particle-based 2D volume
approximation, not raymarched scene volumes or true multiple scattering.

Both renderers now use neutral grayscale density, irregular billows, softer
boundaries and expansion dilution. Canvas caches three deterministic density
sprites; GPU shades procedural billboards. Neither changes emitter conditions,
random draws, vehicle state or physical integration. The shader fetch explicitly
revalidates cached files. A real WGSL/Canvas pixel test rejects colored output,
including deliberately magenta particle input, and checks translucency.

The source at bd52833 already had no magenta smoke debug output. The user's
reported magenta appearance has not been reproduced on that source; stale files,
a different served checkout or a separate effect cannot be ruled out. Cache
revalidation is a precaution, not proof of the cause. Smoke screenshots and pixel
tests validate the new implementation, not the user's local serving setup.

Most optional materials are GPU-only. A Canvas session therefore shows much less
change. Inspect `getGPURenderStats()` from `/js/gpu-renderer.js` for the active
backend and fallback reason. A running page must be reloaded after updating files.

Validation of the smoke follow-up: 151 unit tests passed; the complete ordinary
browser run passed 40 with seven adapter skips. The isolated real-WGSL tests
exercise skipped GPU cases. [Procedural GPU scene](validation/smoke-procedural-gpu.png)
is a controlled overlapping-emission scene, not a live driving capture.
[Billboard comparison](validation/smoke-billboard-comparison.png) shows the detailed
GPU puff beside the simpler fallback. Captures use software WebGPU; native GPU
performance and live presentation remain unqualified. No speedup is claimed.

Final isolated GPU/fallback run: **10 passed, zero skips/failures**, including all
seven GPU cases skipped by the ordinary browser run. The original 151 unit tests
and all existing numerical tolerances are retained.
