# Pre-implementation reconstruction

Base: Mission 01 commit 74440cd9204d2cd5a1aedd9f45bed5c152d514a2.

`v_contact = v_center + omega_z cross arm`, then project into each wheel's axes.
Lateral velocity has a 25 ms EMA. `alpha=atan2(vLatFiltered,max(abs(vLong),0.5))`.
`kappa=clamp((R*Omega-vLong)/max(abs(R*Omega),abs(vLong),0.5),-1,1)`.

With load-sensitive peak D from tire-load.js, scalar demand is
`D*sin(C*atan(B*s/s_config))/sin(C*atan(B))`.
It returns zero if the denominator is below 0.0001. Lateral demand is multiplied
by `clamp(centerSpeed/2,0,1)`. Independent longitudinal/lateral demands are
radially clipped to D. At high |kappa| a smoothstep starting at peakSlipRatio
blends toward slidingRatio*D opposite raw patch motion. Pure lateral sliding
never activates that blend.

Force history is clipped to the current D. Relaxation time is
`max(L/max(abs(vLong),0.5),0.0001)`. wheel.js adaptively step-doubles an implicit
rotor/brake solve and exponential force relaxation, averages common longitudinal
and lateral impulses back to the chassis, and reacts R*Jlong against rotor inertia.
Brake bias is 80/20, handbrake capacity per rear corner is 0.5*brakeForce*R.
Locked drivetrain reflects engine inertia into each driven wheel by the existing
Ie*G^2/2 approximation; that drivetrain defect is outside this mission.

SAT is summed front lateral force times `pneumaticTrail*exp(-abs(alpha)/(pi/12))`,
followed by an independent 80 ms EMA. It has no separate tire-energy ledger.
The column applies negative SAT; its mechanics remain out of scope.

Confirmed defects: slider peak is not analytic peak or cap onset; legal C values
can disable the scalar curve; lateral sliding ignores Sliding Grip; center-speed
fade removes pure-pivot contact; stacked lags carry force/SAT through reversals
and unloading without a stated stored-energy model.

Preserve: local rigid contact kinematics; suspension-provided normal loads and
bounded load sensitivity; vector friction bounds; zero-load history clearing;
shared wheel/body contact impulse; passive brake holding. Do not compensate by
changing yaw damping, column mechanics, normal-load equations, or drivetrain.
