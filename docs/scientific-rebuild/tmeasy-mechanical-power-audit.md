# Mission 20 — mechanical power audit

Source identities: [source audit](tmeasy-source-and-license-audit.md). **PASSIVITY UNRESOLVED.** This status is separate from successful source reproduction and from observed positive/negative instantaneous power.

## Boundary, references and rotor reaction

Use fixed flat road, upright wheel, ISO x forward/y left/z up. Hub C has velocity `(Vx,Vy,Vz)` and angular velocity `(wx,Omega,wz)`; `Omega` is the axle-axis component, not an extra rotation to be added again. Source wheel state derives this component from the full angular velocity. A future wheel carrier plus rotor split must reconstruct the same total wheel velocity.

At road point P, the tire returns `F=(Fx,Fy,Fz)` and `M=(Mx,My,Mz)`. ChForceElementTire::GetTireForce rotates these and adds `(P-C)×F` to the hub moment; ChWheel applies that wrench to the spindle. For upright single-point contact, `P-C=(0,0,-r_stat)`, `r_stat=R0-depth`, so independently:

```text
M_C = (Mx+r_stat*Fy, My-r_stat*Fx, Mz)
P_wheel = F·V_C + M_C·omega_wheel
        = Fx(Vx-r_stat*Omega) + Fy(Vy+r_stat*wx) + Fz*Vz
          + Mx*wx + My*Omega + Mz*wz
```

For the planar probes wx=Vz=0. A drivetrain would add `Tdrive*Omega` at its wheel port, with the opposite coupling torque at the connected shaft; the tire does not integrate a separate engine, rotor speed or rotor inertia. Tire inertia is added to the external spindle by ChTire::Initialize. Do **not** apply both the translated hub wrench and another `-R*Fx` rotor torque; that double counts reaction.

The original slip uses `vsx=Vx-R_eff*Omega`, with `R_eff=R0-depth/3`. Therefore the actual planar wrench power is

`P_wheel = Fx*vsx+Fy*Vy + Fx*Omega*(R_eff-r_stat) + My*Omega + Mz*wz`.

The additional radius term is `Fx*Omega*(2*depth/3)`, not a floating-point discrepancy. Effective rolling-radius phenomenology may represent deformed-tire effects, but a source-supported storage/loss balance for that port was not recovered. It must not be discarded, silently compensated, or equated to a proven energy violation by itself.

## Individual terms

- **Handling force:** with s=norm(sx,sy)>0, `F=f(s)*(sx,sy)/s`. Its effective-slip work is `-vta*f*s<=0` when the configured curve has f>=0. This is DERIVED for valid positive coefficients, not proof of the complete wheel-work sign.
- **Normal force:** before deactivation, elastic potential is `Uz=d1*depth²/2+d2*depth³/3+kb*max(depth-free_depth,0)²/2`. For fixed upright geometry, depth_dot=-Vz, hence `Fz*Vz=-Uz_dot-dz*Vz²`. Unilateral removal and changing geometry/load require separate transition accounting; the exactly-zero-force path actually fails numerically.
- **Rolling resistance:** `My=-rr*Fn*R0*tanh(Omega)` gives `My*Omega<=0` for nonnegative rr/Fn. It uses full Fn and R0, not capped handling load or R_eff. This term was retained in every power probe.
- **Camber moment:** `Mx=-cg*gamma`, `cg=width²*(d1+2*d2*depth)/12`. A fixed-cg restoring potential can be written locally, but variable depth/stiffness and the exact relation between gamma_dot and wheel angular velocity need their own work terms. Planar tests have gamma=wx=0 and do not validate that extension.
- **Aligning moment:** `Mz=-Fy*P_len*trail(abs(sy),load)` only when signed Vx>=1. Neither yaw rate nor local contact-frame spin enters its constitutive stress calculation. Its power is Mz*wz; no steering-relative angular work should be added twice. With an independently moving steering carrier that carrier's rate must appear in total wheel angular velocity and actuator balance.

The aligning-moment construction therefore retains a potentially important mismatch between a translational-slip constitutive law and yaw work. Its sign can supply or remove mechanical power according to yaw, without a corresponding spin-dependent deformation calculation. This does not prove practical energy growth or thermodynamic nonpassivity in all driving regimes.

## What the bristles can account for

SOURCE-EXACT scalar law is `zdot=v-sigma0*z*abs(v)/fc`, output `F=-sigma0*z-sigma1*zdot`, `fc=min(Fn,pn_max)*muscale`. A candidate **derived scalar storage**, not an invented state, is `E=sigma0*z²/2`. Before force-circle projection:

`-F*v-E_dot = sigma0²*z²*abs(v)/fc + sigma1*v*zdot`.

For fixed fc>0 and `abs(sigma0*z)<=fc`, `v*zdot>=0`, so this scalar expression is dissipative. This limited result does not extend automatically to the actual two-axis force-circle projection, variable fc, force blending, memory updates while the bristle force is unused, contact resets, or old-state force / new-state discrete storage. The source's Dahl pair is not a full belt/contact-patch energy model.

The trapezoidal update is closed-form for each held velocity/load. It is A-stable for that linear ODE but can alternate errors when `a*h>2`; A-stability is not positivity, L-stability or discrete mechanical passivity. Advance computes force from old z and then advances z. Its effective integration h is the configured m_stepsize, not its argument.

## Executed power observations

[Power probes](../../research/scientific-rebuild/tmeasy-evaluation/results/power-probes.json) apply yaw {-0.3,0,+0.3} rad/s to four recorded force states, without rerunning or changing constitutive parameters. They are 12 accounting observations, not a prevalence survey. Independent Python evaluation of the hub cross-product identity agrees with the expanded ledger (absolute tolerance 2e-10 W plus 2e-12 relative).

For the tiny positive lateral-slip state, yaw=-.3 gives approximately **+6.69611e-5 W aligning work** versus **-6.34394e-9 W effective tire-force work**. Full rolling work is about **-1303.68565 W**, so total wheel work remains negative. Omitting rolling resistance would change the result and is not permitted. No conclusion about magnitude in ordinary drifting follows from this selected near-zero-slip probe.

For `release_storage`, a valid initial brx=.001 m produces **+0.451184 W total wheel work**; the scalar stored-energy reduction over .001 s is **1.006502 W** in average-rate units. Positive instantaneous work here is consistent with releasing preloaded bristle energy, not evidence of energy creation. This is not a complete discrete work-quadrature proof.

The 12 probes close the mechanical identity; they do not close a complete constitutive storage/transport ledger. Road/frame transformations and full wheel dynamics were source-inspected, not executed in Chrono. Global thermodynamic passivity and real-world drifting fidelity remain **UNRESOLVED**.
