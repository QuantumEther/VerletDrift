# Mission 20 — computational assessment

## Structural work

Original Synchronize performs external contact/kinematic work and fixed-size slip/parameter arithmetic. In a contacting Advance, exactly one CombinedCoulombForces call updates two scalar bristles, one tmxy_combined evaluation computes the combined handling curve, and at most one AlignmentTorque evaluation is made. There is no tire equilibrium/root iteration, recursive wheel solve or hidden substep in these methods. No-contact Advance returns immediately. Parameter guessing and optional vertical least-squares fitting are setup work, excluded from timed calls.

The minimal adapter executes only the original constitutive methods and prescribed identity-frame contact input. It does not measure the real terrain collision, frame/quaternion operations, Chrono system solver, wheel/spindle dynamics, four tires, browser, diagnostics serialization, or production rendering. Full framework integration cost remains unknown.

## Measurements actually executed

[benchmark.csv](../../research/scientific-rebuild/tmeasy-evaluation/results/benchmark.csv) records one saved benchmark run. Hardware: AMD EPYC 9V74 80-Core Processor in a shared cloud environment; Linux 6.18.55 x86_64, glibc 2.41; g++ Debian 14.2.0-19, -O2 C++17. No CPU pinning or real-time scheduling. Python 3.12.14 orchestrates; timed work is C++, not Python.

Each regime/work unit has 2000 warmup calls and 10000 measured calls. Every timing brackets one operation with steady_clock; quantiles are sorted samples at zero-based indices 5000/9500/9900. They include timer overhead and shared-host interruptions, so very small differences are not meaningful. Bristle states evolve during repeated held inputs; no elapsed vehicle simulation or reset is hidden in a sample. Configured dt=.001 s. Each full call completes one model update; no failed/rejected benchmark call was observed. The NaN boundary is a separate failed experiment, not omitted from the validation record.

|Regime / work unit|Mean ns|Median ns|p95 ns|p99 ns|Worst ns|
|---|---:|---:|---:|---:|---:|
|Forward 10 m/s, prescribed Synchronize+Advance|104.82|100|110|111|20421|
|Blend 2 m/s, same|141.30|140|141|150|11157|
|Near zero .01 m/s, same|85.60|81|91|91|11357|
|Reverse -10 m/s, same|105.08|100|101|110|38237|
|Forward, bristle call only|31.97|30|40|41|60|
|Blend, bristle call only|33.44|30|40|41|14912|
|Near zero, bristle call only|31.95|30|40|41|41|
|Reverse, bristle call only|33.39|30|40|41|14421|

Bristle-only calls are **not** added to full-call times; the latter already contain the update. Benchmark work totals 48000 prescribed Synchronize+Advance calls including warmup, plus 48000 separate bristle-only calls. C++ operator-new instrumentation observed zero allocations inside all measured call loops; setup/vector reservation and output are outside timing. This does not instrument arbitrary libc allocation or the excluded framework.

The large ratio of worst to median is visible; bounded arithmetic is not a hard real-time latency guarantee. No cross-language speedup ratio versus Zhang or the legacy solver is claimed. Diagnostic and CSV-writing costs, real contact collision, and the source's optional QR stiffness fitting were not timed. The benchmark's inexpensive arithmetic does not establish physical suitability or production-browser frame rate.

Reproduce with the command in [numerical validation](tmeasy-numerical-validation.md). Changed host scheduling will change timings; deterministic force CSV, not identical timing samples, is the reproducibility expectation.
