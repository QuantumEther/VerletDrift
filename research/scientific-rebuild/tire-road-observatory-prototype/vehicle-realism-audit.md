# Mission 40 — Vehicle realism, evidence and boundaries

Starting commit **d419189dda7fc698d5364e0a1f91d2c9718c9113**. Source `../braking-and-tire-contact-prototype/`. Evidence: `results/mission40-handling.json`, decimated traces/marks in `mission40-traces.json.gz`, source-preservation and bit-identity tests in `tests/observatory.test.js`. New code observes the equations; it does not recalibrate them.

## Confirmed defects and corrections

1. **Unpopulated COM trajectory.** The source declares/resets `trail=[]` and draws it, but never appends to it. The regression checks that original failure and verifies accepted motion now populates a separate bounded COM path. Tire paths and black deposition are independent histories.
2. **Load-reporting time levels.** At the rear-support switch, source corner diagnostics recompute normal force using the new time while wheel forces still describe the accepted force stage. At 0.5 s the applied axle sum can be about 510 N while the newly switched geometry reports about 255 N. No tire-force coding defect is inferred: they are different time levels. The new front/rear display explicitly labels `Nstage` and `Ngeometry-now`; contact diagnostics use the coherent solved normal loads. At the following stage the unloaded wheel reports no utilization and makes no mark.
3. **Ambiguous contact labels.** The source's `contactMode='sliding'` means the friction disk is saturated. It does not establish substantial sliding or rubber deposition. The observatory separately reports saturation, relative speed, recent/cumulative slip work and visual deposition. A test deliberately saturates a low-capacity contact at only 0.05 m/s without painting it.
4. **Fixed-pixel top-view tires.** Source top-view wheels use 44×14 pixels regardless of radius/zoom; their apparent width can be narrower than a valid .18 m rubber strip. New top-view wheel dimensions use the actual .32 m radius and the existing Three.js .22 m tire width. This changes artwork, not tire mechanics.

Accepted-stage observation is also necessary for **new** work accounting. A master step may contain two accepted force stages and many discarded dog-location probes. Multiplying the final cached power by the full master h would be unjustified. The optional observer commits detached snapshots only after the whole step succeeds, using each accepted stage's dt. Instantaneous dog impulses add no finite tire-slip time. Forces/slip/force-stage wheel speed are captured before subsequent dog impulses; current wheel speed is displayed separately. Tests exercise actual searches, match accepted time, and independently sum work. Rejected probes never deposit.

## Model limitations — not repaired by dramatic tuning

### What vehicle is this?

This is an uncalibrated **104 kg research machine**, not a historical touring car or a DeLorean: 80 kg sprung mass, two 12 kg axle-level unsprung assemblies, wheelbase 2 m, track 1.2 m, wheel radius .32 m, yaw inertia 60 kg m², body pitch inertia 45 kg m². Each virtual wheel has 6 kg translating mass and 1 kg m² spin inertia. Open-differential carrier inertia is .4 kg m²; engine .3 and input shaft .1 kg m² are separate ports.

The rendered touring-car appearance does not certify mass distribution. In particular, **I=1 exceeds mR²=.6144 kg m²** for a literal 6 kg rotor entirely inside radius .32 m. These independently specified research parameters cannot all describe such a bare wheel. Extra reflected inertia is not a free explanation because carrier/input/engine inertias are already explicit. This is a parameter/interpretation limitation, not a singular numerical mass matrix; no arbitrary inertia change is authorized here. Positive-inertia work identities can pass for a physically uncalibrated fixture.

No mass, inertia, geometry, grip, tire coefficient, engine curve or suspension constant was changed. A separate reference-grounded proposal is in `full-size-parameter-proposal.md`; missing manufacturer measurements remain explicit.

### Longitudinal load transfer and pitch

The equations actually integrated remain:

```
mc*zDDot = FspringFront + FspringRear - mc*g
Iy*pitchDDot = xf*FspringFront + xr*FspringRear
mu_i*zuDDot_i = N_i-Fspring_i-mu_i*g
M*vxDot = sum Fx_i   (inside the planar Newton–Euler/contact solve)
```

The vertical solver receives no horizontal guide reaction, tire-force/CG-height moment or caliper/housing couple. Thus symmetric flat-road acceleration/braking does not pitch the chassis or redistribute vertical axle loads. Bumps and explicitly imposed heave/pitch disturbances can do so. Adding an empirical load-transfer formula on top of integrated suspension would risk double counting; making springs softer cannot supply the missing mechanical port.

For the existing static coordinates, body COM z=.809147 m and axle centers z=.307247 m give a translating-system COM height **.693323923 m** if those masses are interpreted literally. An elementary spin-negligible flat-road quasi-static benchmark is

```
Nf0 = M*g*b/L, Nr0=M*g*a/L
Delta Nf = -M*ax*hCG/L; Delta Nr=-Delta Nf
```

For M=104 kg, L=2 m and ax=-.5g, this predicts about **176.839 N** transferred forward, versus **zero** flat-road transfer in this reduction. This is a missing-model benchmark, not evidence that existing code incorrectly evaluates its stated equations.

A full mechanical benchmark must also account for angular momentum. With x forward/z up, positive nose-up pitch is about -y, while forward wheel spin is about +y:

`sum(x_i*N_i)+hCG*sum(Fx_i) = dH_pitch/dt`.

In a wheel-only, steady-pitch benchmark, `dH_pitch/dt=-sum(Iwheel*OmegaDot)`, so `Delta Nf=(-M*ax*hCG-sum(Iwheel*OmegaDot))/L`. The four toy I=1 rotors rolling at R=.32 add about **30.656 N** to the front transfer at -.5g. Carrier and other rotor axes need their own consistent vector contributions; do not add all scalar shaft inertias as though their axes were identical.

Next full-corner benchmark should first reproduce the negligible-spin formula, then finite-rotor angular-momentum/work balances, then suspension transients with a shared force snapshot and refinement. Chassis guides, wheel/carrier forces, brake/housing reaction torques and engine block reactions need explicit generalized coordinates. Do not simply insert `h*Fx` into one existing equation while omitting its paired reactions.

### Lateral load transfer and contact geometry

There are only two vertical wheel-center coordinates. Left/right loads are split equally, apart from the explicitly commanded support-retraction experiment. Lateral acceleration does not create body roll, inside-wheel unloading, anti-roll-bar reaction or independent corner travel. Four horizontal tire contacts are genuine; four independent vertical corners are not.

The spin-negligible total-vehicle benchmark is a side-load shift magnitude approximately `M*ay*hCG/track`, with its front/rear allocation dependent on validated roll geometry and stiffness. Do not separately subtract arbitrary grip to imitate it. With constant mu, total `sum(mu*N)` alone need not change when load redistributes; real load sensitivity and individual saturation matter.

The source samples bump height at axle-center x for the shared vertical load, while the four ground footprints have different x when yawed. The observatory can therefore report a positive solved axle-derived load at a footprint with no local geometric overlap. It warns and suppresses deposition there; it does **not** silently change tire forces. A four-corner contact architecture is needed to close that approximation.

### Tire fidelity versus the retained TMeasy research

|Property|Current law|Pinned basic Chrono TMeasy research|
|---|---|---|
|Small-slip behavior|F=-800*s, isotropic Ns/m; no load-dependent unsaturated slope|Load-interpolated, anisotropic empirical handling curves and a separate low-speed branch|
|Speed dependence|At small angle Fy≈-800*abs(Vx)*alpha; apparent cornering stiffness grows with speed|Normalized-slip handling plus signed-speed low-speed blending; its particular reverse branch has documented limitations|
|Saturation/combined slip|One convex isotropic disk, no calibrated peak/drop or load sensitivity|Combined-slip handling magnitude/direction and empirical load dependence|
|Transient response|No constitutive memory/relaxation; implicit discrete velocity response only|Dahl bristle states at low speed, not a complete transient belt/contact-patch model|
|Aligning moment/caster|None|Empirical trail moment with a documented signed 1 m/s activation boundary; no recovered local-spin constitutive closure|
|Contact work|Same radius in slip/reaction; F·s≤0 and no tire elastic storage|Effective/static radius distinction, bristle storage, rolling/alignment moments; complete passivity remains unresolved in the recorded audit|
|Empirical credibility|Uncalibrated point-friction fixture|More detailed engineering model, still requiring appropriate tire data and validation; not automatically passive or universally accurate|

Sources **inspected, not rerun** here: [source audit](../../../docs/scientific-rebuild/tmeasy-source-and-license-audit.md), [power audit](../../../docs/scientific-rebuild/tmeasy-mechanical-power-audit.md), [Mission 22](../../../docs/scientific-rebuild/mission-22-decision.md). Chrono source pin: `9a5072b5324e012a66d9fb7eaac0c679b8465e73`. No tire port, new fitting or native build was performed.

The planar port uses nominal R=.32 m in both slip and rotor reaction, while the static vertical solution puts hubs .307247 m above the flat road. This consistent reduced-radius choice is not a complete 3D wrench/deformation balance at the visually projected ground point. A future loaded/effective-radius formulation must close its moment and storage/transport work; simply replacing R with hub height is not a verified correction.

### Steering and gear shock

The worm/sector, Pitman, drag-link and tie-rod position geometry is retained. It has a measured finite-trapezoid Ackermann error, but no steering inertia, compliance, hand-force feedback, caster/trail or self-aligning tire moment. Releasing A/D requests a centered driver position; it is not a proven passive self-centering mechanism. Tire relaxation and roll are also absent. Test linkage length/angle geometry independently from future force-feedback or relaxation experiments.

The source `living-automobile`/`mission39-shift-transients` evidence already traces actual dog impulses, input momentum, clutch torque, differential outputs, tire Fx and chassis acceleration. It finds matched/mismatched impact losses about .000298/1.92476 J and longitudinal peaks about 1.12/3.38 m/s², both with zero flat-road pitch. Those saved experiments were **inspected/reused**, not presented as newly rerun. New preservation/conservation and observer equivalence tests execute dog transitions again. No gearbox rewrite or fake jerk was added.

A longitudinal effect exists; housing/engine mounts, finite shaft compliance and the pitch-reaction port remain reduced. Engine shaft and axle axes differ, so their reaction torques cannot be indiscriminately added to pitch. A future isolated compliant shaft plus mechanically closed carrier/body work experiment should precede a perceived-shock “improvement.”

## Visual limitations

Rubber darkness, width, thresholds and imprint shape are legibility choices driven by measured sliding work, not abrasion calibration. No tire temperature, compound transfer, water, wear, smoke or road-grip feedback from marks is represented. Colored paths are projected wheel-center trajectories, including airborne travel; black deposition additionally requires actual support and local footprint overlap. The COM path is the planar reference-point path, projected onto the map, not a full three-dimensional mass-distribution measurement.

Ground marks use the rendered road's .25 m linear interpolation plus .006 m visual offset; contact diagnostics retain the analytical road height. This avoids floating above/below the source bump mesh. Terrain changes reproject stored x/y in the renderer only; original measured heights remain in research data. No skid geometry fabricates body roll, camber or independent vertical wheel motion.

## Future research

1. Validate a named full-size mass/geometry/inertia and corner-load dataset before changing the research fixture.
2. Establish the closed full-corner pitch/roll, reaction and energy benchmarks above in an independent stage.
3. Then compare a calibrated tire/relaxation/aligning formulation on identical mechanical ports. Do not adopt TMeasy or change grip to make these plots look more convincing.

Mathematical consistency, visual correctness, empirical accuracy and real-time performance are separate findings. This mission verifies observability of the existing reduced model, not realism of a complete automobile.
