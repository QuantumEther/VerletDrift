# Physics Recovery Mission 02

- [Full analysis and Mission 03 recommendation](REPORT.md)
- [Before/after comparisons and figures](BEFORE_AFTER.md)
- [Parameter definitions and v1 → v2 migration](PARAMETERS.md)
- [Validation, work accounting, reproduction and limitations](VALIDATION.md)
- [Baseline data](before.json), [corrected data](after.json), and [split-contact negative control](split-contact-control.json)
- [Evidence manifest](MANIFEST.json)
- [Reports and evidence ZIP](../mission-02.zip)

Working branch: `recovery/mission-02-tire-dynamics`. Base: completed Mission 01 `74440cd`. Test-first commit: `10d39d2`. Source fix: `dbd2d1e`. No merge into the base, audit branch, or main.

All 295 unit tests and 10 selected browser tests pass. Results establish mathematical consistency and measured numerical behavior, with stated limitations; they are not real-world tire calibration. Source code, automated tests and experiment runners are committed in the repository alongside this unpacked evidence. The ZIP contains this documentation/evidence directory; use a repository checkout for source/test reproduction.
