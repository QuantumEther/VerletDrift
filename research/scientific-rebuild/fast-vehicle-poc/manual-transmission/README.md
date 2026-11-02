# Manual transmission: bounded progression and integration blocker

PERFORMANCE, starting e786a6a. Status: **partial implementation, not a playable
manual gearbox**. Historical vehicle, tire/contact, engine, rotor solver and UI
are unchanged. No vehicle CPU-overhead or browser-drivability claim is made.

## Confirmed representation obstruction

`../constraints.js` has exactly five rotational states: FL, FR, RL, RR and engine.
Its only coupling row is engine − G*(RL+RR)/2. It assumes a positive fixed G and
solves one scalar friction reaction. `../variable-terrain/vehicle.js` freezes that
parameter object, uses this flow in its predictor and every contact trial, and
has an energy expression containing only wheel and engine rotational inertia.
There is no independent gearbox input/output rotor or synchronizer reaction.

Neutral cannot be modeled correctly merely by opening the current clutch:
with the clutch closed in neutral, the engine should still accelerate input-shaft
inertia. That inertia must retain speed and energy when a gear disengages.
Changing G while locked changes a constraint manifold without accounting for a
shift impulse, synchronizer heat or gear inertia. Setting engine RPM to match
wheels would create/discard energy. Negative G is explicitly rejected today.

For engaged ratio g and final drive f, wi=g*wo and wo=f*(wRL+wRR)/2.
An input inertia Ii contributes Ii*(g*f)^2 to the carrier inertia. In wheel
coordinates this is a rank-one 2x2 block proportional to [[1,1],[1,1]],
**not independent additions to each wheel's diagonal inertia**. With neutral or
synchronization, wi must remain an independent state. Retaining gearbox output
inertia also couples the rear wheels even in neutral. The current scalar clutch
reaction formula assumes diagonal rotor inertia; it cannot represent this block
plus a separate clutch and synchronizer reaction without a new verified coupled
rotor kernel and energy ledger. This is a structural dependency, not a tire change.

## Implemented smallest isolated mechanical kernel

`shaft-flow.js` implements two inertial shafts and a finite-capacity synchronizer
at signed gear ratio g. Default configuration declares six forward ratios, reverse
and a final-drive ratio. These are synthetic plausible gearbox ratios, not a fit
to the lightweight experimental vehicle; final drive is configuration only here.
The synchronizer test uses gearbox output inertia directly, not a disguised wheel
or engine inertia. This module is not connected to the existing vehicle.

For slip s=wi-g*wo, reaction c gives Ii*wiDot=Ti-c and Io*woDot=To+g*c.
During slip c=sign(s)*capacity. At s=0 the static reaction is externalSlipRate /
(1/Ii+g²/Io), clipped to capacity. Constant torques integrate analytically up to
an exact slip-zero event. At most three segments are allowed. An engaged dog row
maintains wi=g*wo; mismatched dog engagement rejects rather than snapping RPM.
Neutral integrates the shafts independently. Ideal dog disengagement/selector
motion, reverse selection interlocks and gear-request transitions are deliberately
not modeled by this kernel; callers cannot treat its mode argument as a physical
vehicle shift controller. Reverse synchronization tests only signed ratio math.

Heat is integral(c*s dt); it is nonnegative. Torque-free coupling preserves
L=g*Ii*wi+Io*wo, the null-space generalized momentum. Energy changes by applied
work minus synchronizer heat, with a machine-epsilon guard. Exact-root rounding
corrections are bounded; inputs are never mutated. A locked-shaft energy reduction
exposes Io+g²*Ii explicitly. No engine lifecycle model is invented.

## Verification and scope limits

`node --test research/scientific-rebuild/fast-vehicle-poc/manual-transmission/shaft-flow.test.mjs`
passes **9 tests**: ratios/reflection, neutral isolation, forward/reverse
synchronization momentum/heat, rejected dog engagement, engaged torque and
back-drive, finite slipping, matched-time 1/.25 ms refinement and input preservation.
This tests a mechanical building block, not complete vehicle shifts. It has no
clutch, brakes or differential internally; composing their independent flows
would generally violate simultaneous constraints and is not done here.

Complete-step before/after benchmarking is **not performed**: there is no integrated
candidate to compare. Kernel timings would not establish vehicle overhead.
Browser manual drivability is **not implemented**; existing fixed-gear controls
remain honestly labeled. Stalling, starter and idle lifecycle remain unsupported
by the inherited mean-engine model. Terrain/contact regression behavior is
preserved by leaving the original implementation unchanged.

The next required implementation boundary is a six-rotor kernel (four wheels,
engine and independent input shaft), with output inertia reflected as a rear-wheel
mass block, simultaneous clutch/synchronizer/brake reactions, bounded event
handling, neutral/selector/dog states, synchronizer heat and the augmented vehicle
energy/work ledger. It must replace the rotor evaluation inside the same contact
stage, not run beside it. Only after its independent tests pass should six-speed
controls, reverse engagement restrictions and complete-step timing be connected.
This mission stops at the structural blocker rather than introducing fictitious
gear selection into the playable laboratory.
