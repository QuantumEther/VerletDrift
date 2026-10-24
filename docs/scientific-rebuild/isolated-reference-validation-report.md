# Mission 16 — Isolated reference validation

## Verdict: PARTIALLY VERIFIED

The published governing equations and the frozen moving-domain experiments are executable and numerically verified. All 16 standalone tests, two equilibrium refinements, 22 independent-reference gates and 88 RK4 comparisons passed their specified numerical requirements. Full contact passivity remains a **known physical FAIL**. A source-level inconsistency in the ordinary-cornering row of Table 2 prevents claiming exact reproduction of every printed value: attribution remains **UNRESOLVED**. No physics or parameters were changed to resolve it.

Branch: `scientific-rebuild/03-isolated-reference`, directly from Mission 15 `16881f487e5da859263efb2152814caab648ae0a`. Numerical code tested at **`0bf59dc46f9309eb7f75f31b97771beee0bdc6f2`** (core implementation `6168e2a`); benchmark/count/test additions included in that commit. Subsequent delivery changes add constitutive tests, source-table analysis, results and this report, not numerical kernels. Working tree/source hashes are retained in `results/provenance.json`. Only `research/scientific-rebuild/reference-model/` and this documentation were added. No production imports, DOM, renderer, manual drivetrain, control system, production modifications or merge.

## Mathematical fidelity and ordered gates

Source: the same attached 51-page Zhang–Takács–Orosz manuscript verified in Missions 14–15, SHA-256 `d90caa7ac9a70cb3b767c6475feb30b913989aa2bb64d921adbfbc182ac80479`, DOI 10.1080/00423114.2025.2522391. Eq.(7)–(8), p.9; slips (9)–(13), pp.11–12; loads/adhesion (15)–(17), p.13; branches/forces/moments (18)–(20), p.14; Table 1; Appendices A/B. Optional pose Eq.(6) was omitted: no effect on essential mechanics. The isolated files cite these equations; source notation/radius meanings are retained.

First implemented `tire.mjs`, compared to eight independent 70-digit mpmath fixtures (`fixtures.py/json`), and passed zero-slip, stiffness, signs, reflection, combined-slip, total sliding and continuity tests. No fitting, root solving, force clamp, force memory or fallback law. Total sliding reports lambda=0 as the physically absent adhesion region, not as a state clamp or an adhesion-branch calculation with negative source lambda. Exact zero slip is a limiting return, not a dead zone. Dimension checks include length-rescaling homogeneity (force invariant/moment scales) and documented SI powers.

Then reproduced the counterexample and checked the derivative/roots before trajectory integration. Initial test infrastructure treated IEEE -0 and +0 as different; the straight-invariance assertion was corrected to numerical equality without changing the equations or adding a tolerance. Python roots use dimensionless adhesion fraction and a 2x2 mass-matrix solve; JS uses the expanded Eq.(7). They do not call each other. Python performs no production imports. Parameters remain the source Table 1, with explicit g=9.81 assumption. No tire gate failed physically and no unauthorized correction was made.

## Equilibria and local behavior

Offline damped Newton, maximum 50 iterations, accepted only inside the frozen seed windows. Both converged in three updates. Residual histories, all Jacobian entries, two finite-difference increments, eigenvalue refinement uncertainty, tire forces/slips/moments, counts and state margins are saved in `equilibria.json` and `assessment.json`. Each root refinement/diagnostic bundle used 59 RHS/118 tire evaluations, separate from stepping.

### cornering

Refined `[v,sigma,omega,Omega_r,Omega_f]`: `[14.959551725963632, -0.8550304834498416, 0.2904059047049009, 50.50053398836876, 49.51138613566645]`.

Residuals: `[-2.2964963264371363e-13, 7.558398351648066e-13, -5.668151784041634e-13, 3.739033773955371e-12, 3.706547929135812e-11]`. Scaled residual `5.66815e-07` (required <=1e-3). Eigenvalues `[real,imag]`, 1/s: `[[-74.2266118467581, 0.0], [-68.43948771274351, 0.0], [-0.06994980264167769, 0.0], [-1.6053667300714527, 1.6969556743143195], [-1.6053667300714527, -1.6969556743143195]]`. Max Jacobian increment-refinement difference `1.25556e-06`; max eigenvalue shift `3.36163e-07`.

### drifting

Refined `[v,sigma,omega,Omega_r,Omega_f]`: `[13.631677027351403, 4.042351630163378, -0.3867263269612893, 54.63526071431814, 46.32804373084742]`.

Residuals: `[-6.661338147750939e-16, -1.7763568394002505e-15, 2.370376877515499e-16, 1.0105496686365869e-13, -0.0]`. Scaled residual `2.37038e-10` (required <=1e-3). Eigenvalues `[real,imag]`, 1/s: `[[-63.20203297698549, 0.0], [-10.21995277663988, 0.0], [-2.694028741808106, 0.0], [0.01992247229783121, 0.0], [1.6598303798937586, 0.0]]`. Max Jacobian increment-refinement difference `5.58528e-07`; max eigenvalue shift `1.82818e-07`.

Ordinary cornering is locally stable. Drift has positive eigenvalues (~0.01992 and 1.65983/s), rear sliding/front adhesion, sideslip ~16.5 degrees and yaw opposite steering. Perturbation trajectories are not held by a controller. Independent central perturbation dynamics at 0.25 s give the dominant ordinary multiplier 0.982664455 versus linearized prediction 0.982664567; drift multiplier 1.514306624 versus 1.514306525. Full finite-amplitude/linearized matrix differences, even-remainder uncertainty indicators and 0.05 s results are in `stability.json`; these support local stability consistency, not a chaos or global stability claim.

### Printed-table discrepancy

The original PDF Table 2 p.18 was visually checked: ordinary front Omega is printed **49.75 rad/s**. At equilibrium Eq.(27) requires front Fx=0; Eq.(20) with positive parameters then requires Sx=0. Eq.(13) applied to the printed v=14.96, sigma=-0.84, omega=0.29, gamma=5 degrees gives Vxf=14.8551370 m/s; r Omega_f is 14.925 m/s. Under nearest-0.01 rounding of all three state entries, the center-speed interval is [14.8492845,14.8609896], while the printed rotor interval implies [14.9235,14.9265]. They do not overlap. This cannot be explained by gravity, because the velocity-to-slip relation does not depend on g. Unpublished parameter precision, author data/code or a table error may explain it; none is assumed.

The refined ordinary front Omega=49.5113861 is inside the preauthorized +/-2 rad/s root-identification window and satisfies the published governing equations. Thus the equation-root gate passed and dependent numerical validation was legitimate; exact printed-number consistency did not pass. `source-table-audit.json` preserves the mismatch and raw seed residuals for both cases. The drift entry is not contradicted by this particular interval test. The smallest source-resolution action is to obtain the authors' unrounded Table 2 states/configuration; do not tune our model to the table.

## Independent numerical reference and RK4 convergence

Independent SciPy DOP853, max step 1/6400 s, rtol 1e-12 and component atol 1e-4 times the Mission 15 allowances; repeat max step 1/12800, rtol 2.5e-13 and quartered atol. Five signed work ports are integrated alongside the five mechanics states. Refinement checks every 1/800 s and requires <=0.01 component allowance and <=1e-5 J work uncertainty. The reference uses independently transformed tire equations and inertial solution, not RK4 at a smaller step or a Python wrapper of JS.

All 22 reference cases passed; maximum scaled refinement difference `5.34017e-08`, maximum independent energy residual `2.8381e-08 J`. Total offline integration wall time was `151.639 s` on the recorded cloud environment; it is not a real-time solver benchmark.

The prescribed 22 cases are ordinary equilibrium 5 s, ten ordinary +/- component perturbations 2 s each; drift equilibrium 1 s and ten drift perturbations 0.25 s each. No optional longer drift extension or extra driving family was run. Errors use max-in-time component scales [1e-4,1e-4,1e-6,1e-3,1e-3] in stated SI units. Maximum normalized error must be <=1; integrated energy residual <=0.001 J.

|RK4 Hz|Passed / cases|Maximum normalized state error|Maximum energy/work residual J|
|---:|---:|---:|---:|
|100|22 / 22|0.0550983125|4.81204503e-05|
|200|22 / 22|0.00258860679|2.32091941e-06|
|400|22 / 22|0.00013893591|1.28475919e-07|
|800|22 / 22|8.04182321e-06|2.09298037e-08|

All 88 comparisons passed; no authorized trajectory exited the box or froze. Ordinary longitudinal-perturbation observed orders were ~4.41,4.22,4.11 under refinement; drift ~4.34,4.19,4.09. Do not infer order from equilibrium roundoff. No trajectory crossed a tire branch in this small perturbation campaign: continuity was checked separately at pure/combined constitutive boundaries, but global fourth-order behavior across dynamic branch events is **UNRESOLVED**. Accuracy is validated only for these cases/rates/domain, not arbitrary five-state motions near the cutoff.

42,750 RK4 steps completed, zero rejected in the two trajectory families, 171,000 integration RHS calls and 342,000 integration tire calls. Each completed step has exactly four RHS/eight tires. Benchmark categories also measure actual aggregate operation totals: each RK category has 50000 completed steps, 200000 RHS and 400000 tire calls, with no rejected samples. Separate endpoint diagnostics add their own counters; Python equilibrium/reference counts are separately retained. An explicit invalid-stage unit test confirms last accepted state preservation, stage/failure reporting and no clamping. Nonfinite states are FAIL, envelope violations OUT OF DOMAIN. Replayed fixed inputs/configuration reproduce bitwise-identical mechanical/work rows within this numeric environment; no cross-platform bitwise guarantee.

## Energy: three different outcomes

- Equation reproduction: **PASS**, counterexample contact power `+0.2308529702430956 W` versus independent `+0.230852970243096 W`. Rear/front forces, moments, signed force/moment work and energy-gradient derivative are saved in `counterexample.json`.
- Force-work dissipation: **PASS** under the source parameters/domain. Positive full moment work is not counted as force dissipation.
- Full global contact passivity: **known FAIL**, retained explicitly. This is not a JS bug, controller, RK4 error or proof of physical realism.

Constant-steer kinetic energy includes p sigma omega and both rotor inertias. Derivative diagnostics compare its gradient dot RHS to Md Omega_r plus two contact-force and two moment powers. Maximum validation-point identity residual was ~1.92e-11 W. RK4 integrates each signed port with stage weights/compensated accumulation; no work is inferred from endpoint energy change. Positive and negative contact work are retained separately. `diagnostic-samples.json.gz` exposes 20 Hz endpoint force/moment/slip/load/energy/power data; every validation endpoint was evaluated for the maxima, and full state/work rows permit diagnostic reconstruction. Full contact identity closure is not a passivity proof.

## Measured computational cost

Node `v24.19.0`, V8 `13.6.233.17-node.51`, `AMD EPYC 9V74 80-Core Processor`, `linux 6.18.55`, 5 visible cores. Power mode not controlled/known. IEEE binary64, no additional runtime flags. 10000 RHS warmup per family, then five serial repetitions of 10000 samples/category. 800 Hz benchmark segments reset at refined equilibrium every 80 steps outside timing; these resets are disclosed timing fixtures, never repairs of validated trajectories.

|Family / category|Mean ms|Median ms|p95 ms|p99 ms|Worst ms|
|---|---:|---:|---:|---:|---:|
|cornering / timer|6.21199e-05|5e-05|7e-05|0.00013|0.220588|
|cornering / tire|0.00116785|0.000942|0.001712|0.002874|0.861759|
|cornering / rhsMechanics|0.00402677|0.003445|0.004477|0.007301|1.46575|
|cornering / rhsDiagnostics|0.00414283|0.003525|0.005869|0.008803|2.70504|
|cornering / rkMechanics|0.0173956|0.015442|0.020911|0.060109|0.857723|
|cornering / rkLedger|0.0184635|0.016505|0.026099|0.054591|2.37158|
|cornering / reportSerialization|0.00137516|0.001312|0.001432|0.001622|0.29015|
|drifting / timer|6.46453e-05|6e-05|7.1e-05|8.1e-05|0.13513|
|drifting / tire|0.00101484|0.000921|0.001011|0.001583|1.36929|
|drifting / rhsMechanics|0.00386275|0.003375|0.005879|0.00705|0.430248|
|drifting / rhsDiagnostics|0.00384238|0.003505|0.004036|0.005728|0.549655|
|drifting / rkMechanics|0.0159172|0.014852|0.016604|0.034131|0.417299|
|drifting / rkLedger|0.0170405|0.015924|0.017657|0.035642|0.427515|
|drifting / reportSerialization|0.00137329|0.001262|0.001412|0.001663|1.51902|

`rkMechanics` omits energy/ledger reporting; `rkLedger` retains it, with identical mechanical results. `rhsDiagnostics` versus `rhsMechanics` exposes diagnostic cost; `reportSerialization` is JSON encoding of a fixed step record, excluding disk. Pure tire timing uses a fixed mixed-slip point, not an entire drive workload. Timer baseline is reported without subtracting noisy tails. Rare cloud/GC/scheduling outliers remain (cornering full-ledger worst 2.37 ms). These measurements support a small isolated compute cost, not hard real-time guarantees, full-browser FPS, or a speedup ratio against 12,168 legacy bisections.

Arrays/contact objects and diagnostics allocate; heap start/end/observed-peak values are in `benchmark.json`, including sample buffers and GC. No allocation bytes-per-call or long-run leak claim is made. Independent DOP853 cost is separate from all JS categories. Runtime/library versions and operation counts are retained in machine-readable files.

## Outcomes, reproducibility and scope

|Claim|Outcome|
|---|---|
|Analytical tire fixtures, units/homogeneity, source signs/moments|PASS|
|Counterexample, straight invariance, mirror/order, energy identity, replay|PASS|
|Governing-equation roots inside frozen windows, Jacobians/local behavior|PASS|
|Printed ordinary Table 2 row consistent beyond rounding|FAIL; underlying cause UNRESOLVED|
|Independent-reference refinement and specified RK4 trajectories|PASS (22 and 88 cases)|
|Domain failure policy|PASS intentional rejection test; no authorized trajectory exited|
|Full contact passivity|Known physical FAIL|
|Global convergence across dynamic branch crossings or arbitrary inputs|UNRESOLVED / not tested|
|Production suitability/real-tire fidelity/manual drivetrain|Not established; outside scope|

All commands/dependencies are in the [standalone README](../../research/scientific-rebuild/reference-model/README.md). No new npm packages or dependency trees were committed. Python uses NumPy/SciPy/mpmath only offline. Result paths: `fixtures.json`; `results/equilibria.json`, `plan.json`, `counterexample.json`, `references.json.gz`, `validation.json`, `rk4-traces.json.gz`, `diagnostic-samples.json.gz`, `stability.json`, `assessment.json`, `source-table-audit.json`, `benchmark.json`, `provenance.json`. Compressed trace metadata/columns/units are in validation and plan. Historical artifacts are never overwritten; campaign reruns explicitly replace only this directory's outputs.

The implemented reference is inspectable and executable without the game. It preserves the source approximation rather than improving its physics. No stopping, restart, engine, clutch, gears, differential, braking, independent wheels, free steering, UI, shaders or rendering was added. Source parameter/equation changes were neither needed nor allowed. The discovered printed-table discrepancy is not repaired. The final verdict remains conservative because exact correspondence to that source entry is unresolved even though the governing-equation experiment passed its frozen gates.

**PARTIALLY VERIFIED**
