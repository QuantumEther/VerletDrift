# Mission 34 — neutral and two forward ratios

Run `python3 serve.py` from repository root. Open
`http://localhost:8000/research/scientific-rebuild/manual-gearbox-prototype/`.

W applies motor torque; S brakes; A/D steer; Space/B retain suspension demonstrations. Clutch slider controls engagement. Keys 1, 2 and N request gearbox states; key repeat is ignored. Gear selector is a request, while the Selected field reports the actual state.

## Mechanical implementation

Gears 1=3.5 and 2=2.0 are illustrative positive forward ratios. Neutral disconnects the input shaft from the output. Engine flywheel inertia remains 0.3 kg m²; a physical 0.1 kg m² transmission input inertia is added.

In neutral this shaft has independent angle/speed and can be clutched to the flywheel while wheels coast independently. It loses torque 0.005*omega Nm to a neutral coast-down bearing resistance. The loss is fixed and does not depend on target gear or speed error. Its implicit velocity update participates in the same clutch/contact active-set solve. It is not a synchronizer.

In an engaged gear, input speed is G*carrier speed; input angle is derived with a phase offset preserving angular position on engagement. No independent input-shaft integration runs in gear. Input inertia contributes Ji*G² to the output-side reduced mass matrix, including the independent-drive input boundary. Flywheel/clutch ratio factors remain in the single coupled solve. No double-counted reflected flywheel inertia is added.

Clutch torque Tc first accelerates the input inertia. Actual mesh input torque is Tgear=Tc-Ji*inputAcceleration, and carrier torque is G*Tgear. Diagnostics compare Tgear*inputSpeed against carrierTorque*carrierSpeed. The input-shaft storage term is deliberately excluded from mesh power. The carrier and rear wheels retain their existing inertia/constraints. Ideal casing reaction is reported, with the inherited fixed-support/reduced pitch assumption.

The neutral input inertia becomes the reflected engaged inertia only when a valid kinematic constraint is installed. Releasing a gear copies its calculated input angle/speed into the newly independent neutral coordinate, preserving energy. No flywheel or wheel speed is reset.

## Shift protocol and moving shift

1. Open clutch completely.
2. Select N.
3. Request 1 or 2. An immediate engagement succeeds only if inputSpeed-G*carrierSpeed is within 1e-7 rad/s; otherwise it is rejected and the reason displayed. Switching directly between forward ratios is rejected.
4. Reengage the clutch after a successful shift.

For a moving first-to-second demonstration: drive in first, release W, open clutch, select N, request 2 (initially rejected), then press **Engage requested gear at natural speed match**. The shaft coasts down under the fixed neutral resistance while the vehicle coasts. This optional gate watches for equality; it applies no torque and changes no speeds. Once the mismatch changes sign, at most 40 bisection trials locate the crossing inside that same master step, using the actual neutral dynamics. The step is split at this physical event, the zero-mismatch constraint is installed, and the remainder advances in gear. Reengage clutch afterward and observe its separate synchronization of the engine.

The gate cancels if clutch engagement is increased while waiting. If no natural crossing occurs, it waits rather than inventing a shift. It cannot synchronize a downshift with a faster target shaft. Input inertia and phase are preserved through permitted transitions; any tiny engagement-energy discrepancy due to the numerical tolerance is recorded as transitionEnergy, not hidden. The tested shift discrepancy was below 1e-8 J. This does not model dog impacts, teeth alignment or a real synchronizer.

## Visual explanation

The two constant-mesh pairs and selected collar appear in the schematic and 3D cutaway. Green highlights the selected path. Neutral disconnects the input and carrier visually as well as mechanically. Each input pinion follows actual input-shaft angle; its freely rotating mating gear follows input angle divided by its ratio, without creating a new rotational state. Selected gear speed matches output speed. Ratios are net positive forward reductions; omitted idlers and marker phases are schematic, not detailed tooth meshes. Transparent chassis, driveline-only inspection, focus camera and ordinary driving views remain available.

## Reproduce and verify

```bash
node --test research/scientific-rebuild/manual-gearbox-prototype/tests/*.test.js
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/manual-gearbox-prototype/tests/browser-smoke.mjs
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/manual-gearbox-prototype/tests/browser-3d.mjs
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/manual-gearbox-prototype/tests/browser-gearbox.mjs
```

Executed: 9/9 grouped new tests cover ratio kinematics, mesh power, reflected inertia, neutral coasting/isolation, engagement/rejection, clutch-open rule, moving event shift/reengagement, back-driving, energy/momentum and differential modes. All 63 predecessor tests passed with their original source. Preservation test compares all five exhibits byte-for-byte with commit 9e93fa5.

Browser smoke and 3D tests passed driving, braking, steering, clutch controls, camera/view switching and zero runtime errors. Dedicated gearbox browser check passed keyboard/selector use, rejected mismatch and clutch-engaged requests, neutral motor isolation, second-gear propulsion and the moving shift (11.3 simulated seconds waiting under this configuration).

Known limitations: no reverse, synchronizer, clutch pedal dynamics or combustion engine; neutral bearing resistance is a declared experimental loss active on the free input coordinate only. The inherited model uses two vertical axle coordinates, temporary tire forces, no roll or complete chassis/rotor reaction coupling. Rotor/gear work closure is not a proof of global tire passivity or real handling. Existing exhibits and production are unchanged.
