# Mission 23 — first sprung corner

This is an isolated native Chrono quarter-corner experiment. It is not part of the production simulator. Upstream Chrono source is pinned to `9a5072b5324e012a66d9fb7eaac0c679b8465e73`; only the separately built Mission 22 `Fn < 0` to `Fn <= 0` research variant is loaded. The original source tree remains untouched.

## Rebuild and run

The native Chrono Core/Vehicle build and temporary Mission 22 patched library must already exist. Mission 21/22 documents contain the reproducible upstream build and patch-variant commands. With the same paths used for the recorded experiment:

```bash
/tmp/m21-tools/cmake/data/bin/cmake \
  -S research/scientific-rebuild/first-sprung-corner \
  -B /tmp/m23-build -G Ninja \
  -DCMAKE_MAKE_PROGRAM=/tmp/m21-tools/bin/ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCHRONO_SOURCE=/tmp/m20-chrono \
  -DCHRONO_BUILD=/tmp/m21-build \
  -DVEHICLE_LIBRARY_DIR=/tmp/m22-variant/lib \
  -DEIGEN_INCLUDE=/tmp/m21-deps/usr/include/eigen3
/tmp/m21-tools/bin/ninja -C /tmp/m23-build -j2
python3 research/scientific-rebuild/first-sprung-corner/run_experiments.py \
  --binary /tmp/m23-build/corner \
  --chrono-source /tmp/m20-chrono \
  --patched-library /tmp/m22-variant/lib/libChrono_vehicle.so \
  --out research/scientific-rebuild/first-sprung-corner/results
```

The output directory must be empty on each run; historical outputs are never overwritten. The code needs C++17, CMake/Ninja, pinned Chrono Core and Vehicle native libraries, and Eigen. The validation driver needs Python 3 and NumPy. It verifies the loaded patched library, original source commit/hash, finite states, force/torque balances, contact transitions, wrench translation, timestep comparison and step timings. The trace `.meta.json` files record actual assembled masses/inertia and local tire stiffness/damping. `verification.json` records commands, runtime, hashes and check outcomes. CSV traces are gzip-compressed as `.csv.gz`; `force_evaluation_time_s` labels the frozen state used for the tire update and `time_s` labels the mechanically integrated state after that step.

## Mechanical fixture

The sprung quarter body (280 kg) is vertically guided to a fixed test frame. A separate 12 kg carrier is vertically guided relative to it. The source Generic wheel (18 kg, inertia `[0.4634, 0.6243, 0.4634] kg m²`) and Generic TMeasy tire (37.6 kg, inertia `[3.84, 6.69, 3.84] kg m²`) are registered once on a Chrono spindle, giving 55.6 kg and axle inertia 7.3143 kg m². The wheel spindle is attached to the carrier by a revolute joint whose free axis is world +y. Native TSDA suspension uses 30 kN/m and 2 kN s/m. There are three mechanical coordinates: body heave, carrier heave and relative wheel spin. All x/y translations and non-heave rotations are restrained by the explicitly reported fixed guides.

The wheel/tire position is initialized using the source elastic normal law and the combined physical weight. The spring free length is selected so it supports the sprung mass at the declared ride height. These seed values are experimental fixture values, not a measured DeLorean quarter-car calibration. `parameters.json` is the human-readable fixture; every output has a machine-readable runtime snapshot.

The master step is fixed at 1 ms (refinement also runs 0.5 and 0.25 ms). Each step clears the old tire accumulator, synchronizes and advances TMeasy once with that step, applies the newly calculated hub wrench, sets the shaft-port torque on the free revolute coordinate, invalidates Chrono's cached force update with `ForceUpdate()`, and advances the native system. This explicit invalidation is needed because otherwise changed tire/shaft inputs may be used one step late. The system then integrates body/joint state. The tire step and body step are asserted equal.

Drive torque and braking torque act through the native revolute joint's free `Rz` coordinate (the frame z axis is aligned with wheel y); Chrono applies the equal/opposite housing torque. Braking is a bounded slipping torque opposing relative spin. No wheel-speed assignment, lock, engine, clutch, gearbox, road acceleration, bump stop or additional tire correction is implemented. In driven-road tests the fixed x/y guide reacts to the tire force, so they do not represent vehicle acceleration.

`boundary` is a separate controlled contact-history fixture: prescribed initial wheel spin builds a finite bristle value under positive support; an analytically initialized upward velocity then places it at the nearest representable zero-support boundary using the native contact frame. It is not a free release maneuver. `unload` uses a 50 kN, 15 ms declared sprung-body lift input, reports its work, and observes actual support loss and recontact.
