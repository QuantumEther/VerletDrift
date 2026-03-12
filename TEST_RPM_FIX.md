# RPM Fix Test Scenarios

## The Fix
**Changed wheelSpeedThreshold from 5.0 to 40.0 rad/s in CASE B (fully engaged clutch)**

This gives the engine much longer to free-rev and respond to throttle input while wheels accelerate.

## Expected Behavior After Fix

### Scenario 1: Full Throttle Launch from Standstill
**Input:** Full throttle, 1st gear engaged, wheels touching ground
**Expected Timeline:**
1. t=0.0s: omega=0, blend=1.0 → RPM follows free-rev to ~6000 RPM
2. t=0.5s: omega~10-15 rad/s, blend~0.6-0.75 → RPM still mostly free-rev (~5000 RPM), wheels accelerating
3. t=1.0s: omega~20-25 rad/s, blend~0.4-0.5 → RPM still responsive to throttle (~4500 RPM), wheels at ~6-7.5 m/s
4. t=1.5s: omega~30-35 rad/s, blend~0.125-0.25 → RPM transition beginning, wheels at ~9-10.5 m/s
5. t≥2.0s: omega~40+ rad/s, blend→0 → RPM locks to wheel-speed coupling

**Key verification:** Car should accelerate smoothly, RPM should rise with throttle, wheels should spin up gradually

### Scenario 2: Clutch Engagement While Moving
**Input:** In neutral coasting at ~10 m/s, then engage 1st gear (release clutch)
**Expected:** No jerk or stall; smooth acceleration as driveline engages

### Scenario 3: No Stalling on Gentle Accel
**Input:** 1st gear engaged, gentle throttle (not full)
**Expected:** Car should not stall; should accelerate smoothly at reduced RPM

## How to Test

1. Start game in browser (http://localhost:8000)
2. Place car on track, get into 1st gear
3. Hold W (full throttle)
4. Watch RPM gauge and wheel slip gauges
5. **Good result:** RPM rises smoothly to 5000-6000, wheels accelerate without excessive slip
6. **Bad result:** RPM stuck at idle (~800), wheels spin wildly with extreme slip ratios

## Debug Values to Check in Console

If you want to see the blend values, look for console logs of:
```
[CASE B] rearAvgOmega=XX.XX | freeRpm=XXXX | engineRpmFromWheel=XXX | blend=X.XX | final RPM=XXXX
```

**Interpretation:**
- `rearAvgOmega`: Average rear wheel angular velocity [rad/s]
- `freeRpm`: RPM from throttle input alone (what engine "wants" to do)
- `engineRpmFromWheel`: RPM that wheel speed "demands"
- `blend`: Mix factor (1.0 = pure free-rev, 0 = wheel-locked)
- `final RPM`: Actual engine RPM after blending

For a healthy launch:
- `freeRpm` should be 4000-6000 (following throttle)
- `engineRpmFromWheel` should start very low (~0-50) and grow as wheels spin up
- `blend` should decay from 1.0 toward 0 as wheels accelerate
- `final RPM` should mostly track `freeRpm` early on, then gradually shift toward `engineRpmFromWheel`
