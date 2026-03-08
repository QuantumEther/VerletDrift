# Critical RPM Coupling Fixes - Validation Guide

**Commits:** `ffcc6b2` (both fixes) builds on `10a271b` (threshold increase)

## What Was Fixed

### Fix 1: Inverted engineRpmFromWheel Formula
The calculation was dividing when it should multiply:
- **Old (wrong):** `engineRpmFromWheel = wheelRpm / (gearRatio × finalDrive)` → produces tiny values (~5-30 RPM)
- **New (correct):** `engineRpmFromWheel = wheelRpm × (gearRatio × finalDrive)` → produces realistic values (100-3000 RPM)

### Fix 2: Clamping Floor Overriding Transient Blend
The minimum RPM clamp (640 = idle × 0.8) was preventing the blend from working:
- **Old:** Fixed floor of 640 RPM → blended values got clamped back up
- **New:** Blend-aware floor that ranges from 640 (free-rev) to 160 (wheel-locked)
  - When blend ≈ 1.0 (wheels not spinning): floor = 640
  - When blend ≈ 0.5 (wheels medium): floor = 400
  - When blend ≈ 0.0 (wheels fast): floor = 160

## Expected Debug Values AFTER Fixes

### Test: Full Throttle from Standstill

**Early launch (wheels slow, ω ≈ 5-15 rad/s):**
```
[CASE B] rearAvgOmega=10.5 | freeRpm=5200 | engineRpmFromWheel=383 | blend=0.74 | final RPM=3980
         ↑ wheels at 3.2 m/s    ↑ engine wants 5200  ↑ wheels demand 383  ↑ mostly throttle  ↑ mostly throttle
```

**Mid launch (wheels accelerating, ω ≈ 20-30 rad/s):**
```
[CASE B] rearAvgOmega=25.0 | freeRpm=4800 | engineRpmFromWheel=911 | blend=0.38 | final RPM=2850
         ↑ wheels at 7.5 m/s    ↑ engine wants 4800  ↑ wheels demand 911  ↑ mostly throttle  ↑ transitioning
```

**Late launch (wheels spinning faster, ω ≈ 35-45 rad/s):**
```
[CASE B] rearAvgOmega=40.0 | freeRpm=4500 | engineRpmFromWheel=1455 | blend=0.0 | final RPM=1455
         ↑ wheels at 12 m/s     ↑ engine wants 4500  ↑ wheels demand 1455 ↑ blend done!  ↑ wheel-locked
```

### Key Differences from Broken Version

**BROKEN (old code):**
```
rearAvgOmega=20.06 | freeRpm=1022 | engineRpmFromWheel=13 | blend=0.50 | final RPM=640
                                                          ↑ TINY!                        ↑ STUCK!
```

**FIXED (new code):**
```
rearAvgOmega=20.06 | freeRpm=5200 | engineRpmFromWheel=730 | blend=0.50 | final RPM=2965
                                                        ↑ REALISTIC!                  ↑ RESPONSIVE!
```

## How to Test

### Test 1: Full Throttle Launch
1. Hard refresh browser (Ctrl+Shift+R) to clear module cache
2. Press P to reset car
3. Shift to 1st gear (use arrow keys or Q/E shortcut)
4. Hold W (throttle)
5. **Expected behavior:**
   - RPM rises from idle (800) toward redline (6000) with throttle
   - Wheels gradually accelerate (visual/motion confirmation)
   - Car moves forward smoothly
   - Slip ratio gauges show more reasonable values (not extreme)
6. **Broken behavior would be:**
   - RPM stuck at 640 or 800
   - No apparent response to throttle
   - Car doesn't move or barely moves

### Test 2: Check Console Debug Output
1. Open Developer Console (F12)
2. Filter for `[CASE B]` logs
3. Verify progression:
   - Early frames: `blend ≈ 0.7-1.0`, `engineRpmFromWheel ≈ 100-300`
   - Mid frames: `blend ≈ 0.3-0.5`, `engineRpmFromWheel ≈ 500-1000`
   - Late frames: `blend ≈ 0.0`, `engineRpmFromWheel ≈ 1000-2000`

### Test 3: Verify No Stalling
1. Get to 1st gear at idle
2. Engage clutch partially (press A partway)
3. Apply moderate throttle (hold W gently)
4. **Expected:** Car should accelerate smoothly without stalling
5. **Broken behavior:** Car would stall immediately

## Parameters to Verify

If you see strange values, check:
- **idleRpm** (default 800) — check in UI slider
- **redlineRpm** (default 6000) — check in UI slider
- **gearRatio** for current gear — should be 3-4 for 1st gear
- **finalDriveRatio** (default 3.5) — check in state.js
- **wheelRadius** (default 0.3) — check in state.js

## If It's Still Not Working

Check the console for:
1. **Syntax errors** in physics.js around lines 460-495
2. **NaN values** in debug output → indicates division by zero somewhere
3. **RPM still clamped at 640** → verify clampFloor calculation is applied
4. **engineRpmFromWheel still tiny** → verify multiplication is being used, not division

### Manual Calculation Check

With these values:
- rearAvgOmega = 20 rad/s
- gearRatio = 3.5
- finalDrive = 3.5

Expected:
```
wheelRpmValue = 20 × 9.549 = 191 RPM
engineRpmFromWheel = 191 × 3.5 × 3.5 = 2,338 RPM ← should see values in this range
blend = max(0, 1.0 - 20/40) = 0.5
clampFloor = 800 × (0.8 × 0.5 + 0.2 × 0.5) = 800 × 0.5 = 400
final RPM ≈ 0.5 × freeRpm + 0.5 × 2338 ≈ 2500-3500 range
```

If actual values don't match, the formula fix didn't apply correctly.
