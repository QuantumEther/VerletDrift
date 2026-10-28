# Mission 39 — Braking, tire contact and oversteer

Standalone preserved sibling of the Mechanical Laboratory. Branch `scientific-rebuild/12-braking-and-tire-contact`; source commit **012423a1ca092bf44495f344564653936d2ba480**, directory `../unsynchronized-gearbox-prototype/`. That entire predecessor remains byte-identical. `source-provenance.json` records the initial copied tree. `SOURCE-README.md` and copied Mission 35–38 results describe the predecessor, not new measurements.

## Launch and controls

From repository root run `python3 serve.py`, then open:

<http://localhost:8000/research/scientific-rebuild/braking-and-tire-contact-prototype/>

The original comparison application remains at `/research/scientific-rebuild/unsynchronized-gearbox-prototype/`.

W: motor torque; S: all-wheel service brake; **Space: rear handbrake**; A/D: front steering; 1/N/2: selector force; R: reset; B: bump; **H: the preserved suspension impulse experiment**. Pointer buttons also apply the service brake and handbrake. Experiment setup includes a clearly labelled **8 m/s rolling initial condition** for coast/braking trials; this is a reset, not a force or yaw intervention during driving. The manual clutch, worn gear, differential, audio, vehicle/X-ray/cutaway/exploded cameras and vintage instruments remain.

The optional **Tire force & slip vectors** overlay uses actual solved values (brass: 1 m per 1000 N; pale: 1 m per 10 m/s slip). Directions use the applied contact frame; wheel poses use their actual angular coordinates. It does not create skid marks, yaw impulses or new suspension degrees of freedom. Scientific inspection lists commands, brake capacities/reactions, wheel modes, slip, work/energy and solver diagnostics. A stationary wheel held at a marginal capacity boundary may be labelled “at capacity/free”; holding is certified when the scalar reaction is interior, rather than by a chosen speed threshold.

## Confirmed baseline issues

`planar-reference.js` is the copied original stepper. Its brake torque is `-sign(omegaFree)*min(brake,abs(omegaFree)*I/h)`: valid for stopping an isolated free rotor within its torque budget, but not a static brake reaction against newly applied drivetrain torque. At zero wheel speed its brake torque is zero even under drive. It applies the same request to all wheels and has no rear-only mechanism.

The old lateral force is frozen from slip angle before the longitudinal solve. It consumes a share of the friction circle, but a rolling and a rotationally locked tire with the same hub velocity receive identical lateral force. That split cannot reproduce the vector sliding direction of a locked wheel. Both observations are executed in `tests/braking-baseline.test.js`; they are not inferred from animation.

## Brake mechanics

Each wheel brake is ideal dry friction against its externally supported carrier. For rotor speed omega, opposing torque b satisfies `|b|<=C`, omega=0 permits any holding reaction in that interval, and sliding uses b opposite omega at capacity. It is solved simultaneously with tire and drivetrain reactions. Wheel speed is **never assigned zero** by a control handler. The solver's linear KKT polish changes reaction impulses to satisfy stationary constraints; it does not reset velocities. Locked-differential redundancy is handled by selecting independent constraint rows.

Per-wheel service capacities are **100 Nm front / 70 Nm rear** (58.8:41.2 total axle bias). Rear handbrake capacity is **160 Nm per wheel**, added independently to rear service capacity. These are explicit research mechanism parameters, not calibrated car brakes. An equivalent two-face pad model at muPad=0.4 and effective radius 0.08 m uses front/rear clamp forces 1562.5/1093.75 N and handbrake 2500 N. Pressure actuation is ideal quasi-static, proportional to bounded pedal/lever command; hydraulic lag, cable compliance and separate static/kinetic pad coefficients are not modelled. Instantaneous **finite capacity** is assumed, not instantaneous wheel stopping.

The inherited reduced carrier/housing support is retained. Rotor brake reaction is accounted in the constrained rotational system and heat, but full caliper torque reaction into chassis pitch/roll is not resolved. Do not interpret this as a complete six-DOF brake installation or complete global angular-momentum closure of vehicle/ground.

## Reduced combined-slip contact law

Contact-frame slip is `s=(Vx-R*Omega,Vy)` at each of four individual wheels, including yaw-rate contact-arm velocity and front steering rotation. There is **one radius** in slip and rotor reaction; no duplicate `-R*Fx` torque. Force is

`F = -min(k, mu*N/|s|)*s`, with F=0 at s=0 or N<=0.

Here **k=800 N s/m** is an uncalibrated isotropic viscous regularization, anchored to the predecessor's 800 N/rad lateral slope at a declared 1 m/s reference speed. It is not fitted to a drift. The old longitudinal stiffness was 18000 N s/m; that value is intentionally replaced, not silently preserved. Effective small-angle cornering stiffness now scales approximately as k*|Vx|. This is a substantial constitutive approximation and handling change, not measured pneumatic-tire behavior.

The convex dissipation potential is `phi(s)=k*|s|²/2` inside `|s|<=mu*N/k`, otherwise `phi=mu*N*|s|-(mu*N)²/(2k)`. Thus F=-grad(phi), `F·s<=0`, and `|F|<=mu*N`. There is no longitudinal-speed division, zero-speed singularity, hidden root solve in the tire law, tire elastic storage, aligning moment, relaxation or contact memory. Numerical impulse warm starts are solver initialization only; they are projected and rescaled when the stage timestep changes.

This regularized rolling/creep law has finite creep under traction and cannot provide ideal zero-creep static road adhesion against an arbitrary external chassis load. “Rolling/creep” labels the unsaturated branch; “sliding” labels the saturated branch. It is a reduced contact experiment, **not TMeasy or a validated real-tire model**. No original friction coefficient, grip surface, geometry or mass was tuned to induce oversteer.

The repository [TMeasy mechanical-power audit](../../../docs/scientific-rebuild/tmeasy-mechanical-power-audit.md) motivates using the actual wrench/slip work and avoiding unsupported aligning-moment passivity claims. [Mission 22](../../../docs/scientific-rebuild/mission-22-decision.md) motivates deactivation at nonpositive support. This mission does not claim reproduction of Chrono's empirical force law; a separate constitutive calibration comparison remains necessary.

## Coupled numerical method and ledgers

One 1 ms master clock remains. At a frozen geometry/steering stage, all four two-axis contact forces, four brake reactions and clutch reaction share one generalized inverse mass matrix: total planar mass, yaw inertia, reduced differential/wheel/selector inertia, engine inertia and neutral-shaft inertia. Gear ratios, worn ramps and rotor inertia are not bypassed.

For opposing impulses z, slip rows J, free generalized velocity vFree and inverse mass B, solve the small convex dual problem

`min 0.5*zᵀ*(J*B*Jᵀ + contactCompliance)*z - (J*vFree)ᵀ*z`.

Each tire impulse belongs to a disk `|z_i|<=h*mu*N` with compliance `1/(h*k)`; each brake reaction belongs to an interval `|zBrake|<=h*C`. Projected accelerated gradient solves the whole force balance, with a row-sum Lipschitz bound over free variables and a pre-polish KKT tolerance 1e-10 in normalized SI impulse coordinates (1 Ns contact / 1 Nms rotor scale). It is **not** clipping a force after integration. A small linear impulse polish resolves independent stationary scalar constraints. The actual post-polish projected residual and direct constitutive force mismatch are recorded separately. A constitutive impulse error above 2e-8 Ns rejects the stage (2e-5 N at 1 ms). Tiny dog-event sub-stages therefore do not have the same force-error bound as a full 1 ms step; an optimizer velocity-gradient residual is not mislabelled as a force bound.

The verified clutch still tries static capture then +/- capacity and requires nonnegative midpoint clutch friction work. Each trial solves the contact/brake system; inadmissible clutch modes are rejected. At most three trials, each at most 2000 convex iterations, are allowed per core stage. Nonconvergence, unresolved clutch modes, nonfinite state or failed energy accounting throws a visible fault. The existing at-most-24 dog time-search trials remain; their actual work is counted. No unbounded correction loop, hidden substep, wheel-speed reset, yaw stabilization or automatic matching was introduced.

`lastSolveCases` / `lastStepCases` retain their legacy field names but now count **convex iterations**, including rejected clutch attempts and dog time-search stages; they are not comparable to old active-set candidates. Copied workload assertions use the corresponding new 3*2000 and 26*3*2000 bounds. All other copied gearbox physical assertions remain. The old active-set solver stays runnable in `planar-reference.js`/`clutch.js`.

Diagnostics report reduced horizontal/rotational kinetic energy, external motor/selector end-stage work, tire/brake end-stage dissipation, clutch end-stage power, bearing power and **independently calculated** backward-Euler quadratic velocity-increment loss. Their energy residual is checked separately (<1e-7 J per tested step), not defined by assigning a balancing loss. The original rotor midpoint-work ledger and nonnegative midpoint clutch heat also remain. Do not combine midpoint clutch heat with an end-stage power integral and call it one thermal balance: clutch reversal/capture and numerical losses require their disclosed time levels.

For an isolated braked rotor I=1 kg m², omega0=10 rad/s and capacity 100 Nm, the stop time is 0.1 s within one timestep and energy removed is 50 J. The end-stage brake-work sum plus numerical loss closes that energy within 1e-8 J; numerical loss decreases with refinement. This is not exact thermal partition at finite h. Brake/tire instantaneous dissipation is nonnegative to floating-point tolerance in the executed cases. The full ledger includes motor/selector work; kinetic energy may increase when the driver or stored mechanical system supplies work.

## Executed experiments and reproduction

Run from repository root:

```bash
node --test research/scientific-rebuild/braking-and-tire-contact-prototype/tests/*.test.js
node --test research/scientific-rebuild/unsynchronized-gearbox-prototype/tests/*.test.js
node research/scientific-rebuild/braking-and-tire-contact-prototype/tests/contact-experiments.mjs
node research/scientific-rebuild/braking-and-tire-contact-prototype/tests/shift-transients.mjs
MPLCONFIGDIR=/tmp/verlet-mpl XDG_CACHE_HOME=/tmp/verlet-cache python3 research/scientific-rebuild/braking-and-tire-contact-prototype/tests/plot-contact.py
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/braking-and-tire-contact-prototype/tests/browser-laboratory.mjs
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/braking-and-tire-contact-prototype/tests/browser-braking.mjs
```

`mission39-traces.csv.gz`, `mission39-results.json` and `mission39-comparison.svg` record before/after constant-load cases at 8 m/s, 1 ms, 2 s: straight coast, service braking, steady steering, left/right handbrake, and steering reversal. Baseline service capacity is 100 Nm uniformly, new service capacity 100 front/70 rear; the baseline has no handbrake. Those mechanisms are disclosed, not treated as identical calibrations. The new grip envelope uses the unchanged mu and normal loads.

A progressive rear handbrake (ramp from 0.5 to 0.75 s) locks the rear while translation continues. Without handbrake, the new 2 s left-turn yaw is about 0.588 rad/s; with handbrake it is about 0.939 rad/s, with a transient peak about 1.975 rad/s. Left/right responses are mirrored. At 2 s, handbraked speed is about 1.44 m/s and rear angular speed is numerically zero; release spins the rotors up through tire torque. These are one controlled reduced-model observation, not a universal drift outcome or proof of real-car fidelity.

Steady curvature r/u is about 0.0751 m⁻¹, compared with tan(0.15)/2=0.0756 m⁻¹ for the 2 m wheelbase geometric reference. Tire slip angles, front/rear forces, yaw, sideslip and response during the steering-rate ramp are recorded. Ackermann geometry, steering compliance, tire relaxation, self-aligning moment, roll and lateral load transfer are absent; the two front steering angles remain equal. No steering redesign or extra yaw torque was used.

The matched 1 s handbrake/steer refinement at 1/0.5/0.25 ms records every state in JSON. From 1 to 0.25 ms, energy differs by about 0.42 J out of 2550 J; rear-right speed differs by about 0.0322 rad/s near its lock transition. Differences halve under refinement. This is first-order numerical evidence, not a claim of timestep independence.

`mission39-shift-transients.json` traces shaft angular momentum changes, engine/input speeds, output and rear wheel torque, rear Fx, acceleration, pitch and impact loss. With the prescribed double-declutch blip versus omission, losses are approximately 0.000298 versus 1.92476 J; peak longitudinal acceleration is about 1.12 versus 3.38 m/s². Both have zero pitch response on the equilibrium flat road. Thus a longitudinal response exists; it stops at the vertical/pitch subsystem because its equations contain only vertical spring/load moments, not longitudinal force/height or housing-mount couples. No camera shake or fake pitch was added.

Next steering investigation: independently compare this reduced law with a calibrated combined-slip tire fixture and add relaxation/steering geometry only after its force/work checks. Next driveline-shock investigation: one isolated compliant shaft/hub and physically closed chassis/unsprung reaction and pitch-work experiment; do not add an arbitrary shock impulse.

The per-wheel record separates actual service and handbrake torque and dissipated end-stage power. Parallel brake mechanisms share a rotor; the sum of their torque intervals is exactly the aggregate interval used by the solver. At slip both mechanisms saturate proportionally to installed capacities. At static hold their individual reactions are underdetermined without pad/cable compliance; displayed reactions use a disclosed proportional-capacity allocation, each within its own bound. Only their unique aggregate reaction drives the dynamics.

## Verification results and performance limits

Executed Node suites: **47 tests in this new exhibit pass**, plus **29 unchanged tests in the original Mission 38 exhibit pass**. Tests include brake stop/hold/release, positive/negative/near-zero speed, the independent 0.1 s / 50 J rotor stop, combined force/work/envelope checks, unsupported tires producing zero wrench, asymmetric grip and dynamic unloading, actual force-law residuals, mirrored handbrake turns, deterministic replay and refinement, two-inertia clutch synchronization/135 J heat, all inherited gear/dog/worn/differential assertions and byte-for-byte preservation. The new copied workload bounds count convex iterations, not old active-set candidates; conservation tolerances were not loosened to get a pass.

`results/mission39-browser-laboratory.json` records the executed Chromium 154 laboratory regression: gauge pivots at three viewport widths, actual shaft/wheel/steering mappings, camera/view/explosion state isolation, 1200 submitted paused frames and renderer recreation. Scene resource counts remain stable at 100 geometries / 31 materials; lazy GPU uploads differ by view. `mission39-browser-braking.json` records actual keyboard Space application: rear speeds [0,0] with the vehicle still translating at 6.37 m/s, yaw 1.11 rad/s, no vertical impulse, and positive rear spin after release. The overlay was enabled on a paused scene without modifying physics state; its screenshot was inspected. These are controlled-RAF functional tests, not a claim of native real-time FPS. H retains the prior body impulse.

`mission39-performance.json` records the 2000-step worn/alternating-selector workload on Node 24.19 / AMD EPYC 9V74, 5 exposed logical CPUs. New mean/p95/worst tick duration: **0.775 / 1.847 / 23.18 ms**; reference **0.484 / 1.269 / 11.62 ms**. New observed maximum was 3312 convex iterations over an accepted master step including event searches; reference maximum 2360 counts active-set candidates, an incomparable work unit. Event-search totals differ (1558 vs 1522) because contact laws and trajectories differ. No speedup is claimed. Warm starts and exclusion of fixed coordinates from the Lipschitz bound reduce unnecessary work without changing the converged law.

The 6 ms cooperative / 32-step frame scheduler, 50 ms debt cap and explicit slow-wall accounting remain. One indivisible step can exceed the budget; the measured worst tick rules out a hard 1 ms deadline. The browser braking replay recorded 1.521 s simulated, 0.039 s explicitly slowed and 0.1 s paused out of 1.66 s requested. It does not measure GPU completion. Mission 37's poor SwiftShader software-rendering performance and lack of accelerated desktop measurements remain unresolved; this mission does not certify interactive frame rate or repair that renderer bottleneck.

Remaining limits: uncalibrated viscous regularization and brake strengths, no exact zero-creep road adhesion, no tire relaxation/aligning moment/thermal model, equal front steering angles, no lateral load transfer or roll, and incomplete caliper/driveline/chassis pitch-reaction coupling. The inherited vertical suspension still supplies dynamic loads and bumps; it cannot reproduce braking dive or gear-shock pitch merely by improving tire forces. All empirical numbers here concern the stated reduced model. No universal claim of realistic drifting is made.

Rear-wheel drive-torque diagnostics use the differential's actual individual output reactions (`I*omegaDot + R*Fx - brakeTorque`), rather than the nominal clutch torque times ratio divided by two. This distinction includes input/carrier inertia and locked-differential reactions; it changes reported values, not the force solve. Clutch input, gearbox delivered output and wheel half-shaft torque are distinct ports in the transient trace.

Kinetic-energy diagnostics recompute the current coordinates, including any dog impulse applied after the force stage; force-stage ledgers are labelled separately. The 8 m/s open-differential initial condition has 4703 J reduced kinetic energy, including the carrier's 125 J. The explicit diagnostic test checks that number and the post-capture energy loss, so the baseline comparison does not omit carrier inertia or display a pre-impact cache as current energy. Event impulse/impact heat are separate from finite force-stage torque; no torque impulse is silently applied to the chassis.

During development an endpoint-only clutch law failed the inherited abuse/heat regression and was rejected; the verified midpoint admissibility rule is retained. Tiny stationary-brake residual speeds were resolved by mechanical reaction-impulse polish. Final direct force-law mismatch and independently calculated energy residual guards remain active; failures pause rather than substitute a plausible state.
