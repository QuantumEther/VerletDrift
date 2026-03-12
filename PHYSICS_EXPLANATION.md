# Physics Explanation: Why RPM Coupling Was Broken

## The Drivetrain System

```
Engine RPM
    ↓ (× gearRatio)
Transmission Output RPM
    ↓ (× finalDriveRatio)  
Differential Output RPM
    ↓ (÷ wheelRadius, convert to ω)
Wheel Angular Velocity [rad/s]
    ↓ (× wheelRadius)
Tire Surface Speed [m/s]
```

**The key relationship:** `engineRpm = wheelRpm × gearRatio × finalDrive`

Gears AMPLIFY wheel speed back to engine speed (ratios > 1).

## The Bug: Inverted Formula

### WRONG (What the code had):
```javascript
engineRpmFromWheel = wheelRpmValue / (gearRatio × finalDrive)
```

This is **backwards**! It divides instead of multiplies.

**Example:** Wheels at 244 RPM in 1st gear (gearRatio=3.5, finalDrive=3.5)
- Engine SHOULD be at: 244 × 3.5 × 3.5 = 2,990 RPM ✓
- Code calculated: 244 / 12.25 = 19.9 RPM ✗ (off by 150×!)

### Why This Breaks Transient Blending

The blend formula is:
```
final_rpm = freeRpm × blend + engineRpmFromWheel × (1 - blend)
```

**With the bug at 20 rad/s wheels:**
- freeRpm = 1022 (throttle response)
- engineRpmFromWheel = 13 (WRONG! Should be 730)
- blend = 0.5
- Expected: 0.5 × 1022 + 0.5 × 13 = 517.5 RPM
- But clamped UP to 640 (idleRpm × 0.8)
- **Result: RPM stuck at 640, no blend effect!**

**With the fix:**
- freeRpm = 4800 (throttle response)
- engineRpmFromWheel = 730 (CORRECT)
- blend = 0.5
- Blended: 0.5 × 4800 + 0.5 × 730 = 2765 RPM
- Clamped floor = 400 (blend-aware)
- **Result: RPM follows throttle + wheel feedback!**

## The Clamping Problem

### What Was Happening

The original clamp was:
```javascript
engine.rpm = clamp(engine.rpm, idleRpm * 0.8, redlineRpm)
```

This sets a FIXED minimum of 640 RPM (800 × 0.8).

When transient blending produces a value below 640, the clamp pushes it back up, **negating the blend**!

### The Fix: Blend-Aware Clamping

```javascript
const clampFloor = idleRpm × (0.8 × transientBlend + 0.2 × (1 - transientBlend))
engine.rpm = clamp(engine.rpm, clampFloor, redlineRpm)
```

This creates a **dynamic clamp floor** that varies with blend:
- At blend = 1.0 (wheels not spinning): `floor = 800 × 0.8 = 640`
- At blend = 0.5 (wheels medium): `floor = 800 × 0.5 = 400`
- At blend = 0.0 (wheels spinning): `floor = 800 × 0.2 = 160`

**Why this works:** When wheels are slow and engineRpmFromWheel is low, the floor lowers to accommodate the blended value without clipping it. As wheels accelerate and engineRpmFromWheel rises naturally, the floor becomes irrelevant.

## Transient Blending Physics

The transient blend is designed to smooth the transition from "engine free-revving" to "engine locked to wheels":

```
Wheel Speed [rad/s]
0          10        20        30        40        50
|----------|---------|---------|---------|---------|
blend=1.0  blend=0.75 blend=0.5 blend=0.25 blend=0.0
Free-rev   Transitioning...     Wheel-locked coupling
```

**Early launch (0-1 second):**
- Wheels barely spinning (0-15 rad/s)
- blend ≈ 0.75-1.0 (mostly free-rev)
- Engine responds to throttle, wheels accelerate from torque
- RPM rises, wheels spin up, engineRpmFromWheel increases

**Mid launch (1-2 seconds):**
- Wheels accelerating (15-30 rad/s)
- blend ≈ 0.25-0.75 (transitioning)
- Engine RPM influenced by both throttle AND wheel speed
- Smoother coupling as driveline loads up

**Full launch (2+ seconds):**
- Wheels spinning (30+ rad/s)
- blend ≈ 0 (wheel-locked)
- Engine RPM = engineRpmFromWheel (realistic drivetrain coupling)
- No runaway revving; RPM tracks wheels

## Why 40 rad/s Threshold?

At 0.3m wheel radius:
- 5 rad/s = 1.5 m/s = 5.4 km/h (barely moving)
- 20 rad/s = 6 m/s = 21.6 km/h (good momentum)
- 40 rad/s = 12 m/s = 43 km/h (highway merge speed)

With threshold = 5 rad/s:
- Wheels exceed it almost immediately
- Engine locks to wheels while they're barely spinning
- RPM plummets to unrealistic values

With threshold = 40 rad/s:
- Wheels have time to build up speed (2-3 seconds)
- Engine stays responsive to throttle throughout launch
- Smooth transition once wheels reach meaningful speed
- More realistic and intuitive driving feel

## Mathematical Proof

**Setup:**
- idleRpm = 800, redlineRpm = 6000
- gearRatio = 3.5 (1st gear), finalDrive = 3.5
- wheelRadius = 0.3m

**Scenario: Full throttle from standstill**

**t = 0.0s (wheels = 0 rad/s):**
```
freeRevTarget = 800 + 1.0 × (6000 - 800) = 6000
freeRpm ≈ 800 (starts at idle, ramps up)
engineRpmFromWheel = 0 × 9.549 × 3.5 × 3.5 = 0
blend = max(0, 1.0 - 0/40) = 1.0
clampFloor = 800 × (0.8 × 1.0 + 0.2 × 0.0) = 640
RPM = 1.0 × freeRpm + 0 = freeRpm (follows throttle) ✓
```

**t = 1.0s (wheels = 20 rad/s ≈ 6 m/s):**
```
freeRevTarget = 6000 (still full throttle)
freeRpm ≈ 4500 (rising toward 6000)
wheelRpmValue = 20 × 9.549 = 191
engineRpmFromWheel = 191 × 3.5 × 3.5 = 2338
blend = max(0, 1.0 - 20/40) = 0.5
clampFloor = 800 × (0.8 × 0.5 + 0.2 × 0.5) = 400
RPM = 0.5 × 4500 + 0.5 × 2338 = 3419 (transitioning) ✓
```

**t = 2.0s (wheels = 40 rad/s = 12 m/s):**
```
freeRevTarget = 6000 (still full throttle)
freeRpm ≈ 5500 (nearly at target)
wheelRpmValue = 40 × 9.549 = 382
engineRpmFromWheel = 382 × 3.5 × 3.5 = 4676
blend = max(0, 1.0 - 40/40) = 0.0
clampFloor = 800 × (0.8 × 0.0 + 0.2 × 1.0) = 160
RPM = 0.0 × 5500 + 1.0 × 4676 = 4676 (wheel-locked) ✓
```

**Result:** RPM smoothly transitions from 800 → 3419 → 4676 as wheels accelerate!

Without the fixes, RPM would be stuck at 640 throughout, with wheels unable to properly accelerate.
