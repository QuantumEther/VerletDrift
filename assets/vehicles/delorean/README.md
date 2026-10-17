Vehicle artwork used by `js/renderer/vehicle-sprites.js`:

- `DeLorean.png`: chassis, facing up (local negative Y).
- `DeLorean_Wheel.png`: static tire, rolling along local Y.

The original PNGs are kept unchanged. The renderer crops transparent padding
using source rectangles. The chassis fits the existing 1.6 m × 3 m body bounds;
wheel sprites retain their aspect ratio within the original tire footprint.
Physics wheel anchors remain unchanged. For display, each wheel is offset
0.10 m inward across the chassis; front wheels are shifted 0.60 m toward the
rear, and rear wheels 0.54 m toward the front. These artwork-calibration offsets
rotate with the chassis (not steering), placing tires under the fenders rather
than at the bumper corners. Ghosts apply the same offsets to historical anchors.

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
