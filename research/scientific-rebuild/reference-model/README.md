# Isolated Zhang reference

No production imports, DOM, rendering or manual drivetrain. State order is
`[v,sigma,omega,Omega_r,Omega_f]` in m/s,m/s,rad/s,rad/s,rad/s.
The source's `r` is radius. Equations/provenance are the Mission 14 audit and
Mission 15 manifest in `docs/scientific-rebuild/`. The source approximation has a
known **FAIL** of global contact passivity; faithful reproduction is a separate claim.

Use Node (tested runtime recorded in results) and Python with NumPy, SciPy and
mpmath; installed versions are recorded by offline results. No npm additions.
Run commands from repository root, in order, stopping when a gate fails:

```sh
R=research/scientific-rebuild/reference-model
python3 "$R/fixtures.py"
node --test "$R/tire.test.mjs"
node --test "$R/model.test.mjs"  # includes counterexample and saved root cross-check
node "$R/cli.mjs" counterexample
python3 "$R/offline.py" roots
node "$R/cli.mjs" plan
node --test "$R/"*.test.mjs
python3 -u "$R/offline.py" references
node "$R/cli.mjs" validate
python3 "$R/offline.py" stability
node "$R/assess.mjs"
node "$R/benchmark.mjs"
```

On a fresh clone the checked-in independent root fixture supports the model test;
regenerate it with `offline.py roots` before the integration campaign. A failing
tire/counterexample/root gate prohibits dependent trajectories. References may
take minutes: there are 22 cases and two independent DOP853 refinements with
small maximum steps. No JavaScript model is called from Python. Python uses
nondimensional adhesion fraction and a 2x2 mass-matrix solve rather than the JS
expanded equations. `fixtures.py` independently evaluates Eq.20 at 70 digits.

Outputs are confined to this directory's `results/`; historical data is untouched.
Rerunning deliberately replaces this campaign's outputs. Retain provenance when
comparing runs. `validation.json` and `assessment.json` distinguish numerical
rate acceptance from the known physical failure. `references.json.gz` contains
fine time/state/signed-work rows; coarse-to-fine uncertainty is separately stored.
`rk4-traces.json.gz` contains all fixed-step state/work rows. CSV-like column names
and units are in validation metadata, no hidden position states. Counts for RK4,
reference/equilibrium and separate diagnostics are reported separately.

No solver silently clamps/teleports/resets invalid trajectories. Invalid RK stages
return the last accepted state, failing stage/time, field/value/bound, attempted
step and operation counts. Same-environment deterministic replay excludes CPU
clocks. No cross-platform bitwise promise.

Benchmark segments restart at a refined equilibrium every 80 steps only to keep
fixed-size timing samples valid, explicitly outside sample timing; this is **not**
a continued trajectory validation or a repair of an exited run. No speedup against
legacy bisection counts is claimed. Heap observations include GC and timing data;
they do not measure allocation bytes per call.
