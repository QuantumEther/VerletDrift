# Mission 21: native Chrono boundary verification

This directory contains a standalone experiment using real pinned Chrono objects. It does not reuse Mission 20's extracted-method adapter. `ReadableTire` exposes read-only diagnostics; it overrides no contact, force, state-update or timestep method.

Fixed upstream commit: `9a5072b5324e012a66d9fb7eaac0c679b8465e73`. The input matrix is [cases.json](cases.json): exactly four questions, eleven fresh-object cases, each repeated twice. Results and classifications are in the accompanying Mission 21 reports.

## Prepare a minimal native build (tested on Debian x86_64)

Keep all tools, upstream source and build artifacts outside VerletDrift. The tested small dependencies were CMake 3.31.6, Ninja 1.11.1.3, GCC 14.2.0 and Debian Eigen 3.4.0-4. For example:

```bash
python3 -m pip install --target /tmp/chrono-m21-tools cmake==3.31.6 ninja==1.11.1.3
```

Obtain `libeigen3-dev_3.4.0-4_all.deb` from `https://deb.debian.org/debian/pool/main/e/eigen3/` and extract with `dpkg-deb -x` into `/tmp/chrono-m21-deps`. This installs no system packages. For another platform supply its Eigen header directory instead; native verification on that platform is not claimed here.

Fetch the fixed commit into an external Git checkout. From VerletDrift root:

```bash
mkdir -p /tmp/chrono-m21-source
git -C /tmp/chrono-m21-source init
git -C /tmp/chrono-m21-source remote add origin https://github.com/projectchrono/chrono.git
git -C /tmp/chrono-m21-source fetch --depth 1 --filter=blob:none origin 9a5072b5324e012a66d9fb7eaac0c679b8465e73
git -C /tmp/chrono-m21-source config core.sparseCheckout true
git -C /tmp/chrono-m21-source config core.sparseCheckoutCone false
cp research/scientific-rebuild/tmeasy-native-verification/upstream-sparse.txt /tmp/chrono-m21-source/.git/info/sparse-checkout
git -C /tmp/chrono-m21-source checkout --detach FETCH_HEAD
mkdir -p /tmp/chrono-m21-source/data
```

The sparse checkout omits the large asset tree. The actual patterns used are:

```text
/*
!/*/
/cmake/
/src/CMakeLists.txt
/src/*.in
/src/chrono/
/src/chrono_vehicle/
/src/chrono_thirdparty/
/src/**/CMakeLists.txt
/src/chrono_models/ChApiModels.h
/src/chrono_models/vehicle/generic/Generic_Wheel.*
/src/chrono_models/vehicle/generic/tire/Generic_TMeasyTire.*
```

Create an empty `data/` directory in that external checkout because upstream CMake copies it unconditionally. No assets or data are consumed by this experiment. Do not alter tracked upstream files.

Using the actual CMake binary inside the wheel (`.../cmake/data/bin/cmake`) avoids needing Python package-path configuration. Substitute your external source/build paths below:

```bash
/tmp/chrono-m21-tools/cmake/data/bin/cmake -S /tmp/chrono-m21-source -B /tmp/chrono-m21-build -G Ninja \
  -DCMAKE_MAKE_PROGRAM=/tmp/chrono-m21-tools/bin/ninja \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH=/tmp/chrono-m21-deps/usr \
  -DCMAKE_DISABLE_FIND_PACKAGE_MPI=TRUE \
  -DCH_ENABLE_MODULE_VEHICLE=ON -DCH_ENABLE_MODULE_FEA=OFF \
  -DCH_ENABLE_MODULE_VEHICLE_MODELS=OFF -DCH_ENABLE_MODULE_ROBOT_MODELS=OFF \
  -DCH_ENABLE_YAML=OFF -DCH_ENABLE_OPENMP=OFF \
  -DBUILD_DEMOS=OFF -DBUILD_TESTING=OFF -DBUILD_BENCHMARKING=OFF
/tmp/chrono-m21-tools/bin/ninja -C /tmp/chrono-m21-build -j4 Chrono_vehicle
```

This builds authentic Core and Vehicle libraries, not a complete vehicle application. The official build includes other Vehicle class implementations in the same library; no optional subsystem demo is executed. MPI is not needed and was disabled because the environment had a stale MPI discovery path. Setting a prefix rather than only Eigen3_DIR permits upstream's Eigen-5-then-Eigen-3 search to find Debian Eigen correctly. No source patch was used.

## Build and repeat the four investigations

From VerletDrift root:

```bash
/tmp/chrono-m21-tools/cmake/data/bin/cmake \
  -S research/scientific-rebuild/tmeasy-native-verification -B /tmp/chrono-m21-probe -G Ninja \
  -DCMAKE_MAKE_PROGRAM=/tmp/chrono-m21-tools/bin/ninja -DCMAKE_BUILD_TYPE=Release \
  -DCHRONO_SOURCE=/tmp/chrono-m21-source -DCHRONO_BUILD=/tmp/chrono-m21-build \
  -DEIGEN_INCLUDE=/tmp/chrono-m21-deps/usr/include/eigen3
/tmp/chrono-m21-tools/bin/ninja -C /tmp/chrono-m21-probe -j1
python3 research/scientific-rebuild/tmeasy-native-verification/verify.py \
  --exe /tmp/chrono-m21-probe/tmeasy_native --source /tmp/chrono-m21-source \
  --build /tmp/chrono-m21-build --out /tmp/chrono-m21-results
```

The probe matches upstream's `-march=native` and Eigen configuration; it directly compiles the two unchanged original Generic model `.cpp` files and links native Core/Vehicle. The verifier checks the upstream revision, original-file hashes, deterministic replay, Mission 20 point comparisons and independent wrench transformations. Read its classifications, not just the process exit code. Nonfinite outputs are preserved in CSV.

The lifecycle follows the pinned official wheel-test-rig sequence: clear accumulator, tire Synchronize, wheel Synchronize (cached wrench), tire Advance, system DoStepDynamics. A second ordinary Synchronize/application observes the pending wrench at the naturally advanced state. No force update is silently reordered to make the computed wrench immediately applied. The external integration uses the first applied wrench; if that wrench is nonfinite the harness records it and does not integrate it. No tire value is clamped or repaired.

Only initial wheel pose/velocity and caller step configuration are prescribed. Terrain, collision, wheel state, tire physics, hub translation, accumulation and system integration are native. No steering, drivetrain, full vehicle, force fit, tire correction or benchmark campaign is included. The original Project Chrono software is BSD-3-Clause; no upstream code is copied into this directory.
