# Experiment 11 terrain physics — production endpoint path

The production vehicle adapter now accepts tested non-flat steps. No interactive terrain page or navigator release is included yet. Experiments 1–10 remain unchanged.

`candidateTerrainStep` uses a private clone and one eighteen-velocity drivetrain/contact solve per endpoint iteration. Vertical coordinates satisfy q1=q0+h*v1; there is no post-solve half-step position correction. Linear suspension uses its exact discrete potential gradient (average compression), gravity is constant, damping uses endpoint relative velocity, and terrain uses `discreteTerrainNormal`. Generalized force work, spring/gravity/terrain potential changes, damping and the existing contact-stage numerical loss close the full ledger. Neither the old flat tire-normal stage nor the suspension-only RK stage runs in parallel on this path. Flat conditions retain the unchanged Experiment 10 reference update.

The iteration is bounded at 80 attempts, with 1e-11 m contact-position, 1e-10 generalized-velocity, 1e-9 J local contact-work and 1e-7 J full-work thresholds. Failed iterations, energy checks and unsupported events leave the original state and observer history unchanged. Accepted samples are emitted once after commit. No energy correction impulse or tolerance increase is used.

## Verified results

`node --test research/scientific-rebuild/procedural-terrain/tests/*.test.mjs` passes 25 tests. They include the preserved historical failure, actual production inclined stepping, powered drivetrain/steering/braking, exact flat-state compatibility, unilateral opening/recontact, seeded small-amplitude terrain advancement and rejected-step rollback.

For the same historical 1 ms inclined initial state, residual changes from 0.02200968484 J to -4.62054e-14 J. The accepted spring/gravity/terrain changes are +4.31388e-8 / +1.01181e-10 / -2.62268477e-4 J. Generalized conservative/damper force work is +2.58800657e-4 J; physical damper work is +3.42458e-6 J. Backward-Euler numerical loss remains separately reported by the contact ledger.

On a plane z=0.001*x, 100 steps at 1 ms produce downhill velocity -0.00192478 m/s and a maximum full-step residual of 4.07e-12 J. Front/rear step-average normal loads are approximately 262.036/248.081 N per wheel. A 0.05 s refinement at 2/1/0.5 ms gives downhill velocities -0.00183680 / -0.00185790 / -0.00186865 m/s. A raised wheel releases and recontacts over 0.1 s with no tensile load. Full numerical output is in results/accepted-endpoint-regression.txt.

## Boundaries

The inherited vehicle/contact geometry is still small-angle with a fixed 0.5 m reference lever height. Terrain is vertical-gap elastic contact; reference stiffness is not a calibrated normal-gap tire coefficient on arbitrary slopes. Discrete forces represent step-average contact reactions, including opening/closing intervals. The generalized geometry mapping is linearized at each step; the actual endpoint potential is checked, and configurations that fail the work bound reject rather than silently accepting an inconsistent finite rotation.

Non-flat gearbox selector event crossings explicitly reject: rollback-safe event subdivision has not yet been integrated into the new endpoint path. Fixed selected gears, engine/clutch/steering/brake constraints are tested; flat terrain continues to use inherited gear-event handling. General terrain initialization/equilibrium, aggressive hills, long driving, large rotations, terrain rendering, UI and public deployment remain unverified. Successful short incline tests do not establish those capabilities.
