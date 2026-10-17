# Vehicle sprite and visual scale audit

Baseline: `6e8bdde` on `verlet_gpt_v19_ui`. Physics, constraints, collision logic,
friction, slip, mass, suspension, controls and time stepping are unchanged.

## Diagnosis

The screenshot combines real geometry mismatches with deliberately exaggerated
diagnostic graphics. It does not establish a need to apply a global car-size gain.

1. **Confirmed: visible tires were detached from physical contact positions.**
   The preceding sprite fix offset front tires by 0.60 m longitudinally, rear
   tires by 0.54 m, and all tires by 0.10 m laterally. This made the artwork look
   assembled, but its visible track was 1.40 m and visible wheelbase 1.86 m.
   Skids, paint pickup, smoke and sparks correctly continued to use the physical
   1.60 m track and 3.00 m wheelbase. Moving only the tires caused the disconnect.
2. **Confirmed: axle dimensions were mistaken for shell dimensions.**
   `CAR_HALF_WIDTH=0.8` and `CAR_HALF_LENGTH=1.5` place the wheel particles and
   define constraint rest lengths, load-transfer arms and inertia. They do not
   describe a separate bumper-to-bumper shell. Drawing the shell inside that
   rectangle put the physical axles at its bumpers. Some old comments still
   mention obsolete 4/8 m dimensions; the executable SI constants are authoritative.
3. **Confirmed: Canvas resolution changed world scale and omitted DPR.**
   `renderFrame()` resized backing pixels while drawing unscaled pixel
   coordinates. At 2x resolution, the same world geometry occupied half as many
   CSS pixels. An unused `applyCanvasResolution()` helper did not correct this.
4. **Confirmed: GPU resolution was immediately overwritten.**
   `main.js` resized the GPU target with `gpuResolutionScale`; `renderFrameGPU()`
   immediately resized it again without that factor.
5. **Confirmed: trail lengths disagreed across renderers.**
   Canvas converted the authored 22 px length using the fixed default 20 px/m;
   GPU divided by the current view scale. Changing pixels-per-metre therefore
   changed arrow length in metres only on GPU.
6. **Confirmed: checker size and screen shake disagreed with a shared world view.**
   Dividing checker size by the current pixels-per-metre held its screen size
   fixed while the car changed size. GPU background shake used the opposite sign
   from Canvas, and GPU skids/arrows/particles did not share its offset.
7. **Confirmed: appearance controls had misleading/inconsistent behavior.**
   `gpuSkidResolution` is actually a line-width multiplier, not texture quality;
   it previously applied only on GPU. Configured mark widths could exceed tread
   width. The GPU background opacity uniforms were also one float out of step
   with `BgUniforms`, affecting blur appearance rather than SI geometry.

## Authoritative dimensions and calibration

| Quantity | Source | Current value/model |
| --- | --- | --- |
| Track width | `2 * CAR_HALF_WIDTH` | 1.600 m |
| Wheelbase | `2 * CAR_HALF_LENGTH` | 3.000 m |
| Wheel centres | `state.wheels[name].x/y` | Actual Verlet particle positions |
| Chassis centre/angle | `state.body.centerX/Y`, `heading` | Derived from axle midpoints; heading 0 faces -Y |
| Front wheel angle | `heading + steering.frontWheelAngle` | Same steering data as physics |
| Rolling radius | `params.wheelRadius` | Default 0.350 m |
| Visible tire length | `2 * radius` | Default 0.700 m |
| Visible tire width | Diameter × cropped tread aspect ratio | Default 0.29724 m; inferred, not a friction input |
| Body artwork bounds | `BODY_RECT` derived from source arch positions and axle spacing | Approx. 1.829 m wide × 4.844 m long |
| Body overhangs | Artwork outside physical front/rear axles | Approx. 0.970 m front, 0.874 m rear |
| Default checker tile | Authored 80 px / fixed 20 px/m reference | 4.000 m |
| Trail reference length | Authored 22 px / fixed 20 px/m reference | 1.100 m at 25 m/s |

`vehicle-geometry.js` owns sprite source rectangles, shell calibration, tire
dimensions, skid coverage and the explicitly artistic mark-width multiplier.
The original PNGs and image-loading/fallback mechanism remain intact.

The shell's source arch centres are measured artwork calibration: X 327/928 and
Y 267/1012 in the original 1254-square image. Mapping their midpoint to the
physical axle midpoint and their spacing to the physical track/wheelbase derives
the shell bounds. It does **not** scale or move the wheel particles. Both current
poses and historical motion-blur poses use the same geometry.

Physics has no separate outer-shell dimensions or tread width. These visual
dimensions are therefore explicit assumptions, not newly invented physics or
factory DeLorean specifications. The image's wheelbase-to-track proportions do
not match the solver's, so fitting both requires independent X/Y shell scaling.
Preserving the source image's aspect ratio, its illustrated wheel arches, and
both existing physical axle distances simultaneously is not possible. This
implementation prioritizes physical contact alignment as requested; a different
sprite matching the existing axle proportions could avoid that image distortion.
Collision remains based on the existing particle model; visual overhangs do not
expand collision geometry.

## Rendering map and modifications

| Files / functions | Responsibility and change |
| --- | --- |
| `js/renderer/vehicle-sprites.js`, `drawVehicleSprites()` | Draw all tires at their physical anchors. Use shared shell/tire dimensions, current rolling radius, original steering and spin hook. Preserve fallback and stalled overlay. |
| `js/renderer/vehicle-geometry.js` | New small SI geometry module. Calibrate the shell around the existing axles; bound skid coverage by inferred tread width. |
| `js/main.js`, `recordSkidMarks()` | Continue recording segment endpoints at actual wheels. Use shared tread-bounded width; preserve thresholds, fade, paint mixing, segment timing and opacity. |
| `js/main.js`, `renderFrame()` | Keep viewport and HUD in logical CSS pixels. Size backing buffers with DPR × resolution settings; apply Canvas sampling transform, enable image smoothing. GPU raster dimensions are set once here. |
| `js/renderer/world.js`, `applyCameraTransform()` | Use shared effective camera, including existing shake. Rendering metres become logical pixels through `zoom * pixelsPerMeter`. |
| `js/renderer/world.js`, `drawSkidMarks()` | Preserve segment endpoints, color, opacity and round caps. Apply the same explicit width multiplier as GPU. |
| `js/renderer/world.js`, `drawCarGhosts()/drawCar()` | Pass current rolling radius to the existing sprite path. Ghost history positions are retained. |
| `js/renderer/world.js`, `drawCheckerboard()/drawMapBoundary()` | Convert authored tile size at fixed reference scale; make boundary stroke/dashes explicitly CSS-pixel debug graphics. |
| `js/renderer/view.js` | Shared effective camera and checker conversion. Positive shake displaces all world graphics in the same direction. |
| `js/trail.js`, `getTrailArrowGeometry()/drawTrailArrows()` | One metre-valued length/shaft-width rule, independent of view scale. Arrow position, speed and lifetime are unchanged. |
| `js/gpu-renderer.js`, `renderFrameGPU()` | Consume logical viewport without overriding raster size. Share camera, trail geometry and skid width. Align background opacity uniform indices with WGSL. |
| `js/shaders/background.wgsl` | Clarify that viewport units are logical CSS pixels; shader geometry is unchanged. |
| `js/ui/control-data.js`, `js/state.js` | Clarify width exaggeration and checker units. Retain settings IDs, numeric values and import/export compatibility. State change is a comment only. |

Skid records already originate at tire contact positions. Their simple ribbon
model varies coverage with utilization and clips it to tread width; default
maximum-utilization width remains 0.260 m. It is not a full contact-patch sweep
simulation. `skidWidthMin/Max` remain metre-valued coverage requests. The legacy
`gpuSkidResolution` key is labeled **Width exaggeration**; 1x is geometric scale,
and other values intentionally exaggerate/reduce width in both paths.

Paint pickup tests the same physical wheels against metre-valued decal radii.
`js/balloon.js` creates world-space splats/decals;
`drawSplatDecals()/drawSplatParticles()` render those world positions under the
same camera. `renderer/sparks.js` and `renderer/smoke-system.js` emit at physical
wheels with existing metre-valued jitter. Their positions, random sampling,
particle simulation, opacity and lifetimes were not changed.

## Scale and quality conventions

World point to logical screen point:

```text
effectiveCamera = camera - activeScreenShake
screenCSS = viewportCSS / 2 + (worldMetres - effectiveCamera) * zoom * pixelsPerMetre
Canvas backing = round(viewportCSS * DPR * canvasResolution)
GPU backing = round(Canvas backing * gpuResolutionScale)
```

Thus resolution sliders alter sampling density, not car size, contact positions,
view extents, HUD size, or camera behavior. Checker size retains its existing
stored pixel setting as an authoring unit at 20 px/m; changing view scale now
zooms its fixed metre-valued tiles with everything else.

The cyan acceleration arrow is a diagnostic scale (0.3 m per m/s², capped at
8 m), not vehicle geometry. The jerk vector is similarly exaggerated. Their
metre-valued strokes and trajectory arrow speed coloring remain unchanged.
HUD elements are CSS-pixel graphics. The dashed map boundary is now explicitly
a fixed-pixel annotation on a world-space rectangle.

The PNGs have ample source resolution and transparency. Cropping ignores empty
margins; no image edits were necessary. Canvas smoothing remains enabled at high
quality. GPU skid texture sampling was already linear, at 16 texels/m over the
default 384 × 288 m map (6144 × 4608 texture). A default tire is about 4.8 texels
wide there; at high zoom it will look softer than the much higher resolution
sprite. That is a quality limit, not a different physical scale. Changing the
width multiplier does not improve its resolution. No global opacity/blur/style
retuning or costly texture enlargement was introduced.

## Validation and remaining limits

Results: **145 unit tests passed; all 32 existing browser checks and all five new
scale checks passed.** The new drift test was rerun after correcting an early
sampling condition to wait for measurable rotation. No vehicle implementation
change was needed for that test correction.

- Unit tests verify calibrated arch-to-axle mapping, inferred tire dimensions,
  width bounds, shared camera convention, fixed grid and trail units.
- Browser tests inspect actual Canvas drawing at DPR 1/2, mobile/desktop widths,
  and 0.5x/1x/2x backing resolution; displayed shell size remains constant.
- A 27-case turn/zoom/view-scale/shake matrix compares projected tire centres
  with projected colored mark endpoints, including a denser backing transform.
- A production handbrake turn checks newly recorded segment endpoints against
  actual wheel centres and their widths against tread width.
- A recording WebGPU device checks production JavaScript uniform/instance
  uploads, viewport/raster separation, shared camera, trail lengths, mark widths
  and opacity-field offsets. This is **not** WGSL execution or GPU raster proof.
- Existing browser suites cover real throttle, braking, reverse, clutch/gear
  shifts, handbrake handling, UI bindings, faults, storage and image-load fallback.
- Parked and turning screenshots were inspected in Canvas fallback. This cloud
  session has no working hardware WebGPU adapter. Hardware GPU raster quality,
  display-specific antialiasing and high-zoom texture appearance require manual
  verification on a suitable browser.
- The original procedural fallback retains its old shell/rim styling. Diagnostic
  force/SAT overlays retain their existing independent display scales. The
  pre-existing smoke shader still has a hardcoded magenta debug color; correcting
  that separate appearance issue was not needed for this geometry audit.
- Existing pose interpolation blends the body/camera but not the four wheel
  coordinates. Tires and mark endpoints now share those un-interpolated anchors;
  very-high-refresh wheel/body jitter remains a separate interpolation issue.
- GPU skid persistence still refreshes on `gpuSkidRedrawInterval`; width changes
  and fading can lag until redraw. Texture coverage remains the default map.
  Dynamic texture coverage, cap-style parity and adaptive skid resolution are
  separate quality improvements, not hidden scale corrections here.
