# WebGPU migration milestones

Branch PERFORMANCE_2. Initial isolated upgrade vendors Three.js 0.180.0 (MIT) with core, WebGL, WebGPU and TSL builds. The laboratory HTML import map maps the legacy core URL to r180 for this page only; historical pages retain r160. No physics, assets or audio changed. Existing addon loaders currently remain legacy and need explicit compatibility testing/upgrading before claiming migration completion.

Executed `node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/viewport-browser.mjs`: passed responsive viewport/control checks on Chromium at three viewport sizes under upgraded WebGL. This is not full visual parity validation. The WebGPU build is available but not selected or integrated; there is no claimed WebGPU success or measured backend comparison yet. Custom GLSL effects and direct WebGL diagnostics still require migration. Do not treat this intermediate milestone as the completed user mission.
