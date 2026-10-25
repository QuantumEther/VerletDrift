# Mission 35 — unsynchronized selector and dog engagement

Start `python3 serve.py` from repository root, then open:
`http://localhost:8000/research/scientific-rebuild/unsynchronized-gearbox-prototype/`.

## Driver controls

Hold **1** or **2** (keyboard or pointer buttons) to apply +120 or -120 N selector force. Release to let the lever respond to detents/contact/load. Hold **N** to center the lever with a compliant hand: force=clamp(-10000*q-100*qDot, ±120 N). This is an explicit force/displacement input, not a gear assignment. W applies the selected motor torque, S brakes, A/D steer, Space/B retain suspension inputs. The clutch slider remains entirely driver-controlled. No input combination is forbidden. The worn configuration resets the experiment.

A normal attempt: open clutch, hold a gear lever direction, release the lever, then close clutch. If the teeth obstruct entry, their phase must change through actual shaft motion. The cutaway and lever show the reaction. There is no perfect-match button, target speed, progress bar, shift score, shift refusal handler or sequence detector. Scientific values are inside the closed developer inspection panel.

The **Start moving in second** button is a documented initial condition: vehicle 1.6 m/s, wheels 5 rad/s, engine/input shaft 10 rad/s, engine/input phase 1.86 rad, rear angles 0.93 rad, second dogs seated and clutch open. It does not run a shift. From there: hold N with clutch open, close the clutch in neutral, give a short throttle blip, open clutch again, hold 1, then reengage clutch. Imperfect timing can cause contact or harsh capture; no software reward or refusal is issued.

Enable mechanical audio explicitly, then adjust volume. Quiet capture, face clicks, repeated contact and harsh knocks are synthesized from actual contact events. Six voices maximum, 25 ms event coalescing, 50 ms envelopes, oscillator gain <=0.039 and master <=0.3 bound summed output below clipping, with an additional compressor. Muting stops new voices and sets master gain to zero. Headless tests verify oscillator triggering and mute control; subjective sound quality was not evaluated through speakers.

## Mechanical selector

Sleeve coordinate q is in metres: neutral 0, first +0.025, second -0.025. Its mass is 0.25 kg with physical viscous resistance 6 N s/m. Detents use the nearest of those three wells, stiffness 1600 N/m (worn 100 N/m). Compliant rail stops begin at ±0.030 m with 60000 N/m stiffness and 200 N s/m damping. No selector position or velocity is silently reset.

Dog mouth depth is 0.010 m, seated engagement 0.022 m, release below 0.014 m. Six abstract dogs have angular period 2*pi/6 and a 0.24 rad clearance gap. Relative phase is inputAngle/G-carrierAngle, relative speed inputSpeed/G-carrierSpeed. These are computed from real states; free constant-mesh gears do not transmit output torque by merely rotating.

At an obstructed mouth, an inelastic axial impulse stops closing sleeve motion. The same face supports sustained axial pressure. Dry tooth-face rubbing (mu=0.15, dog radius 0.04 m) transfers an angular impulse bounded by mu*normalImpulse*radius and by the impulse required to remove tangential slip. It may rub or stop tooth-to-tooth; it is not a cone synchronizer or target-based aligning torque. Face-friction momentum exchange updates the free input shaft and rear rotational system. Finite clutch capacity cannot transmit an instantaneous dog shock to the engine: the resulting clutch slip is resolved on the next shared step.

When the sleeve reaches seating depth within the angular opening, an inelastic dog constraint impulse couples the actual rotating members even with nonzero speed mismatch. Its magnitude is mismatch/effective inverse inertia. Shaft, rear rotors and (for ramped dogs) selector receive their respective generalized impulses. Impact heat is 0.5*mismatch^2/effective inverse inertia. A bad attempt can engage harshly instead of being refused. Gear release preserves the calculated input angle/speed as a free neutral coordinate, with no wheel or engine reset.

## Worn second gear and work exchange

Normal dogs have square load faces. Worn second uses a 0.05 rad ramp angle at radius 0.04 m and weakened detents. The engaged input coordinate is

`inputAngle = G*carrierAngle - sign(q)*G*tan(beta)/radius*q + phase`.

Thus g=[0,0,G/2,G/2,-sign(q)*G*tan(beta)/radius] maps four wheel speeds and selector speed to input-shaft speed. The generalized inertia is M0 + Ji*g*g^T, with Ji=0.1 kg m². A rank-one inverse update includes that inertia exactly once, retaining the open/locked differential's reduced rear inertia. The clutch/contact solve now also includes selector force. Axial ejection is g_q*Tgear, not an added stabilization force. The corresponding power g_q*Tgear*qDot is included in the gear power balance. Transmitted torque can move the lever, and applied hand force can hold it. No timer or random neutral jump is used.

The instantaneous rotor/selector kinetic work ledger includes motor work, driver/detent/stop/damper forces, tire reaction work, neutral bearing work and clutch heat. `rotationalWorkResidual` tests the discrete kinetic identity; detent/stop forces use semi-implicit integration, so this is not proof of exact total potential-energy conservation. Dog impulse losses are checked independently against before/after kinetic energy. The model retains the predecessor's externally supported gearbox casing and reduced vehicle dynamics, not full housing/selector/chassis momentum coupling.

## Numerical boundary and visualization

One 1 ms master clock. Vertical suspension retains RK4. The engine/clutch/contact/selector update uses the analytical reduced inertia and at most 243 five-equation active-set cases per evaluation. A tooth-mouth crossing uses at most 24 time-bracketing trials; no recursive correction loop or hidden time dropping. `lastStepCases` counts all trial evaluations, not just the accepted one. Contact and capture are bounded operations per master step. An unresolved or nonfinite state pauses with its existing error report.

The 3D sleeve, dogs and linkage follow q, actual input/free-gear/carrier angles and engagement state. Sleeve travel is visually magnified to fit the schematic gear locations; it has no effect on physics. A 150 ms display persistence for a real shock makes contact visible between render frames. Lever motion is physical, including motion caused by load. No scripted shifting animation is present. Existing top/side/3D and normal/x-ray/driveline modes are retained. Developer diagnostics report axial Ns separately from input angular Nms, input momentum change, impact loss, detent force, work residual and engagement depth.

## Tests and reproducible comparison

```bash
node --test research/scientific-rebuild/unsynchronized-gearbox-prototype/tests/*.test.js
node research/scientific-rebuild/unsynchronized-gearbox-prototype/tests/scenarios.mjs
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/unsynchronized-gearbox-prototype/tests/browser-selector.mjs
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/unsynchronized-gearbox-prototype/tests/browser-3d.mjs
```

Executed: 10/10 grouped new tests pass. They cover neutral rotation, applied force, phase obstruction, clean engagement, impulse/momentum/energy, double-declutch versus missed blip, torque transmission/release, worn ejection/hand holding, clutch/differential regressions, bounded work and repeated abuse. All 72 predecessor tests passed unchanged. A preservation test compares all six prior exhibits byte-for-byte with c4ef0d8.

`results/scenarios.json` records the fixed comparison: from the same moving-second state, center neutral for 250 ms; the proper trial then engages clutch, applies 30 Nm for 102 ms, opens clutch and applies first selector force. The missed-blip trial omits that neutral clutch/throttle operation. The only success condition is the physical sleeve reaching the dogs. First engages in both examples, but impact losses are about 0.00029 J versus 1.92476 J. This phase-specific fixture illustrates one clean versus harsh shift, not universal timing guidance. Browser controls independently reproduce this comparison, plus worn second held versus released under load, contact-generated audio, and default-hidden inspection data. The 3D browser check verifies view switching without state mutation and functioning cutaway/orbit controls.

Limits: abstract contact geometry and finite-step collision resolution; no tooth elasticity/fracture, fatigue, damage or material calibration. Very high shaft speeds can outrun the discrete tooth-phase resolution. Selector potential/stop integration has numerical error. The existing approximate tire law, axle-based vertical model, absence of roll and incomplete chassis/powertrain coupling remain. No catastrophic failure or production vehicle realism is claimed. There is no synchronizer or automatic shifting mechanism. All previous exhibits and production source remain untouched.
