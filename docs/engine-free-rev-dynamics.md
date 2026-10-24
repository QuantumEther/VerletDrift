# Mission 8 — Engine free-revving dynamics

Branch: `fix/engine-free-rev-dynamics`, based on `fix/cornering-performance` (`52c6385`). No merge. **Measurement and test deliverable; no production engine correction or calibration claimed.**

The slow neutral RPM decay is reproducible and principally a torque-model issue, not transmission drag or timestep instability. The brief explicitly permits a harness and candidate models when a reference target is missing. That path is used here: changing coefficients to obtain a preferred sound/feel would be arbitrary. All 99 tracked production JavaScript files are byte-identical to the base. Before and after RPM trajectories are consequently identical.

## Reproduction and evidence

Fresh Chromium 154 startup, no saved settings; actual UI values captured in [parameters.json](engine-free-rev-data/parameters.json). Important values: peak torque 350 Nm, idle 800 RPM, redline **7000 RPM**, stall 600 RPM, stall resistance **0.5**, crank inertia 0.25 kg m², starter 40 Nm, firing threshold 400 RPM. Source-state defaults alone would incorrectly use 9000 redline and 0.7 stall resistance.

The browser directly runs the production engine at 50/100/200/400 Hz. Neutral, requested neutral, zero input-shaft speed, clutch pedal/engagement zero and clutch key held are explicit. Throwing proxies prohibit wheel/chassis access; every sample requires zero transmitted clutch torque, zero input-shaft speed and an open clutch. No tires, wheel integration or rendering enter the isolated step. Calling the neutral/open synchronization function retains production stall checking without introducing driveline load.

[summary.json](engine-free-rev-data/summary.json) contains metrics computed from **every tick** of 48 isolated and 28 loaded runs. [browser.json.gz](engine-free-rev-data/browser.json.gz) retains diagnostic trajectories at approximately 20 Hz (25 Hz for 50 Hz runs), plus mode transitions/endpoints. It includes throttle, signed crank speed, separate combustion/governor/starter torque, internal drag, explicitly absent pumping torque, external torque, angular acceleration, RPM derivative, work, energy and mode. Re-running regenerates full-resolution measurements before summarization.

### Original and unchanged final trajectories

Zero throttle, running, clutch open. Time to **810 RPM** avoids an arbitrary exact-idle crossing in an asymptotic controller.

| Hz | 7000→810 RPM, s | 4000→810 RPM, s | 2000→810 RPM, s | OFF 4000→0 RPM, s | RPM at 4 s after 7000 release | Full-throttle maximum RPM |
|---:|---:|---:|---:|---:|---:|---:|
| 50 | 11.240 | 6.880 | 3.460 | 7.360 | 4236.420 | 7143.000 |
| 100 | 11.250 | 6.880 | 3.470 | 7.360 | 4235.911 | 7071.789 |
| 200 | 11.260 | 6.885 | 3.480 | 7.355 | 4235.656 | 7035.886 |
| 400 | 11.260 | 6.8875 | 3.480 | 7.355 | 4235.529 | 7017.946 |

100 Hz release from 7000 RPM: 6851.04 at 0.2 s, 6266.99 at 1 s, 5562.71 at 2 s, 4235.91 at 4 s, 1880.43 at 8 s, 802.35 at 12 s. Governor torque is zero through those first 8 seconds. At 16 s RPM is 800.0011.

Other 100 Hz profiles: idle recovery from 1000/1200 RPM is monotonic with no overshoot; an initial 800 RPM idle stays at 800 to rounding accuracy. A 20% throttle blip for 0.2 s peaks at 855.24 RPM; four 50% pulses of 0.2 s peak at 1273.39 RPM. Throttle-step and sustained-full-throttle traces are included in the evidence. A stalled stationary crank uses finite starting torque, enters running at 0.39 s, and reaches 799.946 RPM at 5 s. Shutdown has no combustion, governor or starter torque, reaches zero without drag reversing the crank, and behaves symmetrically for initially negative crank speeds.

## Equations and source findings

[engine.js](../js/physics/engine.js), particularly lines 81–114, implements the following, with signed crank speed ω, signed RPM n, throttle u and inertia I:

```
I = 0.25 kg m²                        (one lumped inertia)
Tc = 0.035 × peakTorque = 12.25 Nm
b = 0.01 Nm s/rad
D = Tc + b |ω|
G = clamp(D + 0.05 (800 − n), 0, 0.25 × peakTorque)
C = peakTorque × max(0, 1 − 2.5 ((n − 4500)/(7000 − 800))²) × u
Tcomb = C + G, only if running, ω > 0 and n < redline; otherwise 0
Tstarter = 40 Nm only while starting
v = (ωold + (Tcomb + Tstarter) dt/I)/(1 + b dt/I)
ωfree = sign(v) max(0, |v| − Tc dt/(I + b dt))
```

This is implicit viscous drag with bounded Coulomb friction. It preserves signed mechanics and avoids a friction-induced reverse kick at rest. There is no separate flywheel, reciprocating-component model, pumping loss, accessory load or manifold transient. Peak torque controls both the combustion curve and Coulomb loss; it supplies no evidence that either deceleration coefficient is physically correct.

Above approximately 1067 RPM the governor is zero at closed throttle. There:

```
I dω/dt = −Tc − bω
ω(t) = (ω0 + Tc/b) exp(−bt/I) − Tc/b
I/b = 25 seconds
```

At 7000 RPM, drag is only 19.58 Nm, corresponding to about −748 RPM/s initially. This explains the long fall without invoking clutch drag. The analytic solution and implemented discrete recurrence agree with the observations. RPM error against the continuous solution at 4 s decreases approximately by half with each doubling of Hz (about 1.02, 0.51, 0.25, 0.13 RPM). This is consistent first-order convergence, not evidence for physically calibrated coefficients.

Near idle, G cancels estimated drag and adds proportional feedback. That makes the final approach asymptotic. In an isolated running idle this is stable; it does not hold high RPM up. Additive governor torque remains available alongside driver throttle near idle, so it is not an explicit idle-only actuator. Whether that overlap is appropriate requires a controller target. It is not the cause of the high-RPM release behavior.

Fuel cut removes all combustion at the redline and immediately restores it below the redline. The resulting relay overshoot shrinks with dt (143/72/36/18 RPM above 7000). It is not a strict redline clamp or a smooth limiter. We expose that behavior rather than silently redefining it.

Stall checking ([lines 31–34](../js/physics/engine.js#L31)) uses signed crank speed and the existing resistance-adjusted threshold: 360 RPM with browser settings. It runs before the free step and after clutch synchronization. Starting becomes running at a finite firing threshold; stopped/stalled modes have only passive engine drag unless starting is explicitly requested. These transitions remain unchanged.

### Energy accounting and external load port

The harness calls the production integrator; it does not substitute an RPM integrator. Production `externalWorkJ` and `dragWorkJ` are **per-step**, whereas `starterWorkJ` is cumulative. The observer separates indicated throttle torque from the additive governor and accumulates each work contribution. `dragWork` is production's work-minus-kinetic-energy residual at its integration time levels, not an independently measured thermodynamic loss. Pumping torque is recorded as zero because it is absent, not because real engines have zero pumping loss.

For an optional prescribed torque, the harness applies J = Text dt after the free-engine step, then runs open/neutral synchronization. Work at this test port is exactly J(ωbefore + ωafter)/2. This explicitly split, test-only actuator is not a replacement drivetrain method. A negative prescribed torque can back-drive a negative crank and do positive work; it is not a passive friction brake.

At 100 Hz, the 16 s 7000 RPM release consumes 72,889.24 J in recorded drag, receives 6598.40 J from the governor and zero throttle/starter work. The difference equals the kinetic-energy decrease. Across all isolated profiles, maximum per-step accounting residual is 1.75e−13 J. This verifies bookkeeping, not empirical loss calibration. The extra isolated stall experiment applies a −100 Nm actuator from 0.5 to 1.0 s: stall occurs at 0.63 s, the actuator subsequently reverses the crank, passive drag stops it, and combustion does not spontaneously restart. A separate full-vehicle brake-load experiment below avoids interpreting this actuator as a wheel brake.

## Reference assessment and calibratable candidates

No empirical crank inertia, motoring/friction map, manifold pressure trace or time-stamped free-rev recording is supplied by this repository or brief. The DeLorean artwork and named audio settings do not identify a calibrated physical engine. The current 350 Nm / 7000 RPM lumped engine cannot be defensibly assigned the inertia and losses of a specific real engine from those values alone.

A relevant empirical source to evaluate is the US EPA's [complete engine ALPHA maps](https://www.epa.gov/vehicle-and-fuel-emissions-testing/combining-data-complete-engine-alpha-maps). Access was attempted during this task but the environment returned HTTP 403 at the CONNECT proxy; no map was retrieved or used. Even a full-load brake-torque map alone would not determine this simulator's closed-throttle pumping losses, controller intervention or flywheel inertia. **No empirical dataset was available for calibration.** The classical separation of indicated work, pumping work and mechanical friction is described in J. B. Heywood, *Internal Combustion Engine Fundamentals*, 2nd ed. (2018); this is a modeling framework, not measured evidence for the present coefficients.

A proposed target class, subject to choosing an actual reference, is a naturally aspirated four-stroke spark-ignition passenger-car engine. Two bounded-cost candidates:

1. Retain Coulomb + viscous friction, but identify I independently and fit Tc/b to ignition-off rundown at several initial RPMs; add measured closed-throttle pumping torque separately. This is the smallest extension, but its linear friction shape may fail validation.
2. Use measured friction mean effective pressure versus speed and pumping pressure versus speed/throttle. For four-stroke displacement Vd, opposing torque magnitude is `(FMEP(n) + Δp(n,u)) Vd/(4π)`. Use a small calibrated lookup table or low-order fit. This provides interpretable loss components without a coupled solver.

Both fit within `I dω/dt = Tind(n,u) + Tidle + Tstarter + Text − Tfriction − Tpumping`. Passive losses oppose shaft motion and are bounded at rest using the existing finite-step architecture. Combustion requires forward rotation and an explicit running state. Any forward-flow pumping map needs a stated reverse-rotation limitation. Fit idle control near its operating region, rather than choosing a universal redline-to-idle duration. If the input map is measured **brake** torque, account for losses already included in that map; subtracting full losses again would double-count them.

Required reference data: an identified engine, hot/cold/accessory condition, independent effective crank/flywheel inertia, full-load torque and throttle/RPM/time traces for ignition-on release and ignition-off rundown, plus starter/idle-control conditions. Free-rundown data alone constrains torque divided by inertia, not both independently. Do not infer vehicle engine braking directly from unloaded decay. No constants or parameter sliders were added while those inputs remain missing.

## Loaded simulator observations

Existing production mechanical step and browser UI parameters, seven scenarios at each of four rates; no nonfinite samples or execution anomalies. Results below are 100 Hz; full cross-rate results are in the summary.

| Scenario and defined input | Observation |
|---|---|
| Neutral, 4000 RPM release, 6 s | 854.094 RPM; no crank-to-input torque |
| 15 m/s, third gear, open clutch, same release | **Identical** engine RPM trace; final speed 13.918 m/s; wheel motion cannot explain isolated slow decay |
| 15 m/s, third gear, engaged clutch, zero throttle, 4 s | Final 2120.68 RPM / 13.598 m/s; slip zero; crank receives 12.63 Nm from driveline; unintended peak yaw 0.292 rad/s |
| Same gear/speed, 20% throttle for 1 s then release | Final 2213.98 RPM / 14.197 m/s; peak unintended yaw 0.295 rad/s |
| Stalled neutral, explicit engine-button start | Starting at first tick; running at 0.39 s; 799.946 RPM at 5 s |
| First gear, 15% throttle, release clutch key at 1 s, original 0.3 s pedal ramp | Stalls at 1.61 s; this scripted modest-throttle launch does **not** succeed |
| First gear, brakes held, release clutch key at 0.5 s, zero throttle | Stalls at 0.83 s; finite joint clutch/brake friction heat, no stall immunity |

The launch stalls at 1.640/1.610/1.600/1.595 s across 50/100/200/400 Hz. This is an observation, not proof that a particular real engine should stall under the uncalibrated input. The rear-contact sequential coupling/yaw and locked-clutch heat issues described in previous missions remain. No high-speed stall fix is claimed; a successful 15 m/s third-gear test does not cover all operating states.

## Tests, runtime and reproduction

- New isolated suite: **25 passed**. Covers equilibrium, analytic rundown/first-order error bounds, work closure with external torque, monotonic idle recovery, passive stop with either crank sign, finite restart, defined-load stall, deterministic pulses and a finite-step limiter bound. Tests lock down current numerical behavior; they do not certify real-engine realism.
- Full unit suite: **299 passed, 7 failed** across 30 files. Existing failures unchanged: four `drivetrain-operation.test.js` holding-static-clutch heat checks (21.3798/5.3492/1.33784/0.334527 J instead of zero at the four rates); three `wheel-omega-audit.test.js` expectations for exact neutral idle with engaged clutch, instantaneous over-rev coupling and pre-contact idle creep. No failures were weakened or skipped.
- Engine-start, engine-inertia, gearbox, rotational drivetrain and all **46 Mission 01 numerical chassis tests** pass within that run.
- **11 browser tests passed**: input reliability (3), prior mechanical replay parity (1, seven scenarios), UI integration (7), including real input, finite restart/button behavior and instruments. Selected tests use existing system-Chromium configuration; software Canvas, not hardware GPU validation.
- Browser versus isolated Node: **210,350 compared fields, maximum numerical difference zero**. All 99 tracked production JS files match the base byte-for-byte. There is no production before/after behavior or per-step workload change.
- Isolated production engine + open neutral synchronization: ~**0.122 µs/step**, ~8.17 million steps/wall-second in warmed Node 24 on AMD EPYC 9V74. 100 batches × 5000 steps after 20,000 warmup; p95/worst **batch mean** 0.153/0.166 µs, not individual-tick percentiles. Excludes measurement-object allocation and browser rendering. This is an unloaded microbenchmark, not simulator FPS.
- Incidental full-step browser timings at 100 Hz: third-gear engine braking mean/p95/worst **1.85/2.60/3.50 ms**; throttle-lift **1.81/2.70/3.90 ms**. Audit wrappers and browser timer quantization are included; these are not a controlled before/after renderer benchmark.

With dependencies installed and the existing `python3 serve.py` serving this checkout on port 8000:

```sh
node research/engine-free-rev/browser.mjs
node research/engine-free-rev/summarize.mjs
node research/engine-free-rev/verify.mjs
npm test
node node_modules/@playwright/test/cli.js test -c research/cornering-performance/playwright.config.mjs tests/e2e/input-reliability.spec.js tests/e2e/steering-physics-parity.spec.js tests/e2e/ui-integration.spec.js
```

Verification details and benchmark environment are in [verification.json](engine-free-rev-data/verification.json). Browser capture precedes summarization; summarization refuses already-downsampled data. Verification compares retained browser samples to full Node replays and checks production identity against the base.

Remaining limitation: the engine is numerically reproducible but **not defensibly calibrated**. Its slow free-rev decay, simplistic pumping/friction/governor/limiter behavior and existing loaded drivetrain defects remain. Clutch, gear assistance, tires, chassis integration, geometry, steering, suspension, rendering, artwork and all production parameters were deliberately left unchanged.
