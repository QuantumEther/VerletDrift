# Environment overhaul

Serve the repository root with `python -m http.server 8792`. Open the
laboratory with `?terrain=flight` to load the three-lane facility. Select
**Terrain → Launch lane → Start rolling test** in the Mustang. This establishes
a level-road initial speed in neutral before the ramp. The existing 1 ms
simulation computes every subsequent contact, takeoff and landing. Selecting
the map without the rolling test starts at rest.

The flight facility has a connected paved staging area, separate lanes,
progressive and short profiles, a cross-banked offset lane, 5 m station ticks
and flat runoff. Quintic joins provide continuous gradients and curvature.
Suspension Laboratory has a bounded two-scale washboard and painted shoulders.
Industrial proving ground opens into a roughly 61 m wide skid pad with four
survey rings. Hills, rough country, road, alpine and rally get terrain-sampled
vegetation. Road through hills uses the same physical corridor for road paint.
The flat preset remains a clean control surface. The facility meshes and
vegetation are original procedural artwork. Repeated scenery uses two
instance batches and updates on 24 m window crossings. Test markings use one
static mesh. These objects have no collision response.

The HDR source uses Y-up equirectangular coordinates. Its +Y axis maps to
world +Z at neutral, and both the background and PMREM reflections share that
rotation. Yaw, pitch and roll also update smoke's environment sampling.
The directional key light follows the controls from its authored offset.
The EXR source's sun azimuth was not photometrically calibrated. The existing
German Town EXR and vehicle assets are reused.

## Flight measurements

| Lane | Initial speed | Four-wheel flight | First touchdown |
|---|---:|---:|---|
| Progressive crest | 100.8 km/h | 1.928 s | Both rear wheels |
| Short launch | 86.4 km/h | 2.544 s | Both front wheels |
| Offset crest | 86.4 km/h | 1.985 s | Right rear |

Full flight means all four tires have zero contact force for the entire
evaluated step. In the three neutral tests, horizontal COM velocity
and wheel spin were constant during this phase. The mass-weighted vertical
velocity followed gravity to within 3e-12 m/s. All wheels recontacted.
The offset pass reached about 28° roll by the last fully airborne step.
Maximum accepted step work residual was about 5.1e-10 J. Complete test
loops took 177–247 ms of elapsed Node time per simulated second on the cloud CPU,
including trajectory sampling and assertions. This is separate from rendering.
See [trajectory plot](results/airborne-proving-ground.png) and
[recorded state and contact sequences](results/airborne-proving-ground.json).

The first ramp traversal reproduced a bounded contact-solver failure at
a residual of approximately 2.4e-11 N, where subtraction of metre-scale
heights is amplified by the tire spring. The flight preset now uses a narrow
stiffness-scaled roundoff bound in force closure. The measured residual still
enters the work check, and the friction acceptance tolerance is preserved.
Authored roads now use continuous grip at road and shoulder transitions.
The source of earlier freezes on legacy maps was not reproduced in these
bounded routes. There are no automatic resets or time discards in the fix.

The reduced vehicle model has no body-ground impact, aerodynamic forces, or
full 3D inertia coupling. These results do not validate drift takeoff, power-on
airborne behavior or extreme attitude landings. Run
`FLIGHT_RESULTS=/tmp/flight.json node --test environment-traversal.test.mjs`
from this directory for nine traversal cases and the three measured launches.

## Browser review

The [first comparison sheet](results/environment-comparison-1.jpg) covers
the four legacy terrain presets. The [second sheet](results/environment-comparison-2.jpg)
covers the authored maps and the two new facilities. Images are screenshots
of the Cinematic WebGL laboratory in Chromium from the baseline `c9a7086`
and from the overhaul. The flat map serves as the control. The flight row
shows the rolling-test spawn with EXR enabled.
[Flight launch capture](results/flight-launch-hdri-webgl.jpg)

The current laboratory initialized every map in WebGL, and a native WebGPU
canvas texture probe returned nonuniform output for the flight map using
SwiftShader Vulkan. These are software-browser checks. RTX and Mac frame
pacing remain unmeasured.

The launch capture was also repeated with the simulation running until
all four contact forces reached zero, then paused for the
[airborne frame](results/flight-airborne-webgl.jpg). A separate WebGPU run
passed the texture check with the EXR enabled and yaw set to 22°.
The combined laboratory and engine-lifecycle suite passed all 73 tests.
