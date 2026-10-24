# Mission 21 — native readiness

Gate Zero, established before the build and harness: **NATIVE CONDITIONALLY READY**. Branch `scientific-rebuild/08-tmeasy-native-verification`, based directly on Mission 20 `7e2df69bec9ed5153a7fed6229ced50f34bb998e`. Upstream is exactly [Chrono 9a5072b5324e012a66d9fb7eaac0c679b8465e73](https://github.com/projectchrono/chrono/tree/9a5072b5324e012a66d9fb7eaac0c679b8465e73), with **no tracked source modifications or compatibility patches**.

The six Mission 20 audit/decision documents, actual adapter and saved records were inspected. They remain the historical comparison baseline and were not edited. This mission executes native objects rather than another extracted-method adapter.

## Authentic minimum and actual build

The pinned official `src/tests/unit_tests/vehicle/utest_VEH_tire_contact.cpp` supplies the disc/flat-road collision precedent. More directly, `src/chrono_vehicle/wheeled_vehicle/test_rig/ChWheelTestRig.cpp`, VehicleWheelAssembly::Initialize/Synchronize/Advance, code lines 257–302, supplies the standalone spindle/wheel/tire pattern and lifecycle. ChWheel::Initialize explicitly permits a null chassis. No complete powertrain is needed.

Executed object boundary:

- `chrono::ChSystemSMC`, dynamic `chrono::vehicle::ChSpindle`.
- Actual `generic::Generic_Wheel` and `generic::Generic_TMeasyTire`; a derived `ReadableTire` exposes read-only diagnostics and overrides **none** of the lifecycle/constitutive/contact methods.
- Actual `FlatTerrain(0,.8f)`, SINGLE_POINT disc contact, wheel GetState, tire Initialize/Synchronize/Advance, local and global force reports, hub moment translation, wheel Synchronize, spindle accumulation and native DoStepDynamics.
- Initial position/orientation/velocities and caller timesteps are prescribed. Subsequent body motion is naturally integrated; no pose reset occurs before the second callback. The full ChWheelTestRig/ChWheeledVehicle orchestration objects are not instantiated. Their call order and timestep ownership were inspected separately.

No preinstalled Chrono, CMake or Eigen was present. Small temporary dependencies were CMake 3.31.6, Ninja 1.11.1.3 and Debian Eigen 3.4.0-4, extracted outside VerletDrift. Compiler: g++ Debian 14.2.0-19; Python 3.12.14; Linux 6.18.55 x86_64/glibc 2.41. Core and Vehicle were built in Release with FEA, model libraries, demos, tests, YAML, OpenMP and unrelated optional modules disabled. The official Vehicle library necessarily contains unused vehicle subsystems; none was instantiated as a vehicle/powertrain experiment.

The target required 640 build work units, four jobs and **468.7004 s** on this shared AMD EPYC 9V74 environment (five available CPUs, 32 GiB memory limit). Core library: 15,533,176 bytes; Vehicle: 7,288,656 bytes; probe executable: 240,024 bytes. No timing benchmark was undertaken. Library/executable hashes, dependency package checksum and configuration are in [build provenance](../../research/scientific-rebuild/tmeasy-native-verification/results/build-provenance.json), [build options](../../research/scientific-rebuild/tmeasy-native-verification/results/build-options.txt) and [linked libraries](../../research/scientific-rebuild/tmeasy-native-verification/results/linked-libraries.txt).

Build setup required no physics patch: a CMake prefix lets the Eigen-5-then-Eigen-3 search find extracted Eigen; optional MPI discovery was disabled because of a stale system MPI include path; an empty external `data/` satisfies upstream's unconditional asset-directory copy. No asset is consumed by this test. The observer matches upstream's `-march=native` and Eigen configuration to preserve ABI. No fast-math option or source-law change was added.

## Source integrity and reproducibility boundary

[Source integrity](../../research/scientific-rebuild/tmeasy-native-verification/results/source-integrity.json) records SHA-256 for fourteen relevant pinned files including the root BSD-3-Clause LICENSE, native tire/contact, wheel/spindle, official orchestration and Generic model source. Principal tire cpp hash is `4e254282b6e45eeb17e7206d08eb512b08f1c5e20402b198b26de7026b93322a`; header `8c33511b9310156f507f3b582230777f8433688f3d3038fe5871ae4ed25cdf96`. Both match Missions 17/20. The entire checked-out tracked source also passes `git diff --quiet`.

The native probe directly compiles the two original Generic `.cpp` files and links original Core/Vehicle shared libraries. No Chrono source tree, binary or dependency package is copied into VerletDrift. Root BSD conditions remain applicable to the external source/build; no commercial TMeasy implementation is used.

Exact setup/build/repeat commands and sparse checkout patterns are in [README](../../research/scientific-rebuild/tmeasy-native-verification/README.md). Tested source content is identified by upstream commit, VerletDrift base, frozen input hash and harness-file hashes in [verification.json](../../research/scientific-rebuild/tmeasy-native-verification/results/verification.json), rather than claiming the harness existed at the base commit.

## Exact new files

Documentation: this file, `tmeasy-native-boundary-results.md`, `tmeasy-native-wrench-and-timestep.md`, `tmeasy-native-verdict.md`.

Research directory `research/scientific-rebuild/tmeasy-native-verification/`: `CMakeLists.txt`, `README.md`, `cases.json`, `native.cpp`, `upstream-sparse.txt`, `verify.py`; results: `boundary-assessment.json`, `build-options.txt`, `build-provenance.json`, `linked-libraries.txt`, `native-run-1.csv`, `native-run-2.csv`, `source-integrity.json`, `verification.json`. No existing file is changed.
