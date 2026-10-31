# Experiment 10 cumulative-development inventory

Current state after b4f7f61: the reduced interactive page is not a complete successor to Experiment 9. The governing cumulative-development rule is in research/scientific-rebuild/AGENTS.md.

| Capability | Experiment 9 | Experiment 10 current |
| --- | --- | --- |
| Interactive 3D vehicle, cutaways, orbit/focus cameras | Present | Missing |
| Engine, starter, ignition and throttle | Present | Missing |
| Clutch pressure plate, selector/dog gearbox, differential | Present | Missing |
| Hydraulic service and rear cable brakes | Present | Service-capacity fixture only |
| Dynamic steering, inertia, friction, stops and tire moments | Present | Prescribed column angle only |
| Continuous driving and reverse interaction | Present | Two-second local fixture |
| Accepted-stage tracks, world marks and clear/visibility | Present | Missing |
| Instruments, mechanical diagnostics and laboratory styling | Present | Simplified replacements |
| Independent four-corner suspension and chassis roll | Missing | Present |
| Contact pitch/roll virtual-work Jacobians | Missing | Present in reduced solve |
| Stable navigator route | Present | Present |

## Exact integration conflict and next executable step

Experiment 9 `src/planar.js` owns an eleven-velocity solve with non-diagonal drivetrain inverse inertia from `rotorSystem`, dynamic steering, clutch modes, brake friction and one accepted-stage energy ledger. Experiment 10 `src/coupled-contact.js` instead solves fourteen velocities using independent wheel inertias and no engine, selector, clutch or steering coordinate. Running these solves in succession would apply tire impulses twice and break the validated driveline inertia and work accounting. Feeding only four normal loads to the old solve would omit the new pitch/roll reaction velocities.

The next implementation must create an Experiment-10-specific extension of the mature solver, retaining its first eleven velocity coordinates and rotor block, and append seven vertical velocities. Embed the contact-port pitch/roll coefficients into each tire row, respecting road-wheel rotation and the existing trail/steering coefficient; include those velocities in slip and reaction work. Replace only the axle-level RK step with the seven-coordinate vertical step. Map its four end-stage normal loads directly to tire limits; extend kinetic/potential/damping and numerical-loss accounting. Retain gear-event cloning and accepted-substage observer emission. Do not call the reduced tire solve on top of this extended solver.

Only after the combined solve passes rotor, steering, contact, energy and refinement tests should the mature application and 3D scene be adapted: four physical corner heights must drive hubs and suspension artwork, while any two-axle summary is display-only. Then enable inherited continuous controls and compare actual drivetrain sessions and tracks with Experiment 9. This inventory records inspected interfaces, not completed integration or new validation evidence.
