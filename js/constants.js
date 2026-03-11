// =============================================================
// CONSTANTS — All magic numbers live here. Every value has a
// comment explaining its source and what changing it affects.
// All objects are frozen so they cannot be mutated at runtime.
//
// UNIT SYSTEM:
//   All physics quantities use SI units:
//     lengths        → metres (m)
//     speeds         → metres per second (m/s)
//     forces         → Newtons (N = kg·m/s²)
//     accelerations  → m/s²
//     torques        → Newton-metres (N·m)
//     mass           → kilograms (kg)
//   Conversion to pixels happens ONLY in renderer.js via
//   ctx.scale(PIXELS_PER_METER, PIXELS_PER_METER) inside
//   applyCameraTransform(). No pixel arithmetic in physics.
// =============================================================

// -------------------------------------------------------------
// WORLD SCALE
// 1 metre of real-world length = PIXELS_PER_METER pixels.
// At 10 px/m the car body (8 m long) renders as 80 px on screen.
// This constant is used ONLY by the renderer to scale world→screen.
// Physics never multiplies by this value.
// -------------------------------------------------------------
export const PIXELS_PER_METER = 20;

// Conversion factor: multiply km/h by this to get m/s.
// Derivation: 1 km/h = 1000 m / 3600 s ≈ 0.2778 m/s.
export const KPH_TO_MPS = 1000 / 3600; // ≈ 0.2778

// -------------------------------------------------------------
// CAR BODY GEOMETRY (metres)
// The car is represented by four Verlet particles at wheel positions.
// Half-width and half-length are measured from the car's centre of mass.
// These determine rest distances for the six rigid constraints.
// At PIXELS_PER_METER = 10:  0.8m → 8px, 1.5m → 15px on screen.
// === PHASE 3c: CAR DIMENSION RESCALING ===
// OLD: 2.0m width, 4.0m length (tanker truck proportions, 8m × 4m wheelbase)
// NEW: 0.8m width, 1.5m length (realistic sports car: ~3m wheelbase, ~1.6m track)
// Moment of inertia automatically recalculates from updated dimensions.
// Old I ≈ 8000 kg·m²; New I ≈ 1156 kg·m² (car now feels more responsive to torque).
// -------------------------------------------------------------
export const CAR_HALF_WIDTH  = 0.8; // m
export const CAR_HALF_LENGTH = 1.5; // m

// Derived rest distances for all six rigid distance constraints (metres).
export const CONSTRAINT_AXLE_WIDTH  = CAR_HALF_WIDTH  * 2; // 4.0 m
export const CONSTRAINT_SIDE_LENGTH = CAR_HALF_LENGTH * 2; // 8.0 m
export const CONSTRAINT_DIAGONAL    =
  Math.sqrt(CONSTRAINT_AXLE_WIDTH ** 2 + CONSTRAINT_SIDE_LENGTH ** 2); // ≈ 8.944 m

// Number of Jakobsen constraint solver iterations per physics sub-step.
// === PHASE 3c: CONSTRAINT ITERATIONS INCREASE ===
// OLD: 6 iterations (loose, allows jitter in rigid body)
// NEW: 12 iterations (stiff, better weight transfer accuracy, reduces jitter)
// Higher iterations = tighter constraint solving = better stability but more CPU
export const CONSTRAINT_ITERATIONS = 12;

// -------------------------------------------------------------
// PHYSICS
// -------------------------------------------------------------
export const CAR_MASS_KG = 1200; // kg

// Gravitational acceleration (SI, m/s²).
// Previously GRAVITY_PX_PER_SEC2 = 9.8 × PIXELS_PER_METER = 98 px/s²,
// which inflated all normal-force calculations by 10×. Now correct.
export const GRAVITY = 9.81; // m/s²

// Height of the centre of gravity above the ground (metres).
// 0.5 m is typical for a sports car.
// Previously COG_HEIGHT_PX = 5 px = 0.5 m — same physical value, now explicit.
export const COG_HEIGHT = 0.5; // m

// Moment of inertia (rectangular plate approximation, kg·m²).
// I = mass × (halfLength² + halfWidth²) / 3
// With metre geometry: 1200 × (4² + 2²) / 3 = 8000 kg·m².
// Previously ≈800,000 kg·px² — 100× too large due to pixel units.
export const MOMENT_OF_INERTIA =
  CAR_MASS_KG * (CAR_HALF_LENGTH ** 2 + CAR_HALF_WIDTH ** 2) / 3; // ≈ 8000 kg·m²

// Maximum displacement a wheel particle can move in a single sub-step (metres).
// Prevents tunnelling through map walls.
export const MAX_DISPLACEMENT_PER_STEP = CAR_HALF_WIDTH * 0.9; // 1.8 m

// Default coefficient of restitution for wall collisions.
export const DEFAULT_BOUNCINESS = 0.5;

// Yaw damping decay rate (1/s).
// Applies counter-torque: τ_damp = -yawDamping × I × ω
// Equivalently, α_damp = -yawDamping × ω, so this is how many rad/s of yaw the
// system removes per second — a pure angular velocity decay rate.
// Slider range: 0.0–5.0
//   0.0:  no damping (spin persists forever — pure arcade chaos)
//   1.0:  realistic aerodynamic-like damping (spin halves in ~0.7 s)
//   3.0:  sporty stability control
//   5.0:  heavy stability assist
export const DEFAULT_YAW_DAMPING = 1.0; // 1/s

// -------------------------------------------------------------
// ENGINE
// -------------------------------------------------------------
export const IDLE_RPM        = 800;  // engine minimum speed when running
export const REDLINE_RPM     = 9000; // fuel cut / hard limiter above this
export const TORQUE_PEAK_RPM = 4500; // RPM at which parabolic torque curve peaks

// Engine stall threshold.
export const STALL_RPM = 600;

// Peak engine torque in Newton-metres.
// === PHASE 3c: ENGINE TORQUE RESCALING ===
// OLD: 2800 N·m (hypercar territory, unrealistic for base car)
// NEW: 350 N·m (realistic road car, mid-range sports car level)
// Tune via the peakEngineTorqueNm slider.
// With WHEEL_RADIUS = 0.35 m, 1st gear full throttle peak:
//   driveForce = 350 × 3.5 × 4.1 / 0.35 ≈ 14,350 N  (~1.2 g before friction clamp)
export const PEAK_ENGINE_TORQUE_NM = 350;

// Braking force when the brake pedal is held (Newtons).
// 9810 N / 1200 kg ≈ 8.2 m/s² ≈ 0.83 g — realistic for a road car.
export const BRAKE_FORCE = 9810; // N

// Small forward force at idle so the car creeps without throttle.
// 200 N > rolling drag (141 N) so the car just barely creeps forward.
export const IDLE_CREEP_FORCE = 200; // N

// -------------------------------------------------------------
// DRIVETRAIN
// -------------------------------------------------------------
export const GEAR_RATIOS = Object.freeze({
  N:   0,
  '1': 3.5,
  '2': 2.1,
  '3': 1.4,
  '4': 1.0,
  '5': 0.75,
  '6': 0.58,
  R:  -3.0,
});

export const FINAL_DRIVE_RATIO = 4.1;

// Effective driven wheel radius (metres).
// 0.35 m = typical for 205/55R16 tyres.
// Previously WHEEL_RADIUS_PX = 24 px = 2.4 m — physically absurd.
export const WHEEL_RADIUS = 0.35; // m

// -------------------------------------------------------------
// CLUTCH
// -------------------------------------------------------------
export const CLUTCH_BITE_POINT  = 0.35;
export const CLUTCH_BITE_RANGE  = 0.20;
export const CLUTCH_BITE_CURVE  = 1.8;
export const CLUTCH_ENGAGE_TIME = 0.30;
export const DEFAULT_STALL_RESISTANCE = 0.7;

// -------------------------------------------------------------
// TIRE MODEL (Pacejka simplified, E = 0)
// Formula: F = normalLoad × frictionCoeff × sin(C × atan(B × normalizedSlip))
// -------------------------------------------------------------
export const PACEJKA_B = 10.0;
export const PACEJKA_C = 1.9;
export const TIRE_PEAK_SLIP_ANGLE_DEG = 8.0;
export const TIRE_PEAK_SLIP_RATIO = 0.12;
export const DEFAULT_TIRE_FRICTION_COEFF = 1.0;
export const DEFAULT_WHEEL_INERTIA = 1.2;  // kg·m² — rotational inertia per wheel

// -------------------------------------------------------------
// DRAG
// -------------------------------------------------------------
// Rolling resistance coefficient (true SI value, dimensionless).
// Force = coeff × mass × GRAVITY.
// Now that GRAVITY = 9.81 m/s² this uses the real-world value.
// At 0.012: rollingDrag = 0.012 × 1200 × 9.81 ≈ 141 N.
export const DEFAULT_ROLLING_RESISTANCE_COEFF = 0.012;

// Aerodynamic drag coefficient (N·s²/m²).
// Formula: F = coeff × speed²  (speed in m/s, F in N).
// From first principles: F = 0.5 × ρ × Cd × A × v²
//   ρ = 1.225 kg/m³, Cd = 0.30, A = 2.2 m²  → coeff ≈ 0.404
// At 200 km/h (55.6 m/s): aeroDrag ≈ 1237 N.
export const DEFAULT_AERO_DRAG_COEFF = 0.4;

// -------------------------------------------------------------
// STEERING
// -------------------------------------------------------------
export const MAX_FRONT_WHEEL_ANGLE_RAD = 0.52;
export const STEERING_DRAG_RANGE_PX    = 150; // pixels (HUD/input, not world space)
export const STEERING_SELF_CENTER_RATE = 5.0;

// Self-aligning torque (SAT) steering model parameters.
// The steering column is modelled as a rotational system driven by:
//   1. Driver input force (from mouse drag)
//   2. Self-aligning torque from front tires (opposes slip, returns to centre)
//   3. Friction (coulomb + viscous damping in the steering rack)
//
// Pneumatic trail: distance (m) behind the contact patch centre where the
// lateral force effectively acts. Typical road car: 0.02–0.04 m.
// Larger trail = stronger SAT = heavier steering feel.
export const PNEUMATIC_TRAIL         = 0.035;  // m
// Steering column inertia: resistance to angular acceleration.
// Low value = responsive; high = sluggish and realistic.
export const STEERING_COLUMN_INERTIA = 0.08;   // kg·m² (effective at wheel angle)
// Viscous damping in the steering rack (opposes angular velocity).
export const STEERING_VISCOUS_DAMPING = 5.5;   // N·m·s/rad — zeta≈0.74, well-damped
// Coulomb (dry) friction in the steering system — constant opposing torque.
export const STEERING_COULOMB_FRICTION = 0.05; // N·m

// -------------------------------------------------------------
// CAMERA
// -------------------------------------------------------------
export const CAMERA_SPRING_STIFFNESS        = 3.0;
export const CAMERA_DAMPING_FACTOR          = 4.0;
export const CAMERA_MIN_ZOOM               = 0.3;
export const CAMERA_MAX_ZOOM               = 1.0;
export const CAMERA_ZOOM_SPEED_THRESHOLD_KPH = 80;

// -------------------------------------------------------------
// GAUGES
// -------------------------------------------------------------
export const SPEEDOMETER_MAX_KPH    = 400;
export const TACHOMETER_MAX_RPM     = 10000;
export const TACHOMETER_REDLINE_RPM = 6500;
export const NEEDLE_STIFFNESS         = 0.070;
export const NEEDLE_DAMPING           = 0.855;
export const NEEDLE_RISE_BOOST        = 1.35;
export const NEEDLE_FALL_BOOST        = 0.75;
export const NEEDLE_FLUTTER_THRESHOLD = 0.80;

// -------------------------------------------------------------
// TRAIL ARROWS
// -------------------------------------------------------------
export const MAX_TRAIL_ARROWS          = 600;
export const TRAIL_ARROW_BASE_LENGTH_PX = 22; // pixels (visual only)

// Speed considered "fast" for trail colour and size scaling (m/s).
// 25 m/s ≈ 90 km/h. Previously TRAIL_REFERENCE_SPEED_PX = 250 px/s = 25 m/s.
export const TRAIL_REFERENCE_SPEED = 25; // m/s

// -------------------------------------------------------------
// WORLD / MAP
// -------------------------------------------------------------
// Map dimensions in metres.  384 m × 20 px/m = 7680 px on screen.
// Aspect ratio: 4:3 (matches GPU texture 6144×4608).
export const DEFAULT_MAP_WIDTH  = 384; // m
export const DEFAULT_MAP_HEIGHT = 288; // m
export const CHECKERBOARD_TILE_SIZE_PX = 80; // pixels (visual only)

// -------------------------------------------------------------
// SIMULATION TIMING
// -------------------------------------------------------------
export const DEFAULT_SIM_FPS    = 60;
export const MAX_FRAME_TIME_SEC = 0.25;

// -------------------------------------------------------------
// BALLOON GAME
// -------------------------------------------------------------

// How many balloons to scatter across the map at spawn time.
export const BALLOON_COUNT = 40;

// Balloon radius range in metres. Random value chosen per balloon between min and max.
export const BALLOON_RADIUS_MIN = 0.6;  // m — smallest balloon
export const BALLOON_RADIUS_MAX = 1.8;  // m — largest balloon

// Margin from map edge so balloons don't spawn in the wall collision zone (metres).
export const BALLOON_SPAWN_MARGIN = 5;

// How many splat particles to spawn at minimum (slow hit) and maximum (full speed hit).
export const SPLAT_PARTICLE_COUNT_MIN = 10;
export const SPLAT_PARTICLE_COUNT_MAX = 60;

// Splat particle lifetime range in seconds. Larger splats from fast hits last longer.
export const SPLAT_LIFETIME_MIN = 0.6;  // seconds
export const SPLAT_LIFETIME_MAX = 1.8;  // seconds

// Speed at which a hit is considered "maximum force" for particle and score scaling.
// 30 m/s ≈ 108 km/h. Hits faster than this are clamped to 1.0 splat factor.
export const SPLAT_MAX_REFERENCE_SPEED = 30; // m/s

// Splat particle initial speed range (metres per second, world space).
// Particles fan outward from the balloon centre with random speed in this range.
export const SPLAT_SPEED_MIN = 3;   // m/s
export const SPLAT_SPEED_MAX = 18;  // m/s

// Splat particle radius range in metres.
export const SPLAT_RADIUS_MIN = 0.08; // m
export const SPLAT_RADIUS_MAX = 0.35; // m

// Combo system: time window in seconds to chain balloon pops for a combo.
// If the next balloon is popped within this window, the combo count increases.
export const COMBO_TIME_WINDOW = 1.8; // seconds

// Multiplier values for combo levels. Index = combo count (0-based, clamped at last).
// combos[0] = 1st balloon (×1), combos[1] = 2nd in chain (×2), etc.
export const COMBO_MULTIPLIERS = [1, 2, 3, 5, 8, 13]; // Fibonacci-ish

// Base score per balloon pop, before multipliers.
// Final score = BASE_SCORE × splatFactor × comboMultiplier
// splatFactor is 0.5 (slow tap) to 3.0 (full speed into large balloon).
export const BALLOON_BASE_SCORE = 100;

// How long the combo multiplier flash animation lasts (seconds).
export const COMBO_FLASH_DURATION = 0.5; // seconds

// Balloon hue range — full spectrum so each balloon is a different colour.
// Hue is in degrees (0–360), using HSL colour model.
export const BALLOON_HUE_RANGE = 10;//360;

// Default maximum number of live balloons on the map at any time.
export const DEFAULT_MAX_BALLOONS = 240;

// Default balloon respawn rate in balloons per second.
// 0.5 = one new balloon every 2 seconds.
export const DEFAULT_BALLOON_RESPAWN_RATE = 0.5;

// -------------------------------------------------------------
// SCREEN SHAKE
// -------------------------------------------------------------

// Maximum screen shake offset in metres (world space) for the hardest possible hit.
export const SCREEN_SHAKE_MAX_MAGNITUDE = 1.5; // m

// Screen shake decay rate (1/s) — how fast the shake fades out.
// At 8.0 the shake drops to ~0.03× of initial in 0.5 seconds.
export const SCREEN_SHAKE_DECAY = 8.0;

// -------------------------------------------------------------
// SKID MARKS
// -------------------------------------------------------------

// Lateral slip speed threshold (m/s) above which skid marks are drawn.
// 1.0 m/s is a gentle squeal; 3.0 m/s is proper tire chirp.
export const SKID_MARK_SLIP_THRESHOLD = 1.5; // m/s

// Maximum number of skid mark segments stored before oldest are culled.
export const MAX_SKID_SEGMENTS = 4000;

// Skid mark alpha — semi-transparent so the checkerboard shows through.
export const SKID_MARK_ALPHA = 0.55;

// Skid mark width in metres.
export const SKID_MARK_WIDTH = 0.18; // m

// -------------------------------------------------------------
// GAUGE SHAKE AT HIGH SPEED
// -------------------------------------------------------------

// Speed above which gauges begin to tremble (m/s).
// 40 m/s ≈ 144 km/h.
export const GAUGE_SHAKE_SPEED_THRESHOLD = 40; // m/s

// Maximum gauge needle jitter amplitude (fraction of full needle sweep).
// 0.02 = ±2% of full scale — visible but not absurd.
export const GAUGE_SHAKE_MAX_AMPLITUDE = 0.04;

// -------------------------------------------------------------
// TRACTION LOSS (for skid sound trigger)
// -------------------------------------------------------------

// Lateral wheel speed above which traction is considered lost (m/s).
export const TRACTION_LOSS_THRESHOLD = 1.8; // m/s

export const TAU        = 2 * Math.PI;
export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;
