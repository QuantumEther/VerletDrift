# Laboratory DOM inventory

Generated from the audited HTML and literal references in top-level JavaScript. Computed ID groups are described in the audit.

| HTML line | Element | ID / data attributes | Initial attributes | JS references (first eight) |
|---:|---|---|---|---|
| 5 | select | terrain |  | main.js:40, main.js:46, view3d.js:115, view3d.js:116, view3d.js:117, view3d.js:118 |
| 5 | input | terrain-seed | type=number, value=23, step=1 | main.js:40, main.js:46 |
| 5 | input | terrain-amplitude | type=number, value=0.15, min=0, max=0.5, step=.01 | main.js:40, main.js:46 |
| 5 | input | terrain-roughness | type=number, value=.5, min=0, max=1, step=.1 | main.js:40, main.js:46 |
| 5 | button | regenerate |  | main.js:46 |
| 7 | select | vehicle-select |  | main.js:16, main.js:40, main.js:47 |
| 7 | p | vehicle-info |  | main.js:47 |
| 8 | input | ignition | type=checkbox, checked | controls.js:8 |
| 9 | output | throttle-value |  |  |
| 9 | input | throttle | type=range, min=0, max=1, step=.01, value=.65 | controls.js:8, main.js:58 |
| 10 | button |  | data-drive=w |  |
| 10 | button |  | data-drive=s |  |
| 10 | button |  | data-drive=a |  |
| 10 | button |  | data-drive=d |  |
| 10 | button |  | data-drive=  |  |
| 10 | button |  | data-drive=r |  |
| 10 | pre | engine-live |  | main.js:73 |
| 11 | output | engagement-value |  |  |
| 11 | input | engagement | type=range, min=0, max=1, step=.01, value=.5 | controls.js:8, main.js:58 |
| 11 | button |  | data-clutch=0 |  |
| 11 | button |  | data-clutch=.3 |  |
| 11 | button |  | data-clutch=1 |  |
| 12 | select | drivetrain-mode |  | controls.js:8, main.js:16, main.js:40, main.js:47, main.js:48 |
| 12 | select | gear-request | disabled | controls.js:5, controls.js:8, main.js:47, main.js:48 |
| 12 | p | gear-status |  | main.js:74 |
| 13 | button | rest |  | main.js:46 |
| 13 | button | pause |  | main.js:49, main.js:119, main.js:124 |
| 13 | button | coast |  | main.js:46 |
| 15 | h2 | vehicle-title |  | main.js:47 |
| 16 | details | engine-audio-panel | open | main.js:25 |
| 16 | button | audio-enable |  | main.js:26, main.js:34 |
| 16 | button | audio-resume |  | main.js:30 |
| 16 | button | audio-record |  | main.js:31 |
| 16 | select | audio-mode |  | main.js:32, main.js:33 |
| 16 | input | audio-master | type=range, min=0, max=1, step=.01, value=.6 | main.js:32, main.js:33 |
| 16 | input | audio-engine | type=range, min=0, max=2, step=.01, value=1 | main.js:32, main.js:33 |
| 16 | input | audio-sample | type=range, min=0, max=2, step=.01, value=.6 | main.js:32, main.js:33 |
| 16 | input | audio-blend | type=range, min=0, max=1, step=.01, value=.12 | main.js:32, main.js:33 |
| 16 | input | audio-starter | type=checkbox, checked | main.js:32, main.js:33 |
| 16 | select | audio-low |  | main.js:26 |
| 16 | select | audio-take |  | main.js:26 |
| 16 | select | spatial-mode |  | main.js:28, main.js:29 |
| 16 | input | spatial-distance | type=checkbox, checked | main.js:28, main.js:29 |
| 16 | input | spatial-atmosphere | type=checkbox, checked | main.js:28, main.js:29 |
| 16 | input | spatial-direction | type=checkbox, checked | main.js:28, main.js:29 |
| 16 | input | spatial-cabin | type=checkbox, checked | main.js:28, main.js:29 |
| 16 | input | spatial-reference | type=number, min=.1, max=20, value=1 | main.js:28, main.js:29 |
| 16 | input | spatial-max | type=number, min=20, max=500, value=100 | main.js:28, main.js:29 |
| 16 | input | spatial-temperature | type=number, min=-30, max=50, value=20 | main.js:28, main.js:29 |
| 16 | input | spatial-humidity | type=number, min=0, max=100, value=50 | main.js:28, main.js:29 |
| 16 | select | audio-capture-route |  | main.js:31 |
| 16 | pre | spatial-diagnostics |  | main.js:34 |
| 16 | p | audio-status | role=status | main.js:31, main.js:34 |
| 16 | pre | audio-diagnostics |  | main.js:34 |
| 17 | input | smoke-enable | type=checkbox, checked | main.js:16, main.js:43, main.js:54 |
| 17 | input | smoke-density | type=range, min=0, max=5, step=.1, value=2 | main.js:16, main.js:43, main.js:54 |
| 17 | input | smoke-opacity | type=range, min=0, max=2, step=.1, value=1.15 | main.js:16, main.js:43, main.js:54 |
| 17 | input | smoke-size | type=range, min=.5, max=3, step=.1, value=1.4 | main.js:16, main.js:43, main.js:54 |
| 17 | input | smoke-lifetime | type=range, min=.5, max=3, step=.1, value=1.4 | main.js:16, main.js:43, main.js:54 |
| 17 | input | smoke-dispersion | type=range, min=0, max=2, step=.1, value=1 | main.js:16, main.js:43, main.js:54 |
| 17 | pre | smoke-stats |  | main.js:65 |
| 17 | select | renderer-backend |  |  |
| 17 | select | graphics |  | main.js:43, main.js:52, main.js:53, main.js:54 |
| 17 | input | exposure | type=range, min=.25, max=2, step=.05, value=1 | main.js:52, main.js:53 |
| 17 | input | environment-intensity | type=range, min=0, max=3, step=.1, value=1 | main.js:52, main.js:53 |
| 17 | input | environment-background | type=checkbox | main.js:52, main.js:53 |
| 17 | input | sunlight | type=range, min=0, max=6, step=.1, value=3 | main.js:52, main.js:53 |
| 17 | input | environment-path | type=text, value=./german_town_street_2k.exr | main.js:16, main.js:55 |
| 17 | button | load-environment |  | main.js:55 |
| 17 | input | terrain-detail | type=checkbox, checked | main.js:52, main.js:53 |
| 17 | input | contact-shading | type=checkbox, checked | main.js:52, main.js:53 |
| 17 | input | roadside-detail | type=checkbox, checked | main.js:52, main.js:53 |
| 17 | span | graphics-status |  | main.js:67 |
| 18 | select | appearance |  | main.js:43, main.js:56 |
| 18 | span | asset-status | role=status | main.js:68 |
| 19 | select | camera | aria-label=Camera | main.js:16, main.js:43, main.js:57 |
| 19 | select | render-scale | aria-label=Render resolution | main.js:43, main.js:51, main.js:114, main.js:121, main.js:124 |
| 19 | button | reset-camera |  | main.js:57 |
| 19 | canvas | perspective | tabindex=0, width=1000, height=590, aria-label=Performance terrain vehicle | main.js:26, main.js:43 |
| 20 | input | xray | type=checkbox | main.js:16, main.js:84 |
| 20 | input | contact-overlay | type=checkbox | main.js:16, main.js:84 |
| 20 | input | show-marks | type=checkbox, checked | main.js:16, main.js:84 |
| 20 | input | record-contacts | type=checkbox, checked | main.js:16, main.js:50, main.js:62 |
| 20 | button | clear-tracks |  | main.js:57 |
| 21 | p | live-performance | role=status | main.js:70 |
| 21 | p | warning | role=alert | main.js:43, main.js:44, main.js:78, main.js:84 |
| 21 | span | clock-status |  | main.js:71 |
| 22 | div | engine-dial |  | main.js:22 |
| 22 | div | input-dial |  | main.js:22 |
| 22 | div | speed-dial |  | main.js:22 |
| 22 | p | clutch-reading |  | main.js:75 |
| 22 | pre | energy-reading |  | main.js:76 |
| 23 | canvas | friction-circles | width=600, height=135 | main.js:77 |
| 23 | tbody | contacts |  | main.js:77 |
| 24 | input | balloon-count | type=number, min=0, max=128, value=24 | main.js:128 |
| 24 | input | balloon-min | type=number, min=.08, max=1, step=.05, value=.18 | main.js:128 |
| 24 | input | balloon-max | type=number, min=.08, max=1, step=.05, value=.48 | main.js:128 |
| 24 | input | balloon-intensity | type=range, min=.1, max=3, step=.1, value=1 | main.js:128 |
| 24 | input | balloon-persistence | type=number, min=1, max=600, value=90 | main.js:128 |
| 24 | button | balloon-reset |  | main.js:128 |
| 24 | select | diag-mode |  | main.js:15, main.js:16, main.js:83, main.js:114, main.js:121, main.js:124 |
| 24 | div | diag-components |  |  |
| 24 | input | diag-terrain | type=checkbox | main.js:16, main.js:83, main.js:113, main.js:120 |
| 24 | input | diag-vehicle | type=checkbox | main.js:16, main.js:83, main.js:113, main.js:120 |
| 24 | input | diag-lighting | type=checkbox | main.js:16, main.js:83, main.js:113, main.js:120 |
| 24 | input | diag-tracks | type=checkbox | main.js:16, main.js:83, main.js:113, main.js:120 |
| 24 | input | diag-other | type=checkbox | main.js:16, main.js:83, main.js:113, main.js:120 |
| 24 | input | diag-gpu | type=checkbox | main.js:16, main.js:83, main.js:113, main.js:120 |
| 24 | input | diag-submit | type=checkbox, checked | main.js:16, main.js:84, main.js:113, main.js:120 |
| 24 | input | diag-scene | type=checkbox, checked | main.js:16, main.js:84, main.js:113, main.js:120 |
| 24 | input | diag-panel | type=checkbox, checked | main.js:16, main.js:84, main.js:113, main.js:120 |
| 24 | input | diag-smoke | type=checkbox, checked | main.js:16, main.js:84, main.js:113, main.js:120 |
| 24 | button | diag-audit |  | main.js:126 |
| 24 | button | diag-audit-cancel | disabled | main.js:106, main.js:119, main.js:124 |
| 24 | button | diag-audit-download | disabled | main.js:107, main.js:124 |
| 24 | pre | diag-audit-status |  | main.js:121, main.js:124, main.js:126 |
| 24 | input | diag-commit | type=text, placeholder=40-character commit hash | main.js:16 |
| 24 | input | diag-hardware | type=text, placeholder=GPU and driver version | main.js:16 |
| 24 | select | diag-duration |  | main.js:19 |
| 24 | button | diag-start |  | main.js:19 |
| 24 | button | diag-download |  | main.js:20 |
| 24 | pre | diag-output |  | main.js:18, main.js:87 |
