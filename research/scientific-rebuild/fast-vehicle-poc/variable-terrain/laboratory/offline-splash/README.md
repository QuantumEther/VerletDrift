# Native DFSPH export checkpoint

The upstream solver built successfully at dba6b26b9387ab6bdd187d6df0a7c9d490d03500. `smoke.cpp` executed DFSPH for 251 liquid particles and exported 11 frames (2761 particle records) with positions, velocities, individual masses and actual solver timestamps. End time was 0.046 s; automatic timestep adaptation remains enabled. Output was finite. This is an installation/export smoke test, not an accepted impact, mass/energy audit or replacement effect.

Python wheel 2.19.1 segfaulted on import on Python 3.12 with both NumPy 2.5.4 and 1.26.4. Native library execution avoids that blocker and does not need Blender, X11 or a browser.

Build against the pinned upstream source using `SPH_LIBS_ONLY=ON`, then link `smoke.cpp` against SPlisHSPlasH and Utilities. The accompanying CMake file supplies that wrapper; its combined-project configuration still needs validation (the executed build added the equivalent executable to the upstream CMake project). Use an ordinary user-owned build directory. Keep Ninja on PATH for dependency builds.

Next required work: sampled moving boundary and ground, viscosity/surface tension configuration, signed boundary-work accounting, physical refinement, compact export and actual laboratory rendering. None of those stages is claimed complete here. Existing laboratory effects are unchanged.

## Impact preview checkpoint

`impact.cpp` adds sampled ground and a prescribed 4 m/s moving planar boundary using upstream Akinci2012 boundary handling. The executed native run exported 121 frames through 0.1676 s, retaining 251 markers and 5.509952 kg. `impact-frames.json` contains timestamped positions and velocities. `index.html` displays those recorded positions as instanced spheres using the existing Three.js WebGL module. Serve the repository root and open this directory's `index.html`.

This preview has not been browser-tested or integrated into the main laboratory. It is not an accepted liquid surface or rupture: boundary-work accounting, viscosity/surface-tension configuration, refinement, optical reconstruction and performance validation remain pending. The existing balloon effects are unchanged. The impact executable was built by adding an equivalent target to the upstream native build; the wrapper CMake configuration still requires independent validation.
