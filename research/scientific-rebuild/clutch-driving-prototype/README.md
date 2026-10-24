# Mission 32 — flywheel, clutch and fixed ratio

Run `python3 serve.py` from repository root and open
`http://localhost:8000/research/scientific-rebuild/clutch-driving-prototype/`.
W applies external motor torque (default 20 Nm). Start with clutch slider at zero, spin up the flywheel, then increase engagement gradually. S brakes all wheels, A/D steer, Space impulses the sprung body, B adds a road bump, R resets. Mode/scenario selection resets the complete experiment. The coasting reset explicitly initializes 3 m/s vehicle speed and a stopped flywheel; engage the clutch with W released to observe back-driving. No RPM setpoint, starter, idle or combustion engine is present.

## Rotational coupling

`clutch.js` adds one flywheel coordinate (Je=0.3 kg m²) to the previous four-rotor/contact system. Engine angle and speed integrate from applied motor torque minus clutch torque. Clutch input/output disks use engine angle and G times the mean rear angle. Ratio G=4 is positive and ideal: omega_t=G*omega_c, torque at carrier=G*Tc, Tc*omega_t=(G*Tc)*omega_c. Input shaft speed is derived, never independently integrated.

Independent drive has no carrier inertia: its equivalent input boundary uses mean rear speed and half the carrier torque at each wheel, preserving power. Open mode retains the predecessor carrier inertia (0.4 kg m²) in its reduced mass matrix. Locked differential uses its existing one-coordinate rear inertia; rear wheel speeds are never overwritten. The flywheel inertia is not reflected into wheels a second time.

The tire contact solve and clutch form one bounded active-set calculation: four longitudinal forces plus clutch torque are solved together. Rear port forces are +(G/2)*Tc on each output; engine reaction is -Tc. Contact equations include the full rear inverse rotor mass matrix. Enumerate clutch locked/positive-slip/negative-slip candidates and up to 81 tire saturation cases, at most 243 five-by-five linear solves. No open-ended iteration, independent speed projection or elapsed-time dropping is introduced.

Capacity is engagement*30 Nm. Locked candidate enforces end-of-step omega_e=G*mean(omega_rear) through the same inertia equations and is accepted only within capacity. Otherwise capacity-bounded friction opposes midpoint slip. Torque/slip sign is verified; unresolved active sets pause with an error rather than repair velocities. Disengaged clutch transmits zero. A zero initial slip does not guarantee lock under overload.

Heat increment is Tc*h*(slip_start+slip_end)/2. This is midpoint friction work on the actual coupled velocity update. Static reactions at zero slip therefore produce no physical heat; numerical residuals within 1e-10 J are treated as roundoff. There is no heat-counter reset during slipping/locking. Synchronization tests compare total rotor-energy decrease with heat, including carrier energy. Generalized input-coordinate momentum is Je*omega_e + output rotor momentum/G; ideal gearing needs a casing reaction, so this is not a claim of unconstrained global angular-momentum conservation.

Gear casing reaction is recorded as (1-G)*Tc on the ideal support. The reduced rotor model assumes an externally supported casing and prescribed external motor torque. This reaction is not injected into chassis pitch: rotor/casing/chassis-pitch coupling remains outside the inherited reduced chassis model. Thus the closed rotor work tests do not establish whole-vehicle 3D energy closure. Engagement-actuator work and plate compliance are not modeled.

## Observable demonstrations

- Free flywheel: slider zero, W. Engine accelerates, rear torque stays zero.
- Engagement: spin first, release W, increase slider. Capacity bounds torque; slip falls and heat grows.
- Static lock: full engagement from rest and W. Nonzero reaction, shared constrained acceleration, near-zero slip heat.
- Overload: engagement 0.1, motor 100 Nm. 3 Nm clutch capacity is exceeded; engine runs away in slip.
- Back-driving: coasting reset, W released, engage. Output spins up the flywheel and slows the moving system.
- Differential comparison: choose open or locked (resets), full engagement and drive/turn. Same clutch/gear mechanics, different rear constraints.

The educational schematic shows actual engine/input, output-shaft, carrier and rear angles; separation follows engagement. Independent-mode carrier represents a massless input boundary, not an additional gear mechanism. 3D orbit camera, top and side views are preserved; rear axle housing remains schematic.

## Reproduction and results

```bash
node --test research/scientific-rebuild/clutch-driving-prototype/tests/*.test.js
node --test research/scientific-rebuild/differential-driving-prototype/tests/*.test.js
node --test research/scientific-rebuild/four-wheel-driving-prototype/tests/*.test.js
node --test research/scientific-rebuild/javascript-driving-prototype/tests/*.test.js
node research/scientific-rebuild/clutch-driving-prototype/tests/scenarios.mjs
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/clutch-driving-prototype/tests/browser-smoke.mjs
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/clutch-driving-prototype/tests/browser-3d.mjs
```

Executed: 6/6 new grouped tests cover the 12 requested mechanical properties and frozen-file preservation; all 48 predecessor tests passed unchanged. Rotor synchronization energy/heat residual tolerance is 1e-7 J; generalized momentum tolerance 1e-8; static locked heat stays below 1e-9 J over 1000 nonzero-torque steps. Browser smoke passes disengaged spin without propulsion, engagement/drive, steering/braking, mode reset/comparison and back-driving. 3D smoke passes orbit/zoom and exact snapshot preservation on view switching.

`results/scenarios.json` saves six fixed 1-second demonstrations in open and locked modes. The first five use zero road load to isolate rotor mechanics; turning uses the full vehicle. Defaults and inputs are explicit in `tests/scenarios.mjs`. No real-engine calibration or universal stability is claimed.

Other inherited limits: temporary lateral-priority friction law, two vertical axle coordinates, no roll/lateral load transfer, prescribed support-retraction fixture, and incomplete longitudinal pitch coupling. Three prior exhibits and production files are unchanged. Three.js remains locally vendored with its MIT attribution.
