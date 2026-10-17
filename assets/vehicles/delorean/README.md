Vehicle artwork used by `js/renderer/vehicle-sprites.js`:

- `DeLorean.png`: chassis, facing up (local negative Y).
- `DeLorean_Wheel.png`: static tire, rolling along local Y.

The original PNGs are kept unchanged. `js/renderer/vehicle-geometry.js` owns the
source crops and wheel-arch calibration. Wheels are drawn at the exact physical
anchors, with front steering, so skid marks, paint, smoke and sparks coincide.

The solver's 1.6 m track and 3 m wheelbase are axle distances, not the shell's
outer bounds. The shell is fitted around them using source-pixel arch centres
(left/right X = 327/928, front/rear Y = 267/1012). This gives a roughly
1.829 m × 4.844 m visual envelope. Its front/rear overhangs are artwork-derived,
not collision geometry or factory DeLorean specifications. Fitting both axle
distances requires independent X/Y image scaling because the supplied artwork's
axle proportions differ from the simulated model.

Tread length is the current physical rolling diameter (`2 * params.wheelRadius`);
width is inferred from the wheel image aspect ratio because physics has no tire
width parameter. At the default radius these are 0.700 m × 0.297 m. Mark coverage
cannot exceed tread width; explicitly named width exaggeration remains optional.
Ghosts use the same geometry. See `docs/VEHICLE_VISUAL_SCALE_AUDIT.md` for the full
diagnosis, scaling conventions, validation and remaining limitations.

To restore the original visuals at runtime:

```js
const { vehicleSpriteSettings } = await import('./js/renderer/vehicle-sprites.js');
vehicleSpriteSettings.enabled = false;
```

The original renderer is also used until both images load or if either fails.
Car motion-blur ghosts use the same sprites and their existing historical poses.
The original renderer's tire heat/paint tinting is retained in fallback mode;
sprite tires use the supplied artwork without tinting. The stalled-body overlay
is preserved. `selectWheelImage(name, angularSpeed)` is the extension point for
future motion artwork; angular speed comes from `state.wheelOmega` in rad/s.
