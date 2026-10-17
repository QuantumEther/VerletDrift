Vehicle artwork used by `js/renderer/vehicle-sprites.js`:

- `DeLorean.png`: chassis, facing up (local negative Y).
- `DeLorean_Wheel.png`: static tire, rolling along local Y.

The original PNGs are kept unchanged. `js/renderer/vehicle-geometry.js` owns the
source crops and wheel-arch calibration. Wheels are drawn at the exact physical
anchors, with front steering, so skid marks, paint, smoke and sparks coincide.

This branch contains the DMC-12 geometry conversion; see
`docs/DELOREAN_GEOMETRY_CONVERSION.md` before using it as a validated configuration.
The draft solver track is 1.589 m and wheelbase 2.408 m. The requested shell
envelope is 1.988 m × 4.267 m, distinct from those axle dimensions.
The unchanged body is uniformly fitted inside it: actual visible art is
1.988 m × 3.481 m. Its proportions and arches do not match all requested dimensions.
No nonuniform stretching or wheel offsets conceal this known artwork mismatch.

Nominal tire envelopes are 195/60 R14 front and 235/60 R15 rear. Tread artwork is
uniformly fitted within each envelope, at the corresponding physical particle.
The shared mechanical rolling-radius default remains 0.35 m; the existing radius
control scales visual envelopes relative to that default without introducing
per-axle wheel dynamics. Mark coverage is bounded by each axle's tread width.
Ghosts share the geometry. `?vehicleCalibration=1` shows target/art bounds and
physical wheel centres/constraints. The prior visual-scale audit is historical
background; the conversion report describes validation and remaining limitations.

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
