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
