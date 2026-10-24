# Mission 22 — zero-support root cause

Baseline: Chrono `9a5072b5324e012a66d9fb7eaac0c679b8465e73`, original `ChTMeasyTire.cpp` SHA-256 `4e254282b6e45eeb17e7206d08eb512b08f1c5e20402b198b26de7026b93322a`. This document adds findings without changing [Mission 21](tmeasy-native-boundary-results.md) or its artifacts.

## Original path and singular operations

1. Native `DiscTerrainCollision` establishes geometric overlap, depth/frame and road friction. Overlap is not the same as positive support.
2. Synchronize calculates `Fn=GetNormalStiffnessForce(depth)+GetNormalDampingForce(depth,-Vz)`. Upward velocity reduces support. The original `if(Fn<0)` deactivates negative support, but **leaves exact zero active**, despite its adjacent comment saying force/moment calculations should be skipped at zero.
3. Load ratio q becomes zero; Advance still enters CombinedCoulombForces. `fc=min(Fn,pn_max)*muscale` is zero. Road friction scaling is positive for this valid fixture; it cannot rescue a zero load.
4. Each Dahl derivative contains `sigma0*z*abs(v)/fc`. At z=v=0 this is 0/0; at finite nonzero z/v it can diverge. Force `-sigma0*z-sigma1*zdot` becomes nonfinite. A force-circle cap cannot repair a vector whose norm/normalization is already undefined.
5. Trapezoidal updates divide by `2*fc+h*sigma0*abs(v)`. At fc=v=0 this is another 0/0. For v≠0 the zero-load algebra has a different degenerate limit, not permission to continue the force calculation. BDF1's alternative formula also has a zero denominator at fc=v=0, though the fixture uses trapezoidal integration.
6. The nonfinite local horizontal force contaminates rotated force and translated hub moments, including components that were locally zero. Internal bristles are now nonfinite; returning a finite reported force alone would conceal corrupted state.

The regularized slip denominator `R_eff*abs(Omega)+.01` is finite here. It solves a different low-speed normalization problem. The combined handling curve's q=0 fallback is not the originating singularity. Normal spring/damper evaluation itself is finite for the tested boundary.

## Distinct regimes

|Condition|Original source behavior|Required distinction|
|---|---|---|
|Small positive Fn, including recorded .003931684976 N neighbor|Active; fc>0; finite derivatives for admitted finite inputs|Do not floor the load or introduce an epsilon threshold.|
|Negative computed Fn during overlap|Inactive, Fn reported zero; bristles not reset in that branch|Finite history is already dormant under this source policy.|
|Exactly zero computed Fn during overlap|Active; zero friction capacity; undefined derivatives/update|The authorized correction targets this condition only.|
|Geometric separation|No contact; source else branch resets brx/bry and contact states|Retain that existing policy.|
|Zero penetration / just touching|Native single-point collision returns false for depth<=0|Already follows geometric no-contact; not the same as overlapping zero support.|
|Loaded contact with zero slip speed|fc>0; derivative is zero and finite bristle preload persists|A valid holding state; do not erase it as a low-speed fix.|

## Cached wrench and re-support

The native rig order is tire Synchronize → wheel Synchronize (cached wrench) → tire Advance → system step. In Mission 21's fresh-wheel release, initial cached force was zero and subsequent upward motion deactivated contact before the invalid pending wrench was applied. Internal bristles still remained NaN. That experiment did not establish universal suppression.

The new nine-stage native history excitation first creates finite nonzero bristles, unloads to the positive neighbor, reaches exact zero support, and then restores positive support **before geometric separation**. Original source returns to active contact with NaN bristles and a NaN cache. The next wheel application receives a nonfinite wrench; that native body step is explicitly rejected by the test driver and retained in the original trace. Subsequent geometric separation resets bristles and permits later finite recontact. This extends, rather than rewrites, Mission 21 evidence.

## Minimum policy selected

[The research diff](../../research/scientific-rebuild/tmeasy-safety-experiment/zero-load.patch) changes only `Fn<0` to `Fn<=0` and labels the variant. Nonpositive support is inactive. Public wrench retrieval is zero immediately because GetTireForce checks activity; Advance clears the cache before returning without calling the friction law. Finite bristles remain frozen during geometrically overlapping no-support callbacks. Positive re-support resumes them; geometric separation retains the original reset. No valid loaded history is reset just because speed or support reaches zero.

This is a **numerical boundary policy**, not a new tire unloading theory. Keeping finite dormant history matches the existing negative-support behavior. With the scalar proxy `E= sigma0*(brx²+bry²)/2`, freezing changes no stored value and zero wrench transfers no work. At geometric separation, resetting removes that proxy from the represented contact; it does not deliver an unmeasured impulse or compensating torque to the chassis. Interpreting removal as unresolved contact-material/storage transport is more honest than claiming a complete elastic-energy proof. Full passivity remains unresolved.

The patch prevents generating the demonstrated invalid state from finite admitted inputs. It does not repair already corrupt checkpoints, invalid parameters, nonfinite input motion, impossible geometry or extreme floating-point underflow. Such inputs must be rejected diagnostically rather than silently reset. [Validation](tmeasy-zero-load-patch-validation.md) states the verified envelope.
