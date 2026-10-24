# Mission 31 — differential driving prototype

Standalone continuation. Start `python3 serve.py` from repository root, then open:
`http://localhost:8000/research/scientific-rebuild/differential-driving-prototype/`.
W rear torque, S brakes, A/D steering, Space chassis impulse, B spatial bump, R reset. Select 3D/top/side views. Mouse orbit/zoom and camera reset are retained. Gold housing and shaft mark the rear differential.

## Modes and rotational equations

Wheel order FL,FR,RL,RR. Input torque is applied once, at 1:1 ratio. No final drive losses or gears. Front rotors remain uncoupled. Rear wheel inertias are 1 kg m² each.

- Independent: externally prescribed T/2 to each rear rotor, carrier absent.
- Open: ideal symmetric gears impose omega_c=(omega_L+omega_R)/2. Carrier inertia Jc=0.4 kg m² is retained through elimination: rear mass matrix M=diag(JL,JR)+(Jc/4)*[[1,1],[1,1]]. Solve M*omegaDot=[T/2+brakeL-R*FxL,T/2+brakeR-R*FxR]. Carrier speed is derived, not a separately integrated or assigned state. Actual equal output torque is (T-Jc*omegaDot_c)/2.
- Locked: initialize equal rear speeds on reset. One reduced common-speed coordinate has inertia JL+JR+Jc. Both shaft accelerations follow the summed external torques divided by this inertia; the same common coordinate increment is applied to each equal initial speed. Unequal initial locked speeds are rejected. Each tire force is independently calculated; rear rotor inverse mass block is all ones/(JL+JR+Jc). Per-side output torque is Ji*omegaDot_i-brake_i+R*Fx_i; lock reaction is half their difference. It can be large and may reverse torque on one output during tire scrub.

The shared contact solver uses the full inverse rotor mass matrix in its four coupled implicit slip equations. It does not integrate independent rear rotations and overwrite them afterward. Gear power residual is T*omega_c-outputL*omegaL-outputR*omegaR-Jc*omegaDot_c*omega_c. The rotor energy ledger uses midpoint shaft/contact work, including carrier kinetic energy, and is tested separately from tire or vehicle passivity. No engine/clutch/LSD is implied.

Changing mode or scenario resets the entire experiment to rest and static equilibrium. Previous momentum/energy are explicitly discarded as a new initial condition; no claim of conservative live engagement is made.

## Front contact investigation

Flat static geometry gives 510.12 N per axle, 255.06 N per tire, with chassis mass 80 kg and two 12 kg axle unsprung masses. Flat driving retains these loads. There is no longitudinal force contribution to pitch in this reduced predecessor model, so acceleration itself cannot explain front lift-off.

A 5 m/s coasting run with the existing 8 cm, 0.8 m bump at x=1.3 reproduces front unloading at t=0.141 s while rear load is 270.103 N per tire. Front compression is still 0.004613 m: upward wheel velocity makes kt*delta-ct*vu nonpositive and the documented unilateral normal law cuts off support. Recontact is finite and tested. This closely matches the reported observation, but the screenshot's exact initial conditions are unavailable, so its precise attribution remains unresolved. No forced front contact is introduced.

A separate source defect was found: terrain-relative damping omitted the axle point's yaw velocity contribution. Only this new project's road-point x velocity now includes -arm*sin(heading)*yawRate. A focused test checks the corrected derivative; it does not affect the straight-line anomaly reproduction. Tire force/mass counting and equal/opposite suspension reactions remain as in the reduced predecessor.

## Reproducible comparisons

Scenario selector offers uniform grip, rear-left mu=0.08 (others 0.9), and controlled rear-left support retraction from 0.5 to 1.0 s. This last scenario is an externally prescribed contact-removal rig, not simulated roll or independent wheel suspension. It removes that contact's half axle support from the vertical axle force and sends zero load/friction to RL; the other rear tire retains its radial half-axle support. Restoration can do external work; no full transient contact-energy closure is claimed.

Run `node research/scientific-rebuild/differential-driving-prototype/tests/scenarios.mjs` for the saved configurations; results are in `results/scenarios.json`. Each case runs 2 s at 1 ms and 20 Nm total drive. Turn uses 0.3 rad steering.

Observed rear speeds (RL/RR rad/s):

| Case | Independent | Open | Locked |
| --- | --- | --- | --- |
| Uniform | 2.735 / 2.735 | 2.662 / 2.662 | 2.662 / 2.662 |
| Turn | 2.368 / 2.830 | 2.307 / 2.758 | 1.550 / 1.550 |
| Asymmetric grip | 6.959 / 2.427 | 6.107 / 2.365 | 2.666 / 2.666 |

Open and independent are both equal-torque modes; their differences here include carrier inertia, not limited-slip action. Under support removal the free shaft can accelerate in open mode, while locked speed stays common; the data records peak speed difference during the event, not just the recovered final state. Open output torque remains equal despite unequal tire reactions. Locked turning scrubs the simplified tires and runs slower in these tests. These are model observations, not real-world calibration.

## Verification

```bash
node --test research/scientific-rebuild/differential-driving-prototype/tests/*.test.js
node --test research/scientific-rebuild/four-wheel-driving-prototype/tests/*.test.js
node --test research/scientific-rebuild/javascript-driving-prototype/tests/*.test.js
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/differential-driving-prototype/tests/browser-smoke.mjs
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/differential-driving-prototype/tests/browser-3d.mjs
```

Executed: 12/12 new-project tests, 5/5 four-wheel predecessor tests, 31/31 original tests passed. Byte-for-byte preservation of both predecessor directories against commit 51f0a70 is itself a test. Browser smoke passed all mode selections, reset policy, propulsion/braking/steering and camera/views with no page exceptions. Additional 3D test passed exact state preservation on view switching. No physics imports from predecessors; vendored Three.js and its MIT license are copied locally.

Limits: two vertical axle coordinates with equal-side radial geometry (except the explicit retraction fixture); no roll or lateral weight transfer; temporary lateral-priority combined-friction law; small pitch approximation and incomplete longitudinal pitch coupling; no calibrated drivetrain parameters. Rotor work closure does not establish global tire passivity or vehicle realism.
