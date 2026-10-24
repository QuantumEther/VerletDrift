# Mission 20: pinned Chrono TMeasy method-slice probe

Gate Zero: CONDITIONALLY READY. This is an isolated prescribed-contact adapter, not a complete Chrono build or a production tire port. Original methods and fixture initializer are extracted unchanged from the small vendored source set; `source-manifest.json` pins provenance and verifies all source bytes. See `upstream/LICENSE` (BSD-3-Clause).

Run from repository root:

```bash
python3 research/scientific-rebuild/tmeasy-evaluation/verify.py /tmp/tmeasy-m20 --benchmark
```

Requires Python 3 standard library and g++ with C++17. Generated includes and binary go to the requested output directory, outside the repository. No external downloads or full-framework dependencies. `build.py /tmp/tmeasy-build` only builds the probe.

`cases.csv` preserves all 54 cases, including NaNs at zero normal force. `verification.json` separates passing reproduction assertions from candidate FAIL findings and unresolved passivity. Exit zero means the recorded source observations were reproduced, not that the model is approved. `power-probes.json` is an independent wheel-wrench calculation at 12 fixed diagnostic points. `benchmark.csv` includes warmup methodology in the linked report; timings vary by host.

Only upright flat contact, zero camber, prescribed hub velocity/spin/depth/contact flag and fixed road coefficient are supported by the adapter. No collision, JSON parsing, actual Chrono transforms, spindle/vehicle integration or production imports. All constitutive law bodies are original.

See [source audit](../../../docs/scientific-rebuild/tmeasy-source-and-license-audit.md), [validation](../../../docs/scientific-rebuild/tmeasy-numerical-validation.md), and [decision](../../../docs/scientific-rebuild/tmeasy-architecture-decision.md).

Exact research file inventory: `README.md`, `build.py`, `harness.cpp`, `verify.py`, `source-manifest.json`; `upstream/ChTMeasyTire.cpp`, `upstream/ChTMeasyTire.h`, `upstream/ChFunctionSineStep.cpp`, `upstream/Generic_TMeasyTire.cpp`, `upstream/LICENSE`; `results/cases.csv`, `results/fixture.csv`, `results/verification.json`, `results/power-probes.json`, `results/benchmark.csv`. No generated binary or dependency tree is committed.
