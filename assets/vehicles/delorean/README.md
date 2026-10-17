Vehicle artwork used by `js/renderer/vehicle-sprites.js`:

- `DeLorean.png`: chassis, facing up (local negative Y).
- `DeLorean_Wheel.png`: static tire, rolling along local Y.

The original PNGs are kept unchanged. The renderer crops transparent padding
using source rectangles. The chassis fits the existing 1.6 m × 3 m body bounds;
wheel sprites retain their aspect ratio within the original tire footprint.
Wheel anchors remain the simulator's Verlet particle positions, even though
those positions do not match the illustrated DeLorean's wheel arches exactly.

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
