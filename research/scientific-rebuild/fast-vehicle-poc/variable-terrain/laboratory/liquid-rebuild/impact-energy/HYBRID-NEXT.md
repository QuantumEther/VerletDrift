# Decision: stop extending this live PBF pilot

The single bounded correction failed. It is retained only as an isolated negative experiment; it is not imported by the vehicle or balloon laboratory. No second live pressure solver or graphical rewrite is started.

Prepare **one offline physical bake, then GPU playback**, with ballistic secondary spray and volume-accounted deposition. [hybrid-bake-contract.json](hybrid-bake-contract.json) freezes the first experiment and data exchange. It is deliberately marked NOT BAKED; it is not a native solver input or a claim of a working replacement.

A Blender-independent candidate is [SPlisHSPlasH](https://github.com/InteractiveComputerGraphics/SPlisHSPlasH/tree/dba6b26b9387ab6bdd187d6df0a7c9d490d03500), whose inspected README documents DFSPH and particle exports. The underlying method is Bender & Koschier, *Divergence-Free Smoothed Particle Hydrodynamics*, SCA 2015, DOI [10.1145/2786784.2786796](https://doi.org/10.1145/2786784.2786796). Neither the full paper nor a completed solver execution is claimed here. MIT applies to the library; dependency licenses require separate review. This is a defensible candidate, not a promise of passivity or an accepted bake.

The bulk motion must come from the physical export, not a radial animation. Export particle IDs, masses, positions and velocities, boundary work and dissipative terms before extracting a render surface. Secondary droplets inherit resolved local velocity and **remove the same mass from the bulk**. Landing moves that mass to world-indexed wetness/shallow-volume tiles. Density integration, physical mass and enclosed surface volume remain separate checks. GPU playback uses bounded frame buffers and the existing thickness/absorption/Fresnel optics; it does not run a second vehicle simulator.

Initially support one validated impact and ground orientation. A baked sequence cannot faithfully respond to arbitrary new terrain or be freely time-scaled without changing gravity and momentum. Do not sell interpolated bakes as general live fluid simulation. Expand neither the event library nor the optics until this one coherent body passes accounting, refinement and close-range visual review.

The reproduced Blender initialization crash remains a separate environment blocker, recorded under `../recovery/`. No Blender settings were changed here, no bake was produced, and the current working balloon effects remain the playable implementation.
