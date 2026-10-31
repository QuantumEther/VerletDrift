# Selector-stop stability and accepted-stage subdivision

The real uncontrolled-RAF browser sessions revealed a failure absent from gentle 180 s driving: holding first-selector force against the stop at coarse h. At 250 Hz the unstable stop response crossed a release boundary; at 200/100 Hz the explicit selector reaction could produce enormous excursions before an energy check rejected. The saved pre-fix live traces retain those faults. This was not a renderer stall, and energy closure had not made the explicit stop integration stable.

The inherited linear stop law plus detent has k=61600 N/m, c=206 Ns/m, selector mass 0.25 kg in the reference configuration. For v1=v0+h*(-k*q0-c*v0)/m and q1=q0+h*v1, Jury stability requires h²*k/m+2*h*c/m<4. The policy also requires h*c/m<1 so explicit viscous drag alone cannot reverse velocity. A 0.9 margin on the smaller of this bound and the Jury critical step gives a safe interval of approximately 1.092 ms. This retains the existing 1 ms reference and resolves larger scheduled ticks only when needed. Coefficients are estimated from the authoritative inherited `selectorForces` function, not applied as a second force law. The bare mass is conservative when a worn cam adds reflected inertia.

The Experiment 11 adapter now subdivides only when a selector stop can be reached (or conservatively for the coupled worn second gear). Each inner step uses the full existing coupled vehicle; tire impulses are applied once per actual interval. No force, inertia or tolerance is changed. For reference parameters, active-stop 2/4/5/10 ms ticks use 2/4/5/10 coupled substeps. The maximum is 16 internal steps; unsupported configurations reject. Normal first-gear driving with zero selector force/velocity remains one step at the requested h. A coarse candidate requiring subdivision is rejected rather than accepted as a valid whole step. A new sign-crossing guard also prevents selected dogs jumping across the entire release interval unnoticed. Non-flat gear engagement/release subdivision remains unsupported and still explicitly rejects.

The entire nominal step is private until every substep and summed energy/work checks pass. Observations are published once, in accepted chronological order. A failure in a later substep leaves state, contacts and observer history unchanged. Conservative work/potential changes, physical damping, numerical loss and solver counts are summed; the sum of absolute substep residuals must stay below the original 1e-7 J work gate. The sum of local normal-work error bounds must stay below 1e-9 J. Accepted and attempted internal-step counts are distinct in clock telemetry, and the UI labels nominal frequency and internal steps/s.

## Production hold/release benchmark

One second, first gear, running engine, throttle/steering, 120 N selector force for 0.5 s then release. Actual model, existing driveline inertia and constraints. Substep counts are real solver advances, not hidden skipped calls.

| Nominal Hz | Internal advances | Max selector q (m) | Peak whole-step residual (J) | Fault |
|---|---:|---:|---:|---|
| 2000 | 2000 | 0.03201997 | 7.65e-12 | None |
| 1000 | 1000 | 0.03224932 | 1.49e-11 | None |
| 500 | 755 | 0.03181818 | 2.97e-11 | None |
| 250 | 637 | 0.03210643 | 5.88e-11 | None |
| 200 | 616 | 0.03195245 | 7.42e-11 | None |
| 100 | 577 | 0.03195245 | 1.47e-10 | None |

The held-force static balance is q=1960/61600=0.03181818 m, reached at all rates without commanding a target. Tests check this balance, an independent work-based excursion bound, exact nominal interval coverage, rollback after a later failed substep, sign-crossing event detection, and equivalence to explicitly sequenced coupled reference steps in independent/open/locked differential modes. Existing 1000 Hz flat regression remains exact.

The previously failing live 100 Hz engine-start/driving/braking/selector session now completes without a fault, with visible internal-step accounting. This is a software-rendered browser verification, not hardware-GPU frame-rate certification.

## Per-frequency live pilot timings

Real engine start precedes throttle/steering/braking in all runs. The following acceleration/steering windows use the same browser/viewport and controls. They are **not a controlled ranking**: shared load, tiny frame sample counts, and the fidelity-preserving sampler-cache change during collection confound timing comparisons. They demonstrate actual per-frequency application operation and retain measured timings rather than substituting controlled RAF tests. CPU/default conclusions use the numerical/analytic evidence, not these pilot FPS values. Percentiles below use nearest rank.

| Hz | Frames | Mean FPS | Frame median/p95/worst (ms) | Mean accepted tick cost (ms) | Sim/wall | Debt ms |
|---|---:|---:|---:|---:|---:|---:|
| 1000 | 7 | 3.15 | 316.7/333.3/333.3 | 1.474 | 0.030 | 40.0 |
| 500 | 6 | 2.75 | 350.0/433.4/433.4 | 2.756 | 0.029 | 44.0 |
| 250 | 5 | 2.27 | 466.7/583.3/583.3 | 4.250 | 0.029 | 42.0 |
| 200 | 6 | 2.76 | 333.3/416.6/416.6 | 4.311 | 0.044 | 35.0 |
| 100 | 6 | 2.78 | 349.9/399.9/399.9 | 9.873 | 0.051 | 30.0 |

The backend is SwiftShader. Repeat on hardware graphics at a frozen revision before making a rendering-throughput claim. Saved pre-fix selector-phase faults are intentionally not erased. The post-fix 100 Hz session is saved separately.
