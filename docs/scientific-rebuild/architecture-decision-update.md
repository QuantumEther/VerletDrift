# Mission 14 decision update to Mission 13

This is an additive decision record. The five original Mission 13 documents and protected recovery branches are unchanged.

## Confirm

Retain the isolated RWD single-track reference direction, explicit axle rotor states and combined-slip tire closure; retain eventual four individual wheels and mechanically coupled manual drivetrain as nonnegotiable. Retain the separation of application/visual identity from core dynamics and the staged migration gates. No current application, physics, renderer, controls or assets change.

## Amend on primary-source evidence

1. Mission 13 `implementation-roadmap.md`, “Exactly one recommended next implementation experiment,” says **“Candidate mathematical source: Dallas et al.”** This is superseded. Dallas p.3 Eqs.(11)–(15) has states [r,beta,V,delta,tau], prescribed Fx,r=tau/rw and no Omega/slip-derived longitudinal constitutive law. Select Zhang Eqs.(6)–(20)/Table 1 instead. Dallas remains a recovery/control reference, not a complete torque-driven rotor model.
2. Mission 13 `mechanical-interface-contract.md`, “Proposed planar balance,” gives body-only balances and static reference loads. Those remain conceptual interface equations; they are **not the exact Zhang reproduction**. Selected Eq.(7) includes m,p,J and -C gamma_ddot, Eq.(17) includes applied Md load transfer, and Eq.(20) includes aligning moment. No silent mix of sources is acceptable.
3. Mission 13 `implementation-roadmap.md` says **“Use static loads m g b/L and m g a/L.”** For this selected reproduction use Z Eq.(17), with positive-support domain checks. Its Md term cannot later be replaced blindly by internal clutch torque. Constant steering avoids a steering-acceleration input in the initial test, but is an explicit protocol restriction.
4. Mission 13 architecture calls for **“Exact published tire equations ... obtained and frozen before implementation.”** That source-access blocker is now resolved by the attached Zhang manuscript and appendices. New, specific numerical/domain/power gates remain. Equation completeness is conditional on nonzero Omega and positive support, not global standstill readiness.
5. Mission 13 roadmap requests passive contact testing. This remains necessary, but force-level passivity and full aligning-moment/steering work must be distinguished. Do not count undefined tire storage or the wrong body-only kinetic energy to close the ledger. Source moment approximations are documented, not empirically validated for a free steering column.

## Reject as inferences

Do not infer RK4 stability from eight calls per step. Do not infer real-tire validation from Zhang Appendix B's analytic/numerical comparison; the source conclusion leaves vehicle validation for future work. Do not infer unrestricted recoverability from Dallas shared control on an emulated low-friction vehicle. Do not infer browser performance or guaranteed solver success from Stocco's finite C++ test campaign. These corrections strengthen, rather than discard, the preservation architecture.

## Readiness and next authorization

**CONDITIONALLY READY** for a narrow moving, source-reproduction experiment after the four prerequisites in [readiness](reference-implementation-readiness.md). Not ready for a standstill-capable complete manual simulator. No implementation was performed, no new driving demo was created and no branch was merged. The next action is the constant-steer moving-domain/full-power specification gate; future implementation requires separate authorization.
