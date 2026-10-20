# Live simulator liquid integration

This report describes the initial v26 checkpoint. For the completed controls,
residue weathering and legacy visual replacement, see
[the v28 integration report](COMPLETE_LIQUID_INTEGRATION.md).

Development branch: `verlet_gpt_v26_simulator_liquid`. Reference branch
`verlet_gpt_v25_splash_optimization` remains at `5c94e73`. No merge into the
original simulator/UI branches is part of this change.

## Behavior

Popping a balloon now launches the laboratory liquid in the live WebGPU world.
Its origin, speed and direction come from the existing collision result and body
velocity. Balloon hue selects the dye absorption rather than forcing every impact
to crimson. Sheets, filaments, droplets and secondary landing splashes share the
laboratory model. Deposited liquid remains world anchored, pools, dries into damp
asphalt, and leaves dye. The body retains local glossy streaks/beads while driving
away and dries separately.

Scoring, collision impulses, audio, CPU paint deposition, paint pickup/depletion,
colored tire trails, controls and vehicle physics still use their existing code.
The visual observer does not consume physics random numbers or write vehicle
state. This liquid is cosmetic: it does not change grip, momentum or handling.

Existing GPU splat billboards are replaced visually by the new liquid after an
impact; their CPU gameplay updates remain active. Canvas continues to use the
original splat/decal renderer. Existing gameplay paint can remain visible under
the liquid and after it dries; cosmetic drying does not erase gameplay paint.

## Rendering architecture

- `liquid-events.js` records immutable impact snapshots at the existing balloon
  pop site. `spawnBalloons()` clears the visual session. Seeds are derived from
  event order and position, independently of gameplay randomness.
- Shared shaders now live in `js/shaders/liquid/`. The lab reads the same material,
  geometry, vehicle response, deposition and drying functions. Lab-only scene
  rendering remains in its experiment directory. Shared topology helpers live
  in `liquid-mesh.js`.
- `WorldLiquid` owns GPU pipelines, meshes, cropped body/wheel textures, uniforms,
  two scene targets, and a layered `rg16float` deposition atlas. It shares the
  simulator's existing device and submission; it does not create another device
  or run a second simulation loop.
- The existing base pass supplies terrain, gameplay paint, marks and shadows.
  A ground pass composites each event's puddle over that actual substrate,
  preserving its texture. Balloons, smoke and sparks are drawn after puddles,
  then the car and airborne liquid, so the ground optics cannot dye elevated
  objects. It never substitutes the lab road.
- The main car and motion-blur sprites move into this pass while liquid events
  are active. Body dimensions/crop, wheel anchors, individual tire sizes, heading,
  front steering and stall tint come from the existing sprite geometry/state.
  Body shading runs only over a bounded sprite quad. Existing history and blur
  opacity drive ghost sprites, below the live car and airborne liquid.
- Airborne sheets/droplets refract the composed world, puddles and car. Camera,
  shake, logical scale, backing resolution and current rendered pose are shared
  with the live world renderer. A distant environment reflection stays coherent
  across map coordinates; the lab retains its finite local luminaire. Heading
  transforms are supported by the shared
  vehicle helper; zero heading fields retain the lab's reference orientation.
- When no airborne liquid remains, ground and car render directly to output.
  Refraction targets stay allocated for backward reconstruction. Before the first
  impact, or after session reset, the existing world/Canvas car path is used.

GPU work is analytic rendering and raster deposition, not a fluid solver. There
is no new compute particle simulation, per-frame particle upload, synchronous
GPU readback or per-particle CPU update in this subsystem. The existing simulator
paint/smoke systems retain their own updates.

## Determinism and resource bounds

The atlas is reconstructed from the requested event age, seed and impact state.
It is cached once contact has settled. Seeking backward rebuilds affected layers;
forward rendering does not depend on earlier displayed frames. Body wetness and
drying are analytic functions of age and local position. Existing blur ghosts still depend on the supplied pose history; an external
replay must restore that history and the car pose as well as impact events. The
simulator does not gain a replay/timeline UI; this provides deterministic rendering of retained
impact history, and the lab retains its full timeline.

The most recent **24 impacts** are retained. At capacity, the oldest visual event
is evicted, including its additional liquid residue and any body contribution.
This bounds memory and shading cost. Existing gameplay paint is not evicted by
this subsystem. More than 24 impacts in a short burst can retire an airborne event;
spatially tiled long-session residue caching is a useful future improvement.
This is a documented visual budget, not unlimited persistent liquid history.

| Quality | Layers | Filaments | Primary drops | Atlas per event | Atlas payload, 24 events |
| --- | ---: | ---: | ---: | ---: | ---: |
| Performance | 1 | 24 | 400 | 384² | 14.16 MB |
| Balanced | 2 | 36 | 650 | 512² | 25.17 MB |
| High / Ultra | 2 | 54 | 1200 | 768² | 56.62 MB |

Secondary drops are at most twice the primary count. Two reusable scene targets
cost eight bytes per backing pixel combined. Fixed meshes, sprite textures and
small uniform/storage buffers are additional. Atlas slots are allocated once;
normal frames allocate no GPU textures or buffers. Resize replaces/destroys the
targets. Device loss and allocation failure release the added resources before
Canvas fallback. Missing liquid shaders retain the existing GPU world. Missing
vehicle artwork retains Canvas car ownership. Calibration and disabled sprite
mode also keep the existing Canvas vehicle path.

`getGPURenderStats()` exposes the liquid budget, events, evictions, ghosts,
atlas/target payloads and resource counts. `residentBytes` includes the new
owned payload, and `liquidResidentBytes` reports that subset. These are payload
estimates, not browser/driver VRAM measurements. The existing base-world GPU
timestamp explicitly excludes the new liquid/upper-world passes and presentation; it must
not be interpreted as complete-frame GPU execution time.

## Preview and controls

Run `python3 serve.py` and open the simulator normally on a hardware WebGPU
browser. Drive through balloons. Red, blue and other balloon colours use the new
liquid. The existing `?quality=performance`, `balanced`, `high` and `ultra` settings
select bounded liquid detail as well as the existing world quality.

Use `?liquid=0` to compare with the old GPU splats and Canvas car, or
`?renderer=canvas` for the original Canvas fallback. Existing car artwork,
geometry and redesigned interface have not been changed. No new slider panel
is added to the simulator; the laboratory retains its detailed material controls.

Do not force software WebGPU for normal play. `?renderer=gpu` is useful for
correctness diagnostics; a software adapter is still unsuitable for responsive
simulation. Native RTX 5090 performance has not been measured in this cloud.
The previous laboratory benchmark gains do not quantify the cost of this new
live effect, which adds rendering work after balloon impacts.

## Captures

[Live impact](simulator-liquid/simulator-0.7.png),
[live settled puddle](simulator-liquid/simulator-5.png),
[live late residue](simulator-liquid/simulator-72.png).
These use the actual simulator UI and collision handler, with the animation loop
held for deterministic capture, camera zoom 3 and diagnostic panels hidden.
Their static FPS readouts are not performance measurements.

Close-up production-world captures:
[impact](simulator-liquid/red-0.7.png),
[settled glossy pools](simulator-liquid/red-5.png),
[drying](simulator-liquid/red-18.png),
[final dye](simulator-liquid/red-72.png),
[multiple colours/rotated car](simulator-liquid/mixed-2.7.png),
[multiple settled pools](simulator-liquid/mixed-7.png).
The output was inspected across the airborne-to-ground transition, at late drying,
and under zoom/rotation. No page or shader errors occurred in these captures.

Reproduce the close-ups with the existing Playwright dependency and a local server:

```sh
CHROMIUM_EXECUTABLE=/usr/bin/chromium node scripts/capture-simulator-liquid.mjs \
  --url http://localhost:8000 --quality balanced --output /tmp/live-liquid
```

This uses real simulator WGSL on a readable offscreen target to avoid unsupported
headless presentation. It supports `--backend hardware` and JSON `--browser-args`
for an appropriately configured Chromium. Neither mode measures compositor/display
latency. [Capture diagnostics](simulator-liquid/captures.json) and
[UI capture diagnostics](simulator-liquid/live-ui-captures.json) record the scope.

## Remaining limits

This is a procedural visual approximation. It does not conserve liquid mass or
reconstruct the full vehicle's 3D collision surface. Body contact is captured at
impact; the film uses a coarse hood/glass flow field. Later driving through a
puddle does not yet generate new wheel spray or re-wet the body. Landing spray is
included. The original lab likewise did not implement wheel-generated spray.
Overlapping airborne refraction remains an approximation; it is not multilayer
ray tracing. Ghost sprites retain the existing dry-art blur approximation.

The procedural puddle footprint is visual and is not used as gameplay
paint-pickup collision geometry. Its extent can differ from the existing paint
contact field, whose behavior is deliberately preserved.

The Canvas fallback remains functional but does not reproduce the new GPU
optics. Very dense impacts and the 24-event fragment loop need profiling on the
actual hardware/browser. No RTX speedup, hardware memory/occupancy result, or
high-refresh frame-rate claim is made here.


## Automated validation

- Unit suite: **165 passed**, 18 files. Existing numerical tolerances unchanged.
- Full browser suite with WebGPU enabled: **79 passed** at the integration
  checkpoint. This includes UI, controls, physics/handling, the laboratory,
  smoke, terrain, sprites, camera scaling and fallback coverage.
- After correcting ground/upper-world ordering: **21 passed**, covering the
  existing GPU world and all 11 new live-liquid integration tests.
- After final map-lighting and upload refinement: **14 passed** (all 11 live
  integration tests and three shared laboratory optical tests). A GPU probe
  verifies map-translation-invariant environment reflections while the lab's
  finite-light mode remains spatially dependent. The balloon pixel regression
  verifies that a green balloon above a red pool remains untinted.
- Complete ordinary-browser suite: **44 passed, 37 skipped** out of 81. These
  skips require a WebGPU adapter; the separate software-WebGPU runs above execute
  that coverage. No tests or numerical tolerances were weakened.
- Rendering checks include backward seeks, colour layering, car motion away
  from the puddle, dry substrate/residue, current wheel geometry, ghost history,
  session reset, opt-out, bounded 26-impact stress, performance/high budgets,
  resize, missing shaders, allocation failure and device loss.
- `git diff --check` passed. Vehicle physics, constants, controls, state schema
  and source artwork have no changes. Only a visual observer was added at the
  existing balloon-pop site.

The cloud adapter is SwiftShader. These runs validate actual WGSL and integration
correctness, not native RTX performance, browser presentation or display frame
pacing. Capture fences/readbacks exist only in test/capture tooling.
