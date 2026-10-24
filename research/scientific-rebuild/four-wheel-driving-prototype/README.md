# Four-wheel driving prototype — Mission 30

Launch from repository root with `python3 serve.py`, then open
`http://localhost:8000/research/scientific-rebuild/four-wheel-driving-prototype/`.
W drives, S brakes all wheels, A/D steer, R resets, Space gives a chassis impulse, B places a spatial bump ahead. Select top driving or side suspension view.

Four independent rotors and tire frames at x=±1 m, y=±0.6 m define a 2 m wheelbase and 1.2 m track. Rear drive is a prescribed equal torque split, not a differential. All four wheels have separate slip, force, spin and brake states. Front angles share the bounded/rate-limited steering command (parallel steering, no Ackermann).

Local velocities are (u-r*y,v+r*x). Tire forces rotate through each wheel frame; yaw moments include x*Fy-y*Fx. Dynamic axle loads come from the retained two-unsprung-mass heave/pitch model and split equally left/right. Rotor inertia and unsprung mass are each half the earlier axle values. Total horizontally translated mass stays 104 kg; Iz stays 60 kg m². No roll or lateral load transfer.

Temporary lateral force is -800*alpha with alpha=atan2(tireVy,max(abs(tireVx),0.5)), capped by mu*N. Lateral stiffness is per contact in this new experimental configuration. Longitudinal slip stiffness is 18000 N s/m per contact. Remaining longitudinal capacity is sqrt((mu*N)^2-Fy^2). A four-equation implicit longitudinal contact solve includes all wheels, shared translation/yaw and rotor reaction. It enumerates at most 81 free/saturated cases and solves each with pivoted Gaussian elimination; no open-ended solver. One fixed 1 ms clock runs vertical RK4 then the planar step. Lateral forces are frozen during each step. This prioritizes lateral force within the friction circle and is not a calibrated tire law or a passivity proof.

The planar model omits full 3D coupling, steering reaction work, road-slope horizontal normal reactions and acceleration-induced pitch coupling. Side view projects left/right wheels onto their axle and uses average rotor angle; top view shows all four independently. Original Mission 29 files are frozen and unchanged.

Tests:
```bash
node --test research/scientific-rebuild/javascript-driving-prototype/tests/*.test.js
node --test research/scientific-rebuild/four-wheel-driving-prototype/tests/*.test.js
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/four-wheel-driving-prototype/tests/browser-smoke.mjs
```
Existing Playwright is used only for browser verification; runtime needs no dependencies.

Validation: 5/5 new deterministic tests passed, covering the ten requested checks in grouped scenarios; all 31/31 existing tests passed without edits. Chromium smoke passed on the new entry point: side suspension impulse and bump controls, acceleration, all-wheel braking, top view selection, steering-induced heading change, changing Canvas, reset, and zero runtime exceptions. The original tracked prototype files were compared byte-for-byte with commit 1a43beb, and remain unchanged.

No real-world handling calibration or universal numerical stability is claimed. Lateral stiffness is explicit per step; extreme speed or large slips can exceed this model's useful range. The fixed-work contact solve avoids unbounded nonlinear iteration. The browser intentionally keeps the existing plain Canvas renderer.
