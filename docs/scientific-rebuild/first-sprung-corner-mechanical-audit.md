# Mission 23 — mechanical assembly audit

## Assembly and ownership

The experimental source is [first_sprung_corner.cpp](../../research/scientific-rebuild/first-sprung-corner/first_sprung_corner.cpp). It constructs the bodies, guides, spindle, revolute shaft, TSDA, `Generic_Wheel`, `Generic_TMeasyTire`, and flat terrain directly in an isolated executable. There are no imports from production `js/physics/`, renderer code, or player input. The machine snapshot records the combined wheel/tire mass and inertia after native initialization; the source wheel's 18 kg and tire's 37.6 kg are not added twice.

The assembly exposes sprung heave, carrier heave, and wheel spin. It is not a free vehicle: the guides react longitudinal and lateral tire forces. In the driven-road case the measured peak tire force is 577.316 N, while the hub remains fixed in x and the carrier guide supplies the equal reaction. This verifies the load path, not vehicle acceleration.

## Ports and balances

The shaft input is a torque on the wheel's relative revolute coordinate. Its equal-and-opposite reaction is carried by the carrier. A free-wheel test gives 30 N·m·s applied angular impulse and 30.0000000027 N·m·s measured wheel angular-momentum change. Rotational energy changes by 61.5233173373 J against 61.5233173373 J input work, with a residual of `-1.69e-11 J`. A slipping brake likewise opposes the current spin, and the high-torque case remains a finite slipping response rather than silently locking the wheel.

The independent hub-wrench moment translation check has maximum reconstruction error `6.49e-11 N·m`. Static tire support is 3409.956000000004 N against 3409.956000000001 N expected; suspension spring force is 2746.8 N against 2746.8 N expected. Vertical guide reaction at settled static state is below `7.2e-24 N`.

## Contact boundary and cache behavior

The boundary case preserves a previously created finite bristle state as support approaches zero. Floating-point transforms make the closest representable native raw normal load `-4.5474735088646412e-13 N`, which is unloaded by the Mission 22 `Fn <= 0` variant. The experiment reports this as a near-zero boundary; exact zero remains covered by the Mission 22 tire-level test. It is not evidence about an unconstrained free-drop event.

The Chrono system caches force updates. The final scheduler calls `ForceUpdate()` after applying each step's tire wrench and shaft torque and before `DoStepDynamics()`. The harness records the actual step result and rejects traces if Chrono reports a failed/rejected step, if state is nonfinite, or if solver diagnostics exceed configured limits. All 24 checks in this run passed.

## Work-ledger limits

The measured free-spin and brake work ledgers close tightly. At the final sample, the disturbance, unloading, and boundary mechanical-energy residuals are `-48.936 J`, `+0.290 J`, and `-1.087 J`, respectively. The harness ledger does not include a separately measured internal TMeasy bristle-energy state; the unloading trajectory also crosses contact and separation while applying a declared external lift force. The disturbance residual is material and unexplained by this experiment; bristle storage is a possible omitted term, not a demonstrated explanation. These results are not proof of passivity or complete contact-energy accounting. Mission 22's contact safety behavior is being exercised here, not newly proven for every possible state.
