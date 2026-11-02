# Coupled six-rotor drivetrain

PERFORMANCE; starting reference `f4693971033f8494fdb0da724e1c24177d4076e3`.
This isolated vehicle variant replaces the five-rotor fixed-ratio flow inside the
same terrain force-consistency step. Historical implementations and fixtures are
preserved. The existing PERFORMANCE laboratory offers it as an explicit
**Experimental six-rotor gearbox** selection; fixed-ratio reference stays default.
This is an idealized mechanical gearbox, not a new engine lifecycle simulation.

## Mechanics and accounting

Rotational coordinates: FL, FR, RL, RR, engine, gearbox input. Output speed is
`finalDrive*(RL+RR)/2`, so output inertia is represented once by a rear-wheel mass
block `Io*finalDrive²/4 * [[1,1],[1,1]]`. Engine and input inertia remain independent.
Neutral retains both shaft energies. No inertia is added or removed on shifting.
With dogs engaged, the constraint automatically reflects input inertia as
`Ii*(gearRatio*finalDrive)²` onto the rear carrier; adding it again to wheel inertia
would double-count it. `test.mjs` checks that effective acceleration independently.

For `w` in that six-coordinate order, solve `M*wDot = T - Jᵀ*reaction` with:

- Four individual wheel brake rows.
- Clutch row `[0,0,0,0,1,-1]`, bounded by the inherited clutch capacity.
- Synchronizer/gear row `[0,0,-g/2,-g/2,0,1]`, g=gearRatio*finalDrive.
  It has finite cone capacity while synchronizing and an ideal unbounded dog
  reaction after engagement. Neutral removes this row entirely.

At a nonzero slip the friction reaction opposes that slip. At a zero slip a small
active-set enumeration solves all static reactions together, checking bounds and
release-direction inequalities. Only zero-slip finite rows have three candidate
statuses; there are at most six rows, 729 candidates per regime. Dense solves are
at most 6x6; the unchanged SPD mass block has an analytical sum/difference inverse.
This uses the f469397 shaft equations/configuration and cross-checks against its
independent `shaftFlow`; sequentially applying that two-shaft flow to a vehicle
would violate simultaneous clutch/brake constraints, so it is not composed that way.

Each constant-torque regime integrates analytically until the next wheel/clutch/
cone slip-zero event. Hard cap: 32 regimes per rotor call; the outer contact cap
remains 24 with **1e-11 N** closure and the inherited friction and whole-step energy
guards. Unresolved reactions, nonfinite states/energies, conditioning failures or
event exhaustion reject the step. No global optimizer, substep fallback, speed
assignment, damping or tolerance relaxation is used. There is no artificial RPM
matching: speeds change only through mass-matrix accelerations over elapsed time.
Numerical zero classification is 128*epsilon times rotor-speed scale; locked rows
are maintained to floating-point precision, not promised bit-identical equalities.

The controller releases the old ideal dog row on a changed request, retaining all
speeds/energies. It applies finite synchronizer friction to the requested ratio.
Dogs engage only when an accepted endpoint is synchronized to roundoff. An
unsynchronized engaged initial state rejects. The decision is at a fixed-step
endpoint, not a modeled selector/tooth-phase event. A short-lived zero crossing
that cannot be maintained by the cone may therefore not engage the dogs.

Six forward ratios default to [3.8,2.2,1.52,1.16,.92,.76], reverse -3.55 and final
drive 3.7. Input/output inertias default to .08/.12 kg m² and cone capacity 4 Nm,
retaining the standalone experiment values. They are synthetic, not vehicle
calibration. `create(terrain,{ratios,inputInertia,outputInertia,synchronizerCapacity})`
configures them at initialization. Do not change inertias/ratios in a live state.
Reverse is an explicitly **synchronized constant-mesh reverse**, not an idler
collision model: its negative ratio uses the same finite-slip gate. Forward motion
does not magically permit dog engagement; the input shaft must attain its negative
required speed. There is no arbitrary vehicle-speed lock or automatic rev matching.

New state slots: y[30]=input speed (rad/s), y[31]=negative cumulative synchronizer
heat (J). Output energy is `Io*outputOmega²/2`; input energy is `Ii*y[30]²/2`.
`totalWork` adds y[31] to the prior engine-minus-loss ledger. Tire contact work is
still internal elastic exchange. Clutch, brake and synchronizer heat are distinct.
The exact same accepted rotor integrals/h drive the tire slip calculation.
Independent impulse and generalized-momentum tests include the off-diagonal rear
inertia, and a separate two-shaft fixture checks the synchronizer transcription.

All gear requests and the whole vehicle candidate are transactional: no state,
gear, thermal history or diagnostics publish before the original work/friction
checks pass. The live laboratory adapter quadratures six accepted rotor angles;
it does not run another drivetrain or infer RPM from road speed.

## Operation and limits

Launch the existing laboratory under an HTTP server, then select the experimental
drivetrain. It starts in neutral. Set clutch open, request a gear and observe
**engaged**, then apply throttle and clutch engagement. The clutch slider is direct
capacity control; there is no clutch-pedal actuator simulation. Shift requests
under load may remain synchronizing and produce heat; opening the clutch removes
engine load. Displayed requested gear and engaged gear are separate. Input/output
shaft speed, engine RPM, clutch state, brake/clutch heat and synchronizer heat are
actual mechanical values. Reverse should be tried from rest with clutch open.

Dog release is an externally commanded ideal frictionless release: no selector
force, dog axial mass, undercut/friction, gear-tooth collision/phase, wear or cone
thermal fade is modeled. Disengagement itself does zero rotational work. This is
not a complete physical selector mechanism. The default engine is still the old
mean-torque source: **no reliable stall, starter, restart, idle governor lifecycle,
overrev protection or reverse-crankshaft protection is added**. A badly chosen
ratio can back-drive the engine outside a realistic engine operating envelope;
this experiment does not claim those maneuvers are physically validated. No tire,
terrain, suspension or handling coefficient was adjusted to disguise a shift.

The full vehicle is still the existing reduced chassis architecture; gearbox
carrier/shaft mounting reaction dynamics and gyroscopic extensions are not added.
Total translational vehicle mass is unchanged. The inherited bristle contact has
no rolling-patch renewal or calibrated pneumatic handling. No production merge.

## Executed validation and timing

All 20 new solver/adapter tests pass, along with 175 existing tests across the
standalone shaft, terrain, laboratory-adapter and historical suites. Tests include independent six-component impulse balance (including
635 reaction cases in one zero-speed stress flow), generalized momentum, heat,
neutral isolation, all six forward ratios, reverse propulsion after synchronization,
engine braking, effective reflected inertia, loaded shifts, recontact, rollback,
nonfinite rejection, matched-time refinement and exact laboratory-adapter delegation.
The historical 56-test fast-model and 82-test strict-terrain suites pass; Strategy A's
1,080 accepted-state bit-exact replay also passes. No historical fixtures changed.

Eight integrated cases at 1/.5/.25 ms all complete without rejection. Maximum
cumulative energy/work residual is 2.64e-11 J; locked-clutch mismatch <=7.11e-15
rad/s; engaged gear mismatch <=1.57e-13 rad/s. Maximum outer force iterations 8/24;
closure remains <=1e-11 N. `results/validation.json` stores all 25 legacy mechanical
state errors plus input-shaft error. Takeoff position errors versus .25 ms are
1.59e-7/3.18e-8 m at 1/.5 ms; braking 8.42e-7/1.65e-7 m; recontact
1.05e-6/1.44e-7 m. Transition observations are discrete; no universal convergence
order at friction/input switching events is claimed. Every rate starts from the
same state; the explicitly recorded preparatory gear request uses 1 ms at all rates.

Complete-step benchmark: Node 24.19.0, Xeon Platinum 8573C, shared cloud host,
four CPU-equivalent quota. Seven 1-second cases, 1 ms fixed step, one untimed
validation/warmup pass per method/case, five alternating measured repetitions,
discard first, median of four retained runs. No other local test/browser workload
ran concurrently. Process CPU includes common counters and runtime overhead;
per-step latencies time the complete step. This is headless CPU, not GPU/FPS data.
Initial 30 old state values and driver inputs match, but new ratios/inertias and
shift/neutral behavior intentionally differ; costs are **not equivalent-trajectory
speedup measurements**. Per-case differences include different mechanical work.

| Case | Reference CPU ms/sim s | Six-rotor CPU ms/sim s | New median/p95/p99 step ms |
|---|---:|---:|---:|
| acceleration | 267.60 | 312.81 | 0.196 / 0.421 / 0.603 |
| steering | 254.71 | 275.23 | 0.192 / 0.402 / 0.541 |
| braking | 252.73 | 216.98 | 0.191 / 0.371 / 0.565 |
| drift-recovery | 194.03 | 235.59 | 0.210 / 0.382 / 0.532 |
| recontact | 190.73 | 235.86 | 0.209 / 0.396 / 0.532 |
| clutch-transition | 147.64 | 212.97 | 0.186 / 0.341 / 0.486 |
| hold-release | 115.39 | 61.27 | 0.054 / 0.104 / 0.216 |

Equal-case CPU mean: **203.26 ->221.53 ms/simulated second**, about **+9.0%**
in this retained run, corresponding to 4.51 simulated seconds per CPU second.
This is not a universal marginal solver overhead: neutral and different gear
ratios change trajectories and active constraints; shared-host runtime noise also
limits inference. Worst retained new step 5.302 ms; no benchmark failures. No
hard real-time latency guarantee. The bounded enumeration can be expensive near
multiple simultaneous zero-speed constraints even when average cost is small.

Real Chromium smoke tests passed both the retained fixed-ratio laboratory and
experimental drivetrain. The manual test actually waits for requested gear 1,
gear 2 and reverse to be **engaged**, verifies first-gear propulsion, neutral
isolation under throttle, and clutch-open shifting. Backend was SwiftShader;
this proves browser execution, not RTX performance. `results/browser.json` records
states and backend. The gearbox is ready for **bounded experimental interactive
testing**, with the ideal selector and inherited engine/tire limitations above.

## Reproduction

From repository root, using existing Node/Playwright/Chromium dependencies:

```sh
node --test research/scientific-rebuild/fast-vehicle-poc/coupled-drivetrain/test.mjs
node research/scientific-rebuild/fast-vehicle-poc/coupled-drivetrain/validate.mjs
# Run timings alone, without concurrent local tests:
node research/scientific-rebuild/fast-vehicle-poc/coupled-drivetrain/benchmark.mjs
node research/scientific-rebuild/fast-vehicle-poc/coupled-drivetrain/browser-smoke.mjs
python3 -m http.server 8000
```

Open http://localhost:8000/research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/
and select **Experimental six-rotor gearbox**. Headless API: import `create`,
`step`, `energy`, `totalWork` from this directory's `vehicle.js`. Pass the same pure
terrain sampler to each function. `step` accepts `gear:'N'|'R'|1..6` in the existing
driver input; it never modifies inertia or assigns an engine RPM on request.
