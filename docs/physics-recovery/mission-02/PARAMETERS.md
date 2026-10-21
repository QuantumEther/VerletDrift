# Tire parameters and configuration v2

These are parameters of a synthetic empirical model. They are not measurements of a named road tire. Values are unchanged unless explicitly identified as retired semantics below. Source: [tire-model.js](../../../js/physics/tire-model.js), [tire-load.js](../../../js/physics/tire-load.js), [tire-contact.js](../../../js/physics/tire-contact.js), [wheel.js](../../../js/physics/wheel.js), and [controls](../../../js/ui/control-data.js).

## Independent tire configuration

| State key / control | Units | Supported range | Default | Definitive meaning |
|---|---|---|---|---|
| `tireFrictionCoeff` / Tire Friction | dimensionless | 0–2.5 in mechanics; existing UI 0.1–2.5 | 1 | Peak force divided by reference normal load at the reference load. Zero disables contact for numerical experiments. Load sensitivity changes the effective coefficient away from that load. |
| `peakSlipAngleDeg` / Peak Slip Angle | degrees | 2–20 | 8 | First pure-lateral peak of the steady target as a function of the **regularized diagnostic slip angle**. Internally converted to radians. At sliding ratio 1 the descending branch becomes a plateau; this is the first point of that plateau. |
| `peakSlipRatio` / Peak Slip Ratio | dimensionless | 0.05–0.3 | 0.12 | First pure-longitudinal peak in the symmetric rolling-slip ratio defined below. It is not `(RΩ-v)/v` with a one-sided denominator. |
| `tireSlidingFrictionRatio` / Sliding Grip | fraction; UI percentage | 0.5–1 | 0.85 = 85% | Fully sliding force capacity divided by the load-sensitive peak. Applies in both directions. The transition begins at normalized combined slip q=1 and reaches this ratio at q=2. It remains constant beyond q=2. |
| `tireLoadSensitivity` | dimensionless | 0–0.3 | 0.12 | Reduces effective friction with increasing load. The interior capacity exponent is `1-sensitivity`; extrapolation multipliers are bounded. |
| `tireRelaxationLength` / Relax Length | metres | 0.05–1 | 0.3 | Distance scale for increasing friction-magnitude buildup: `tau=L/max(local patch-center speed,0.5 m/s)`. This is a phenomenological buildup length, not a full elastic tire or standstill stiction model. |
| `pneumaticTrail` / Pneumatic Trail | metres | existing UI 0–0.2 | 0.035 | Small-slip rolling pneumatic trail. A brush-inspired moment/force ratio reduces it with combined slip, and signed longitudinal transport handles forward/reverse travel and rest. No column gain was changed. |

The first six parameters are checked by `validateTireParameters` before tire-state mutation. Invalid finite ranges, NaN, and Infinity are rejected, rather than being converted into an inverted or zero curve. The normal UI/import bounds continue to validate wheel radius, inertia, trail, mass, and related settings. The contact solver also rejects nonfinite velocities/accelerations, nonpositive mass/inertia/radius/timestep, and invalid wheel torque/capacity states.

The two peak inputs and peak force determine small-slip stiffness:

- Lateral cornering stiffness `C_alpha = 3D/alpha_peak`, in N/rad.
- Longitudinal stiffness `C_kappa = 3D/kappa_peak`, in N per unit slip ratio.

They are not independently adjustable stiffnesses. Adding stiffness sliders without another identifiable curve-shape parameter would contradict this model. If real tire data require independently measured stiffness and peak position, extend the model explicitly rather than reusing obsolete B/C values.

## Definitions and dependencies

`v_patch_center = v_CoM + yawRate cross r`, projected into wheel-forward/right axes gives `(vLong,vLat)`. Wheel surface speed is `R*Omega`. Contact slip velocity is `(vLong-R*Omega,vLat)`.

`alpha = atan2(vLat,hypot(vLong,0.5 m/s))`.

`kappa = (R*Omega)/denominator - vLong/denominator`, where `denominator=max(abs(R*Omega),abs(vLong),0.5 m/s)`.

The divided form avoids overflow in subtracting opposite large velocities. Kappa is in [-2,2]; opposite wheel/vehicle travel is no longer discarded by a clamp to [-1,1]. At high rolling speeds alpha approaches the ordinary signed slip angle with an absolute longitudinal denominator; near rest these are regularized creep coordinates, not geometric rolling angles.

`q = hypot(kappa/kappa_peak,alpha/alpha_peak)`. The peak lies on an ellipse in these **slip coordinates**. The force capacity is an isotropic circle of radius D. There is no claim that this is a measured combined-slip surface.

`D = mu*Fz*clip((Fz/Fref)^(-sensitivity),0.5,1.5)`, with `Fref=m*g/4`. Capacity is exactly zero at zero load or zero friction. The standalone load helper retains its reference-load guard of 1 N and sensitivity clamp [0,0.3]. The normal GUI mass range makes that reference guard inactive. Current suspension-provided wheel loads are used directly; tire code does not calculate another weight-transfer correction.

## Other physical inputs retained

| Input | Units / supported interface | Role and dependency |
|---|---|---|
| Wheel normal loads | N, nonnegative current suspension outputs | Current support and force bounds; unload clears carried force and SAT immediately. Suspension currently supplies tick-average loads. |
| `carMassKg` | kg; UI 100–3000 | Chassis linear response, reference normal load, and unchanged rectangle inertia. |
| Chassis geometry | m; existing fixed half length/width | Contact arms and yaw inertia `m*(L_half²+W_half²)/3`; unchanged from Mission 01. |
| `wheelRadius` | m; UI 0.2–0.6, default 0.35 | Rolling surface speed, brake-capacity conversion and contact reaction torque `-R*F_long`. |
| `wheelInertia` | kg·m²; UI 0.5–3, default 1.2 | Physical rotor energy and torque response. No overspeed clamp. |
| Transmitted crank torque, current gear ratios, final drive | N·m and ratios | Existing rear-axle drive torque, split equally between rear rotors. Reverse reverses drive direction. Drivetrain equations unchanged. |
| Reflected crank inertia | kg·m² at each driven wheel | Existing locked approximation `Iengine*G²/2` remains. Work diagnostics use this effective inertia; it is not independent physical crank energy to add a second time. |
| `brakeForce` | nominal rim force N; UI 500–20000 | Existing service allocation 0.4 each front and 0.1 each rear; multiply by R for torque capacity. |
| Handbrake pressure | fraction 0–1 | Existing extra capacity 0.5*brakeForce*R per rear rotor. Existing main-loop pressure ramp on/off times 0.25/0.15 s remain. |
| External acceleration passed to tire API | m/s² and rad/s² | Known noncontact chassis acceleration for the coupled endpoint solve. Main passes the existing drag and yaw damping; their laws and coefficients are unchanged. Direct callers default to zero external acceleration. |

## Fixed model choices, with units and limitations

| Choice | Value / rule | Classification |
|---|---|---|
| Slip regularization / transport crossover | 0.5 m/s | Empirical low-speed crossover, not a center-speed fade. Keeps both slip coordinates finite and trail transport continuous at rest. |
| Pre-peak force fraction | `3q-3q²+q³`, 0≤q≤1 | Brush-like cubic; prescribed peak, finite stiffness, zero derivative at peak. Not a full fitted brush model. |
| Post-peak force fraction | `1-(1-rho)*(3t²-2t³)`, t=clip(q-1,0,1) | C1 peak-to-kinetic transition. Width is one normalized peak; no independently tunable tail-width coefficient. |
| Direction transition | Same smoothstep t | Normalized slip-demand direction changes into exact isotropic patch-sliding direction over q=1…2. Both component signs oppose actual patch slip. |
| Magnitude transient | increasing: first-order lag; decreasing: immediate envelope release | No elastic-energy state is claimed. Direction follows current slip; zero slip cannot retain an active friction force. This deliberately excludes force overshoot and elastic reversal memory. |
| Local relaxation speed | max(hypot(vLong,vLat),0.5 m/s) | Includes local yaw-induced motion; time constant remains finite at standstill. |
| Trail reduction | `3(1-q)^3/(3-3q+q²)` for q<1; zero at/above 1 | Brush-inspired moment/force ratio, normalized to the configured small-slip trail. Partial adhesion disappears at the peak. |
| Signed trail transport | `vLong/hypot(vLong,0.5 m/s)` | Follows rolling direction; vanishes without longitudinal transport. Static steering scrub is not modeled by this point-contact pneumatic term. |
| Input lateral EMA | removed from force pipeline | The former 25 ms numerical velocity filter duplicated lag; `smoothedWheelLat` remains a raw-velocity compatibility diagnostic. |
| Independent SAT EMA | removed | The former 80 ms output filter duplicated tire lag and carried SAT after lift-off. SAT now averages the contact's force/trail impulses. |

## Numerical settings are not tire calibration

| Solver setting | Current rule |
|---|---|
| Rotor root | At most 40 bisections in a torque/force-bound bracket; exact static brake holding and analytic unloaded update retained. Bracket is tightened around the physical free-rotor excursion. |
| Force integration | Exact first-order-lag endpoint and interval average for a frozen target. `-expm1(-h/tau)` avoids cancellation; the average coefficient uses a Taylor expansion below h/tau=1e-3. |
| Coupled root | Three chassis endpoint velocities; four rotor roots are eliminated inside each residual evaluation. Up to 20 Newton iterations, partial-pivot 3×3 solve, and 10 line-search halvings. |
| Jacobian difference increment | 1e-6*max(1,abs(component)), in each component's velocity units. |
| Root norm / tolerance | Max norm with yaw scaled by sqrt(I/m); tolerance 1e-10*(1+old velocity norm). Conservative impulse updates, rather than approximate Newton iterates, propagate between accepted substeps. |
| Adaptive body error | Full versus two half steps: 1e-5 + 1e-4*velocity norm. |
| Adaptive rotor error | 1e-4 + 1e-3*abs(endpoint Omega), rad/s. |
| Force history / average impulse error | 0.1 N + 1e-3*D; impulse error compared to h times that bound. |
| Global refinement limit | Depth 16; nonconvergence throws. No failed interval is silently accepted. |
| Generic wheel helper | Its compatible vector-relaxation mode remains; standalone adaptive depth limit is 20. Production contact calls its single-step kernel inside the shared chassis/contact adaptivity. |

## Retired parameters and explicit migration

Pacejka B and C are not independent parameters of v2. Their controls were removed; constants may remain exported for old analysis tools, but current tire forces do not consume them. Retaining active B, C, two desired peaks, and a desired sliding ratio would overdetermine the old E=0 formula or require introducing more arbitrary shape parameters.

New exports use `{version:2,tireModelVersion:2,...}`. Version 1/unversioned imports retain the numerical **labeled intent** of peak angle, peak ratio, friction, sliding ratio, load sensitivity, and relaxation length; remove B/C; and display an explicit migration notice: force behavior changes and old calibration is not preserved. This is not a force-equivalent conversion. The old malformed plateau/invalid-C curves have no unique equivalent in the new parameter family. Version 2 requires the supported model identity and rejects legacy B/C. Imports remain atomic.

Existing built-in presets retain their values. They now run the declared v2 model; they are not newly calibrated vehicles.

## Unchanged observables and assistance

Grip-state thresholds and EMAs are telemetry/event parameters, not force inputs. Live defaults loss=0.7 and recovery=0.85 retain the audit's inverted-hysteresis limitation; no force law reads the stable/slipping label. Grip EMAs remain 0.15/0.35 per tick. The 200 rad/s overspin threshold is a warning, not a wheel-speed clamp. Drift-intensity thresholds/weights and visual smoothing remain unchanged.

Explicit yaw damping, sleep thresholds, steering spring/friction/input mechanics, suspension, engine/clutch transitions, and graphics retain their prior behavior. Their work or assistance must not be attributed to tire friction.
