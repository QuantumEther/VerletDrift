# VerletDrift v15: New Real-Time Gauges

This document describes the four new real-time gauges added to VerletDrift in v15, their telemetry sources, calculations, and design rationale.

## Overview

All four gauges follow the existing gauge rendering system patterns:
- **Visual Consistency**: Match existing dial aesthetics (dark face, golden labels, red needles/indicators)
- **Needle Smoothing**: Use the same springy physics algorithm (`createNeedlePhysics()`) for smooth, lag-free response
- **No Per-Frame Allocations**: Reuse state objects; avoid temporary arrays in render loops
- **Custom Renderers**: Implement `drawXXX()` functions in `renderer.js` for non-standard dial layouts

---

## Gauge A: Yaw Stability Margin

**File**: `renderer.js:drawYawStabilityGauge()`
**Grid Position**: Integrated into gauge row alongside existing gauges

### Telemetry
- **Input**: `state.body.angularVelocity` (rad/s, signed)
- **Yaw Limit**: 2.0 rad/s (tunable via constants)
- **Margin Used**: `abs(yawRate) / yawLimit`
- **Percentage**: `marginUsed × 100`

### Rendering
- **Dial Type**: Circular, 270° sweep (±140° centered)
- **Needle Angle**: Maps signed `yawRate / yawLimit` to ±140° sweep
  - Fully left (-140°): yawRate = -2.0 rad/s
  - Center (0°): yawRate = 0 rad/s
  - Fully right (+140°): yawRate = +2.0 rad/s

- **Needle Length Growth**: Secondary visual indicator
  - Base length: 60% of face radius
  - Max length: 100% of face radius
  - Growth formula: `L = Lmin + clamp(marginUsed, 0, 1.25) × (Lmax - Lmin)`
  - Allows overflow beyond 100% to visualize dangerous instability

- **Appearance**: Red tapered needle with shadow; white pivot cap
- **Display Text**:
  - "YAW STABILITY" (title)
  - "XX% Margin" (numeric percentage)

### Interpretation
- **0–60% Margin**: Green zone (stable, plenty of yaw authority)
- **60–85% Margin**: Yellow zone (approaching stability limits)
- **85–100% Margin**: Orange zone (high risk of spin)
- **>100% Margin**: Red zone (yaw rate exceeds limit, unrecoverable spin)

---

## Gauge B: Friction Circles (Front & Rear)

**File**: `renderer.js:drawFrictionCircle()`
**Grid Position**: Two separate tiles (Front Grip, Rear Grip)

### Purpose
Visualizes how much of each axle's available grip is currently being used. The friction circle plots the normalized force vector (FxN, FyN) inside a unit circle to show combined traction/braking/steering saturation.

### Telemetry

**Per-Wheel Aggregation** (computed in `physics.js`):
- Front Axle:
  - Fx = force_frontLeft.x + force_frontRight.x (N, world-space)
  - Fy = force_frontLeft.y + force_frontRight.y (N, world-space)
  - N  = load_frontLeft + load_frontRight (N, normal load)

- Rear Axle:
  - Fx = force_rearLeft.x + force_rearRight.x (N, world-space)
  - Fy = force_rearLeft.y + force_rearRight.y (N, world-space)
  - N  = load_rearLeft + load_rearRight (N, normal load)

**Normalization** (in custom renderer):
- Friction Coefficient: `μ = state.params.tireFrictionCoeff` (default ~1.0)
- Max grip circle: `mu × N` (Newtons)
- Normalized coordinates:
  - `FxN = Fx / (μ × N)` (dimensionless)
  - `FyN = Fy / (μ × N)` (dimensionless)
- Saturation: `sat = hypot(FxN, FyN)`

### Rendering
- **Background**: Circular gradient (light beige face)
- **Grid Circles**: 0.5 and 1.0 (reference lines showing 50% and 100% grip usage)
- **Axes**: X (longitudinal) and Y (lateral) crosshairs
- **Operating Point**: Red dot at (FxN, FyN)
  - Dot at center = no forces (zero grip)
  - Dot at circle edge = 100% grip used
  - Dot outside circle = overload (physically impossible; indicates numerical artifact)
- **Display Text**:
  - "XX%" (saturation percentage, centered)
  - "FRONT AXLE" or "REAR AXLE" (label)

### Interpretation
- **Saturation < 50%**: Plenty of grip reserve; can apply more forces
- **Saturation 50–90%**: Moderate commitment; some reserve remaining
- **Saturation 90–100%**: Nearly maxed out; little margin for additional forces
- **Saturation > 100%**: Overload (constraint solver artifact, rarely visible)

**Dot Position Analysis**:
- Dot far right: Heavy throttle/braking (dominates longitudinal)
- Dot far up: Heavy lateral force (drifting, cornering hard)
- Dot at 45° angle: Balanced; cornering while accelerating (pure oversteer/understeer)

---

## Gauge C: Slip Angle Meter (β)

**File**: `renderer.js:drawSlipAngleMeter()`
**Grid Position**: Integrated into gauge row

### Purpose
Measures the angle between the car's velocity vector and its heading (the direction it's pointing). A side-slip indicates either a drift, a loss of traction, or an emergency maneuver.

### Telemetry
- **Car Heading**: `state.body.heading` (rad, 0 = +Y axis, clockwise positive)
- **Velocity Components** (world-space):
  - vX = `state.body.velocityX` (m/s)
  - vY = `state.body.velocityY` (m/s)

**Projection to Car Axes**:
- Longitudinal velocity:
  ```
  vLong = vX × sin(heading) + vY × -cos(heading)
  ```
- Lateral velocity:
  ```
  vLat = vX × cos(heading) + vY × sin(heading)
  ```

**Slip Angle (β)**:
```
β = atan2(vLat, max(abs(vLong), 0.25))  [radians]
β_degrees = β × 180 / π
```

### Rendering
- **Display Type**: Horizontal bar meter with spring-smoothed indicator
- **Range**: ±45°
- **Tick Marks**: At ±15°, ±30°, ±45° for easy reference
- **Indicator**: Red circular marker, spring-smoothed position (no jitter)
- **Center**: Zero marking (straight-ahead driving)
- **Display Text**: "β = ±XX.X°" (numeric value)

### Color Coding (Optional)
- **Green (|β| < 15°)**: Small slip; mostly straight
- **Yellow (15° ≤ |β| < 30°)**: Moderate slip angle (cornering, light drift)
- **Orange (30° ≤ |β| < 45°)**: Large slip angle (heavy drift/oversteer)
- **Red (|β| ≥ 45°)**: Extreme slip (full drift or loss of control)

### Interpretation
- **β ≈ 0°**: Car is pointing in its direction of travel (no drift)
- **β > 0**: Car yawed right, moving left relative to heading (left-oversteer, right-drift)
- **β < 0**: Car yawed left, moving right relative to heading (right-oversteer, left-drift)
- **|β| > 35°**: Uncontrollable spin risk; most road cars stall out here

---

## Gauge D: Drift Stability Radar

**File**: `renderer.js:drawDriftRadar()`
**Grid Position**: Integrated into gauge row

### Purpose
A six-axis "health check" spider chart that visualizes the overall drift stability. Each axis represents a key drift control variable normalized to [0, 1]. A fat polygon suggests a stable, controllable drift; thin or distorted shapes indicate loss of control.

### Telemetry & Calculations

All six axes are spring-smoothed independently using `radarNeedles[0..5]`.

#### Axis 1: Yaw Margin
```
yawMargin = clamp(abs(angularVelocity) / 2.0, 0, 1.25) / 1.25
```
- **Meaning**: How close to the yaw stability limit
- **[0.0]**: No rotation; stable
- **[1.0]**: At 2.0 rad/s limit
- **[>1.0]**: Exceeds safe limit (spin risk)

#### Axis 2: Rear Saturation
```
rearFxN = rearFx / (μ × rearN)
rearFyN = rearFy / (μ × rearN)
rearSat = hypot(rearFxN, rearFyN)
rearSaturation = clamp(rearSat, 0, 1.25) / 1.25
```
- **Meaning**: How hard the rear tires are working
- **[0.0]**: Rear has full grip reserve
- **[1.0]**: Rear at 100% saturation (committed to drift)
- **[>1.0]**: Rear overloaded (loss of grip)

#### Axis 3: Front Authority
```
frontSaturation = hypot(frontFxN, frontFyN)
frontAuthority = 1.0 - clamp(frontSaturation, 0, 1.0)
```
- **Meaning**: How much steering authority remains at front
- **[1.0]**: Full front grip available (can steer freely)
- **[0.5]**: 50% grip used at front
- **[0.0]**: Front maxed out (understeer/can't steer harder)

#### Axis 4: Slip Angle (|β|)
```
slipAngle = abs(atan2(vLat, max(abs(vLong), 0.25)))
slipAngleNorm = clamp(slipAngle / 35°, 0, 1.0)
```
- **Meaning**: Magnitude of the body's slip angle
- **[0.0]**: Straight (β ≈ 0°)
- **[1.0]**: 35° slip (heavy drift, near loss of control)
- **[>1.0]**: >35° slip (uncontrollable)

#### Axis 5: Countersteer Alignment
```
align = clamp(1.0 - abs(sign(β) × steerAngle) / steerRef, 0, 1.0)
```
- **Meaning**: How well steering is aligned against slip direction (good countersteer)
- **[1.0]**: Perfect countersteer; steering opposes slip perfectly
- **[0.5]**: Neutral; steering neither helps nor hurts
- **[0.0]**: Steering is WITH the slip (making it worse; oversteer aggravation)

#### Axis 6: Speed Ratio
```
speedNorm = clamp(speed / 25, 0, 1.0)
```
- **Meaning**: Normalized speed (25 m/s ≈ 90 km/h is reference)
- **[0.0]**: Stationary
- **[1.0]**: 25 m/s (90 km/h, good drift entry speed)
- **[>1.0]**: Faster (higher commitment)

### Rendering
- **Display Type**: Spider/radar chart with six equally-spaced axes (60° apart)
- **Grid Rings**: At 0.25, 0.5, 0.75, 1.0 (reference concentric circles)
- **Polygon**: Filled shape (semi-transparent red) connecting all six normalized values
- **Axes**: Thin gray lines radiating from center
- **Axis Labels**: "Yaw", "Rear Sat", "Front Auth", "Slip β", "Steer Align", "Speed" (around perimeter)

### Smoothing
Each axis value is independently spring-smoothed using its dedicated needle physics instance (`radarNeedles[i]`). This creates a smooth morphing polygon that responds to driving inputs with lag, rather than flickering.

### Interpretation
- **Large, Full Polygon**: Balanced, controllable drift
  - All axes healthy; good margin on all fronts
- **Compressed Laterally**: Limited steering (front authority down, alignment poor)
- **Thin Vertically**: Rear slipping hard, but yaw stable
- **Spiky / Distorted**: Unstable; some axes dangerously high, others dangerously low
- **Shrinking Polygon**: Slowing down or restabilizing (speed and drift intensity dropping)
- **Expanding Polygon**: Accelerating into harder drift (danger zone if already high)

---

## Implementation Notes

### Performance
- **No Per-Frame Allocations**: Gauges reuse state objects (wheelForces, axleForces)
- **No String Allocation in Loops**: Text is pre-formatted
- **Minimal Canvas State Changes**: Gradients created once per gauge, not per frame
- **Spring Smoothing**: All needle animations use shared, pre-allocated physics instances

### Integration
- **Gauge Registry**: All four gauges registered at module load time in `main.js`
- **Custom Renderers**: Each gauge has a dedicated `drawXXX()` function in `renderer.js`
- **Telemetry Flow**:
  1. Physics step updates `state.wheelForces`, `state.axleForces`
  2. `drawGauges()` reads current state values
  3. Custom renderers access state directly and draw (no intermediate data structures)

### Tuning
All physics constants (yaw limit, slip angle reference, speed reference) are defined in `constants.js` and exposed via `state.params` sliders, allowing real-time tuning without code changes.

---

## Testing Checklist

- [ ] All four gauges appear in the gauge row on startup
- [ ] Yaw Stability needle rotates smoothly left/right with steering input
- [ ] Yaw Stability needle length grows when yaw rate approaches limit
- [ ] Friction circles show red dots moving with acceleration/braking
- [ ] Friction circle saturation percentage updates correctly
- [ ] Slip angle indicator (β) responds smoothly to drifting
- [ ] Drift Radar polygon morphs smoothly during spiraling maneuver
- [ ] No console errors on gauge rendering
- [ ] Gauge rendering cost measured with DevTools; <5% of frame budget
- [ ] No memory leaks (heap snapshot before/after 30s of driving)
