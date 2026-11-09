# Foundation 8 Export 2 and functional handwheel

The existing laboratory now defaults to `Mustang_Foundation_8_EXPORT_2.glb` when
Custom Blender Mustang is selected. Foundation 7 remains in the repository and
can still be passed explicitly to `loadCustomMustang(vehicle, url)` for rollback.
The procedural Mustang builder, reference vehicle, solver and drivetrain are
unchanged. No new renderer or parallel integration was introduced.

## Verified source geometry

The actual GLB contains `_ROOT`, Body, Grille (with Cylinder.002), Interior,
Steering_Wheel and the four road-wheel nodes. It has **75,052 triangles and six
materials**. Full converted bounds are about **4.69973 × 1.80555 × 1.32003 m**;
road-wheel diameter is **0.65300 m** and the handwheel rim diameter is **0.381 m**.
The handwheel mesh also includes a column extending along negative local X, so
its complete bounding box is not an appropriate hub pivot.

The existing conversion remains Rx(+pi/2), `(x,y,z) -> (x,-z,y)`. Mesh positions,
topology, materials and unit scale are preserved. Registration uses the actual
axle midpoint and now also centers the source wheel track laterally: the new
export's root origin is laterally offset, so leaving its old y=0 registration
would misalign the body by about 63 mm. This translation aligns source and physical
origins without changing geometry or physics.

Geometric mapping remains physical FL ← Wheel_FR, FR ← Wheel_FL,
RL ← Wheel_RR, RR ← Wheel_RL. Native road-wheel radius **0.3265 m** differs from
physics radius **0.335 m** by 8.5 mm; no scale correction is applied. The source
wheelbase (~2.71556 m) and wheel-center track (~1.48135 m) also differ slightly
from the physical 2.7432 / 1.49352 m configuration. Imported wheels follow the
physical hubs and accepted rotor angles as before; the small native visual/contact
and arch-location discrepancies remain explicit.

## Local-axis handwheel animation

The source rim lies in local Y/Z about the object origin, with ±0.1905 m radial
bounds and the column extending along negative X. Thus local **+X** is the shaft
axis, not global Y or Z. Its original quaternion maps this axis toward the driver
and upward with an approximately **25°** inclination. The original object origin
is retained as the hub; centering its full mesh bounding box would instead make
the wheel orbit because the column extends far behind it.

At initialization the integrator caches the object reference, original quaternion,
shaft vector and a reusable turn quaternion. Each rendered frame applies:

`Q_handwheel = Q_original * axisAngle(localX, acceptedFrontSteer * visualRatio)`.

The accepted front steer is the mean of the two front wheel steering values in
the existing read-only presentation. No keyboard handlers drive the handwheel.
The provisional **16:1** ratio is configurable through `vehicle.visual.steeringRatio`;
it is not a verified factory ratio. Positive road steer produces positive rotation
about the rear/upward shaft, corresponding to a left turn as viewed by the driver.
There is no modulo or artificial angular clamp. Existing ±.35 rad road steering
permits ±5.6 rad handwheel travel (about ±321°). Return to center inherits the
existing accepted steering-response rate; no extra lag or RPM/speed dependency.
The quaternion is always recomposed from neutral, preventing accumulated drift.
No per-frame mesh search, material cloning or geometry allocation is added.

The Interior and dashboard remain rigid chassis children. The steering wheel
rotates at its own hub, including its axially symmetric shaft geometry; no other
interior object is rotated. Body yaw/pitch/roll, terrain-following road wheels,
suspension, marks, x-ray, appearance fallback and diagnostics retain their existing
paths. A new **Interior · fixed cockpit** camera preset follows chassis orientation and permits close inspection without orbit control;
all existing presets remain available.

## Verification and limitations

Commands:

```sh
node --test research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/custom-mustang.test.mjs research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/adapter.test.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/custom-glb-browser.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/browser-smoke.mjs
```

Nine Node checks passed, including actual new GLB parsing, geometric mapping,
0.653 m tires, unchanged vertex-position buffers and source paint properties,
25° inclination, composed positive/negative rotation, exact neutral restore and
1,000 pose updates without positional drift. Adapter/clock invariants and explicit Foundation 7 rollback loading also pass.
Browser checks cover actual scene rendering, steering-state/handwheel agreement,
left/right interior views, appearance/state invariance, rotor parity, terrain,
driving, shifts, load-error fallback and stable resource counts after warmup.
The retained reference browser smoke is run separately. Browser rendering uses
Chromium/SwiftShader, not an RTX hardware performance benchmark. Source material
appearance is preserved; lighting is the existing laboratory lighting. The
underlying small-angle chassis and contact-frame approximations are unchanged.

Supporting browser results and screenshots are `results/foundation8-*`.
