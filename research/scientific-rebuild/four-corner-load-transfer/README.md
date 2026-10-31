# Laboratory 10 — four-corner load transfer

Runnable page: `index.html`. Stable navigator route: `lab/load-transfer/`. This is a **reduced local-reference experiment**, not a full road vehicle or a calibrated car model. Previous experiments are not modified.

## Integrated update

`src/vehicle.js` advances the existing seven-coordinate vertical subsystem with RK4, applies prescribed rear-wheel torque impulses, then uses the existing four-contact stage to solve fourteen coupled velocities. The contact Jacobians include pitch/roll, horizontal translation, yaw and four wheel spins. Each wheel's actual compliant normal load from its independent vertical state bounds its friction disk. Hydraulic brake capacities come from the validated predecessor `brakeActuation`; steering angles come from its closed `linkage`. The underlying tire impulse solver is imported unchanged. No acceleration-based transfer force is added. Contact velocities and reaction moments use the same virtual-work map.

The reference values remain those of the foundation: 80 kg sprung mass, 6 kg per wheel, pitch/roll inertia 45/20 kg m², suspension 2000 N/m per corner, damping 80 N s/m, vertical tire stiffness 20000 N/m, radius 0.32 m and contact lever height 0.5 m. Wheel spin inertia is 1 kg m². They are illustrative SI parameters, not measurements.

The contact stage closes its kinetic/work balance and reports numerical dissipation independently. The split vertical/contact loop also reports the accumulated residual of total energy, external wheel-torque work, suspension dissipation, contact/brake dissipation and contact numerical loss. Vertical damper work uses trapezoidal quadrature. This residual is **not zero** or hidden: for 0.4 s braking, 2/1/0.5 ms steps give 0.00178788 / 0.000448483 / 0.000112305 J. Pitch values are -0.03804368 / -0.03805189 / -0.03805553 rad. At 1 ms, front normal loads reach 323.464 N each versus 186.656 N rear. The acceleration fixture gives 251.705 N front and 258.415 N rear. These are transient fixture results, not steady analytical transfer measurements.

## Interaction and verification

The page offers equilibrium, braking, acceleration, left/right steering and reverse steering presets, reset/repeat and pause/run. Top, side and front views show independent corner load bars and suspension responses; the table reads actual normal force, grip utilization and spring compression. Pitch/roll and both energy residuals are displayed. Each run stops at two simulated seconds to limit interpretation outside the local reference geometry.

Twelve numerical tests pass: independent corner equilibrium/contact loss, force/moment and virtual-work balance, damped/conservative suspension response, contact energy balance, braking/acceleration load direction, mirrored turn response, reverse finiteness and timestep refinement. Chromium verifies six scenarios, exact display/state load correspondence to rounding precision, reset, three views, direct loading, navigator No. 10/Latest and the launch iframe. Commands:

```
node --test research/scientific-rebuild/four-corner-load-transfer/tests/*.test.mjs
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/four-corner-load-transfer/tests/browser.mjs
```

## Remaining gates and explicit reductions

Horizontal kinematics use a fixed linearized reference frame and constant contact lever height; yaw is recorded but not used to construct a finite-rotation road vehicle. Left/right scenarios demonstrate initial lateral load response, not validated sustained constant-radius cornering. Steering is prescribed, with no column inertia or steering work coupling; propulsion is a prescribed wheel-torque fixture, with no engine, clutch, gearbox or differential integration. No claim is made that those mechanisms have been integrated. Tire friction is fixed μ=0.9, with no load sensitivity. No tire-track or 3D renderer is included. Those features require further work against the governing plan, rather than simulated accuracy added to the UI. Unilateral normal contact is elastic, with no tire normal damper. Contact-switch convergence and steady analytical load-transfer cases remain separate validation gates. A complete Experiment 10 as specified in the governing technical plan is not claimed.

The shared brake/tire/steering modules are loaded through relative imports from the braking prototype. Publishing must include that dependency directory and the complete Experiment 10 directory alongside the generated `lab/` files. Public Pages deployment remains separate: the Pages API previously returned Forbidden, so a repository administrator must confirm Settings → Pages publishing source before applying the additive overlay. No repository settings or public deployment were changed here.
