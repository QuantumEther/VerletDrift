# Collision gate: NOT VERIFIED — stop native splash extension

Branch PERFORMANCE_2, starting b335117; upstream SPlisHSPlasH dba6b26b9387ab6bdd187d6df0a7c9d490d03500. Linux x86-64, GCC 14.2, CMake 4.4.4, Release, AVX2/OpenMP, SPH_LIBS_ONLY, two OpenMP threads. No vehicle, audio or working balloon implementation changed.

## Trusted baseline

Inspected upstream `data/Scenes/GridModel_Akinci2012.json`: DFSPH method 4, Akinci boundary method 0. A fresh separate build `/tmp/verlet-official-example-build`, with SPH_LIBS_ONLY=OFF and Python bindings OFF, fails configuring bundled GLFW because X11 headers/libraries are missing. See official-build.txt. No official simulator executable exists in this installation, so the official scene was **NOT RUN**. Initialization, first step, subsequent steps and cache regeneration are NOT TESTED, not failed scene results. No claim is made that an official scene crashes. The library-only custom executable is not a substitute for an unmodified upstream scene loader.

Without this prerequisite, no custom volume/boundary/velocity progression was attempted. No solver parameter was changed to suppress the crash.

## Failure localization

The custom harness omitted boundary `deferredInit()` registration in the old export. Simulation::deferredInit initializes fluid models only. The pending registration change calls the upstream boundary initialization explicitly. Running that corrected harness exits 139 during its first step.

A diagnostic-only copy installs a SIGSEGV handler using glibc execinfo backtrace; link option `-rdynamic` exposes native symbols. Run: `OMP_NUM_THREADS=2 /tmp/verlet-splish/bin/verlet_trace /tmp/collision-trace.csv`. The captured stack is in native-backtrace.txt:

`Viscosity_Standard::step() [OpenMP worker] -> Simulation::computeNonPressureForces() -> TimeStepDFSPH::step() -> main`.

`addr2line -Cf -e /tmp/verlet-splish/bin/verlet_trace 0xa2357` resolves the worker symbol, but Release has no line information. This is a native signal trace, **not** an ASan report or a debugger backtrace. A fresh RelWithDebInfo official configuration was attempted but blocked on X11. No full debug/sanitizer solver run completed. gdb/lldb and the managed system-package installer are absent. The exact invalid access remains unresolved; this evidence does not prove a solver-library defect or identify viscosity parameters as a fix.

## Physical acceptance

FAIL/NOT VERIFIED. The historical 121-frame export has 251 particles, 5.509952 kg and **exactly zero horizontal velocity** at initial, middle and final frames. It is free fall, not collision. This independently fails the sideways-momentum criterion. No new asset was produced. The corrected harness exports only a partial initial frame before crashing; it is not a valid nontrivial sequence. Momentum transfer, boundary work, contact timing and energy stability after real contact remain NOT TESTED. Count/mass conservation in the invalidated free-fall export is not evidence of collision correctness.

## Firm decision and alternative

Stop extending this native implementation in this bounded attempt. Do not integrate or promote the current data. Leave the working laboratory effects active and the failed native setup isolated. No custom live fluid solver is proposed.

Next use an externally validated, licensed fluid mesh/particle animation with supplied timestamps, scale, gravity, positions/velocities and mass provenance. Require a preview showing actual impact, contact and spreading before accepting an asset. Until such data exists, improve the existing effect only as explicitly approximate, physically constrained procedural rendering: a coherent falling/deforming bulk, secondary ballistic droplets inheriting bulk velocity, and mass debited into world-space wet deposits. This is an artistic approximation, not a claim of solved water dynamics. No new native recovery campaign or additional graphical implementation is authorized by this decision record.
