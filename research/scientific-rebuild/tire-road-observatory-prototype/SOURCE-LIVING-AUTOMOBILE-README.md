# Mission 39 — The Living Automobile

Continued on **scientific-rebuild/12-braking-and-tire-contact**, from **7fca4a488306b7aad44e7202ce7d1f987b248fba**. The requested sibling directory already existed: this mission extends it in place. No branch, worktree or duplicate prototype was created. The immediate predecessor `../unsynchronized-gearbox-prototype/`, all earlier exhibits and production remain unchanged. `living-automobile-provenance.json` records both origins.

Changed implementation files: `src/engine.js`, `brakes.js`, `steering.js`, `automobile-view.js`, `vehicle.js`, `planar.js`, `main.js`, `view3d.js`, and `index.html`. Tests, experiment scripts, provenance, this README and prefixed results accompany them. Existing drivetrain/clock/style/vendor files are unchanged.

The previous braking-stage README is archived verbatim in **BRAKING-BASELINE-README.md**. Its Mission 39 result files and earlier result files remain historical records. New measurements have the **living-automobile-** prefix.

## Open and drive

From repository root: `python3 serve.py`, then open

<http://localhost:8000/research/scientific-rebuild/braking-and-tire-contact-prototype/>

- **E** / Hold starter: finite electric starter torque. Start with the clutch open.
- **I** / Ignition button: ignition enable; this does not crank or reset RPM.
- **W**: accelerator, not prescribed engine torque.
- **S**: service brake; **Space**: independent rear handbrake.
- **A/D**: driver steering position through the closed mechanical linkage.
- **1/N/2**: existing physical selector forces. Open the clutch and synchronize shafts as before; no rev matching is added.
- **R**: reset; **B**: bump; **H**: retained body-impulse experiment.

Changing the power source explicitly resets the exhibit. Power source selects normal carbureted operation or the explicitly labelled prescribed-torque laboratory. The latter retains physical brake/steering mechanisms but replaces combustion with the existing `drive` torque port. Spinning-flywheel and moving-second fixtures explicitly select laboratory power. The 8 m/s rolling button is a labelled initial condition, not a force intervention.

Start the engine, wait for it to run, select first with the clutch open, apply the accelerator, then engage the pressure plate progressively. An unsuitable load or abrupt clutch release can stall it. Throttle alone cannot start a stationary stalled engine. Release the clutch and use E to restart; with ignition enabled, wheel/clutch back-driving can also start it.

## Engine equations and states

`engine.js` supplies torque to the existing **single** crank/flywheel inertia J=0.3 kg m². No additional rotor inertia is integrated. The gearbox, clutch friction/pressure plate, selector, dog impacts and differential equations are unchanged.

For crank speed w, accelerator a in [0,1] and physical throttle linkage state theta,

```
thetaDot = (a-theta)/0.08
q = 0.17 + 0.83*theta
b = 100 + 400*theta                            [rad/s]
Tcomb = 32*q/(1+(abs(w)/b)^2)                   [Nm]
Tfriction = 1.1*tanh(w/5) + .012*w + .00005*w*abs(w)
Tpumping = 2*(1-theta)*w/(abs(w)+20)
Tstarter = requested ? 8*max(0,1-max(0,w)/45) : 0
J*wDot = Tcomb + Tstarter - Tfriction - Tpumping - Tclutch
```

The 0.6 litre four-stroke mean-cycle interpretation uses `IMEP=4*pi*Tcomb/displacement`; 32 Nm corresponds to 0.670 MPa maximum gross indicated mean pressure before speed/charge losses. This is **not a fitted historical engine**. Charge restriction, breathing roll-off, Coulomb/viscous/quadratic friction and throttling losses are deliberately reduced and separately visible. No cycle-resolved compression, manifold-pressure, fuel, temperature or cold-start choke states are claimed.

Modes: **stopped, starting, running, stalled**, with explicit ignition and momentary starter input. Forward cranking/back-driving above 22 rad/s enables combustion with ignition. Combustion extinguishes below 12 rad/s; the running state declares stall after 80 ms below that threshold, or immediately at nonpositive rotation. Those are declared combustion-domain thresholds, not RPM targets. Starter torque falls with speed and an ideal overrunning drive disengages at 45 rad/s. Its pinion ratio is 8:1. No speed is assigned by these transitions. Opening ignition disables combustion; inertia can coast before stopping. Likewise, stalled means extinguished combustion, not an instantaneous zero-speed impulse: a crank can coast or be mechanically back-driven, and its mesh always follows its actual angle. Engine reversal does not sustain combustion.

At the carburetor stop the torque balance root is **68.4657563062 rad/s = 653.799812920 RPM**: combustion 3.703814711 Nm, friction 2.155967065 Nm, pumping 1.547847646 Nm. The slope is restoring on both sides. This root is measured, not supplied to the integrator. A freshly cranked engine approaches it gradually: the 6 s experiment is still only about 470 RPM. The equilibrium fixture verifies preservation at the root and recovery toward it after a perturbation. A separate full start/rev/close trajectory verifies finite-time behavior.

The existing contact solver sees a frozen engine torque at each accepted stage; throttle uses exact first-order linkage advancement. Engine integration remains first order with the existing 1 ms master clock and bounded dog-event stage splits. Engine combustion/starter/loss end-stage work uses the same applied torque and time level as the reduced mechanical ledger. This is a work port, not thermodynamic fuel-efficiency certification. Housing reaction into full chassis pitch remains outside the inherited reduction.

## Hydraulic service brakes and rear cable brake

`brakes.js` replaces direct capacity commands in normal browser driving with ideal quasi-static hydraulic **non-servo opposed-shoe drums**. This selects one coherent architecture; no disc/caliper mechanism is implied.

```
Fmaster = pedalCommand * 250 N * pedalRatio(4)
p = Fmaster / Amaster                           [Pa]
Fhydraulic,i = p * AwheelCylinder,i
Tcable,total = handCommand * 100 N * handRatio(8)
Fmechanical,rear = (Tcable,total/2) * expanderRatio(4)
Nshoe = max(0,(Fhydraulic+Fmechanical-Fpreload-kreturn*clearance)
                 /(1+kreturn/klining))
Tcapacity = 2 * muLining * drumRadius * Nshoe
```

Master diameter 20 mm; wheel cylinders 20.2 mm front / 17 mm rear; lining mu=.4; drum radius=.125 m; return preload 20 N, stiffness 10 kN/m, clearance .2 mm and lining stiffness 20 MN/m. Full pedal gives **3.1831 MPa**, approximately **99.76 Nm/front wheel and 70.01 Nm/rear wheel**. Full rear cable gives about **157.72 Nm/rear wheel**. These explicit synthetic mechanism dimensions closely retain the prior brake strengths; they are not measured factory brake data.

The two actuators share the rear shoes, paying return preload once. Aggregate clamp is allocated by hydraulic/mechanical force share for torque reporting. The convex brake intervals use those actual capacities. Static holding is a bounded reaction impulse; slip dissipates `-Tbrake*wheelOmega`. No wheel-speed reset, lock timer or axle disconnect is present. The underlying constitutive brake/contact solver and its energy guards are retained.

Master travel follows actual wheel-cylinder fluid displacement. Pedal angle follows that travel. Hand cable travel includes 8 mm slack take-up, 200 kN/m cable elasticity and the shoe-expander displacement; the lever's 30 mm cable radius maps it to angle. This is a **quasi-static force-controlled** mapping, not a hydraulic transient/cable vibration simulation. Shoe, return-spring and cable deformation coordinates are displayed. Actuator work/compliance energy is not included in the reduced rotor ledger; brake friction heat is. Mechanical brake/housing reactions are supported by the inherited reduced carriers, not a new six-DOF torque closure.

## Closed mechanical steering

`steering.js` describes an ideal position-controlled worm/sector box, Pitman arm, drag link, steering arms, tie rod and kingpins. The column-to-sector ratio is **24:1**; the driver column is limited to **±7 rad (±401°)** at **32 rad/s**. There is no tire-disconnected centering spring: release of A/D requests the driver's centered position. Steering inertia, hand force and tire self-aligning torque are unmodelled.

Actual wheelbase and track (2 m / 1.2 m) determine kingpin coordinates. The .22 m steering-arm angle k is constructed from `L*tan(k)+2*arm*sin(k)=track`, giving the ideal Ackermann cotangent difference **in the small-angle limit**. A fixed 48-step construction solve is used once. Per tick, two analytical circle intersections close the fixed drag-link and tie-rod lengths, selecting the straight assembly branch. No iterative turning solver runs.

This finite trapezoid is **approximate Ackermann**, not perfect Ackermann over the whole range. Measured maximum outer-angle error against ideal Ackermann over the disclosed 15-point sample is **0.004406 rad (0.252°)**. Both turn directions have the appropriate inner/outer ordering. The offset drag link causes a small real left/right asymmetry. Mechanical stops lie inside the valid assembly branch; the initial singular full-travel design was rejected rather than clamped after failure. Both distinct knuckle angles enter contact velocities, force transforms and yaw moments.

The linkage is planar and massless. Its presentation plane follows the shared front-carrier height; it does not solve body-mounted steering-box/bump-steer kinematics. The inclined column has an explicitly ideal articulated input at the horizontal worm; universal-joint inertia and cyclic speed ripple are omitted. Geared display angles are kinematic reductions, not a tooth-contact steering solver.

## Tire contact, suspension and gear shock

The previous passive isotropic regularized combined-slip law is unchanged:

`F=-min(800,mu*N/|s|)*s`, `s=(Vx-R*Omega,Vy)`; F=0 at zero slip/nonpositive support.

One friction disk and the actual axle/differential inertias govern all reactions. No TMeasy, force clipping after integration, grip tuning, lateral stabilizer or scripted yaw was added. The solver remains bounded and rejects failed residual/energy checks. Laboratory-only `createVehicle()` defaults retain old fixture ports; browser vehicles explicitly enable automobile steering/brakes. Tests use both configurations.

The prior `mission39-shift-transients.json` remains the executed source-stage evidence: matched/mismatched dog impacts lose about 0.000298/1.92476 J and produce about 1.12/3.38 m/s² peak longitudinal acceleration. Both show zero flat-road pitch response. The gearbox and vertical/pitch equations remain unchanged here. Longitudinal force/height and mount couples are still absent; no fake pitch or camera shake was added. Next shock experiment remains a compliant shaft/hub with closed pitch-reaction/work accounting, not an impact animation.

## Three.js mechanisms and inspection

New `automobile-view.js` is read-only. It adds an actual-angle crankshaft, existing coaxial flywheel, housing, carburetor butterfly, overrunning starter pinion; hydraulic pedal/master/lines; wheel drums, shoes, wheel cylinders, return springs; hand lever/cable/equalizer; and steering column, worm/sector, Pitman arm, drag link, tie rod and knuckles. Shoe displacement uses actual travel, without visual exaggeration. The carburetor butterfly includes the idle stop; it is not falsely drawn fully shut at idle. Drum spin uses each wheel angle. Force/slip arrows remain available.

New presets: **engine, front drum, rear handbrake, steering column, steering box, front linkage, tire–road contact**. Original workshop, driver, X-ray, clutch, gearbox and exploded modes remain. Internal brake assemblies are omitted behind the opaque wheel rims in vehicle views, then exposed with the same poses in their cutaway. Drum inspection removes the front-left wheel artwork; rear-handbrake inspection sections the rear-left artwork to expose its mechanism. New component cameras use actual yaw/heave positions when focused/reset; they never modify physics. Previous gearbox meshing geometry and every physical drivetrain module remain source-identical.

## Reproduce

From repository root, using existing Node/Playwright; no new runtime dependencies:

```bash
node --test research/scientific-rebuild/braking-and-tire-contact-prototype/tests/*.test.js
node --test research/scientific-rebuild/unsynchronized-gearbox-prototype/tests/*.test.js
node research/scientific-rebuild/braking-and-tire-contact-prototype/tests/living-experiments.mjs
MPLCONFIGDIR=/tmp/verlet-mpl XDG_CACHE_HOME=/tmp/verlet-cache python3 research/scientific-rebuild/braking-and-tire-contact-prototype/tests/plot-living.py
QUICK=1 CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/braking-and-tire-contact-prototype/tests/browser-living.mjs
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/braking-and-tire-contact-prototype/tests/browser-braking.mjs
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/braking-and-tire-contact-prototype/tests/browser-reliability.mjs
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/braking-and-tire-contact-prototype/tests/browser-living-performance.mjs
```

Matplotlib is offline plot tooling only. Results/units/provenance are in `results/living-automobile-experiments.json`; detailed decimated traces are in `living-automobile-traces.json.gz`; the plot is `living-automobile-engine-steering.svg`. Historical scripts still regenerate their historical filenames; preserve those records before deliberately rerunning them.

## Evidence, limitations and source status

Node: **60/60** new-exhibit tests and **29/29** unchanged predecessor tests passed. These include 12 new engine/actuation/linkage tests and an added historical-results preservation test, all retained clutch/differential/dog conservation tests and complete predecessor-file preservation checks. JavaScript syntax checks passed. Chromium functional tests verified starting, revving, first-gear propulsion, brake lock/release, all 12 vehicle/inspection modes, actual-angle/actuation/link-length mapping, view-state isolation and renderer recreation. The final camera check recreated and focused each view on its first frame (two submitted frames per pose), rather than waiting 65 transition frames. Engine, drum, handbrake, steering column, steering box and front-linkage screenshots were inspected. Input/focus clearing, injected-fault recovery and renderer-recreation reliability tests also passed in the new and unchanged predecessor applications. Real tab hiding was injected by the harness; headless OS tab visibility remained visible. The separate real-time performance result below is not a functional PASS.

Engine refinement (1/.5/.25 ms), after the declared start/warm sequence then 2 s full accelerator: **2049.524 / 2049.291 / 2049.186 RPM**. Threshold crossings make start timing grid-sensitive, but refinement error shrinks. These are transient values, not idle or governed maximum RPM. The previous 20 Nm laboratory port reaches **1273.240 RPM after 2 s from rest** and has no combustion/loss equilibrium; it remains available as a fixture.

In the disclosed 8 m/s steering/handbrake sample, left no-handbrake final heading is **1.050 rad** versus **2.458 rad** with rear braking. Final yaw is **.543 versus .435 rad/s**: the braked vehicle has slowed to **.827 m/s**, versus **7.858 m/s** without handbrake. Do not describe this as universally higher final yaw. The trajectory, wheel lock, contact forces and dissipation—not a Space-driven yaw impulse—explain the different heading. Right turns have the same qualitative effect with the documented linkage asymmetry.

CPU benchmark: 500 warm-up + 2000 measured 1 ms master ticks per case, Node 24.19, AMD EPYC 9V74, five exposed logical CPUs. Normal automobile neutral/steer/handbrake mean durations are approximately **.266/.269/.400 ms**, p95 **.283/.299/.424 ms**, worst **24.33/22.50/22.61 ms**. The associated throughput is about **3761/3719/2498 steps per wall second**. No rejected steps; tested energy residuals below 3.1e-12 J and direct force mismatch below 1.1e-7 N. These benign workloads do not replace the prior worst-case dog-search workload; they do not certify a hard 1 ms deadline. Timing includes host scheduling/GC and was collected with a software browser active. No speedup or production performance claim is made.

**Real-time browser observation: NOT REAL TIME on SwiftShader.** `living-automobile-browser-performance.json` records 10 actual RAF frames in 3.283 measured seconds: **3.046 FPS / 75.541 physics steps per wall second** at a 1280×850 viewport, rolling 8 m/s fixture with held A and clutch open. The clock reports slowdown explicitly and no faults/rejections. CPU callback mean/p95/worst was 9.85/10.9/10.9 ms; RAF interval mean/p95/worst 325.91/383.3/383.3 ms. The renderer identifies Google SwiftShader Vulkan software execution. This small observation establishes poor software-rendered interactivity, not a GPU benchmark or desktop performance acceptance. Historical browser measurements use different workloads; no causal speedup/regression ratio is claimed. The final workshop observation submits about 209 draw calls / 57,012 triangles versus the prior recorded 151 / 52,624; the added mechanisms increase rendering work. Internal brakes hidden by opaque rims are exposed only in their inspections, reducing needless submissions. The scene has 154 geometry resources / 39 materials, stable across recreation.

Physical foundations: four-stroke mean-work relation and signed loss ports in `engine.js`; independently closed linkage geometry in `steering.js`; hydraulic force balance and Coulomb brake work in `brakes.js`/`contact-solver.js`. The retained [mechanical interface contract](../../../docs/scientific-rebuild/vehicle-mechanical-interface-contract.md), [TMeasy power audit](../../../docs/scientific-rebuild/tmeasy-mechanical-power-audit.md), and [Mission 22 zero-support decision](../../../docs/scientific-rebuild/mission-22-decision.md) guide the unchanged contact/reaction boundaries.

Historical/source limitation: hydraulic drums, separate rear cables and worm/sector steering are selected as an interwar-inspired coherent design family, **not a reproduction of a named 1930s car**. No period factory torque curve, carburetor-flow data, brake drawing or steering drawing was available for dimensional validation. A bounded external source search was denied (HTTP 403); no primary manual was recovered. Textbook background is Heywood, *Internal Combustion Engine Fundamentals* (four-stroke work/mean pressure), and Gillespie, *Fundamentals of Vehicle Dynamics* (steering geometry); these were not newly accessed or used as measured parameter datasets. Exact period-specific historical suitability and real-vehicle calibration remain **UNVERIFIED**. Do not call synthetic parameters manufacturer data.

Other limits: no compression pulses, cold-start enrichment, thermal states, gearbox expansion, self-aligning steering, caster/trail, steering compliance/inertia, tire relaxation, exact static road adhesion, roll/lateral load transfer, full brake/housing pitch reaction or empirical handling validation. GPU-accelerated desktop frame rate remains unverified; SwiftShader cannot certify usability on the user's hardware. All earlier prototypes and production remain unchanged.
