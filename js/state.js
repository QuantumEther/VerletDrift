// =============================================================
// STATE — single source of truth for all mutable simulation data
// =============================================================
// Every other module reads from and writes to this object.
// No logic lives here — only data and initial values.
// Import constants so initial values are kept in sync with the
// single source of truth for all numeric parameters.
// =============================================================

import {
  IDLE_RPM,
  REDLINE_RPM,
  STALL_RPM,
  PEAK_ENGINE_TORQUE_NM,
  DEFAULT_BOUNCINESS,
  DEFAULT_STALL_RESISTANCE,
  DEFAULT_TIRE_FRICTION_COEFF,
  DEFAULT_ROLLING_RESISTANCE_COEFF,
  DEFAULT_AERO_DRAG_COEFF,
  DEFAULT_MAP_WIDTH,
  DEFAULT_MAP_HEIGHT,
  COG_HEIGHT,
  DEFAULT_SIM_FPS,
  CAR_MASS_KG,
  WHEEL_RADIUS,
  FINAL_DRIVE_RATIO,
  BRAKE_FORCE,
  IDLE_CREEP_FORCE,
  PACEJKA_B,
  PACEJKA_C,
  TIRE_PEAK_SLIP_ANGLE_DEG,
  TIRE_PEAK_SLIP_RATIO,
  MAX_FRONT_WHEEL_ANGLE_RAD,
  STEERING_DRAG_RANGE_PX,
  STEERING_SELF_CENTER_RATE,
  PNEUMATIC_TRAIL,
  STEERING_COLUMN_INERTIA,
  STEERING_VISCOUS_DAMPING,
  STEERING_COULOMB_FRICTION,
  CONSTRAINT_ITERATIONS,
  CHECKERBOARD_TILE_SIZE_PX,
  MAX_TRAIL_ARROWS,
  GEAR_RATIOS,
  DEFAULT_YAW_DAMPING,
  DEFAULT_MAX_BALLOONS,
  DEFAULT_BALLOON_RESPAWN_RATE,
} from './constants.js';

// =============================================================
// The single exported state object.
// Every mutable value in the simulation lives as a property here.
// Physics functions update this; the renderer reads from it.
// =============================================================
const state = {

  // -----------------------------------------------------------
  // CAR BODY — four Verlet particles at wheel positions
  // Wheel naming convention:
  //   frontLeft  = FL (driver's left, looking forward)
  //   frontRight = FR
  //   rearLeft   = RL
  //   rearRight  = RR
  // Each particle stores current position and previous position.
  // Velocity is always DERIVED as (current - previous) / dt.
  // prevX/Y are initialised equal to x/y so initial velocity = 0.
  // -----------------------------------------------------------
  wheels: {
    frontLeft:  { x: 0, y: 0, prevX: 0, prevY: 0 },
    frontRight: { x: 0, y: 0, prevX: 0, prevY: 0 },
    rearLeft:   { x: 0, y: 0, prevX: 0, prevY: 0 },
    rearRight:  { x: 0, y: 0, prevX: 0, prevY: 0 },
  },

  // -----------------------------------------------------------
  // BODY — derived quantities recomputed every physics step
  // These are cache values: never set manually, always derived
  // by computeBodyDerivedState() at the top of each sub-step.
  // Reading these outside of a physics step will give stale data
  // from the previous step, which is fine for rendering.
  // -----------------------------------------------------------
  body: {
    centerX: 0,           // average of all four wheel X positions
    centerY: 0,           // average of all four wheel Y positions
    heading: 0,           // radians; 0 = facing up (+Y), increases clockwise
                          // derived: atan2(frontMid - rearMid) + PI/2
    velocityX: 0,         // m/s, X component of centre-of-mass velocity
    velocityY: 0,         // m/s, Y component
    speed: 0,             // m/s, magnitude of (velocityX, velocityY)
    angularVelocity: 0,   // rad/s, rate of heading change
    prevHeading: 0,       // heading from the previous step (to derive angularVelocity)
    prevVelocityX: 0,     // velocity from the previous step (to derive acceleration)
    prevVelocityY: 0,
    longitudinalAccel: 0, // m/s², acceleration along the car's forward axis
                          // positive = accelerating forward, negative = braking
    lateralAccel: 0,      // m/s², acceleration perpendicular to forward axis
                          // positive = rightward, negative = leftward

    // --- Kinematic chain: 3rd derivative (jerk) ---
    // Computed as (acceleration - prevAcceleration) / dt each physics step.
    accelX: 0,            // m/s², world-space acceleration X (current step)
    accelY: 0,            // m/s², world-space acceleration Y (current step)
    prevAccelX: 0,        // m/s², world-space acceleration X (previous step)
    prevAccelY: 0,        // m/s², world-space acceleration Y (previous step)
    jerkX: 0,             // m/s³, rate of change of acceleration X
    jerkY: 0,             // m/s³, rate of change of acceleration Y
    jerkMagnitude: 0,     // m/s³, scalar magnitude of jerk vector
  },

  // -----------------------------------------------------------
  // WHEEL LOADS — normal force on each tyre (Newtons, SI)
  // Computed by computeWeightTransfer() each step.
  // These scale the peak grip force in the Pacejka tire model.
  // All four should sum to carMassKg × GRAVITY ≈ 11 772 N.
  // -----------------------------------------------------------
  wheelLoads: {
    frontLeft:  0,
    frontRight: 0,
    rearLeft:   0,
    rearRight:  0,
  },

  // -----------------------------------------------------------
  // PER-WHEEL GRIP — independent traction ratio [0,1] per contact point
  // 1.0 = full grip, 0.0 = total loss.
  // Computed inside computeTireForces() from friction demand vs limit.
  // -----------------------------------------------------------
  wheelGrip: {
    frontLeft:  1,
    frontRight: 1,
    rearLeft:   1,
    rearRight:  1,
  },

  // -----------------------------------------------------------
  // PER-WHEEL GRIP STATE MACHINE — hysteretic stable/slipping/recovering
  // Prevents frame-to-frame grip oscillation.
  // state: 'stable' | 'slipping' | 'recovering'
  // smoothedGrip: EMA-filtered grip for rendering (avoids flicker)
  // -----------------------------------------------------------
  wheelGripState: {
    frontLeft:  { state: 'stable', smoothedGrip: 1.0 },
    frontRight: { state: 'stable', smoothedGrip: 1.0 },
    rearLeft:   { state: 'stable', smoothedGrip: 1.0 },
    rearRight:  { state: 'stable', smoothedGrip: 1.0 },
  },

  // -----------------------------------------------------------
  // PER-WHEEL TIRE PAINT — continuous color mixing state
  // hue: current paint hue on tire (-1 = clean rubber)
  // saturation: 0..1, how much paint remains (depletes as tire marks track)
  // contactHue: hue of last decal contact (-1 = none)
  // contactDuration: seconds wheel has been in contact with current decal
  // -----------------------------------------------------------
  tirePaint: {
    frontLeft:  { hue: -1, saturation: 0, contactDecalIdx: -1, contactDuration: 0 },
    frontRight: { hue: -1, saturation: 0, contactDecalIdx: -1, contactDuration: 0 },
    rearLeft:   { hue: -1, saturation: 0, contactDecalIdx: -1, contactDuration: 0 },
    rearRight:  { hue: -1, saturation: 0, contactDecalIdx: -1, contactDuration: 0 },
  },

  // -----------------------------------------------------------
  // DRIFT INTENSITY — aggregated score [0..1] combining lateral velocity,
  // slip angle, wheel mismatch, sustained duration. Updated each physics step.
  // Drives tire sound, paint transfer, motion blur.
  // -----------------------------------------------------------
  driftIntensity: 0,

  // -----------------------------------------------------------
  // MOTION BLUR ACCUMULATOR — temporally coherent blur intensity
  // Rises on action, decays during calm. Prevents snap-on/off blur.
  // -----------------------------------------------------------
  blurAccumulator: 0,

  // -----------------------------------------------------------
  // PER-WHEEL LATERAL SPEED — absolute lateral slip speed at each wheel (m/s)
  // Used for per-wheel skid marks and spark generation.
  // -----------------------------------------------------------
  wheelLateralSpeed: {
    frontLeft:  0,
    frontRight: 0,
    rearLeft:   0,
    rearRight:  0,
  },

  // -----------------------------------------------------------
  // PER-WHEEL KINEMATICS CACHE — reused each substep to avoid recomputing
  // wheel basis vectors and local velocities in follow-up passes.
  // -----------------------------------------------------------
  wheelKinematics: {
    frontLeft:  { wheelForwardX: 0, wheelForwardY: 0, wheelRightX: 0, wheelRightY: 0, wheelVelX: 0, wheelVelY: 0, lateralSpeedAbs: 0 },
    frontRight: { wheelForwardX: 0, wheelForwardY: 0, wheelRightX: 0, wheelRightY: 0, wheelVelX: 0, wheelVelY: 0, lateralSpeedAbs: 0 },
    rearLeft:   { wheelForwardX: 0, wheelForwardY: 0, wheelRightX: 0, wheelRightY: 0, wheelVelX: 0, wheelVelY: 0, lateralSpeedAbs: 0 },
    rearRight:  { wheelForwardX: 0, wheelForwardY: 0, wheelRightX: 0, wheelRightY: 0, wheelVelX: 0, wheelVelY: 0, lateralSpeedAbs: 0 },
  },

  // -----------------------------------------------------------
  // SMOOTHED WHEEL LATERAL VELOCITY — EMA-filtered lateral speed per wheel.
  // Applied BEFORE the Pacejka slip-angle computation so constraint-solver
  // micro-impulses are killed upstream of the nonlinear tire model.
  // A noisy vLat fed into atan2 produces noisy slip angles; smoothing here
  // prevents that amplification entirely.
  // -----------------------------------------------------------
  smoothedWheelLat: {
    frontLeft:  0,
    frontRight: 0,
    rearLeft:   0,
    rearRight:  0,
  },

  // -----------------------------------------------------------
  // TIRE FORCE RELAXATION — previous step's forces for EMA blending
  // Prevents tire forces from reacting instantly to constraint noise.
  // -----------------------------------------------------------
  prevTireForce: {
    frontLeft:  { lat: 0, lon: 0 },
    frontRight: { lat: 0, lon: 0 },
    rearLeft:   { lat: 0, lon: 0 },
    rearRight:  { lat: 0, lon: 0 },
  },

  // -----------------------------------------------------------
  // WHEEL FORCES — per-wheel longitudinal and lateral tire forces (Newtons)
  // Computed during computeTireForces() for gauge rendering.
  // Each wheel: { fx: longitudinal, fy: lateral } (world-space, not car-relative)
  // -----------------------------------------------------------
  wheelForces: {
    frontLeft:  { fx: 0, fy: 0 },
    frontRight: { fx: 0, fy: 0 },
    rearLeft:   { fx: 0, fy: 0 },
    rearRight:  { fx: 0, fy: 0 },
  },

  // -----------------------------------------------------------
  // AXLE FORCES — aggregated forces per axle for friction circle gauges
  // front/rear: { fx: sum of front/rear wheels, fy: sum, N: sum of normal loads }
  // Computed during computeTireForces() after per-wheel calculations.
  // -----------------------------------------------------------
  axleForces: {
    front: { fx: 0, fy: 0, N: 0 },
    rear:  { fx: 0, fy: 0, N: 0 },
  },

  // -----------------------------------------------------------
  // FILTERED BODY DERIVATIVES — EMA-smoothed for rendering
  // Raw accel/jerk from Verlet differentiation is noisy due to
  // constraint impulses. These filtered versions drive the HUD.
  // -----------------------------------------------------------
  filteredBody: {
    accelX: 0, accelY: 0,
    jerkX: 0, jerkY: 0, jerkMagnitude: 0,
  },

  // -----------------------------------------------------------
  // SPARKS — short-lived HDR particles spawned at wheels losing grip
  // Each spark: { x, y, velX, velY, life, maxLife, r, g, b }
  // Positions are in world space (metres).
  // -----------------------------------------------------------
  sparks: [],

  // -----------------------------------------------------------
  // STEERING
  // wheelAngle is the visual steering wheel position in radians —
  // what the on-screen HUD shows. The physics uses frontWheelAngle,
  // which maps wheel angle to a physically meaningful tyre lock angle.
  // -----------------------------------------------------------
  steering: {
    wheelAngle:      0,    // radians, visual indicator only; full lock ≈ ±7.85 rad
    frontWheelAngle: 0,    // radians, actual tyre angle used in slip calculations
    isDragging:      false,
    dragStartX:      0,
    // --- Steering column physics (SAT-driven) ---
    angularVelocity:        0,  // rad/s, rate of change of frontWheelAngle
    angularAcceleration:    0,  // rad/s², 2nd derivative
    angularJerk:            0,  // rad/s³, 3rd derivative (correctly computed)
    prevAngularVelocity:    0,  // previous step value for derivative chain
    prevAngularAcceleration:0,  // previous step acceleration for jerk computation
    selfAligningTorque:     0,  // N·m, net SAT from front tires (for display/effects)
  },

  // -----------------------------------------------------------
  // INPUT — raw state written by event handlers in input.js
  // Physics reads these once per sub-step. Handlers write to them
  // asynchronously from the game loop, which is safe since JS is
  // single-threaded; the values will be read at the next sub-step.
  // -----------------------------------------------------------
  input: {
    throttleKeyHeld:       false,  // D key: full throttle
    brakeKeyHeld:          false,  // S key: front axle brake only
    handbrakeKeyHeld:      false,  // F key: rear axle lock (progressive)
    handbrakeValue:        0.0,    // 0–1 progressive handbrake strength
    clutchKeyHeld:         false,  // A key: clutch pedal to floor
    heldKeys:              {},     // map of currently pressed key codes
    mouseThrottleAmount:   0.0,    // 0.0–1.0; set by left-click drag
    mouseThrottleActive:   false,  // true while left mouse is held
    mouseThrottleDragStartY: 0,
  },

  // -----------------------------------------------------------
  // ENGINE — drivetrain state
  // clutchPedalPosition: 0 = pedal on floor (disengaged), 1 = released (engaged).
  // clutchEngagement:    computed from pedal position via the bite-zone curve;
  //                      0 = no torque transfer, 1 = full rigid coupling.
  // isStalled:           when true, engine produces zero torque.
  //                      Cleared when user blips throttle with partial clutch.
  // isRunning:           top-level engine on/off; false = no torque, no RPM rise.
  // -----------------------------------------------------------
  engine: {
    rpm:                  IDLE_RPM,
    currentGear:          'N',
    previousGear:         'N',
    clutchPedalPosition:  0.0,   // starts floored (disengaged) — safe for gear selection
    clutchEngagement:     0.0,   // derived from pedal position
    isStalled:            false,
    isRunning:            true,
    revMatchTimer:        0,     // countdown for automatic blip on downshift
    revMatchTargetRpm:    0,
  },

  // -----------------------------------------------------------
  // CAMERA — Verlet-integrated spring-damper camera
  // Follows body.centerX/Y with configurable lag and zoom.
  // Stored as a Verlet pair so the camera's own damping can be
  // applied purely via position history, no explicit velocity needed.
  // -----------------------------------------------------------
  camera: {
    x:            0,
    y:            0,
    prevX:        0,
    prevY:        0,
    zoom:         1.0,
    targetZoom:   1.0,
    // Driveline jerk — a decaying offset applied to the camera TARGET (not the camera).
    // The spring chases (body.center + jerkOffsetX/Y), which decays to zero.
    // This produces a natural overshoot-and-recovery feel rather than a shove.
    jerkOffsetX:  0,
    jerkOffsetY:  0,
  },

  // -----------------------------------------------------------
  // TRAIL — velocity arrow trail system
  // arrows: array of { x, y, angle, speed, age, lifespan }
  // spawnAccumulator: time since last arrow spawn (seconds)
  // -----------------------------------------------------------
  trail: {
    arrows:           [],
    spawnAccumulator: 0,
  },

  // -----------------------------------------------------------
  // LOOP — timing state for the fixed-timestep accumulator
  // -----------------------------------------------------------
  loop: {
    previousTimestamp: 0,
    accumulator:       0,
    simulationTime:    0, // total elapsed simulation seconds (for combo timing)
    renderFps:         0, // smoothed render frames per second (set by main.js)
    physicsTps:        0, // smoothed physics ticks per second (set by main.js)
    droppedSubsteps:   0, // number of sub-steps dropped due to per-frame cap
    droppedSubstepsLastFrame: 0, // sub-steps dropped in the most recent render frame
  },

  // -----------------------------------------------------------
  // PARAMS — tunable parameters exposed via HTML sliders
  // All values here have matching slider elements in index.html.
  // Changing these at runtime takes effect on the next physics step.
  // -----------------------------------------------------------
  params: {
    simulationFps:           100,  // physics Hz (wall-clock tick rate)
    maxSubstepsPerFrame:     6,    // cap on fixed-step ticks consumed per render frame
    timeScale:               1.0,
    determinismMode:         false, // true = seeded physics-side randomness for reproducible runs
    determinismSeed:         1337,  // seed for deterministic physics RNG stream
    carMassKg:               CAR_MASS_KG,
    rollingResistanceCoeff:  DEFAULT_ROLLING_RESISTANCE_COEFF,
    aeroDragCoeff:           DEFAULT_AERO_DRAG_COEFF,
    tireFrictionCoeff:       DEFAULT_TIRE_FRICTION_COEFF,
    cogHeight:               COG_HEIGHT,        // metres (was cogHeightPx in pixels)
    bounciness:              DEFAULT_BOUNCINESS,
    stallResistance:         DEFAULT_STALL_RESISTANCE,
    yawDamping:              DEFAULT_YAW_DAMPING, // 1/s decay rate; opposes angular velocity

    trailSpawnInterval: 0.08,   // seconds between arrow spawns
    trailLifespan:      2.0,    // seconds until an arrow fades
    trailFade:          0.7,    // opacity exponent; higher = faster fade

    // Camera spring: parameterized as natural frequency and damping ratio.
    // omega0 (rad/s): higher = camera snaps faster to car.
    // zeta: 1.0 = critically damped (no overshoot), 0.7 = slightly springy.
    // omega=2.2 → K=ω²≈4.8, matching the old cameraStiffness=5.0 feel.
    cameraOmega:            2.2,   // natural frequency ω₀ (rad/s)
    cameraZeta:             0.8,   // damping ratio ζ (0=undamped, 1=critical, >1=overdamped)
    cameraZoomSensitivity:  0.3,

    // Jakobsen constraint damping (0.0–1.0).
    // Fraction of positional correction also applied to prevX/prevY.
    // 0.0 = pure Jakobsen (can inject phantom energy), 0.5 = default, 1.0 = fully absorbed.
    constraintDamping:  0.85,  // higher = less phantom velocity from Jakobsen corrections

    motionBlurSamples:    6,
    motionBlurIntensity:  0.6,
    motionBlurThreshold:  10,   // m/s; blur only appears above this speed (~36 km/h)

    mapWidth:   DEFAULT_MAP_WIDTH,   // metres
    mapHeight:  DEFAULT_MAP_HEIGHT,  // metres

    gaugeLabelScale: 1.0,   // multiplier for gauge tick-label font size

    clutchBitePoint:  0.35,
    clutchBiteRange:  0.20,
    clutchBiteCurve:  1.8,
    clutchEngageTime: 0.30,

    // --- Engine & Drivetrain (new sliders) ---
    peakEngineTorqueNm: PEAK_ENGINE_TORQUE_NM,
    idleRpm:            IDLE_RPM,
    redlineRpm:         REDLINE_RPM,
    stallRpm:           STALL_RPM,
    wheelRadius:        WHEEL_RADIUS,        // metres
    finalDriveRatio:    FINAL_DRIVE_RATIO,
    brakeForce:         BRAKE_FORCE,         // Newtons
    idleCreepForce:     IDLE_CREEP_FORCE,    // Newtons
    gearRatio1:         GEAR_RATIOS['1'],
    gearRatio2:         GEAR_RATIOS['2'],
    gearRatio3:         GEAR_RATIOS['3'],
    gearRatio4:         GEAR_RATIOS['4'],
    gearRatio5:         GEAR_RATIOS['5'],
    gearRatio6:         GEAR_RATIOS['6'],

    // --- Tire Model (new sliders) ---
    pacejkaB:              PACEJKA_B,
    pacejkaC:              PACEJKA_C,
    peakSlipAngleDeg:      TIRE_PEAK_SLIP_ANGLE_DEG,
    peakSlipRatio:         TIRE_PEAK_SLIP_RATIO,
    maxFrontWheelAngle:    MAX_FRONT_WHEEL_ANGLE_RAD,
    steeringDragRange:     STEERING_DRAG_RANGE_PX,
    steeringSelfCenterRate: STEERING_SELF_CENTER_RATE,
    pneumaticTrail:        PNEUMATIC_TRAIL,
    steeringColumnInertia: STEERING_COLUMN_INERTIA,
    steeringViscousDamping: STEERING_VISCOUS_DAMPING,
    steeringCoulombFriction: STEERING_COULOMB_FRICTION,

    // --- World & Visual (new sliders) ---
    constraintIterations:  CONSTRAINT_ITERATIONS,
    checkerboardTileSize:  CHECKERBOARD_TILE_SIZE_PX,
    maxTrailArrows:        MAX_TRAIL_ARROWS,

    // --- Balloon game ---
    maxBalloons:           DEFAULT_MAX_BALLOONS,
    balloonRespawnRate:    DEFAULT_BALLOON_RESPAWN_RATE,

    // --- Sound cylinder count (also affects engine sound character) ---
    cylinderCount:         5,  // Zonda F V12 default

    // --- Visual effect toggles ---
    showKinematicArrows:   true,   // accel + jerk arrows on car
    showSparks:            true,   // HDR sparks at low-grip wheels
    showSkidMarks:         true,   // grip-based tire marks

    // --- Spark tuning ---
    sparkIntensity:        1.0,    // multiplier on spark spawn rate (0.1–3.0)
    sparkSize:             1.0,    // multiplier on spark particle size (0.3–3.0)
    sparkLifetime:         1.0,    // multiplier on spark duration (0.3–3.0)
    sparkGripThreshold:    0.3,    // grip level below which sparks appear (0.05–0.8)

    // --- Splatter tuning ---
    splatViolence:         1.5,    // multiplier on splat particle count and speed (0.5–3.0)
    splatDecalPersistence: 0.7,    // how opaque ground decals are (0.1–1.0)

    // --- Pixels per Metre (visual scale) ---
    pixelsPerMeter:        20,     // world-to-screen scale factor; higher = more zoomed in

    // --- Tire Relaxation ---
    tireRelaxationLength:  0.3,    // metres — distance over which tire force builds (0.1–1.0)

    // --- Decal Evaporation ---
    decalLifetime:         30.0,   // seconds before a decal fully fades (5–300)
    decalEvapRate:         0.02,   // alpha lost per second from evaporation (0.001–0.2)
    decalMaxCount:         4000,   // max decals before oldest culled (500–10000)
    decalMinRadius:        0.15,   // min splat blob radius in metres (0.05–0.5)
    decalMaxRadius:        0.9,    // max splat blob radius in metres (0.2–3.0)
    decalEdgeSoftness:     0.4,    // radial gradient edge fade (0.0–1.0)

    // --- Doppler Effect ---
    dopplerEnabled:        true,   // enable Doppler pitch shift on engine sound
    dopplerStrength:       0.008,  // how strongly speed shifts the pitch (0.0–0.05)
    dopplerMaxShift:       0.25,   // maximum pitch ratio shift (0.0–0.5)

    // --- Engine Sound Fart/Burble ---
    exhaustPopVolume:      0.5,    // volume of exhaust pops (0.0–2.0)
    exhaustPopDensity:     1.5,    // pop density multiplier (0.1–5.0)
    exhaustBurbleGain:     0.15,   // continuous idle burble gain (0.0–0.5)
    exhaustBurbleFreq:     80,     // burble center frequency Hz (40–200)
    backfireThreshold:     1500,   // RPM above which backfires occur on lift (500–6000)

    // --- Skid Mark tuning ---
    skidGripThreshold:     0.6,    // grip ratio below which marks appear (0.1–1.0)
    skidFadeRate:          8.0,    // how fast fade-in/out transitions (1–30 /s)
    skidWidthMin:          0.12,   // minimum mark width in metres (0.01–0.5)
    skidWidthMax:          0.47,   // maximum mark width in metres (0.1–1.5)
    skidAlphaMin:          0.2,    // minimum segment opacity (0.0–1.0)
    skidAlphaMax:          0.7,    // maximum segment opacity (0.0–1.0)
    skidMaxSegments:       4000,   // max live segments before culling (500–20000)
    skidJerkBoostMax:      0.3,    // max opacity boost from jerk impulse (0.0–1.0)

    // --- Paint Mixing tuning ---
    paintPickupRate:       2.5,    // hue shift speed when over a decal (0.1–10)
    paintSatPickupRate:    0.8,    // saturation gain rate per second (0.05–3.0)
    paintDepletionRate:    0.10,   // saturation loss rate per second while sliding (0.01–1.0)
    paintInstantPickup:    true,   // true = pick up color immediately on decal contact
    paintMinSat:           0.05,   // saturation threshold below which tire is "clean" (0.01–0.3)
    paintDecalDepletion:   0.08,   // how fast decal fades when driven over (0.0–0.5)

    // --- Motion Blur tuning ---
    blurAttackRate:        0.35,   // how fast blur accumulator rises (0.0–1.0)
    blurDecayRate:         0.04,   // how fast blur accumulator falls (0.0–0.3)
    blurDriftWeight:       0.70,   // drift intensity contribution to blur (0.0–2.0)
    blurAngularWeight:     0.40,   // angular velocity contribution (0.0–2.0)
    blurSpeedWeight:       0.50,   // forward speed contribution (0.0–2.0)
    blurJerkWeight:        0.30,   // jerk contribution (0.0–2.0)
    blurMaxOffset:         5.0,    // max world-space blur trail length in metres (0.5–20)

    // --- Grip State Machine tuning ---
    gripLossThreshold:     0.70,   // grip ratio that triggers slip state (0.3–0.95)
    gripRecoveryThreshold: 0.85,   // grip ratio that triggers recovery (0.5–1.0)
    gripEmaStable:         0.15,   // EMA alpha in stable state (0.01–0.5)
    gripEmaSlipping:       0.35,   // EMA alpha in slipping state (0.05–0.8)

    // --- DEBUG OVERLAYS ---
    debugShowTireForces:    false,  // Draw tire force vectors at wheels
    debugShowSlipAngles:    false,  // Draw slip angle values/indicators
    debugShowSAT:           false,  // Draw SAT magnitude and direction
    debugShowSmoothingFilter: false, // Draw raw vs smoothed lateral velocity
    debugShowCrossover:     false,  // Highlight where slip angle sign flips
    debugShowWheelSpeeds:   false,  // Velocity vectors at wheel positions
    debugFontSize:          8,      // Pixel size for debug text overlays (4-14)
    debugFontColor:         '#00ff00', // Green for debug text
    debugForceScale:        0.0015, // Pixels per Newton (force arrow scaling)
  },

  // -----------------------------------------------------------
  // SCREEN SHAKE — decaying camera offset triggered by balloon impacts
  // shakeX/Y: current offset in metres applied on top of camera position
  // magnitude: current shake intensity (decays to 0 each frame)
  // -----------------------------------------------------------
  screenShake: {
    shakeX:    0,
    shakeY:    0,
    magnitude: 0,
  },

  // -----------------------------------------------------------
  // SKID MARKS — persistent world-space line segments
  // Each segment: { x1, y1, x2, y2, hue, alpha, isBaloonColor }
  // hue = -1 means rubber black; >= 0 means balloon paint color.
  // Segments are drawn under balloons and car, above the checkerboard.
  // -----------------------------------------------------------
  skidMarks: [],

  // -----------------------------------------------------------
  // TRACTION STATE — tracks whether tires are currently slipping
  // usedForSkidSound: true when lateral slip exceeds threshold this step
  // prevSlipping: previous step state (for edge detection — sound triggers on transition)
  // -----------------------------------------------------------
  tractionState: {
    isSlipping:   false,
    prevSlipping: false,
    lateralSpeed: 0,        // m/s, max lateral wheel speed (for sound intensity)
  },

  // -----------------------------------------------------------
  // BALLOONS — world-space circles that pop on car contact
  // Each balloon: { x, y, radius, hue, isPopped }
  // Populated by balloon.js at game start and on respawn.
  // -----------------------------------------------------------
  balloons: [],

  // -----------------------------------------------------------
  // SPLAT PARTICLES — short-lived paint particles spawned on balloon pop
  // Each particle: { x, y, velX, velY, radius, hue, alpha, lifetime, maxLifetime }
  // Positions are in world space (metres). Renderer draws them in camera pass.
  // -----------------------------------------------------------
  splatParticles: [],

  // -----------------------------------------------------------
  // SPLAT DECALS — persistent ground paint marks left by splat particles
  // Each decal: { x, y, radius, hue, alpha }
  // Deposited when a splat particle's speed drops below landing threshold.
  // Drawn under skid marks so tires can track through them.
  // -----------------------------------------------------------
  splatDecals: [],

  // -----------------------------------------------------------
  // SCORE — balloon popping game score
  // totalScore:       cumulative points earned this session
  // combo.count:      how many balloons popped in rapid succession
  // combo.multiplier: current score multiplier derived from combo count
  // combo.lastPopTime: timestamp (seconds) of the most recent pop, for timeout
  // combo.flashTimer: seconds remaining on the multiplier flash animation
  // -----------------------------------------------------------
  score: {
    totalScore:    0,
    combo: {
      count:       0,
      multiplier:  1,
      lastPopTime: 0,
      flashTimer:  0,
    },
  },

  // Sound synthesis parameters (from engine_sound.html)
  // Initialized from localStorage with defaults matching sound.js
  soundParams: {
    masterVol:     parseFloat(localStorage.getItem('soundParam_masterVol')) ?? 0.5,
    mainGain:      parseFloat(localStorage.getItem('soundParam_mainGain')) ?? 0.3,
    mainFltLow:    parseFloat(localStorage.getItem('soundParam_mainFltLow')) ?? 200,
    mainFltHigh:   parseFloat(localStorage.getItem('soundParam_mainFltHigh')) ?? 2000,
    mainFltQ:      parseFloat(localStorage.getItem('soundParam_mainFltQ')) ?? 0.7,
    subGain:       parseFloat(localStorage.getItem('soundParam_subGain')) ?? 0.25,
    subMult:       parseFloat(localStorage.getItem('soundParam_subMult')) ?? 0.5,
    harmonicEnable: localStorage.getItem('soundParam_harmonicEnable') === 'true' ?? false,
    harmonicGain:  parseFloat(localStorage.getItem('soundParam_harmonicGain')) ?? 0.2,
    harmonicMult:  parseFloat(localStorage.getItem('soundParam_harmonicMult')) ?? 2.5,
    noiseGain:     parseFloat(localStorage.getItem('soundParam_noiseGain')) ?? 0.1,
    noiseLow:      parseFloat(localStorage.getItem('soundParam_noiseLow')) ?? 300,
    noiseHigh:     parseFloat(localStorage.getItem('soundParam_noiseHigh')) ?? 2500,
    noiseQ:        parseFloat(localStorage.getItem('soundParam_noiseQ')) ?? 1.5,
    turboEnable:   localStorage.getItem('soundParam_turboEnable') === 'true' ?? false,
    turboGain:     parseFloat(localStorage.getItem('soundParam_turboGain')) ?? 0.15,
    turboMult:     parseFloat(localStorage.getItem('soundParam_turboMult')) ?? 20,
    distDrive:     parseFloat(localStorage.getItem('soundParam_distDrive')) ?? 0,
    reverbMix:     parseFloat(localStorage.getItem('soundParam_reverbMix')) ?? 0,
    // Exhaust bass layer
    exhaustBassGain: parseFloat(localStorage.getItem('soundParam_exhaustBassGain')) ?? 0.35,
    exhaustBassTune: parseFloat(localStorage.getItem('soundParam_exhaustBassTune')) ?? 65,
    exhaustBassQ:    parseFloat(localStorage.getItem('soundParam_exhaustBassQ'))    ?? 1.2,
    // Drift screech intensity cap
    driftScreechGain: parseFloat(localStorage.getItem('soundParam_driftScreechGain')) ?? 0.55,
  },

  // Car position history for motion blur ghost rendering.
  // Each frame the current pose is pushed; old entries beyond maxGhosts are dropped.
  carPoseHistory: [],   // [{ cx, cy, heading, wheelPoses: {fl,fr,rl,rr} }, ...]

};

export default state;
