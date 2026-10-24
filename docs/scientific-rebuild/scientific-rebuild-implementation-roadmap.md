# Scientific rebuild — bounded implementation roadmap

This is an ordered engineering specification, not authorization to implement another vehicle in Mission 22 or to merge scientific branches. The goal is the first understandable isolated four-wheel drifting research vehicle, then later manual driving and AI, without replacing production systems prematurely.

|Milestone|Small deliverable|Entry / exit evidence and excluded work|
|---|---|---|
|0 — Mission 22, completed scope|Labelled native zero-support safety variant and mechanical/acceptance contracts|Safety fixtures verified; original histories preserved. No vehicle/drivetrain/GUI implementation|
|1 — one native sprung corner, **the single next implementation step**|One sprung quarter-body, one heave/spin wheel, native spring/damper, safety-patched Generic tire and prescribed shaft torque/brake input; one master h|Verify static gravity balance, exact body/relative-spin ports, no duplicate inertia/reaction, work ledger, spin/lock and unloading/recontact, short h refinement and cost. No full car, steering column, engine, clutch, gears, differential, renderer or AI|
|2 — passive then driven headless four-wheel body|Instantiate one chassis plus four constrained heave/spin corners from the authoritative geometry, source-selected passenger wheel/tire fixture, prescribed symmetric rear torque and per-wheel brake ports|First verify Sedan fixture initialization/mass/source coefficients, then gates 1–3,7,10–14. Zero steering initially. No independent axle-load formula or legacy tire forces|
|3 — steering, open differential and drifting research vehicle|Prescribed C2 Ackermann steering with reaction-work measurement; ideal open-differential algebraic relation and bounded drive input; frozen cornering/drift/recovery scripts|All fourteen gates passed or explicitly failed; known source moment/reverse limitations remain visible. A passing bounded drift maneuver is a research functional result, not empirical tire validation. No manual drivetrain or playable-game integration yet|

The one-corner fixture must declare its external guides/actuators and measure their reactions/work. A fixed or prescribed horizontal hub is a legitimate port test but not evidence of vehicle acceleration.

After the first research vehicle passes its declared gates, a separately authorized milestone can add engine/starter/loss states, clutch slip/lock, gearbox engagement/synchronization and casing reactions through the [existing contract](vehicle-mechanical-interface-contract.md). Stalling, incorrect shifts, handbrake and clutch kicks require their own mechanical acceptance tests. Do not replace them with automatic rev matching or wheel-speed assignments to make the vehicle easier to drive.

AI driving and learning come later as external command sources using identical steering/torque/clutch/gear/brake interfaces, observation snapshots and deterministic clock. They must not get privileged velocity resets or an alternate physics path. Rendering/input integration with existing VerletDrift occurs only after independent isolated acceptance and explicit later authorization; no automatic merge is implied.

## Scope and parameter discipline

[State/parameter inventory](minimum-viable-vehicle-state.md) fixes the 14-DOF mechanical representation and 15 provisional body/geometry/suspension scalars plus one source wheel/tire fixture. [Numerical policy](vehicle-physics-acceptance-gates.md) chooses same-stage partitioned updates and one timestep authority. [Mechanical contracts](vehicle-mechanical-interface-contract.md) define force, frame, housing reaction and work ownership.

Each milestone freezes its input manifest, hashes, state/port units, admission bounds and failure criteria before execution. A failure is retained and explained before additional subsystems are attached. Do not reopen the tire-model survey or tune several unrelated force multipliers to hide a failed corner or vehicle gate.

The initial single-corner task is deliberately smaller than a playable vehicle, but directly exercises the mechanical representation that will be instantiated four times. It is the next engineering increment, not another speculative model comparison.
