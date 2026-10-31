# Experiment 10: first vertical stage

Headless stage only, not yet a runnable navigator entry. The governing plan is docs/scientific-rebuild/four-wheel-load-transfer-plan.md.

Seven coordinates represent sprung heave/pitch/roll and four independent unsprung heights. Mount height is z+x*pitch+y*roll. Suspension force is k*(L-mount+wheel)-c*(mountVelocity-wheelVelocity). Equal/opposite reactions and x/y moment arms are applied once. Unilateral elastic ground contact is kt*max(radius-wheelHeight,0), so it cannot pull on a wheel. No tire normal damper is assumed. The energy function includes all vertical kinetic, gravity, spring and tire elastic energy; suspension dissipation is c*relativeVelocity². Reference masses/rates split the inherited two-axle model into four corners; roll inertia 20 kg m² is an illustrative assumption, not measured data. Small angles, fixed horizontal corner coordinates and linear suspension are explicit limits.

RK4 integrates this smooth piecewise-elastic subsystem. Four deterministic tests pass for equilibrium, normal-force/moment balance, symmetric damped heave and conservative pitch/roll energy refinement. At 4 and 2 ms the 0.2 s conservative energy errors were 1.58235e-6 and 4.97269e-8 J. Contact-switch convergence is not established by that smooth oscillation test.

Run: node research/scientific-rebuild/four-corner-load-transfer/tests/vertical.test.mjs

Driving coupling remains unfinished. Existing steering, drivetrain, brake and tangential contact modules will be reused through their ports; none is duplicated or connected yet. There is no longitudinal/lateral load-transfer fidelity claim, load-sensitive tire model, driving UI or track renderer in this stage. Future integration must close the horizontal/vertical reaction-work ledger before enabling driving scenarios. Prior experiments are unchanged.
