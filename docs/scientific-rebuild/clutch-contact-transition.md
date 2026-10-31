# Experiment 10 clutch/contact transition correction

The original twelve-second mixed inputs are unchanged. Before the failed step at t=10.807 s, slip is +0.010685618244927753 rad/s and capacity is 15 N m. The coupled static candidate has zero endpoint slip and torque -4.270011726876329 N m, well inside capacity. Its midpoint slip work is -2.281385760738258e-5 J. The predecessor mode filter rejected this valid endpoint static solution because it required nonnegative midpoint work. This was inconsistent with the backward-Euler tire/contact solve. It was not an exceeded torque capacity or a suspension instability.

## Discrete correction

The Experiment-10-specific combined solver now uses backward-Euler friction consistently. A static candidate satisfies zero endpoint slip with a bounded impulse; a kinetic candidate satisfies torque at capacity opposing endpoint relative motion. Endpoint clutch dissipation is h*T*slip_end >= 0. Torque capacities, contact complementarity, inertia matrix, mechanical states, stopping constraints, rollback and observer emission are unchanged. No velocity clamp, engagement override, added substep, spring tuning or tolerance increase is introduced.

The rotor midpoint work identity still uses signed h*T*(slip_old+slip_end)/2. This is a discrete mechanical identity, not endpoint thermal dissipation. Endpoint heat and the independently computed quadratic backward-Euler numerical loss are kept separate. Finite-step capture heat is a discretization-dependent approximation; the numerical loss must not be relabeled as measured thermal energy. Exact continuous-time slip-event thermal histories remain outside the accuracy claim.

`flywheel.contactCandidates` records candidate mode, torque, endpoint slip/work and midpoint work. `flywheel.midpointClutchWork` exposes signed midpoint work separately from `heat` and `heatingPower`. Before/after full state at the historical failure interval, active impulses, rotor inverse matrix, normal loads, constraints and residuals are in `results/clutch-transition.json`.

## Verification

Three targeted tests pass: direct replay of the recorded historical failure, positive/negative near-zero slip and back-driving with high applied motor torque, abrupt tire grip changes, braking and steering; and the unchanged original twelve-second sequence at 2, 1 and 0.5 ms. They retain capacity, friction-sign, heat, rotor-work and contact-energy assertions. Twenty-one prior Experiment 10 numerical tests pass. Chromium diagnostics/physical geometry checks pass. Existing predecessor experiments are unchanged.

All three original replays complete. Maximum contact energy residuals are 2.80e-12, 2.54e-12 and 2.52e-12 J. Peak pitch converges from 0.0334023 to 0.0334110 to 0.0334149 rad; peak roll from 0.0846047 to 0.0846662 to 0.0846962 rad. The separately reported accumulated vertical splitting residual drops from 0.0265586 to 0.00663509 to 0.00165825 J. No residual is discarded or used as a balancing heat term.

A 24 s replay completes with maximum contact residual 2.54e-12 J, sum of absolute contact residuals 5.80e-9 J, clutch heat 961.188 J, 2,883,193 accumulated solver iterations and two static captures with negative midpoint work. Measured runtime was 39.4 s in the shared execution environment, not a browser real-time throughput guarantee or a controlled baseline speed comparison. The unchanged scheme adds candidate diagnostics but no new event subdivisions.

Reproduce:

```
node --test research/scientific-rebuild/four-corner-load-transfer/tests/clutch-transition.test.mjs
node research/scientific-rebuild/four-corner-load-transfer/tests/record-clutch-transition.mjs
node research/scientific-rebuild/four-corner-load-transfer/tests/record-clutch-transition.mjs --shifts
```

The second long variant preserves the first twelve seconds and then exercises clutch release/re-engagement, physical selector force and grip changes alongside the existing mixed controls. It completes 24 s with no fault, maximum contact residual 2.54e-12 J, absolute-residual sum 5.97e-9 J, 3267.766 J endpoint clutch heat, 2,519,780 solver iterations and 42.9 s shared-machine runtime. Its exact completion/fault and work metrics are retained in `results/clutch-transition-shifts.json`. These finite deterministic scenarios do not establish robustness for every drivetrain state or eliminate existing flat-ground/small-angle limitations.
