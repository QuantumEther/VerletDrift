# Drivetrain integrity: diagnosis and correction proposal

Base: `recovery/realtime`, `b23935b2b98b3474bf7d178283a0450724febb81`.
Working branch: `recovery/drivetrain-integrity`. No production changes, tuning, merges, or Mission 02/03 imports.

## Execution path

1. [Keyboard gear requests](../js/input.js#L118) call `selectGear` → `handleGearChange` immediately; clutch input changes a held-key flag.
2. [Mechanical tick](../js/main.js#L550): steering → engine/pedal/governor/stall → suspension → tire forces and wheel rotation → engine RPM synchronization → chassis forces/integration/constraints → derived body state → sleep.
3. [Engine update](../js/physics/engine.js#L88) integrates crank inertia only while the clutch is not flagged locked. Pedal 0 means disengaged; 1 means released. Engagement is derived from the bite curve, not actual synchronization.
4. [Tires](../js/physics/tires.js#L113) apply signed gearbox torque, equally split between rear wheels. Each rear wheel independently gets half the reflected engine inertia if the lock flag is set. Its road/brake reaction is solved in `integrateWheelContact`.
5. [Synchronization](../js/physics/engine.js#L212) overwrites RPM from the absolute value of driven-axle speed after the tire solve. Stall detection has already run.
6. [Engine button](../js/ui/controls.js#L193) toggles `isRunning`; ON directly assigns idle RPM and clears the stall. There is no starter torque, starter work, starting state, gearbox input-shaft inertia, or pending gear engagement.

## Confirmed defects

- **Pedal-triggered lock discards synchronization mechanics.** [engine.js:120](../js/physics/engine.js#L120), [178](../js/physics/engine.js#L178), [212](../js/physics/engine.js#L212): engagement >0.99 immediately bypasses friction capacity and shared engagement impulse. RPM is then overwritten. The isolated tests demonstrate both momentum destruction and energy injection. In the gentle takeoff, the transition at 1.10 s jumps 405.70 → 1,693.24 RPM while torque drops 334.41 → 4.88 N·m; pre-transition slip is −136.25 rad/s, far from synchronized.
- **Incorrect inertia outside equal-wheel motion.** [tires.js:146](../js/physics/tires.js#L146), [303](../js/physics/tires.js#L303): two independent half-inertias reproduce the common mode but spuriously load the differential mode. A one-sided contact test leaves the untouched right rotor with a missing generalized reaction of 0.005214 N·m·s. Shared crank inertia requires off-diagonal coupling.
- **Contradictory running/stall states.** [engine.js:201](../js/physics/engine.js#L201): stall checks precede wheel synchronization and are suppressed by throttle ≥0.05 or body speed ≥0.5 m/s. At zero crank RPM the engine remains running and delivers 91.36 N·m at the end of the 1 s brake/throttle run. The configured effective stall threshold is 264 RPM, but the gentle takeoff reaches 73.64 RPM without stalling. A direct 100 RPM / 1 m/s fixture also bypasses it. Stalling itself zeroes crank momentum rather than merely stopping combustion.
- **Restart injects unmodeled starter work.** [engine.js:133](../js/physics/engine.js#L133), [controls.js:193](../js/ui/controls.js#L193): throttle with open clutch restores idle instantly, then integrates combustion (865.64 RPM after one tick). Engine ON creates 877.30 J of crank energy with no elapsed time. A stalled engine still has `isRunning=true`, so the button first turns it off; the second click restores idle. This explains a route by which toggling restores motion; it does not establish that every reported driving failure has the same trigger.
- **Ignition state incorrectly disconnects mechanics.** [engine.js:94](../js/physics/engine.js#L94) freezes pedal updates, zeros crank RPM, and disables reflected inertia when OFF. A stalled engine instead reflects inertia while [synchronization skips it](../js/physics/engine.js#L214), pinning its connected crank at zero. Neither supports coherent engine braking/back-driving. Normal engine-off, open-clutch free-wheel coasting does work.
- **Gear requests bypass engagement.** [engine.js:230](../js/physics/engine.js#L230), [254](../js/physics/engine.js#L254): mismatched upshifts and forward-to-reverse requests engage immediately; there is no synchronizer or dog constraint. Downshifts automatically request a 0.2 s rev blip using unsigned chassis speed rather than actual shaft speed, without an assistance enable flag.
- **Crank direction is lost.** [engine.js:217](../js/physics/engine.js#L217): `abs` can report positive RPM while a reverse gear drives the crank backwards. One fixture reports +286.44 rad/s versus a demanded −286.44 rad/s. The slipping branch's [nonnegative speed clamp](../js/physics/engine.js#L196) also prevents signed crank dynamics; zero-crossing treatment needs an impulse/work audit in the correction.
- **Lock changes idle control law abruptly.** [engine.js:161](../js/physics/engine.js#L161): the governor cap switches from 25% of peak torque to a wheel-force-derived cap. This is a second discontinuity at the same pedal threshold. Creep is transmitted through the crank, not a separate wheel motor, but its running/stall transitions are unreliable. The sleep rule also deletes very small chassis velocities; it remains outside this task and must be considered when interpreting tiny creep speeds.

## Deterministic baseline

`tests/drivetrain-integrity.test.js` runs real production functions at 100 Hz. Driving cases use the existing extracted production mechanical prefix; isolated rotor cases remove road/brake loads and use a 1:1 ratio for direct momentum accounting. Only the gentle pedal trace uses a 2 s pedal-travel time rather than the default 0.3 s; engine, grip, and stall parameters are unchanged. The real Engine button callback is extracted with a source-boundary guard. No physics functions are mocked.

**Strict result: 11 pass, 15 fail (26 tests).** Default mode marks those 15 known failures with Vitest `it.fails`, so an unexpected fix fails the baseline rather than silently preserving obsolete expectations. A green default run is not evidence of repaired physics. Two passing tests are explicitly labeled characterizations, not acceptance of the observed takeoff or restart mechanism.

| Scenario | Expected invariant / qualitative behavior | Actual baseline |
|---|---|---|
| Neutral idle, released pedal | Return toward idle after +200 RPM disturbance; no wheel torque | Pass: 800.013 RPM after 5 s; speed/torque zero |
| First gear, open clutch | Independent idle; no motion | Pass: 800 RPM, zero torque/speed after 3 s |
| Gentle no-throttle takeoff | Record response without requiring uncalibrated takeoff success | Characterization: 0.8654 m/s, 337.11 RPM after 3 s; max speed 1.0488 m/s; min RPM 73.64; no stall |
| Abrupt release against brake | Eventually stop combustion | Pass: stalled, zero RPM/torque by 0.2 s |
| First locked tick at rest | No running-at-zero state | **Fail:** 0 RPM, running, not stalled |
| Brake plus throttle held 1 s | Zero-speed crank cannot sustain combustion | **Fail:** 0 RPM, 91.36 N·m, not stalled |
| 100 RPM while chassis moves 1 m/s | Configured low-RPM stall rule not waived by road speed | **Fail:** remains running |
| Throttle-only stalled recovery | No spin-up without a starting energy source | **Fail:** jumps to 865.64 RPM |
| Existing two-click recovery | Characterize actual button behavior | Characterization: OFF, then immediately 800 RPM / stall cleared |
| Engine ON at zero elapsed time | No instantaneous kinetic-energy creation | **Fail:** +877.30 J |
| Depress clutch while engine OFF | Pedal still reaches disengaged position | **Fail:** remains at released position 1 after 1 s |
| Clutchless mismatched upshift | Finite shaft synchronization before dog engagement | **Fail:** gear 2 selected immediately; shaft mismatch 125.66 rad/s |
| Open-clutch upshift | Crank independent of wheels | Pass: 3,000 → 2,994.12 RPM; zero clutch torque |
| Downshift with no assistance requested | No automatic throttle intervention | **Fail:** 0.2 s blip, target 5,872.82 RPM |
| Reverse request during forward motion | No instantaneous mismatched engagement | **Fail:** R immediately selected at 10 m/s |
| Valid-direction locked clutch | Signed crank/axle agreement | Pass: slip <1e−12 rad/s |
| Reverse gear with forward axle | Preserve crank direction / signed constraint | **Fail:** signed mismatch 572.88 rad/s |
| Isolated slipping clutch | Equal/opposite impulses; work dissipative | Pass: momentum error 0; heat 59.4893 J matches energy loss within 2e−13 J |
| Slipping reverse clutch | Oppose forward axle motion; dissipate energy | Pass: axle 20 → 19.6984 rad/s; momentum error <1e−14; energy −73.9676 J |
| Locked common-mode torque | Correct total reflected inertia | Pass: expected/measured Δω 0.648494 rad/s |
| Idle crank locks to stationary wheels | Share momentum between all connected rotors | **Fail:** loses 20.9440 N·m·s; axle stays 0 instead of 7.90338 rad/s |
| Idle crank locks to faster wheels | Passive engagement cannot create energy | **Fail:** +372.7018 J, +4.05605 N·m·s |
| One-sided locked axle contact | Shared crank inertia couples both rear speeds | **Fail:** right momentum residual −0.005214 N·m·s with zero right external impulse |
| Engine OFF, clutch open | Free rotor coasting | Pass: 20 rad/s unchanged, no drivetrain torque |
| Engine OFF, clutch engaged | Wheels can turn the crank without combustion | **Fail:** crank forced to zero, lock disabled |
| Stalled, clutch engaged | Connected inertia must actually rotate | **Fail:** crank zero despite shaft 20 rad/s and lock enabled |

Reproduce:

```sh
DRIVETRAIN_MEASURE=1 npm test -- tests/drivetrain-integrity.test.js
DRIVETRAIN_STRICT=1 npm test -- tests/drivetrain-integrity.test.js
npm test -- tests/drivetrain-integrity.test.js tests/engine-inertia.test.js tests/wheels.test.js tests/numerical-chassis.test.js
```

The combined run reports 92 passing tests under default expected-failure semantics: 77 ordinary passing tests and 15 expected failures. Existing engine tests (6), wheel tests (14), and Mission 01 numerical tests (46) pass unchanged. One existing engine test explicitly expects reverse downshift rev-matching; its success endorses existing behavior, not this mission's desired assistance policy. No browser changes were made. This checkout's tracked Windows native dependencies required local Linux Rollup 4.59.0 and esbuild 0.21.5 binaries to run Vitest; manifests were not changed.

## Smallest coherent correction proposal — not implemented

**State:** retain signed crank speed, existing signed wheel speeds, clutch pedal position, an engine combustion mode (`stopped`, `starting`, `running`, `stalled`), ignition/start requests, and requested versus engaged gear. Add one lumped gearbox-input shaft speed and inertia if gear synchronization is to be mechanical rather than a clutch-key rule. That extra rotor is needed while neutral or changing gear. Derive RPM, clutch slip, and open/slipping/locked labels from mechanical state; derive `isRunning`/`isStalled` from the one mode rather than maintaining contradictory flags. A pending requested gear plus engaged gear can supply the shift-in-progress label without a separate arbitrary shift timer. Clutch lock status is an active constraint with capacity tests, not another independent pedal threshold.

**Torque path:** let `g` be the signed gear × final-drive ratio, `Ω=(ωL+ωR)/2`, and `s=ωe−ωinput`. While a gear is engaged, `ωinput=gΩ`. With negligible input-shaft inertia the core equations are:

```text
Ie · dωe/dt = Tcombustion + Tstarter − Tdrag − Tc
Iw · dωL/dt = g·Tc/2 + Troad,L + Tbrake,L
Iw · dωR/dt = g·Tc/2 + Troad,R + Tbrake,R
Pclutch = −Tc·s ≤ 0
```

Include the added input inertia explicitly; do not count it twice. Neutral disconnects wheels from the input shaft, not the engine from its own crank. An open clutch transmits no torque. A slipping clutch opposes relative speed in either direction, up to its mechanical capacity. For equal rear inertias, the shaft-side equivalent inertia is `Js=Jinput+2Iw/g²` (neutral: `Js=Jinput`). After external torque impulses, calculate:

```text
K = 1/Ie + 1/Js
Jrequired = s*/K
Jc = clamp(Jrequired, −Tcapacity·dt, +Tcapacity·dt)
ωe,new = ωe* − Jc/Ie
ωinput,new = ωinput* + Jc/Js
ΔEclutch = −Jc·s* + K·Jc²/2 ≤ 0
```

Here stars are speeds after accounted external impulses. Distribute the shaft impulse to the rear axle consistently with its shared inertia. Lock only when the necessary impulse fits capacity; full pedal release can still slip under overload. Test holding capacity on every locked step and return to slipping when exceeded. No compensating torque or RPM overwrite is needed. At fixed ratio, `Ie·ωe+(Iw/g)(ωL+ωR)` is conserved under internal clutch impulses when input inertia is omitted; this is generalized momentum, not spatial momentum of a gearbox whose housing also reacts torque. Conservation tests use g=1 to avoid that ambiguity.

For the locked crank/input/axle, the correct rear inertia matrix is:

```text
M = Iw·Identity + (Ie+Jinput)·g²/4 · [[1,1],[1,1]]
M · Δωrear = external generalized torque impulses
```

This constant 2×2 matrix has an analytic inverse. Engine inertia loads the common mode; equal/opposite rear motion adds no crank inertia. Account external work using the coupled rotor midpoint speeds. Do not add the present independent reflected half-inertias on top.

**Starting, idle and stall:** update the pedal and all mechanical speeds regardless of ignition. OFF disables combustion and idle control, not the crank's inertia or mechanical connection. A start action engages finite starter torque over time; crank work explains rising RPM. Enable combustion only after a defensible firing-speed criterion; stall disables combustion when the crank cannot sustain firing, independently of throttle/body speed. Preserve mechanically driven rotation after a stall. Bound idle control as engine torque with one continuous law across clutch modes; do not guarantee creep speed or successful no-throttle takeoff before calibration. Apply drag against signed rotation, with a physically accounted zero-speed hold rather than silently deleting momentum. A modeled bump-start may resume combustion from real back-driving work with ignition on; throttle alone cannot create crank energy. Engine button actions should request ignition/start transitions and never assign RPM.

**Shifts:** separate request from engagement. Unload/disengage the old dog connection, let a finite-capacity synchronizer exchange input-shaft/axle impulses, and engage the requested dog only after shaft synchronization. Mechanical mismatch and available torque, not a clutch-key boolean or a hard vehicle-speed prohibition, determine failed/pending shifts. A correctly unloaded, matched clutchless shift can succeed. Unsynchronized reverse must remain pending/rejected while its dog speeds disagree; a synchronized reverse must expend finite synchronization work. Clutch friction and synchronizer heat need separate accounting. Retain rev matching only behind an explicitly enabled driver-assistance setting, disabled by default. Missing shaft inertia and synchronizer characteristics require stated physical assumptions, not invented precise shift times.

**Scope and numerical cost:** approximately six production files (`engine.js`, `tires.js` rotor interface, `state.js`, `main.js`, `input.js`, `ui/controls.js`) plus tests; no tire curve, geometry, chassis, suspension, rendering, or Mission 02/03 changes. Centralize duplicated gear lookup. Move final stall/state evaluation after mechanically consistent speed updates. Use scalar bounded clutch/synchronizer impulses and the analytic shared-inertia solve. Existing road-contact solves remain; their integration boundary must return consistent rotor impulses rather than owning independently reflected engine inertias. A fixed, small operator-split schedule can couple them without a new nonlinear tire/steering solve. Its contact passivity, final-speed consistency and timestep convergence must be validated before acceptance; merely projecting after the present tire solve is not proof of accurate contact dynamics.

Added rotational work is O(1), with a few scalar/vector operations and one fixed-size inverse per stage, fixed memory, and no new unbounded iteration. Actual runtime and the number of fixed substeps are unmeasured until implementation. First establish isolated impulse/work correctness, then starter/shift transitions, then production driving at 50/100/200/400 Hz and 100 Hz performance. Existing tire stiffness, legacy low-speed sleep, and uncalibrated engine/synchronizer data remain limits; do not conceal them by tuning. **This task stops at tests and this proposal.**
