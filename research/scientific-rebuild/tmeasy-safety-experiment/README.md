# VERLETDRIFT RESEARCH PATCH — NOT UPSTREAM CHRONO

Mission 22 changes exactly one support-boundary comparison in pinned Chrono `9a5072b5324e012a66d9fb7eaac0c679b8465e73`: `Fn_mag < 0` becomes `Fn_mag <= 0`. See [zero-load.patch](zero-load.patch). No epsilon, load floor, force-curve, moment, reverse, or timestep modification.

The finite-history policy is deliberately minimal: no support while geometrically overlapping means inactive contact, zero returned wrench and frozen finite bristles. Actual geometric separation retains upstream's reset. This prevents creation of NaN state from the tested zero-support boundary; it does not heal a corrupt imported checkpoint or certify physical unloading/recontact accuracy.

## Native reproduction

Prepare the unmodified pinned Core/Vehicle build using [Mission 21 instructions](../tmeasy-native-verification/README.md). The following paths describe the actual environment used; substitute external paths for another checkout. No generated object, library or dependency tree goes into VerletDrift.

First build the original comparison executables:

```bash
/tmp/m21-tools/cmake/data/bin/cmake -S research/scientific-rebuild/tmeasy-safety-experiment \
  -B /tmp/m22-original -G Ninja -DCMAKE_MAKE_PROGRAM=/tmp/m21-tools/bin/ninja \
  -DCMAKE_BUILD_TYPE=Release -DCHRONO_SOURCE=/tmp/m20-chrono -DCHRONO_BUILD=/tmp/m21-build \
  -DVEHICLE_LIBRARY_DIR=/tmp/m21-build/lib -DEIGEN_INCLUDE=/tmp/m21-deps/usr/include/eigen3
/tmp/m21-tools/bin/ninja -C /tmp/m22-original -j2
```

Create the separate variant from one copied original `.cpp`, applying the reviewable unified diff:

```bash
python3 research/scientific-rebuild/tmeasy-safety-experiment/build_variant.py \
  --source /tmp/m20-chrono --build /tmp/m21-build --ninja /tmp/m21-tools/bin/ninja --out /tmp/m22-variant
```

This uses the original Ninja compile/link commands. It replaces exactly one Vehicle object and relinks a separate `libChrono_vehicle.so` in `/tmp/m22-variant/lib`; all other original Vehicle objects and the original Core library are reused. No symbol-interposition shim or copied-method implementation. Original source, object and shared-library bytes remain unchanged; the script asserts original source/library hashes before and after. It requires the original **build tree including objects**, not only installed libraries. Output path must be fresh for patch application.

Then build the same probes against the explicitly selected variant library:

```bash
/tmp/m21-tools/cmake/data/bin/cmake -S research/scientific-rebuild/tmeasy-safety-experiment \
  -B /tmp/m22-patched -G Ninja -DCMAKE_MAKE_PROGRAM=/tmp/m21-tools/bin/ninja \
  -DCMAKE_BUILD_TYPE=Release -DCHRONO_SOURCE=/tmp/m20-chrono -DCHRONO_BUILD=/tmp/m21-build \
  -DVEHICLE_LIBRARY_DIR=/tmp/m22-variant/lib -DEIGEN_INCLUDE=/tmp/m21-deps/usr/include/eigen3
/tmp/m21-tools/bin/ninja -C /tmp/m22-patched -j2
python3 research/scientific-rebuild/tmeasy-safety-experiment/verify.py \
  --original /tmp/m22-original --patched /tmp/m22-patched --variant /tmp/m22-variant --out /tmp/m22-results
```

The runtime-library paths are checked with `ldd`. Use Linux GCC-compatible native build flags; this exact execution was not verified on other platforms. Hashes, compilation arguments and environment are saved in results. Root upstream BSD-3-Clause terms are retained in [UPSTREAM-LICENSE](UPSTREAM-LICENSE).

## Scope and output interpretation

`frozen` directly compiles the unchanged Mission 21 native test source: eleven cases. `trajectory` adds nine prescribed native contact-history stages, retaining tire states and using real terrain collision, wheel state, tire lifecycle and spindle accumulation. It records each native body step or rejection. The fixture driver prescribes each stage's pose/velocity; this is a tire-memory excitation, not an unforced free-vehicle trajectory or energy/passivity experiment. No internal state is assigned.

Both variants/executables run twice. Original failure CSV records, including NaNs and a rejected native body step at direct re-support, are retained. Patched history has no rejected step. The original eleven-case trace also matches the historical Mission 21 trace byte-for-byte. Numeric regression tolerance is 1e-8 absolute + 2e-11 relative; the ten unaffected frozen record strings were also identical in this run.

The verification verdict applies only to the admitted finite-state fixture and specified boundary. Extreme underflow, invalid coefficients/geometry, corrupted checkpoints, comprehensive physical recontact behavior and global tire passivity remain outside that claim. Native cached-wrench order and SetStepsize ownership are unchanged.

See [patch validation](../../../docs/scientific-rebuild/tmeasy-zero-load-patch-validation.md) and [Mission 22 decision](../../../docs/scientific-rebuild/mission-22-decision.md). No vehicle, drivetrain, production port or gameplay change is implemented.
