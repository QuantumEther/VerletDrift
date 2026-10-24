# Mission 23 — validation record

The executable is deliberately limited to a one-corner native Chrono fixture. Validation source is [run_experiments.py](../../research/scientific-rebuild/first-sprung-corner/run_experiments.py); the exact machine output is [verification.json](../../research/scientific-rebuild/first-sprung-corner/results/verification.json). All generated traces are gzip CSVs with metadata sidecars in the same `results/` directory.

## Reproduction

From repository root, after the pinned Mission 21 Chrono build and Mission 22 patched variant are available:

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
  --out /tmp/m23-reproduction-results
```

The output directory must be new and empty. The runner verifies the Chrono source revision/hash, actual patched shared library, records runtime details and source hashes, then refuses invalid traces. The completed run used GCC 14.2.0, Python 3.12.14, NumPy 2.3.5, Linux x86_64, and an AMD EPYC 9V74 host with five CPUs available to the process. The recorded Git HEAD before the run was base commit `e75a0650cd0001f13192aead8a416fca7189dd4d`; mission files were uncommitted working-tree inputs, identified by SHA-256 in `verification.json`. Therefore the result is reproducible from recorded source hashes, but is not attributed to a committed Mission 23 commit.

## Results

All **24/24** checks passed, including 12 accepted finite Chrono traces, static force balance, torque/angular-momentum and work checks, driven tire force transfer to the constrained guide, finite near-zero boundary behavior, unload/separation/recontact behavior, hub wrench translation, the linearized heave-mode check, and timestep refinement. The disturbance's measured dominant frequency is 1.52672 Hz versus 1.52624 Hz predicted by the declared reduced linearization; measured decay is 3.18873 s⁻¹ versus 3.18333 s⁻¹ predicted.

The stepper accepts only the fixed step selected for each case: 1 ms main runs, with 0.5 ms and 0.25 ms refinements. The wheel-spin RMS difference against 0.25 ms falls from `7.97e-4 rad/s` at 1 ms to `2.60e-4 rad/s` at 0.5 ms over the common 0.5 s interval. Peak force RMS difference falls from 3.718 N to 1.228 N. The refinement is convergent for the sampled observables; it does not establish accuracy outside this setup.

The closest representable boundary in the assembled contact frame is slightly negative rather than bit-exact zero (`-4.55e-13 N` raw, zero applied support). That check passes; exact zero is a separate Mission 22 native tire test. The fixed guide prevents interpreting the drive case as chassis acceleration. Work-ledger discrepancies on transient bristle/contact cases remain visible and unresolved.

No production code, GUI, shaders, existing physics, or historical experiment source was changed. The only runtime modification is the already-authorized Mission 22 research library loaded from `/tmp`; pinned Chrono source remains unchanged. These outcomes verify this mechanical bench and its declared scenarios, not a complete vehicle, real-world tire behavior, or universal contact passivity.
