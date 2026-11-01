# Mission 16 — contact solver challenge

**Decision: STOP.** The one tested semismooth Newton implementation does not
meet the required 5× full-contact CPU gate at both accuracies. Do not integrate
it or continue a rescue/tuning campaign. The existing FISTA solver and default
simulator remain unchanged.

Base: `1844f08318d1f61dff76cce14165ecbdc5e580fc`, existing branch
`scientific-rebuild/12-braking-and-tire-contact`. All work is isolated here.
No numerical reference, production solver, vehicle equation, fixture or historical
benchmark is modified. This is a frozen-QP experiment, not a new vehicle.

## Problem and one algorithm

The exact captured problem is

```
min 0.5*zᵀ D z - rhsᵀ z
D = J M⁻¹ Jᵀ + C
v = v_free - M⁻¹ Jᵀ z
```

Preserve every scalar interval, fixed kinetic-clutch impulse, zero capacity and
2D Euclidean friction disc. Anisotropic compliance remains in D; there is no
replacement tire model, deleted rotor coupling or changed friction limit.
`prepare.js` reproduces production assembly order and asserts exact D/rhs/L
agreement with all captured matrices before either alternative is benchmarked.

`newton.js` solves `F(z)=z-P(z-(D*z-rhs)/L)=0`, using the analytic generalized
Jacobian `I-P'+P'D/L`. P' uses scalar/fixed and two-dimensional disc blocks;
block sparsity avoids cubic projection-matrix multiplication. Each search
uses partial-pivot dense elimination, fixed 1e-12 direction regularization,
projected Armijo backtracking (maximum12 trials), and at most40 Newton steps.
If a direction is unsuitable, one unaccelerated projected-gradient step is the
bounded globalization rule. It is not a FISTA fallback or a second solver.
Regularization changes only the search direction; objective, projection and
termination remain unregularized. No parameter was tuned after the corpus run.

## Corpus and independent correctness

132 original-size contact problems:

| Class | Problems | Provenance |
|---|---:|---|
| Locked/slipping acceleration attempts | 24 | Existing Mission13 matrix captures |
| Lateral recovery | 24 | Existing Mission13 matrix captures |
| Braking | 24 | Newly captured from unchanged existing benchmark fixture |
| Wheel unloaded/recontact | 48 | Same fixture, entry0 and40ms |
| Accepted locked clutch | 12 | Existing near-steady fixture; all12 actually lock |

A/B tires, h1/4ms, floors0.25/0.5/2. Braking capture requested at50ms uses the
nearest grid step (52ms at4ms). Exact actual entry times are saved. Existing
saved profiles did not contain braking/recontact matrices, so those were captured
without rewriting historical artifacts. Dataset/source hashes are retained.
Original captured warm seeds are used identically. No cross-problem solution
cache or privileged Newton warm start is used; problems rotate/reverse between
repeats. Nine scalar/load active signatures change at131/131 capture adjacencies.

**Coverage limitation:** none of these sampled vehicle QPs has a saturated
friction disc in the certified solution. Active changes involve scalar bounds,
fixed modes and unloaded contacts. A separate anisotropic saturated-disc unit
test compares against an independent multiplier-bisection oracle, but nonlinear
saturated-disc robustness in vehicle captures is **not established**. This
limitation cannot support continuation, and no expanded search was run after
the performance gate failed.

`check.js` independently reconstructs gradient, objective and generalized
velocity from original J/M⁻¹/C/free data, not from the solver Hessian/residual.
It checks feasibility and normal-cone KKT conditions for each group. Numerical
limits were frozen in `results/protocol.json` before checking the corpus:
feasibility1e-12; KKT `max(64*eps*rhsScale,4*L*tolerance)`; objective differences
<=1e-10J strict /1e-8J balanced; generalized-velocity component differences
<=1e-8 strict /1e-6 balanced, in each coordinate's SI units. These checks are
separate from the shared projected-residual stopping criterion.

**264/264 problem/accuracy combinations pass**, at strict1e-12 and balanced1e-10.
Newton has zero nonconvergences, median1/max2 Newton updates, no globalization
fallbacks, at most5 residual evaluations and2 line-search evaluations. Maximum:

- feasibility violation: **0**;
- independent Newton KKT residual: **7.674e-12**;
- objective difference from FISTA: **1.433e-12J**;
- generalized-velocity component difference: **8.962e-10** (m/s or rad/s).

The PSD objective plus feasibility/normal-cone stationarity is the applicable
convex certificate. Redundant impulse coordinates can be nonunique, so raw z
identity is not required; objective and mechanically reconstructed velocity are
compared. This verifies sampled QPs, not complete vehicle trajectories or live
clutch-mode/event selection using the alternative.

## Measured cost and strict gate

Node24.19.0, Linux x64, Intel Xeon Platinum8573C, five exposed logical CPUs on a
shared cloud host. CPU=user+system process time; per-call wall time includes
allocation/GC/descheduling. No GPU or renderer is involved.
Nine alternating solver-order batches, first two warmup, three passes over132
identical problems/batch. Each table entry has **2,772 measured solves per method**.
Preparation, bounds/RHS, optimization and velocity reconstruction are included
in **full contact** timing. FISTA also retains its original scalar polish.
Independent verification and JSON serialization are outside the timers.

| Accuracy | FISTA CPU/solve | Newton CPU/solve | Full-contact CPU speedup |
|---|---:|---:|---:|
| Strict1e-12 | .22814ms | .08339ms | **2.74× — FAIL** |
| Balanced1e-10 | .41291ms | .06925ms | 5.96× |

| Accuracy/method | Median ms | p95 ms | p99 ms | Worst observed ms |
|---|---:|---:|---:|---:|
| Strict/FISTA | .09683 | .64375 | 1.39190 | 2.26528 |
| Strict/Newton | .05604 | .14422 | .24626 | 1.05574 |
| Balanced/FISTA | .19415 | 1.22705 | 2.88935 | 5.37218 |
| Balanced/Newton | .05520 | .14210 | .23136 | 3.88121 |

Quantiles are medians of batch quantiles; worst is the observed maximum, not
WCET. Shared-host results are not hard real-time guarantees. Balanced FISTA took
more CPU despite fewer iterations (median67 vs112 strict). That cross-phase
timing anomaly was not diagnosed; do not infer a universal ordering or promotion
from the favorable balanced ratio. The frozen protocol was not retuned/rerun to
manufacture a pass.

Prepared-optimizer-only ratios are10.56× strict /6.82× balanced. They omit matrix
assembly, production scalar polish and reconstruction and are a different work
unit. They **cannot** replace the full-contact gate. FISTA timing is visibly
phase-dependent across these units; no claimed end-to-end speedup uses the
prepared-optimizer figures. Raw repeated results and per-class wall costs are
saved, including all outliers.

The predeclared gate requires all certificates/convergence, >=5× **full-contact**
CPU gain at both accuracies, and no worse observed full-solve maximum latency.
Strict full-contact gain is below5×, so **STOP**, regardless of kernel results.
This rejects this bounded implementation under this mandate; it is not a proof
that all second-order methods are unsuitable. No further algorithm, tuning,
production experiment or follow-up rescue mission is proposed.

## Reproduce and preservation

From repository root:

```sh
node --test research/scientific-rebuild/contact-solver-challenge/test.mjs
node research/scientific-rebuild/contact-solver-challenge/capture.mjs
node research/scientific-rebuild/contact-solver-challenge/experiment.mjs
node research/scientific-rebuild/procedural-terrain/tools/tire-baseline.mjs
```

Five mathematical/checker tests pass, including a finite-difference generalized
Jacobian, independent saturated-disc optimum, scalar/fixed/zero constraints,
explicit bounded failure and nonmutation. The original1,080-state A replay
passes. Before/after input bytes are checked for equality across the comparison.
All previous files remain byte-identical; the alternative is imported only by
this isolated research harness. No browser test is needed to claim unchanged
files, and no browser/integrated-vehicle performance claim is made.

`results/problems.json.gz` is the small immutable input corpus; `protocol.json`
records the gate; `verification.json` has every independent certificate;
`benchmark.json` has repeated CPU/latency data and STOP decision. Numerical
outputs should reproduce; wall/CPU timings depend on runtime and host. Source
hashes identify the tested implementation. Never overwrite historical fixtures.
