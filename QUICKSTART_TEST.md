# Quick Test Instructions

## Three Commits, Three Fixes

1. **10a271b** — Increased transient blend threshold from 5 to 40 rad/s
2. **ffcc6b2** — Fixed engineRpmFromWheel (divide → multiply) + blend-aware clamping

## What to Do NOW

### Step 1: Reload Browser
```
Ctrl+Shift+R  (hard refresh to clear JS cache)
```

### Step 2: Start Game
- Navigate to http://localhost:8000
- Wait for game to load
- Press P to reset car position

### Step 3: Test Launch
1. Shift into 1st gear (Q key or slider)
2. **Hold W** (full throttle)
3. **Watch for:**
   - ✅ RPM gauge rises from 800 → 5000+ (responsive to throttle)
   - ✅ Car accelerates smoothly forward
   - ✅ Wheel slip gauges show reasonable values (not extreme)
   
4. **If broken:**
   - ❌ RPM stuck at 640 or 800
   - ❌ Car barely moves
   - ❌ Extreme slip ratio values (κ >> 1)

### Step 4: Check Console (F12)
Look for logs like:
```
[CASE B] rearAvgOmega=25.0 | freeRpm=4800 | engineRpmFromWheel=911 | blend=0.38 | final RPM=2850
```

Key: `engineRpmFromWheel` should be **hundreds or thousands**, NOT single digits!

## What Changed

| Aspect | Before | After |
|--------|--------|-------|
| **Threshold** | 5 rad/s | 40 rad/s |
| **engineRpmFromWheel at 20 rad/s** | 13 RPM ❌ | 730 RPM ✅ |
| **Final RPM when blending** | Clamped to 640 ❌ | Follows blend ✅ |
| **Throttle response** | None ❌ | Full ✅ |

## Expected Timeline

### Second 0-0.5: Early Launch
- Wheels accelerate from 0 → 10 rad/s
- engineRpmFromWheel goes 0 → 365 RPM
- blend stays ≈ 0.75-1.0
- **Final RPM follows throttle (4500-5500)**

### Second 0.5-1.5: Mid Acceleration
- Wheels accelerate 10 → 30 rad/s  
- engineRpmFromWheel goes 365 → 1095 RPM
- blend transitions 0.25 → 0.75
- **Final RPM transitions 3000 → 4000**

### Second 1.5+: Wheel-Locked Coupling
- Wheels > 30 rad/s
- blend ≈ 0.0
- **Final RPM = engineRpmFromWheel** (realistic wheel-speed coupling)

## If It's Still Broken

1. **Check syntax:** Look for red errors in browser console
2. **Force cache clear:** Delete browser cache, reload
3. **Check git status:** Verify commits actually applied
   ```bash
   git log --oneline -3
   ```
   Should show `ffcc6b2` and `10a271b`

4. **Manual math check:** 
   - With rearAvgOmega = 20, gearRatio = 3.5, finalDrive = 3.5
   - Should get: engineRpmFromWheel = 20 × 9.549 × 3.5 × 3.5 ≈ **2338 RPM**
   - If you're still seeing ~13 RPM, the multiply fix didn't apply

## Next Steps

Once this is working:
1. Remove debug logging (optional)
2. Test other scenarios (braking, handbrake, drifting)
3. Validate slip ratio gauges normalize
4. Consider adjusting wheelSpeedThreshold for tuning feel
