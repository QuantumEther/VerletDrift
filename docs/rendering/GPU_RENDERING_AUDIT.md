# GPU-first canvas audit

Baseline: f4c9440, preserved on verlet_gpt_v20_delorean_geometry. Development:
verlet_gpt_v21_gpu_rendering. Authoritative CPU vehicle state, geometry, artwork,
controls, gameplay deposition and UI are outside this change.

## Responsibility map and findings (before implementation)

| Workload | Current CPU work | Current GPU work | Decision |
| --- | --- | --- | --- |
| Ground | Motion blur scalar/packing; Canvas nested tiles in fallback | One fullscreen procedural checker pass | Keep procedural GPU approach; add filtered world-space materials |
| Skids | Physical events, fading/culling, pack new events, periodic full repack | Incremental full-map rgba8 texture + composite | Replace raster cache with resident analytic segments, separate alpha stream; no map-sized allocation |
| Paint | Gameplay pickup/depletion, particle integration, individual Canvas polygon drawing | Splat particles instanced | Keep gameplay on CPU; instance procedural ground decals |
| Smoke | Slip-based emission, pool bookkeeping, 2 uploads per spawn; full alive scan; async flags readback | Curl-noise compute + instanced billboards | Repair ABI/count/timing first; batch dirty spawn ranges; keep GPU state resident |
| Sparks | CPU emission/integration, compact instance upload | Instanced quads | Keep tiny 300-slot CPU simulation; improve soft emissive shading |
| Balloons | Gameplay collision/popping; Canvas circles/strings | None | Instance visual balloons and grounding shadows only |
| Vehicle | Five sprite draws, existing ghosts, transforms | Browser Canvas compositor | Preserve supplied artwork/geometry; GPU contact shadow beneath; no large CPU cost worth migrating five draws |
| Camera/temporal | Existing chassis/camera interpolation, wheel coordinates not interpolated | Camera uniforms, resolution-independent world coordinates | Preserve mechanics; smoke visual clock independent of display rate; retain logical CSS viewport |
| HUD/gauges | Existing Canvas/DOM and needle springs | Disabled gauge pipeline | Leave redesigned UI and gauges alone |

Concrete defects: smoke storage allocates 44 bytes/slot but writes/reads 48;
compute count is packed as float while WGSL reads u32; dispatch uses alive count
instead of sparse high-water index; fixed 1/60 render dt makes 240 Hz smoke age
four times faster; alpha is repeatedly multiplied by fade; per-frame drag and
squared-dt buoyancy; magenta debug smoke; no device-loss handling. These are
visual particle defects, not vehicle physics defects.

Existing skid texture: 6144 x 4608 x 4 = 108 MiB, only 16 texels/metre
(~3 texels across a front tire). Periodic full clears cause fade/eviction pops;
clamped sampling can smear border pixels outside the map. Raising density to
64 tx/m would require 1.69 GiB and exceed typical texture dimensions. Tiling is
possible but unjustified for the existing 4000–20000 segment cap: analytic
instanced capsules can remain sharp at any zoom without a raster cache.

No synchronous GPU readback was found. Smoke flags use asynchronous mapAsync,
but queue.onSubmittedWorkDone unnecessarily waits for the whole queue; readback
allocates an index list, scans 8000 flags and issues a zero upload per reclaimed
slot. Spawn uploads similarly issue two writes per particle. Other hot-path
allocations: subarrays/color triples, nested pose-history objects, Canvas paths
and per-decal trigonometry. Main already reuses most staging buffers.

Current layering is hybrid: every GPU element lies below every Canvas element.
Canvas paint therefore covers GPU skids/smoke regardless of intended world
order. Move ground paint into the GPU ground layer; retain car/debug/HUD overlay.
Authoritative paint/decal arrays must never be changed by rendering.

## Ranked opportunities

| Priority | Change | Visual benefit | Expected cost benefit | Complexity/risk |
| --- | --- | --- | --- | --- |
| 1 | Fix smoke ABI, sparse dispatch, fade and visual clock | High; makes existing compute usable | High; removes invalid work/logging, fewer writes | Medium; isolated visual pool |
| 2 | Analytic antialiased skid capsules + resident geometry | High; smooth ends/joins/subpixel detail | Saves 108 MiB + composite pass; GPU draw cost rises with visible segments | Medium; verify event count/width/fade |
| 3 | GPU paint/balloon/shadow instances | High; coherent surface layering/shading | Removes Canvas polygon loops; bounded uploads | Medium; preserve gameplay state |
| 4 | Filtered asphalt/studio/diagnostic/checker materials | High | Single procedural pass; detail adds fragment ALU | Low/medium; test zoom/DPR |
| 5 | Turbulent smoke density and soft spark halos | High | GPU shading; no extra CPU particles | Medium; measure overdraw |
| 6 | Quality controls and fault recovery | Reliability | Caps raster cost; no repeated texture creation | Low/medium |
| Deferred | TAA, indirect draw, GPU vehicle population, full fluid solver | Unproven for this scene | Added latency/history/storage/complexity | High; no demonstrated need |

## Measurement plan and boundaries

Run existing unit/browser suites, GPU command-contract checks and real WGSL
compilation/render/compute/device-loss checks where an adapter exists. Chromium
can obtain a **software SwiftShader WebGPU adapter** in this environment with
explicit development flags. This allows shader correctness and screenshots,
not claims about hardware GPU frame time, throughput or 120/240 Hz attainment.
Record CPU encode time/upload bytes/draw counts and memory budgets separately
from frame cadence. Do not label submission CPU time as GPU time. Baseline cold
initialization had not finished after 2 seconds; preserve baseline logs and images
outside checkout. Warm benchmarks must wait for readiness and use identical
scenes. No pipeline may write vehicle/mechanical state.

## Implementation checkpoint

Shared foundations for phases B–F were implemented together because skid,
paint, balloon/shadow instances and smoke use the same camera/buffer/lifecycle
contracts. Relevant checks: 150 unit tests and 8 executable GPU/fallback checks
pass. The original 37 browser regressions are scheduled next. The authoritative
physics-step function, all physics modules, constants, state defaults, controls,
vehicle sprite/geometry modules, PNGs and UI files are unchanged.

Software WebGPU can execute offscreen textures and compute here. Its **canvas
swap-chain presentation loses the device even in an independent clear-only
reproduction**, including against the baseline. Validation therefore uses real
GPU textures with asynchronous readback in the test/benchmark harness. This is
not a production renderer workaround. Initial presentation-based benchmark
samples are invalid and excluded. The corrected offscreen harness composites
the unchanged Canvas vehicle after GPU rendering for comparison images.

GPU main-pass timing is optionally available with `?gpuProfile=1` when
`timestamp-query` is supported. It samples asynchronously every 30 frames and
reports render-pass duration separately from JS encoding. It excludes smoke
compute, Canvas overlays, browser compositing and display latency. No queue wait
or per-frame resource creation is added to the production profiling path.
