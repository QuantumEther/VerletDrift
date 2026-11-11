# Balloon milestone 1 — incomplete system

Presentation-only prototype: three crimson ellipsoid sizes, a bounded instanced pool, world-space positions and bounded swept impact events. Original balloon event concepts and liquid laboratory analytic topology were inspected. No liquid algorithms have yet been ported.

Collision currently uses a conservative sphere around the moving chassis, not the actual body/wheel geometry. Rotational sweeps and long frame gaps are not resolved. This must be refined before claiming accurate vehicle collisions. No impulses affect the car.

Splash membranes, filaments, droplets, persistent wet deposition, TSL liquid shading, UI controls and real-browser/performance verification are not implemented in this milestone. Native standard physical material is used for balloons; backend-specific appearance has not yet been verified. This is not completion of the requested mission.
