# Vehicle mechanical interface contract

**Future implementation specification; no drivetrain/vehicle code added.** Frames/state/parameters are defined in [vehicle state](minimum-viable-vehicle-state.md); numerical ownership and gates are in [acceptance](vehicle-physics-acceptance-gates.md).

## Common rules

Use right-handed ISO x forward, y left, z up. World vectors carry an explicit frame tag. Moment reports carry an explicit application/reference point. Torque is positive about its named axis. Native body angular velocity is absolute; shaft/joint speeds are relative to their housings unless explicitly tagged otherwise. SI units throughout.

One master scheduler owns time and h. Native multibody integration owns chassis/wheel mechanical state. Tires own only their documented internal memory. Every coupling applies one force/torque pair and measures both port velocities. Never integrate the same wheel in a native body and a separate scalar rotor. A source value, derived observable, driver command and applied reaction must be different diagnostic fields.

|Boundary|Exchanged action; conjugate velocity / power|Reaction, state and timing ownership|
|---|---|---|
|Road ↔ tire/wheel|World contact wrench (F,M_P) at P; `P_tire=F·V_C+M_C·omega_w` after translation|Tire computes once from frozen stage; road has opposite wrench at P (fixed road velocity zero). Wheel receives it; no separate chassis tire force|
|Tire ↔ wheel hub|`F_W=R F_local`, `M_C=R M_local+(P-C)×F_W`|Apply one full native hub wrench, including spin-axis reaction; do not add `-R_eff Fx` again. Invalid/nonfinite result stops the attempt, never becomes a zero-force success|
|Wheel ↔ suspension guide|Constraint forces/moments at defined hub/mount frames; heave allowed, spin allowed, front steer prescribed|Native joint applies equal/opposite reactions to wheel and chassis. Fixed ideal constraints do zero net work; prescribed steering contributes actuator work|
|Wheel ↔ spring/damper ↔ chassis|Two endpoint forces; `U_s=k(ell-ell0)²/2`, pair power `-U_s_dot-c*ell_dot²`|Native spring/damper owns no extra state beyond body travel. Endpoints apply reactions once; lever arms generate chassis roll/pitch/yaw moments naturally|
|Steering actuator ↔ joint/carrier|Reaction `T_delta`, imposed delta_dot; actuator supply `T_delta*delta_dot`|Driver prescribes motion; native moving constraint supplies reaction and records work. No extra aligning-torque or self-centering term is applied manually|
|Drive input ↔ rear wheels (first vehicle)|Prescribed axle/shaft torques; `P_drive=sum(T_i*Omega_rel,i)`|Apply +T_i*a_i to wheel and -T_i*a_i to housing/chassis. External torque source and its measured work are explicit; no engine state is implied|
|Brake ↔ wheel/carrier|Opposing relative rotation; `P_pair=-T_capacity*abs(Omega_rel)` when slipping|Equal/opposite caliper/housing torque. At lock, a bounded constraint impulse holds relative speed zero; no arbitrary spin reset or ongoing slip dissipation at zero relative speed|

### Exact velocity and mass relationships

Hub velocity is `V_h=V_C+omega_C×(R_C*r_i)+R_C*ez*sdot_i`. Wheel angular velocity includes chassis rotation, steering rate and relative spin as specified in the state document. Tire input uses the actual native absolute axial component; mechanical drive/brake ports use relative spin.

For upright flat geometry, translated moment is `(Mx+Rstat*Fy, My-Rstat*Fx, Mz)`. Rstat is the actual contact lever; R_eff is the source slip radius. Their power difference `Fx*Omega_abs*(R_eff-Rstat)` must remain in diagnostics. Neither radius can silently replace the other. All source Mx/My/Mz terms remain unless separately authorized.

Use five physical rigid-body masses/inertias, finalized from one component registry after finite native initialization staging; wheel/tire source mass is not also in chassis mass or an extra driveline inertia. Full rigid-body inertia handles gyroscopic and carrier effects. Springs/guides transfer forces through mounts; no additional empirical axle-load or yaw-response correction runs alongside them.

## Future engine, clutch, gearbox and differential ports

These contracts reserve mechanical compatibility; none is implemented now. Shaft states are owned by the mechanical solver or a single explicitly coupled shaft integrator, not by UI RPM displays. Shaft axes and casing attachment frames are configuration data. Casing reactions must be applied to the chassis; summing only relative shaft power does not authorize omitting housing work in a 6-DOF world ledger.

**Engine.** Relative crank speed omega_e [rad/s], rotor inertia J_e [kg m²]. `J_e*omega_e_dot=T_comb+T_starter-T_loss-T_c` in the simple fixed-housing reduction. A moving 6-DOF housing requires the coupled generalized mass equation (relative rotor momentum is the kinetic-energy derivative with respect to relative speed), or a native shaft/body joint; do not apply that fixed-housing scalar equation independently while also integrating the carrier contribution. Engine output power is `T_engine*omega_e`. Combustion, starter and loss ports are separately logged; combustion/starter require explicit stopped/starting/running/stalled modes later. Rotor/block reaction torque is a mechanical action, not an RPM assignment. No engine/idle characteristics are calibrated in this mission.

**Clutch.** Define slip `Delta=omega_e-omega_in`. Define T_c with the sign of Delta while slipping: torque on engine `-T_c`, on gearbox input `+T_c`. Pair power is `-T_c*Delta<=0`; **dissipation is `T_c*Delta>=0`**, whereas power delivered to the input shaft is `T_c*omega_in`. These are not interchangeable. At lock, impose one speed constraint with the actual coupled inertias and a capacity-limited reaction; do not copy one shaft speed into another or retain two incompatible locked dynamics. Open clutch has T_c=0. A slip-to-lock impulse must account for angular momentum and lost relative kinetic energy. No automatic rev matching is presumed.

**Gearbox.** For engaged signed ratio g, `omega_in=g*omega_out`. Ideal transmitted torque on output is `g*T_in` for input-applied torque T_in; power matches `T_in*omega_in=(g*T_in)*omega_out`. Equivalently the constraint reaction acts `-lambda` on input and `+g*lambda` on output and does zero internal work. Neutral imposes no speed constraint. Negative g handles reverse sign; calibrated losses would be separate dissipative ports. Engagement/synchronizer friction must remove slip with bounded torque/capacity before lock. Failed engagement is insufficient synchronization or inadmissible constraint reaction, not an arbitrary gameplay RPM jump. Detailed gear/stall implementation is deferred.

**Open differential.** In a common housing-relative convention, `omega_carrier=(omega_L+omega_R)/2`; final drive can be a separate signed ratio. Ideal equal torques `T_L=T_R=T_carrier/2` give `T_carrier*omega_carrier=T_L*omega_L+T_R*omega_R`. Equal torque does **not** imply equal wheel speeds. Independent wheel states and unequal tire loads are preserved. An ideal initial differential uses this algebraic relation to define the massless carrier speed, not an extra constraint equating the two wheel speeds; do not add a duplicate integrated carrier state. If a future carrier has physical inertia, introduce its coordinate and account for energy explicitly.

**Future limited slip.** For `Delta_d=omega_L-omega_R`, use coupling `-T_d` on L and `+T_d` on R, with `T_d*Delta_d>=0` so pair power is dissipative. Capacity/preload are separately calibrated mechanical parameters, not an arbitrary yaw torque. No LSD is implemented or tuned here.

When future engine/gear/differential inertias become explicit states, remove any corresponding duplicate locked-body contribution from the component registry. Reflected inertia through an engaged ratio is obtained from the coupled mass/constraint equations (or one reduced representation), never added again to wheel inertia while the original shaft state is also integrated.

**Service/handbrake.** First vehicle needs per-wheel brake capacity and a mechanically bounded slip/lock law. Rear handbrake is a later input to the same rear brake ports, not an axle-speed teleport. Incorrect shifts, clutch kicks and wheelspin must emerge through these ports rather than tire-force substitutions. AI later supplies the same commands and observes the same applied torques/state; it does not get a second state-update path.

## Force staging and diagnostics

Select the same-stage explicit partitioned policy for the future vehicle: snapshot all body/steering states at t_n → tire Synchronize for all corners → set tire h equal to master h → Advance each tire once (force from old bristles, new bristles separately labelled) → collect all four newly calculated hub wrenches → clear/apply accumulators once → integrate native bodies/joints over h → commit snapshot t_n+h.

This is a deliberate future scheduler choice, **not a change to the Mission 22 research patch**. Native source's cached callback order is preserved in the patch tests. Never let early integration of one wheel alter a later wheel's tire input. The tyre update and mechanical step are first-order partitioned; stiffness/energy convergence must pass gates before acceptance. No hidden tire substeps, elapsed-time drops or render-driven physics.

Required ledger per step: all input/applied drive and brake torques, absolute and relative wheel speeds, steering reaction work, spring potentials and damper losses, native contact wrench/reference, body kinetic/gravity energies, contact signed power, constraint residual/work, tire state before/after, Fn/activity and reject status. Internal pair transfer is counted once; external fixed-road/contact law work is reported separately from source storage assumptions. Wrench identity closure is not a global tire-passivity proof.
