# GPU Rendering Debugging Guide

## Case Study: Skid Mark Alignment Issue (March 2026)

### Problem Statement

**Symptom**: Skid marks drifted relative to the car model as the camera moved, with position-dependent behavior:
- **At top of map** (camera.y ≈ 230m): Marks appeared **above** the car
- **At middle of map** (camera.y ≈ 120m): Marks appeared **correctly aligned** ✓
- **At bottom of map** (camera.y ≈ 5m): Marks appeared **below** the car
- **Magnitude**: ~20+ pixels consistent drift (not zoom-dependent)

**Visual Impact**: Trail arrows and particles were perfectly aligned with the car, but skid marks lagged/drifted, breaking the visual coherence.

---

## Investigation Process

### Phase 1: Initial Analysis

**Key Observation**: The drift was **symmetric around the map center** and **position-dependent on Y-axis**, suggesting a coordinate space issue specific to the skid mark rendering path.

**Coordinate Systems Identified**:
```
Arrows & Particles:
├─ CPU: Pre-compute camera offset (world - camera)
└─ GPU: Direct NDC transform

Skid Marks (Accumulate):
├─ CPU: Map-centered world coordinates (world - mapCenter)
└─ GPU: Render to persistent texture (world-space)

Skid Marks (Composite):
├─ CPU: World-absolute camera position
└─ GPU: Sample texture using camera/mapSize as UV center
```

**Initial Hypothesis**: Mismatch between how arrows/particles are positioned (camera-relative) vs how skid marks are sampled (world-space texture).

### Phase 2: Data Collection & Verification

**Debug Approach**: Added console logging to track `uvCenterY` values across the map range.

**Data Collected**:
```
Bottom (camera.y=0.49m):   uvCenterY=0.0020  (expected: 0.49/240=0.00204 ✓)
Middle (camera.y=120.78m): uvCenterY=0.5032  (expected: 120.78/240=0.5032 ✓)
Top (camera.y=234.39m):    uvCenterY=0.9766  (expected: 234.39/240=0.9766 ✓)
```

**Key Finding**: CPU mathematical calculations were **100% correct**. The issue was NOT in coordinate transform math.

### Phase 3: Failed Fix Attempts

#### Option 1: Remove Y-Axis Negation in Composite Shader
**File**: `js/shaders/skid-composite.wgsl` line 40
```wgsl
// Changed from:
output.uv = vec2(...) + quadNdcPosition * vec2(..., -uniforms.uvScaleY);

// To:
output.uv = vec2(...) + quadNdcPosition * vec2(..., uniforms.uvScaleY);
```

**Result**: ❌ **FAILED** - Marks flowed in weird, inverted direction
**Lesson**: The negation was correct; Y-axis inversion wasn't the issue

#### Option 2: Invert uvCenterY in CPU
**File**: `js/gpu-renderer.js` line 511
```javascript
// Changed from:
COMP_DATA[1] = camera.y / MAP_H;

// To:
COMP_DATA[1] = (MAP_H - camera.y) / MAP_H;
```

**Result**: ❌ **FAILED** - Marks moved non-linearly; correct in middle, drifted at edges
**Diagnostic**: Non-linear drift pattern confirmed asymmetry issue, not simple inversion

#### Option 3: Remove Y-Axis Negation in Accumulate Shader
**File**: `js/shaders/skid-accumulate.wgsl` line 70
```wgsl
// Changed from:
let normalizedDeviceCoordY = -worldPositionY * ...;

// To:
let normalizedDeviceCoordY = worldPositionY * ...;
```

**Result**: ❌ **FAILED** - Marks rendered inverted/upside-down
**Lesson**: Both shaders' negations were necessary and consistent

#### Option 4: Mathematical Compensation for Aspect Ratio Asymmetry
**File**: `js/gpu-renderer.js` lines 510-513
```javascript
// Added aspect ratio correction factor
const yPpmRatio = (SKID_TEX_H / MAP_H) / (SKID_TEX_W / MAP_W);
COMP_DATA[1] = camera.y / MAP_H * yPpmRatio;
COMP_DATA[3] = canvasHeight / (2 * eff * MAP_H) * yPpmRatio;
```

**Result**: ❌ **FAILED** - Partially helped but still misaligned
**Why It Failed**: Attempting to compensate for a fundamental design problem rather than fixing it

### Phase 4: Root Cause Discovery

**Critical Insight** (from user observation):
> "I don't understand why 300m by 240m gets 'translated' to 4096 by 3072... ratio of 1.25 and the latter 1.33..."

**The Real Issue**: Texture dimensions didn't match map aspect ratio!

```
Map:     300m × 240m = 1.25 aspect ratio
Texture: 4096 × 3072 = 1.333... aspect ratio ← MISMATCH!

This creates asymmetric pixel density:
├─ X-axis: 4096 / 300 = 13.65 pixels/meter
└─ Y-axis: 3072 / 240 = 12.8 pixels/meter (6.64% difference!)
```

**Why This Caused Drift**:
1. Accumulate shader uses uniform `ppm` value for both X and Y
2. Texture's actual Y density (12.8 ppm) differs from X density (13.65 ppm)
3. Marks written to texture with wrong Y scaling = distorted in Y-axis
4. Composite shader samples with standard math but texture is already warped
5. Result: Non-linear position-dependent drift ← **Exactly what we observed!**

---

## The Solution

### Root Cause Fix: Correct Texture Dimensions

**File**: `js/gpu-renderer.js` line 31
```javascript
// Before:
const SKID_TEX_H = 3072;

// After:
const SKID_TEX_H = 3276;
```

**Calculation**:
```
For uniform PPM across both axes:
  PPM = 4096 / 300 = 13.65 pixels/meter
  Texture height = 240m × 13.65 = 3276 pixels
```

**Result**: ✅ **PERFECT** - Skid marks aligned at all map positions

### Why This Works

1. **Eliminates asymmetry**: Texture now has same PPM in both X and Y (≈13.65)
2. **No compensation needed**: Simple, clean math without layer upon layer of fixes
3. **Correct by design**: Texture dimensions now match map aspect ratio exactly
4. **Future-proof**: Any changes to map size will immediately need texture recalculation

---

## Verification

### Testing Procedure
1. Hard refresh browser: `Ctrl+Shift+R` (bypass cache AND module registry)
2. Drive car to **bottom** of map → Create marks → **Verify alignment**
3. Drive car to **middle** of map → Create marks → **Verify alignment**
4. Drive car to **top** of map → Create marks → **Verify alignment**
5. Test at different zoom levels (1x, 2x, 4x)
6. Verify arrows still aligned (visual sanity check)

### Results
- ✅ Marks perfectly aligned at **top, middle, bottom**
- ✅ No drift as camera pans in X or Y
- ✅ Marks flow in correct direction (no inversions)
- ✅ Consistent across all zoom levels
- ✅ No console errors

---

## Key Lessons Learned

### 1. **Root Causes Are Often Simpler Than You Think**
   - Spent time investigating shader inversions and coordinate transforms
   - Actual issue: Texture dimensions didn't match map proportions
   - **Lesson**: Consider initialization/setup issues before complex math

### 2. **Early Diagnostic Observations Are Critical**
   - User noted aspect ratio mismatch on Day 1
   - Should have been the starting investigation point
   - Instead, treated it as contextual information
   - **Lesson**: When something seems "wrong by design," investigate it first

### 3. **Fix Problems at the Root, Not With Compensation**
   - Options 1-4 were all "fixes" that layered compensation on top
   - Actual solution: Fix the underlying design problem
   - **Lesson**: Don't band-aid architecture issues; redesign to correct them

### 4. **Non-Linear Behavior = Compound/Scaling Issues**
   - When drift is correct in middle but wrong at edges → aspect ratio/scaling issue
   - When drift is constant across all positions → simple offset/inversion issue
   - **Lesson**: Drift pattern shape tells you the problem type

### 5. **Mathematical Verification ≠ Correctness**
   - CPU math verified as 100% correct
   - But still led to visual misalignment
   - Issue wasn't in the math; it was in what the math was operating on
   - **Lesson**: Verify both the math AND the inputs/setup

---

## How to Fix Similar Issues

### If Skid Marks Misalign Again:

**Checklist**:
1. ✓ Verify camera math is correct (log camera position values)
2. ✓ Check texture dimensions match map aspect ratio
   ```
   MapAspect = MAP_W / MAP_H
   TextureAspect = SKID_TEX_W / SKID_TEX_H
   // Should be equal!
   ```
3. ✓ Verify uniform PPM is used for both X and Y
4. ✓ Check shader coordinate space assumptions (world vs camera-relative vs NDC)
5. ✓ If still broken, add debug logging to compare:
   - Arrows position (known to work)
   - Skid mark position
   - Camera position

### If Similar Textures Misalign:

**General Principle**: Before debugging coordinate transforms, verify:
```
1. Source dimensions (map/world size)
2. Target dimensions (texture size)
3. Aspect ratios match?
4. Pixel density uniform across both axes?
5. All transforms use consistent PPM?
```

---

## Commits Related to This Fix

| Commit | Message | Status |
|--------|---------|--------|
| `040e790` | Fix: Remove duplicate PULSE_LOOKAHEAD declaration | ✓ |
| `893009a` | Refactor: Rename WGSL shader variables to descriptive names | ✓ |
| `4cc575a` | Debug: Add console logging for skid mark Y-axis investigation | ✓ |
| `25ea937` | Fix (Phase 3D): Correct skid texture dimensions to match map aspect ratio | ✓ **MAIN FIX** |
| `4520230` | Cleanup: Remove debug logging for skid mark investigation | ✓ |

---

## Related Files

### Core GPU Rendering
- `js/gpu-renderer.js` - Main GPU pipeline, texture creation, uniform updates
- `js/shaders/skid-accumulate.wgsl` - Writes new marks to persistent texture
- `js/shaders/skid-composite.wgsl` - Samples texture and renders to screen
- `js/shaders/arrows.wgsl` - Trail arrows (for reference comparison)
- `js/shaders/particles.wgsl` - Sparks/splat particles (for reference comparison)

### Constants
- `js/constants.js` - Map dimensions (DEFAULT_MAP_WIDTH, DEFAULT_MAP_HEIGHT)

### Physics/State
- `js/trail.js` - Generates skid mark segments
- `js/physics.js` - Vehicle physics (position/rotation)
- `js/state.js` - Global game state (camera, skid marks list)

---

## Additional Notes

### Texture Dimensions Relationship
```
For any map size and desired PPM:

Required texture dimensions:
  TEXTURE_W = MAP_W × PPM
  TEXTURE_H = MAP_H × PPM

For VerletDrift:
  MAP_W = 300m, MAP_H = 240m
  Desired PPM ≈ 13.65 (chosen for X-axis resolution)

  Result:
    TEXTURE_W = 300 × 13.65 = 4095 → rounded to 4096 (power of 2)
    TEXTURE_H = 240 × 13.65 = 3276 ← must match!
```

### Power-of-Two Optimization
- SKID_TEX_W = 4096 is a power of 2 (good for GPU performance)
- SKID_TEX_H = 3276 is NOT a power of 2 (slight performance trade-off, but necessary for correctness)
- This is a reasonable trade-off: correctness > optimization

### If You Need Different Dimensions
If the map size or desired PPM changes:
```javascript
const MAP_W = /* new width */;
const MAP_H = /* new height */;
const DESIRED_PPM = /* pixels per meter */;

const SKID_TEX_W = Math.pow(2, Math.ceil(Math.log2(MAP_W * DESIRED_PPM)));
const SKID_TEX_H = MAP_H * DESIRED_PPM;  // Keep exact, not power-of-2
```

---

**Document Version**: 1.0 (March 2026)
**Last Updated**: After Phase 3D completion
**Status**: Complete and verified ✓
