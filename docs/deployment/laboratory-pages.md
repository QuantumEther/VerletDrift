# Laboratory publishing

The navigator is static and lives at `lab/index.html`. Its sole content registry is `lab/experiments.json`; run `python3 tools/build-lab.py` after changing it. Keep existing IDs stable. Generated `lab/<id>/index.html` pages load the original experiments in an iframe with shared return navigation and an optional full-screen link. Direct legacy experiment URLs still work; the return bar belongs to the stable lab launch URL, not the standalone legacy page. No experiment or homepage source is edited.

## Observed publishing configuration

The current development branch is `scientific-rebuild/12-braking-and-tire-contact`. Git's remote HEAD points to `verlet_v17_smoke_backup`, not main. The only existing workflow, `.github/workflows/webpack.yml`, builds on main and does not publish Pages. The Pages settings API was denied by the environment proxy (403); the actual Pages publishing branch/folder or Actions configuration has not been established. Do not change the default branch or merge this development branch into the public application to publish the lab.

## Deployment steps requiring repository settings access

1. In GitHub Settings → Pages, identify the current publishing source and its exact branch/folder or workflow. Record the deployed commit before changing anything.
2. Prepare a site artifact from that current public publishing source, preserving its homepage and all assets byte-for-byte. Add this branch's `lab/` directory and the nine experiment directories referenced by the registry under `research/scientific-rebuild/`, preserving their relative paths and vendor assets. Include the entire contents of each selected experiment, not just its HTML. If those experiment paths already exist in the publishing source, compare them before overlaying; preserve older variants at their existing URLs unless updating them is intended. Do not overlay the development root index.html, js/, styles.css or package files onto the public simulator.
3. Verify the staged site under the `/VerletDrift/` prefix, including the original homepage. Compare its original homepage/assets against the deployed source. The hub and launch pages use relative URLs, so project-prefix hosting and refreshed directory URLs work.
4. If the existing source is a branch/folder, apply only the additive lab/experiment files to that publishing source through a reviewed change. If Pages already uses Actions, add this overlay to its existing artifact assembly. If changing to Actions is necessary, prepare a reviewed workflow using `actions/upload-pages-artifact` and `actions/deploy-pages`, Pages write and id-token write permissions, and the github-pages environment; switch the Pages source only after reviewing the complete staged artifact. This task does not change repository settings or publish a site.
5. Publish through the existing mechanism, then verify the URLs below and the original simulator. Retain the previous deployment for rollback.

## Stable routes

All routes are relative to `https://quantumether.github.io/VerletDrift/`:

- `lab/` — Laboratory Navigator
- `lab/braking/` — Braking & tire contact
- `lab/observatory/` — Tire-road observatory
- `lab/gearbox/` — Manual gearbox
- `lab/unsynchronized/` — Unsynchronized gearbox
- `lab/differential/` — Differential dynamics
- `lab/clutch/` — Clutch laboratory
- `lab/drivetrain/` — Drivetrain anatomy
- `lab/four-wheel/` — Four-wheel vehicle
- `lab/driving/` — Driving foundation

These are prepared public paths, not a claim of live deployment. The registry includes only existing HTML experiment entry points. It excludes headless reference models, native research and static reports.
