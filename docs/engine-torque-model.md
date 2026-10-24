# Mission 9 — Provisional physical engine torque model

Branch: `fix/engine-torque-model`; base: `fix/engine-free-rev-dynamics` at `ae87786`. No merge.

**Research completed; candidate implemented and numerically validated; branch default production engine changed. Real-world calibration remains provisional.** This is an engine torque correction, not a claim to have repaired the existing coupled drivetrain or frequent-stall problem.

The default separates indicated combustion, idle bypass torque, mechanical friction and throttle-dependent pumping. It retains crank inertia, signed rotation, finite starting and the existing engine/clutch/contact call order. No gear/speed exceptions, rev matching or anti-stall assistance were added.

## Baseline and evidence

Before editing production code, the original Mission 8 browser harness was rerun using fresh UI settings. It reproduced 7000→810 RPM in **11.25 s**, 4000→810 in **6.88 s**, monotonic asymptotic idle recovery and the 100 Hz full-throttle peak of **7071.79 RPM**. Old high-RPM resistance was only `12.25 + 0.01 |ω|` Nm: approximately 19.58 Nm at 7000 RPM, with no pumping component. Original Mission 8 measurements remain unchanged on this branch and its preserved base branch.

The expanded comparison independently runs the archived `ae87786` engine and the new implementation against identical browser UI parameters: **64 isolated and 56 loaded runs per model**, covering 50/100/200/400 Hz. For baseline capture only, a Playwright route serves the original engine module; production code has no legacy selector. New physical coefficients present in the baseline state are ignored by that archived module.

Evidence in [engine-torque-model-data](engine-torque-model-data/summary.json):

- `baseline.json.gz` and `candidate.json.gz`: separate, complete per-tick isolated torque/acceleration/work trajectories; loaded traces retained near 20 Hz and at every tick within ±0.1 s of transitions. Summary metrics use every captured tick.
- `summary.json`: trajectories, endpoint measurements, stall-step components, transition times and before/after loaded comparisons. Legacy governor/friction components are reconstructed from the recorded production torque, impulse, speed and known legacy equations; they are observations, not an alternate dynamics model.
- `verification.json`: browser/Node parity, sensitivity candidates, convergence, timing and source-scope checks.
- `historical-parity.json`: compact comparison against the seven historical Mission 5 replays.

Actual UI settings include 350 Nm peak brake-torque target, 800 idle RPM, **7000 redline**, 600 stall RPM, resistance 0.5 (360 RPM effective threshold), starter 40 Nm and firing threshold 400 RPM. Crank inertia remains **0.25 kg m²**. These differ from some `state.js` startup constants.

## Torque balance and signs

For positive forward crank speed, passive torque magnitudes are subtracted:

```
I dω/dt = Tind + Tidle + Tstarter + Texternal − Tfriction − Tpumping
n = |ω| 60/(2π)
k = displacement/(4π)                       # four-stroke pressure→torque
FMEP(n) = frictionBasePa + frictionSlopePaPerRpm n
F(n) = k FMEP(n) = Tc + b |ω|
P(n,u) = k pumpingPressurePa (1−u)² n/(n+pumpingSpeedRpm)
B(n) = peakTorque max(0, 1−2.5((n−4500)/(redline−idle))²)
Tind = u [B(n)+F(n)] L(n)                  # running, forward rotation only
```

`B` is explicitly a **full-load brake-torque target**, retaining the old curve shape and peak. Mechanical friction is added when converting it to indicated torque; at full throttle outside the limiter/idle region, net shaft torque is B rather than B minus the same losses twice. Pumping falls to zero at wide-open throttle in this simplified model. This omits residual intake/exhaust pressure losses at wide-open throttle and is an explicit limitation.

At reverse speed, passive impulses oppose rotation; combustion and idle torque are disabled. A positive starter can physically reverse a backward crank. Passive loss at zero speed is bounded by available momentum, so it cannot kick the crank backwards. `Texternal` remains the existing driveline reaction, with no changes to its integrator. Applying pressure maps symmetrically to backward rotation is a passive numerical continuation, not a calibrated reverse gas-exchange model.

Ignition OFF does **not** magically open the throttle or eliminate pumping. With the same closed throttle, it removes combustion/idle torque but retains mechanical and pumping resistance. OFF + open throttle isolates this model's mechanical rundown. Controller and starting states remain the existing explicit engine modes.

### Idle and limiter

The idle bypass actuator is bounded to `(1−u) × 0.25 × peakTorque`. Its demand is `max(0, F+P−uF + K(idle−n))`, multiplied by a smooth gate that fades from one at idle to zero at idle+400 RPM, and by the limiter envelope. The `uF` subtraction avoids compensating the same full-load friction offset twice. It has no high-RPM idle torque. K retains the old 0.05 Nm/RPM gain; there is no integral windup, gear awareness or speed-based stall immunity.

Idle convergence is naturally asymptotic for proportional control; there is no RPM assignment or exact-idle snap. The relevant criterion is settling within a finite tolerance without hunting. Both above- and below-idle perturbations settle monotonically; 650 RPM stays running and reaches within 0.01 RPM of idle by 6 s at all four rates. The high-RPM multi-second coast is no longer disguised as an idle-controller effect.

The limiter scales indicated and idle torque by `L = smoothstep(clamp((redline−n)/300,0,1))`. Combustion is zero at/above redline and progressively restores below it. This models an averaged progressive spark/fuel intervention, not individual cylinder cuts or a crank-speed constraint. With full throttle it settles around **6931.21 RPM**, below the nominal 7000 ceiling. That intentional early torque roll-off is a handling change. An externally imposed 7200 RPM condition cuts combustion and restores it progressively during deceleration at every tested timestep. External wheel back-driving can still force mechanical over-rev; the limiter cannot delete that momentum.

### Discretization and work

The free-engine state update retains the previous bounded backward-Euler form. With engine-phase drive torque D, sampled pumping P, `C=Tc+P` and step h:

```
a = ωold + D h/I
v = a/(1+b h/I)
ωnew = sign(v) max(0, |v| − C h/(I+b h))
```

P is evaluated from the old speed, so the nonlinear speed dependence is explicit and first order. No iterative solver or adaptive substepping is added. Clutch and tire integration remain unchanged.

Work now explicitly follows these operators: drive work is `D h(ωold+a)/2`; viscous loss is `I(a²−v²)/2`; constant-loss work is `I(v²−ωnew²)/2`, split between friction and pumping in proportion to Tc and P. Both passive stages have nonnegative work, including starter-driven reversal. Applied signed friction/pumping torques are reconstructed from their impulses and satisfy the discrete angular-momentum balance. Traces distinguish those applied values from nominal pressure-derived capacities.

This removes the ambiguous old single-midpoint loss attribution at reversal without changing the underlying free-engine state-update formula. Finite-step drive/loss splitting adds an O(h) work bias; it is not a thermodynamic combustion-efficiency model. At steady idle the drive and dissipative operators do equal work even though their intermediate speed changes. Across all isolated candidate profiles, maximum energy-accounting residual is **2.04e−11 J** and minimum passive loss work is zero. This does **not** repair the known static-clutch heat error in the separate drivetrain solve.

## Calibration sources, uncertainty and candidates

The reference class is a **provisional 3.5 L naturally aspirated four-stroke gasoline passenger-car engine**, not a claimed DeLorean, BMW or audio-engine calibration. No directly applicable measured crank inertia + torque + motoring + rundown dataset was available.

The source assessment includes the EPA [complete engine ALPHA map resource](https://www.epa.gov/vehicle-and-fuel-emissions-testing/combining-data-complete-engine-alpha-maps), whose access failed at the environment proxy in Mission 8; no dataset was retrieved or used. The published [FASTSim repository README](https://github.com/NREL/fastsim/blob/fastsim-3/README.md) was accessible and reviewed: its vehicle powertrain/energy simulation scope supplies no directly applicable crank free-rev calibration in that reviewed material. Its data were not substituted for an inertia or rundown measurement. Heywood, *Internal Combustion Engine Fundamentals*, 2nd ed. (2018), supports the indicated/brake/friction/pumping work framework, not the numerical coefficients below. This was a bounded reference search, not a claim that no useful measurements exist anywhere.

| Quantity | Value | Status and rationale |
|---|---:|---|
| Displacement | 0.0035 m³ | Provisional reference class; independent of visual body |
| Mechanical FMEP intercept | 50 kPa | Estimated, explicitly configurable; independent of peak torque |
| Mechanical FMEP slope | 10 Pa/RPM | Estimated low-order speed dependence; 58 kPa at idle, 120 kPa at 7000 |
| Closed-throttle pressure scale | 65 kPa | Provisional sub-atmospheric pressure drop; bounded below reference atmosphere, not fitted to a target fall time |
| Pumping speed scale | 600 RPM | Provisional smooth low-flow roll-off, ensuring zero pumping at zero speed |
| Inertia | 0.25 kg m² | Inherited, unidentified lumped crank/flywheel inertia; unchanged, not claimed measured |
| Brake torque curve | 350 Nm at 4500 RPM | Inherited synthetic curve interpreted explicitly as brake torque; not published engine data |
| Idle gain | 0.05 Nm/RPM | Inherited gain; bounded actuator and operating-region gate added |
| Idle fade / limiter band | 400 / 300 RPM | Provisional control-envelope widths, numerically tested |

At 7000 RPM/closed throttle, nominal mechanical friction is about 33.4 Nm and pumping 16.7 Nm: total roughly **50.1 Nm**, versus 19.6 Nm before. This is the quantitative reason for faster coast-down. At full throttle the added mechanical offset preserves the specified brake-torque target instead of reducing peak output by the new losses.

Sensitivity candidates used 40/65/85 kPa pumping scales, with every other coefficient held fixed. At 100 Hz, 7000→810 RPM takes **5.88/5.13/4.66 s**, respectively; all have bounded passive work and convergence in isolated runs. The middle pressure is the provisional default, representing a substantial closed-throttle pressure drop below the atmospheric bound. **Only the 65 kPa candidate received the complete loaded matrix.** The pressure range is an uncertainty study, not a measured confidence interval or a search for a pretty tachometer curve.

These coefficients must ultimately be identified using an actual engine, its effective inertia, throttle/manifold behavior, accessory/temperature conditions and both ignition-on/off trajectories. Rundown alone identifies net loss divided by inertia and cannot determine both independently. Existing low-RPM torque shape and starter/idle reserve also need empirical calibration. No new sliders were added; physical coefficients are ordinary named parameters supported by settings import/export, with positive/finite/pressure-bound validation before any import mutation.

## Neutral, clutch-open and timestep results

Times below are seconds to 810 RPM; shutdown is time to zero from 4000 RPM. These are **provisional outputs**, not claimed correct real-engine durations.

| Hz | Legacy 7000→810 | New 7000→810 | Legacy 4000→810 | New 4000→810 | New 2000→810 | New OFF/closed→0 |
|---:|---:|---:|---:|---:|---:|---:|
| 50 | 11.240 | 5.120 | 6.880 | 3.380 | 1.980 | 3.460 |
| 100 | 11.250 | 5.130 | 6.880 | 3.390 | 1.990 | 3.450 |
| 200 | 11.260 | 5.135 | 6.885 | 3.400 | 1.990 | 3.445 |
| 400 | 11.260 | 5.135 | 6.8875 | 3.405 | 1.995 | 3.4475 |

100 Hz idle-start blips of 20/50/100% throttle for 0.2 s peak at **853.06 / 960.46 / 1349.30 RPM**, then return without hunting. Repeated 50% pulses peak at 1076.99 RPM. OFF/open-throttle 4000 RPM rundown takes **5.53 s**, versus 3.45 s closed: this distinguishes pumping from mechanical friction without pretending ignition changes the throttle plate.

At full throttle, the old peak overshoot above 7000 was 143/72/36/18 RPM across the four rates. The new 300 RPM torque envelope has no overshoot from an idle acceleration at these rates; all settle at about 6931.21 RPM. Starting and imposed-over-rev tests verify finite torque-driven transitions rather than RPM teleportation.

The complete 7000 RPM release curve was compared with a 1600 Hz numerical reference. Maximum RPM errors at 50/100/200/400 Hz are **3.256 / 1.576 / 0.735 / 0.315 RPM**: first-order refinement across the idle transition as well as the high-speed coast. The reference is a numerical convergence aid, not empirical truth. Shutdown event times need not refine monotonically within a sample interval.

Browser/Node comparison checks **2,299,500 fields with maximum difference zero**. Another **464 retained loaded samples** verify exact RPM agreement between isolated neutral release and third gear/open-clutch release while moving, with zero transmitted torque. Primary isolated runs guard wheel/chassis access with throwing proxies; a separate unit case holds spinning shafts in an engaged gear with an open clutch and verifies no crank or wheel-speed disturbance.

## Loaded engine and stall results

All 14 scenarios were run at all four rates for both models. No nonfinite trajectories or execution anomalies, and **no previously successful scenario acquired a stall**. The scripted 0.3 s pedal release is unchanged. This is an explicit test envelope, not proof against every possible stall.

| 100 Hz scenario | Legacy → new observation |
|---|---|
| Start at rest in neutral | Running at 0.39 → **0.50 s**; new 799.932 RPM at 5 s |
| Gentle 15% launch | Both fail: stall **1.61 → 1.59 s** |
| Ordinary 35% launch | Neither stalls; speed at 6 s **3.123 → 2.271 m/s** |
| Aggressive full-throttle launch | Neither stalls; speed at 6 s **12.531 → 12.411 m/s** |
| Normal 2→3 upshift | Both engage third at 1.41 s, no stall; final speed 16.038 → 15.350 m/s |
| Normal 3→2 downshift | Both engage second at 1.40 s, no stall; final speed 12.351 → 11.071 m/s; no automatic blip |
| Second-gear closed coast from 15 m/s, 6 s | No stall; final speed **12.448 → 10.264 m/s** |
| Third-gear closed coast from 15 m/s, 6 s | No stall; final speed **12.918 → 11.533 m/s** |
| 20% throttle then lift in third | No stall; final speed 14.197 → 13.343 m/s |
| Open clutch in third while moving | Crank follows isolated release exactly; vehicle speed trace unchanged |
| Brake to stop; clutch key at 1 s | Both stall during pedal travel: **1.10 → 1.07 s** |
| Brakes held in first, release clutch; then explicit restart | Both stall at **0.83 s**; neutral restart runs at 3.39 → 3.50 s |
| Engine OFF, third gear back-drive | Crank remains stopped-mode but mechanically spinning; new 1961.46 RPM and 12.653 m/s at 4 s, zero combustion |
| Moving neutral throttle/release | Finite free-rev response; vehicle speed trace unchanged |

The **27% lower final speed in the ordinary 35% launch is a real handling change**, not a performance success. The cause is explicit: partial throttle now incurs pumping loss and the specified brake target pays mechanical losses at partial load. For example, near 2000 RPM/35% throttle, the new nominal shaft balance is about 54 Nm rather than 58 Nm; near idle the relative difference is larger. The inherited low-RPM brake curve is particularly weak (about 38 Nm even at full throttle at 800 RPM). These facts explain slower low-throttle acceleration without a gear-specific penalty. This provisional pressure calibration is physically interpretable but not measured proof that a real reference engine should launch this slowly. It must be revisited with reference data; parameters were not reduced merely to restore legacy acceleration.

The narrow acceptance decision is that the model does **not introduce new stall-prone ordinary operation within the measured matrix**: 35% and full-throttle launches and both shifts remain successful at all four rates. Existing 15% launches already failed and remain a blocker to claiming the overall vehicle realistic or easy to launch. No assertion of successful gentle takeoff is made.

Stall-step evidence separates engine-phase and clutch reaction. In the new 15% launch, pre-engine crank speed is 38.716 rad/s; free engine integration **increases** it to 39.575; the final clutch impulse of **57.314 Nm × 0.01 s** removes 2.293 rad/s and leaves **37.283**, below the 37.699 rad/s stall threshold. The engine phase supplies +0.215 N m s, not an isolated-loss-induced stall. The braked first-gear case likewise goes **38.919→35.976 rad/s** through a 73.559 Nm clutch reaction after the engine phase. The stop-with-pedal-travel stall has the same immediate mechanism. Driven-wheel speeds, requested/engaged gear, lateral/forward motion and all torque components are in each stall snapshot and surrounding trace.

That identifies the immediate impulse, not a unique root cause for all existing contact/gearbox behavior. The weak inherited low-RPM brake curve, finite clutch capacity, engine/wheel coupling and rear sequential-contact artifacts remain relevant. The new extra losses modestly change the preceding trajectory, advancing the gentle/stop stalls by 20/30 ms. No vehicle-speed exemption suppresses them, and mechanically imposed overspeed is not clamped.

## Tests, cost and scope

- **36 production engine tests pass**, including torque interpretation, parameter validation, passive signed shutdown/reversal, impulse/work balances, finite start, stable above/below-idle recovery, selected gear/open clutch, limiter cut/restoration and convergence.
- All **25 Mission 8 coefficient-specific assertions are retained** against a frozen copy of its original engine (only import paths relocated; verification checks exact source equivalence). Their old fixed coefficients cannot describe the new model. This is explicitly an archival suite, not a claim that new production reproduces old decay; the new production suite is separate.
- Full unit suite: **335 passed, 7 failed**. The same existing four holding-static-clutch heat cases and three wheel-omega audit expectations remain failures. New 50/100/200/400 Hz static-clutch heat values are approximately 21.3231 / 5.34212 / 1.33695 / 0.334416 J rather than zero. These assertions were not relaxed. Engine-start, gearbox, rotational drivetrain, suspension and all **46 Mission 01 numerical chassis tests** pass.
- **11 browser checks passed**: three input reliability, seven UI integration, one new coefficient round-trip/atomic-import test. They include actual keyboard/button/instrument behavior. Software Canvas Chromium 154 was used; no hardware-GPU performance claim.
- The historical Mission 5 bit-exact-trajectory guard is **not satisfied**, as expected from the engine change. The original assertion was left intact. Its huge synchronous deep-diff computation was interrupted; the same seven mechanical replays were rerun with a compact field comparison, confirming intentional differences and zero execution anomalies. No blanket “all browser regressions pass” claim is made.

The evaluator has fixed arithmetic cost and a caller-owned output record: no per-evaluation object/array allocation in its source. Existing synchronization impulse allocations remain. There are no nonlinear iterations. Warmed Node 24 on AMD EPYC 9V74, with no heavy browser work concurrent, measured:

| Work measured | Legacy mean / p95 / worst, µs | New mean / p95 / worst, µs |
|---|---:|---:|
| Torque evaluation, 50,000 individually timed calls | 0.120 / 0.171 / 79.588 | 0.227 / 0.330 / 198.335 |
| Whole open-neutral engine step, 10,000 individually timed calls | 0.310 / 0.481 / 98.486 | 0.190 / 0.201 / 12.939 |
| Whole step, 100 batch averages of 5000 steps | 0.106 / 0.170 / 0.634 | 0.154 / 0.188 / 1.320 |

Individual timings include timer overhead, JIT and scheduling outliers; their apparent whole-step speedup is not a claim that more equations are faster. Batch means indicate roughly **0.05 µs additional core cost**, or about **6.49 million unloaded steps/wall-second** for the new engine. The relative microkernel cost increases, but its absolute addition is negligible against a 10 ms tick budget. This supports no material engine-workload regression, not an FPS or worst-case real-time guarantee. Full simulator trajectories differ, so incidental contact timings are not an isolated engine benchmark.

Production changes: `js/physics/engine-torque.js` (new), `js/physics/engine.js`, `js/state.js`, `js/ui/controls.js` (atomic physical-coefficient validation only). Research additions are under `research/engine-torque-model/`, evidence under `docs/engine-torque-model-data/`; tests are `tests/engine-torque-model.test.js`, `tests/e2e/engine-torque-settings.spec.js` and the explicit archival binding in `tests/engine-free-rev.test.js`. **96 other tracked production JS files are byte-identical to the base.**

Tire solver/curves, clutch capacity and solver, gearbox ratios, steering, suspension, geometry, rendering/artwork, UI layout and global physics frequency were deliberately unchanged. The experimental coupled rotational solver was not integrated. Remaining limits include provisional gas-exchange/control maps, inherited weak low-RPM curve, no manifold/temperature/accessory dynamics, first-order work splitting, and existing coupled drivetrain yaw/heat/stall defects.

## Reproduce

Serve this checkout using the existing `python3 serve.py` on port 8000, then:

```sh
node research/engine-torque-model/browser.mjs --baseline
node research/engine-torque-model/browser.mjs
node research/engine-torque-model/summarize.mjs
node research/engine-torque-model/verify.mjs
node research/engine-torque-model/historical-parity.mjs
npm test
node node_modules/@playwright/test/cli.js test -c research/cornering-performance/playwright.config.mjs tests/e2e/input-reliability.spec.js tests/e2e/ui-integration.spec.js tests/e2e/engine-torque-settings.spec.js
```

Summarization requires fresh full captures and refuses to summarize already-reduced files. Verification reruns full isolated curves in Node, checks browser parity and open-clutch independence, evaluates pressure sensitivity/convergence, benchmarks core/evaluation cost and enforces production source scope. Default calibration is a bounded, testable engineering estimate; its improved physical structure does not turn those estimates into empirical measurements.
