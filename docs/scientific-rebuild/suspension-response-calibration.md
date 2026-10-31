# Experiment 10 suspension characterization

Baseline: 9d1a799. Parameters are unchanged. Reproduce all nine runs with `node research/scientific-rebuild/four-corner-load-transfer/tests/measure-suspension.mjs`. Results live in Experiment 10 `results/suspension-summary.json` and compressed `suspension-traces.json.gz`; traces sampled every 5 ms include actual coordinates, velocities, normal forces, spring compression, spring energy and damper power. Integration is 1 ms. Failed runs record their accepted time and exact fault, never a completed status.

## Measured free decay

Initial heave displacement is 0.01 m; pitch/roll displacements are 0.005 rad. Positive local maxima of the observed coordinate estimate the period and logarithmic decrement using the first four peaks. These are envelope estimates of a coupled response, not exact damped eigenvalues. Settling means the coordinate remains within 2% of its initial displacement through the end of the six-second record; discrete last-outside times are reported at 5 ms resolution.

| Motion | Observed Hz | Estimated damping ratio | Settling s | First opposite peak |
| --- | --- | --- | --- | --- |
| Heave | 1.50376 | 0.17318 | 2.361 | -0.005744 m |
| Pitch | 1.83486 | 0.22205 | 1.431 | -0.002438 rad |
| Roll | 1.16279 | 0.20831 | 2.271 | -0.002626 rad |

The independent two-mass vertical-only undamped predictions remain 1.51556 / 2.01866 / 1.81762 Hz. Projecting structural damping onto those undamped modes gives approximate ratios 0.17225 / 0.22845 / 0.20609. Heave's lightly damped prediction agrees within 3%, verified against fresh deterministic simulation. Pitch and especially roll involve contact-Jacobian coupling to horizontal, yaw and wheel-spin motion; the vertical-only frequencies are not the eigenfrequencies of the full vehicle. Their discrepancy is not evidence that a spring coefficient should be retuned to force agreement. Exact damped modes of the full contact regime remain to be calculated; early-peak envelope estimates may mix modes.

Sag is 0.0981 m and static spring energy is 38.49444 J. Heave decay dissipates 0.400000 J through dampers. Relative-velocity damping is nonnegative in power and present exactly once. This is a 104 kg scaled reference mechanism, not a calibrated passenger car. No passenger-car presets are introduced without coherent vehicle data.

## Driving and unilateral contact

Six-second progressive braking peaks at 0.026663 rad pitch; emergency braking peaks at 0.073392 rad (4.21 degrees), with 0.164766 m maximum spring compression and 0.419387 m/s relative suspension velocity. Rapid steering reversal peaks at 0.064969 rad roll (3.72 degrees). Those are physical outputs from the current baseline, not animation amplitudes. They are not declared real-car accuracy or validated suspension-travel limits.

A single wheel displaced upward by 0.02 m initially loses contact, records 17 zero-normal integration samples and one restoration, then settles within 0.0004 m by 0.541 s. This is a wheel-displacement/release fixture, **not a supported road-height bump**; road disturbance support is still absent.

The requested twelve-second mixed drivetrain/steering/service-brake/handbrake session fails at 10.807 s with `Clutch/contact modes unresolved: h=0.001, slip=0.010685618244927753, capacity=15, motor=1.8959173940245495`. It is recorded as incomplete. Its maximum contact energy residual before failure is 2.54e-12 J and accumulated vertical splitting residual is 0.00636161 J. The failure is a near-zero-slip clutch mode-transition issue, not evidence of suspension instability. It blocks a claim of robust prolonged driving. Next executable operation: reproduce this transition at refined steps and implement/validate event-aware slip capture or rollback-safe substepping in the Experiment-10-specific combined solver, retaining work and heat checks. Do not bypass the energy assertion or suppress the fault.

## Actual corrections and visual comparison

No spring/damper/mass/inertia values, smoothing, motion clamps or hidden forces were changed. Modal reference geometry factors now come from corner coordinates rather than fixed literals. Live diagnostics include approximate damping references.

The rendering audit found one missing transform: the body-mounted powertrain followed pitch/yaw but omitted chassis roll. It now follows the physical roll in vehicle views; inspection bench views intentionally retain their independent inspection frame. Body pitch/roll have no gain factor. Springs use bottom z = wheel height and top z = chassis z + x*pitch + y*roll, matching the declared small-angle suspension. Browser assertions compare actual world-space spring endpoints, body and powertrain roll during driving against simulation state. Damper lengths use the same suspension separation; there is no cosmetic filtering. Euler body artwork is a finite-angle illustration of a linearized physical model, not exact suspension kinematics.

Before/after physical response is unchanged by construction; the correction removes the drivetrain/body roll mismatch, rather than suppressing motion. Characterization traces are the unchanged baseline, with the rendering-only correction applied for browser tests. Existing numerical refinement already demonstrates decreasing vertical-work residuals; this mission does not establish contact-switch convergence or full-vehicle damping eigenmodes.

Twenty-one numerical tests pass, including a new fresh-simulation heave decay/repeatability comparison. The diagnostics browser test checks nonzero roll and physical endpoint correspondence. Prior experiments are unchanged. Full calibration remains unfinished pending the clutch transition fix, full coupled-mode analysis, road disturbance support and coherent travel-limit/preset specification. No claim of mission completion is made.
