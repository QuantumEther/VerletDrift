# Torque driven wheel sandbox

A standalone JavaScript ES-module experiment for one wheel with horizontal translation and rotation. It has no dependency on production physics or native Chrono.

## Run

From the repository root, start the existing static server:

```bash
python3 serve.py
```

Open `http://localhost:8000/research/scientific-rebuild/javascript-driving-prototype/` (or the URL printed by the server). Use **W** to apply drive torque, **S** to apply opposing brake torque, and **R** to reset. Mass, inertia, radius, friction coefficient, slip stiffness, and torque magnitudes are configurable.

The temporary contact law is `Fx = clamp(ks * (R*omega - v), -mu*N, +mu*N)`, where `N=mg`. It is a capped longitudinal slip-velocity approximation, not a validated tire model or a static-friction/deformation model. The wheel equations are `m*vDot=Fx` and `I*omegaDot=Tdrive+Tbrake_signed-R*Fx`. Brake magnitude is limited to avoid reversing wheel spin in one time step. The simulation uses a fixed 1 ms step.

Contact is solved implicitly using end-of-step slip. With `A=R²/I+1/m` and signed shaft torque `Ts`, the force is `clamp(ks*(slip_start+h*R*Ts/I)/(1+h*ks*A), ±mu*N)`. This closed-form solve avoids the unstable explicit update at high stiffness; it adds numerical dissipation rather than an artificial damping force. Translation and wheel rotation consume exactly the same force. Positions use the new velocities. Returned `slipVelocity` labels the start-of-step state; the page displays the current state after integration.

The brake first limits its impulse against the free shaft prediction (old spin plus drive impulse), then contact is solved with that bounded signed torque. It never assigns rolling wheel speed. Live physical parameter changes reset the experiment, and torque controls apply on subsequent steps. The drawing follows position with a scrolling camera; positive angle is clockwise in the side-view canvas. No chassis, tire deformation, standstill friction, or load transfer is represented.

Run the deterministic mechanics test from the repository root (Node.js built-in test runner; no Vitest/Rollup required):

```bash
node --test research/scientific-rebuild/javascript-driving-prototype/tests/wheel.test.js
```

The Node suite also checks free rolling, drive, contact reaction, friction limits, zero friction, and the instantaneous kinetic-energy identity. The existing constant-torque test checks semi-implicit Euler at fixed `h=0.001 s`: after 3 s (`T=7.2 N·m`, `I=2.4 kg·m²`) the expected angular acceleration is `3 rad/s²`, speed is `9 rad/s`, and rotational energy is `97.2 J`.

Verification: **10/10 Node tests passed**. The isolated constant-torque test disables road friction. The instantaneous power test uses the same time level for every term, and the step ledger separately accounts for numerical energy loss `½I Δω² + ½m Δv²` from the implicit velocity step; its residual tolerance is `1e-12 J`. The default drive/brake experiment runs for 12 simulated seconds and checks finite forward motion and near-zero final energy without reversal.

Browser smoke test (uses the repository's existing Playwright installation):

```bash
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/javascript-driving-prototype/tests/browser-smoke.mjs
```

With an installed Playwright browser, omit `CHROMIUM_PATH`; otherwise set it to your Chromium executable. The test serves the sandbox on an ephemeral local port. Chromium execution passed: module initialization, W acceleration, changing Canvas image, S deceleration, R reset, and no page exceptions. One observed run accelerated to 1.981 m/s and braked to 0.793 m/s; browser timings vary. Production files are untouched.

## Mission 26 suspension

One independent vertical coordinate above a fixed-height wheel support uses mass 40 kg, stiffness 4000 N/m, damping 160 N·s/m, free length 0.6 m, and gravity 9.81 m/s². Equilibrium length is 0.5019 m. Implicit midpoint integrates the linear spring/damper at the same 1 ms clock. Space adds upward velocity 0.5 m/s once per key press (20 N·s impulse); R restores equilibrium. Gravity energy uses z=0 at the wheel support. Spring and damper reactions are reported on the constrained support. Normal load is assumed constant (wheel mass + sprung mass)g, not calculated from that reaction. No reaction is counted twice. Horizontal inertia remains the existing wheel assembly mass; the vertical fixture is an independently constrained experiment.

Run all 14 mechanics tests with `node --test research/scientific-rebuild/javascript-driving-prototype/tests/*.test.js`. Tests cover static balance, predicted undamped period (0.6283 s), damping decay, force signs, and existing wheel regressions.

## Mission 27: coupled quarter vehicle (current browser model)

This supersedes the fixed-support Mission 26 browser assumptions above. `quarter.js` integrates independent sprung and unsprung heights in world metres, positive upward. Masses are 40 and 12 kg, suspension 4000 N/m and 160 N·s/m with 0.6 m free length; tire radial stiffness/damping are 40000 N/m and 180 N·s/m. Suspension reactions are equal/opposite. Static tire compression is 0.012753 m, hub height 0.307247 m, and body height 0.809147 m. Normal force is unilateral: zero for no penetration, otherwise max(0, kt*compression-ct*relative vertical velocity). The same computed normal force is displayed and bounds longitudinal force; no suspended weight is added again.

Shared horizontal position constrains both masses, so horizontal inertia is 52 kg by default. Wheel rotational inertia remains independent. Each master step advances vertical RK4 (four coherent vertical force stages), then uses its accepted normal force for the existing implicit longitudinal update. This partition is explicit in the vertical/horizontal coupling; horizontal forces have no vertical feedback in this reduced model. No tire substeps or external engine are used.

B triggers a time-prescribed road displacement: 0.08*sin²(pi*t/0.4) metres for 0.4 seconds. Radial damping uses wheel velocity relative to this moving road. The road input performs external work; energy conservation is not claimed during a bump. Space adds 0.5 m/s sprung velocity (20 N·s). Neither action changes display coordinates directly. Rendering uses 190 pixels per metre for vertical geometry without displacement exaggeration. Road penetration depicts radial compression; separation depicts airborne state.

Validation: 19/19 Node tests pass, including all earlier wheel/suspension regressions and five coupled tests covering static balance, disturbance decay, separation/recontact, load-dependent friction, total horizontal inertia and bump refinement. Vertical state-vector errors at 1 second against 0.25 ms were 1.21e-10 at 1 ms and 7.07e-12 at 0.5 ms for the smooth bump. These local results do not establish convergence for every touchdown. Chromium smoke covers Space oscillation, B changing calculated normal force, W drive, S brake, R reset and zero exceptions.

Limitations: linear bilateral suspension (no bump stops), temporary capped longitudinal slip law, no pitch/roll, and prescribed uniform road heave rather than a spatial obstacle. The unilateral damping cutoff is nonsmooth and is not an energy-conserving impact law. No universal passivity claim is made. `suspension.js` and its standalone tests remain as the previous isolated oscillator regression; the browser uses `quarter.js`.

## Mission 28: current browser model

The browser now uses `vehicle.js`: chassis mass 80 kg, pitch inertia 45 kg m², front/rear arms +1/-1 m relative to the centered COM (2 m wheelbase), two 12 kg unsprung masses, and independent 2 kg m² rotors. Prior quarter and oscillator modules remain regression fixtures. Defaults retain each corner's suspension/tire coefficients from Mission 27. Static support is 510.12 N per axle (1020.24 N total).

Chassis mount height/velocity are z+x*pitch and vz+x*pitchRate. Upward corner forces sum into chassis heave and their x-weighted sum into positive nose-up pitch; opposite reactions act on the unsprung masses. Vertical RK4 advances all six vertical/pitch states coherently. Both wheels share chassis horizontal velocity: total translational inertia is 104 kg. The two capped slip laws are solved together with that shared velocity via nine bounded analytical active-set cases. Rear torque drives only the rear rotor; S applies 8 Nm brake capacity to each rotor.

B places a spatial 8 cm sin² bump of length 0.8 m 0.3 m ahead of the front wheel. Both wheels sample world position x+arm; the front reaches it first in forward motion. Radial damping uses road slope times forward speed. Space adds 0.5 m/s chassis vertical velocity. R resets. Drawing uses integrated pitch, independent hub heights and wheel angles, with a tracking camera.

Limits: small-angle pitch with vertical suspension forces; no longitudinal pitch inertia coupling, rotor housing pitch reaction, or road-slope longitudinal normal-force component. Thus this is a reduced side-view model, not full rigid-body acceleration-induced load transfer. Vertical forces produce pitch and changing axle loads over bumps; acceleration/braking pitch should not be inferred as physically complete. Fixed 1 ms stepping, partitioned vertical/longitudinal coupling, and no bump stops. The scheduler retains elapsed time in its accumulator with a bounded per-frame work budget.

Validation: 24 Node tests passed before the additional timestep regression. Added tests cover equilibrium/weight, equal-and-opposite forces and pitch signs, combined-mass propulsion, both brakes, front-before-rear bump contact, damped recovery and airborne zero friction. A two-second coasting bump comparison against 0.25 ms gave maximum state-component differences of 0.000350868 at 1 ms and 0.000116518 at 0.5 ms (mixed SI units; compare components rather than interpreting as one physical error). Chromium smoke exercises the new page, Space, B, rear drive, both brakes, Canvas change, reset and page-error capture.

Launch remains `python3 serve.py`, then `http://localhost:8000/research/scientific-rebuild/javascript-driving-prototype/`.
