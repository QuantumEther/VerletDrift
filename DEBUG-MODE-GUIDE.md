# VerletDrift Debug Mode Guide

Comprehensive reference for the observability and logging system.

---

## Quick Start

### Launch Modes

```bash
# Quiet mode (zero spam, for normal play)
index.html?debugMode=quiet

# Tuning mode (sampled logs + telemetry overlay)
index.html?debugMode=tuning

# Trace mode (high-frequency logs for one channel)
index.html?debugMode=trace&traceChannel=tires&traceMs=1500
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `F2` | Cycle debug mode: quiet → tuning → trace → quiet |
| `F3` | Toggle overlay visibility (telemetry + events) |
| `Shift+Ctrl+T` | Open trace window (select channel, duration) |

---

## Logger API Quick Reference

### Core Logging Methods

```javascript
// Available levels: error, warn, info, debug, trace
import { logger } from './js/debug/logger.js';

// Basic logging (gated by mode + level + channel)
logger.error(channel, message, data?);
logger.warn(channel, message, data?);
logger.info(channel, message, data?);
logger.debug(channel, message, data?);
logger.trace(channel, message, data?);  // Only within trace window

// Examples
logger.error('fault', 'Constraint divergence detected', { magnitude: 1.5 });
logger.warn('engine', 'RPM spike: 8500→9200', { prevRpm: 8500, newRpm: 9200 });
logger.info('tires', 'Wheel locked');
```

### Sampling & Conditional Logging

```javascript
// Sample every N frames
logger.sampleEvery('info', 'engine', 100, () => 'RPM: ' + state.engine.rpm);

// Sample every N milliseconds
logger.sampleEveryMs('debug', 'smoke', 250, () => 'Smoke active');

// Log only on value change
logger.onChange('info', 'tires', 'wheelLock', state.wheelLocked,
  () => state.wheelLocked ? 'Lock entered' : 'Lock released');
```

### Configuration API

```javascript
import { logger, setMode, setLevel, setChannelsAllowlist, setTraceWindow } from './js/debug/logger.js';

// Switch mode (quiet / tuning / trace)
setMode('tuning');

// Set log level (error / warn / info / debug / trace)
setLevel('debug');

// Filter by channels (null = all channels allowed)
setChannelsAllowlist(['tires', 'engine']);  // Only these channels
setChannelsAllowlist(null);                  // All channels

// Set trace window (time-bounded high-frequency logging)
setTraceWindow('fault', 2000);  // Log [fault] for 2000ms
```

---

## Debug Modes Explained

### Quiet Mode

**Purpose:** Normal play, performance testing, clean console

**Console output:**
- ❌ No info/debug/trace logs
- ✅ error, warn allowed

**Overlays:**
- Off by default

**Use cases:**
- Running the sim at full speed without distraction
- Performance profiling (no logging overhead)
- Player/demo mode

**Example URL:**
```
index.html?debugMode=quiet
```

### Tuning Mode

**Purpose:** Parameter tuning, understanding frame-by-frame behavior

**Console output:**
- ✅ Sampled info/debug logs (1-5 per second typical)
- ✅ error, warn allowed

**Overlays:**
- On by default (telemetry + recent events)

**Sampling:**
- Frame-based: `sampleEvery('debug', ch, 50, ...)` → logs every 50 frames
- Time-based: `sampleEveryMs('info', ch, 500, ...)` → logs every 500ms
- Change tracking: `onChange()` → logs only when value changes

**Use cases:**
- Tuning suspension stiffness (view damping, forces)
- Validating tire slip calculations
- Checking weight distribution across frames
- Monitoring for anomalies with overlay event panel

**Example URL:**
```
index.html?debugMode=tuning&overlays=true
```

### Trace Mode (Channel-Specific)

**Purpose:** Deep forensic investigation of one subsystem

**Console output:**
- ✅ HIGH-FREQUENCY logs for chosen channel
- ✅ error, warn allowed
- ✅ Other channels: sampled or muted

**Overlays:**
- On by default (telemetry + events + fault panel)

**Duration:**
- Configurable trace window (e.g., 1500ms)
- After window closes, logging returns to normal

**Use cases:**
- Debugging tire slip calculations (enable tires trace for 1.5s after event)
- Investigating constraint solver instability
- Capturing full physics sequence during a fault
- Analyzing smoke particle spawn logic

**Example URLs:**
```
# Trace tires for 1.5 seconds
index.html?debugMode=trace&traceChannel=tires&traceMs=1500

# Trace fault events for 2 seconds
index.html?debugMode=trace&traceChannel=fault&traceMs=2000

# Trace engine + sound for 3 seconds
index.html?debugMode=trace&traceChannel=engine,sound&traceMs=3000
```

---

## URL Parameters Reference

### Debug Configuration

| Parameter | Values | Default | Example |
|-----------|--------|---------|---------|
| `debugMode` | quiet, tuning, trace | quiet | `?debugMode=tuning` |
| `logLevel` | error, warn, info, debug, trace | warn (quiet), debug (tuning), trace (trace) | `?logLevel=info` |
| `logChannels` | comma-separated channel names | null (all) | `?logChannels=tires,engine` |
| `traceChannel` | channel name | null | `?traceChannel=fault` |
| `traceMs` | milliseconds (integer) | 1500 | `?traceMs=2000` |
| `overlays` | true, false | false (quiet), true (tuning/trace) | `?overlays=true` |
| `freezeOnError` | true, false | false | `?freezeOnError=true` |

### Example Repro Links

**Diagnose tire slip issues:**
```
index.html?debugMode=trace&traceChannel=tires&logLevel=trace&overlays=true&traceMs=2000
```

**Investigate constraint solver:**
```
index.html?debugMode=tuning&logChannels=constraints&overlays=true
```

**Debug smoke system:**
```
index.html?debugMode=trace&traceChannel=smoke&traceMs=1500
```

**Frozen state analysis (pause on critical error):**
```
index.html?debugMode=trace&freezeOnError=true&traceChannel=fault
```

---

## Telemetry Overlay Reference

### Telemetry Panel (Top-Right)

Shows per-frame metrics:

```
=== TELEMETRY ===
FPS: 200.0 / 100.0 TPS
Frame: 12345 | dt: 5.1ms
Time: 123.45s

Constraints:
  max=0.0012m avg=0.0008m
  iters=8

--- WHEELS ---
FL: ω=45.3 κ=0.12 α=2.45
FR: ω=44.9 κ=0.10 α=2.30
RL: ω=42.1 κ=-0.05 α=-1.80
RR: ω=42.7 κ=-0.08 α=-1.95
```

**Metrics explanation:**
- `FPS / TPS`: Render frame rate and physics ticks per second
- `dt`: Frame delta-time (target 5ms for 200 FPS)
- `Constraints.max`: Largest position correction applied
- `Constraints.iters`: Number of constraint iterations last frame
- `ω` (omega): Wheel rotation speed (rad/s)
- `κ` (kappa): Slip ratio (0 = locked, 1 = free rolling)
- `α` (alpha): Slip angle (degrees; >45° indicates oversteer/understeer)

### Recent Events Panel (Bottom-Right)

Shows last 10 events from ring buffer:

```
=== RECENT EVENTS ===
[fault] Non-finite centerX: NaN
[tires] Wheel lock entered (FR)
[smoke] Smoke spawned: 450 particles
[engine] RPM spike: 8500→8950
...
Total events: 142
```

**Color coding:**
- 🔴 Red = error level
- 🟠 Orange = warn level
- 🟢 Green = info/debug level

### Fault Status Indicator (Top-Left)

```
DEBUG MODE: TUNING
FAULTS DETECTED
```

**Status states:**
- `NOMINAL` (green) — No recent faults
- `FAULTS DETECTED` (orange) — Fault event in last 5 seconds
- `FROZEN` (red) — Simulation paused due to critical error

---

## Event Ring Buffer API

### Accessing Events Programmatically

```javascript
import { eventBuffer } from './js/debug/events.js';

// Get recent events (newest first)
const events = eventBuffer.getEvents(10, true);

// Find events by type
const lockEvents = eventBuffer.findEventsByType('wheel_lock_enter', 20);

// Find events by channel
const faultEvents = eventBuffer.findEventsByChannel('fault', 50);

// Get total count
const count = eventBuffer.getEventCount();

// Event schema
const event = {
  id: 0,                    // Sequential ID
  tWallMs: 1234567890,      // performance.now()
  tSimSec: 123.45,          // Simulation time (seconds)
  frame: 12345,             // Frame number
  level: 'warn',            // error | warn | info | debug | trace
  channel: 'tires',         // Subsystem name
  type: 'wheel_lock_enter', // Event type
  msg: 'Front-left locked', // Human-readable message
  data: {                   // Optional metadata
    wheelName: 'FL',
    slipRatio: 1.0,
    omega: 0.1
  },
  dedupeKey: 'lock:FL'      // For deduplication
};
```

### Pushing Custom Events

```javascript
import { eventBuffer } from './js/debug/events.js';

eventBuffer.pushEvent({
  level: 'info',
  channel: 'custom',
  type: 'my_event',
  msg: 'Something interesting happened',
  data: { value: 42 },
  dedupeKey: 'my_event:42' // Optional; prevents spamming same event
});
```

---

## Fault Detection System

### Built-In Fault Rules

The system automatically detects and logs these faults:

#### 1. Non-Finite Values (Every Frame)

Detects NaN or Infinity in physics state:

```
Non-finite centerX: NaN
Non-finite velocityY: Infinity
Non-finite angularVelocity: NaN
Non-finite wheel position divergence > 50m
```

**Escalation:**
- NaN = warn
- Infinity = error (may trigger freeze if `?freezeOnError=true`)

#### 2. Wheel Omega Runaway (Every Physics Substep)

Detects excessive wheel rotation:

```
Wheel FL omega runaway: 1250.5 rad/s
```

**Threshold:** > 1000 rad/s (indicates constraint solver issue or unrealistic input)

#### 3. Constraint Health (Every Physics Substep)

Monitors constraint solver corrections:

```
Constraint spike: 1.2345m
Large constraint correction: 0.8954m (instability warning)
```

**Triggers:**
- Spike: Current correction > 5× previous frame
- Large: Correction magnitude > 1.0m (indicates bad state or unstable parameters)

#### 4. Slip Anomalies (Every Physics Substep)

Detects out-of-bounds tire slip:

```
Slip ratio out of bounds: FL=3.2 (should be ±2.0)
Slip angle excessive: RR=112.5° (max ±90°)
```

**Thresholds:**
- Slip ratio κ: [-2.5, 2.5] (normal physics uses [-2, 2])
- Slip angle α: [-90°, 90°] (beyond ±90° = physically invalid)

#### 5. Timing Anomalies (Every Frame)

Detects dropped frames or substeps:

```
High frame time: 150.3ms (frame drop or tab background)
Physics substeps dropped: 3 (CPU overload)
```

**Thresholds:**
- Frame time > 100ms (< 10 FPS equivalent, typical sign of tab backgrounding)
- Dropped substeps > 2 consecutive frames (CPU can't keep up)

### Deduplication Policy

Each fault rule has a **1000ms deduplication window**:
- First occurrence: Logged to event buffer + console warn
- Within 1000ms: Silently dropped (dedupe prevents spam)
- After 1000ms: Next occurrence logged again

This prevents the same fault (e.g., constraint spike during a high-speed maneuver) from flooding the console.

### Auto-Freeze on Error

When launched with `?freezeOnError=true`:

```
index.html?debugMode=trace&freezeOnError=true
```

Any error-level fault will:
1. Set `state.debug.faults.isFrozen = true`
2. Pause the main simulation loop
3. Stop all physics/rendering updates
4. Show "FROZEN" status on overlay
5. Preserve state for inspection

This is useful for debugging instability that causes Infinity/NaN crashes.

---

## Common Debug Workflows

### Diagnosing Tire Slip Anomaly

**Situation:** Tire slip ratio seems wrong, or tire sounds odd

**Steps:**
1. Launch trace mode for tires:
   ```
   index.html?debugMode=trace&traceChannel=tires&traceMs=2000
   ```

2. Trigger the event (e.g., hard acceleration)

3. In console, look for high-frequency tires logs:
   ```
   [tires] Wheel FL: ω=142.3 rad/s, κ=0.45, α=3.2°
   [tires] Slip ratio out of bounds: FL=2.6 (should be ±2.0)
   ```

4. Check telemetry overlay:
   - Is ω increasing as expected?
   - Is κ reasonable (should be 0 locked, 1 free rolling)?
   - Is α small (< 45° indicates good grip)?

5. If anomaly found, check `js/physics/tires.js` for slip calculation.

### Investigating Constraint Divergence

**Situation:** Car feels bouncy or unstable

**Steps:**
1. Launch tuning mode with constraint logging:
   ```
   index.html?debugMode=tuning&logChannels=constraints
   ```

2. Overlay shows `Constraints: max=X avg=Y`:
   - If max > 0.1m frequently: Solver struggling
   - If max > 1.0m: Severe instability (check fault overlay for spike events)

3. Switch to trace to see per-substep details:
   ```
   index.html?debugMode=trace&traceChannel=constraints&traceMs=1500
   ```

4. Look for patterns:
   - Spikes after sudden inputs? Check steering/brake values
   - Continuous high values? Suspension too stiff or mass distribution off
   - Spike every N frames? Possible periodic instability

5. Adjust `JS_CONSTRAINT_DAMPING` in `js/constants.js` (default 0.8):
   - Lower (0.6) = more damping, more stable but spongy
   - Higher (0.95) = less damping, snappier but risk of oscillation

### Debugging Smoke System

**Situation:** Smoke appears wrong (wrong color, spawn location, etc.)

**Steps:**
1. Launch tuning mode:
   ```
   index.html?debugMode=tuning
   ```

2. Press F3 to enable overlays, check recent events panel:
   - Do you see `[smoke] Smoke spawned` events?
   - Are wheel names correct (FL, FR, RL, RR)?

3. Switch to trace for detailed spawn info:
   ```
   index.html?debugMode=trace&traceChannel=smoke&traceMs=1500
   ```

4. Lock wheels hard and check console:
   ```
   [smoke] Smoke: count=450, slip=1.0, color=dark
   [smoke] Spawn at: x=145.2, y=120.3, vx=2.5, vy=0.3
   ```

5. Cross-check with GPU compute shader:
   - Look at `js/shaders/smoke-compute.wgsl` for advection logic
   - Check `js/shaders/smoke.wgsl` for rendering (gradient falloff)
   - Visual misalignment? Check camera transform in `gpu-renderer.js`

### Reporting a Physics Bug

**When filing a bug, include:**

1. **Debug link:**
   ```
   index.html?debugMode=trace&traceChannel=fault&freezeOnError=true&traceMs=3000
   ```

2. **Steps to reproduce:**
   - "Launch tuning mode, steer left at 40 mph, apply full throttle for 3 seconds"

3. **Console output:** Paste from browser console (especially any [fault] events)

4. **Fault description:** Screenshot of overlay showing event times and metrics

5. **Overlay telemetry:**
   - Frame count when fault occurred
   - Constraint max/avg values
   - Wheel omega/slip values

---

## Configuration Persistence

Debug settings are saved to browser `localStorage`:

- Key prefix: `vd17_debug_`
- Persists across page reloads
- Survives browser restart (but not cache clear)

To reset:
```javascript
// In browser console:
localStorage.removeItem('vd17_debug_config');
location.reload();
```

---

## Performance Notes

### Overhead by Mode

| Mode | Console Overhead | Overlay Overhead | Total |
|------|-----------------|------------------|-------|
| quiet | ~0% | 0% (off) | **~0%** |
| tuning | ~2-5% | ~3-5% | **~5-10%** |
| trace (active) | ~10-20% | ~3-5% | **~13-25%** |

**Quiet mode** is suitable for production/demo (essentially no logging cost).

**Tuning mode** sampling is aggressive enough that overhead is minimal while still providing useful diagnostics.

**Trace mode** is high-overhead; use only for 1-2 second windows during focused debugging.

### Log Budget

The logger enforces a **1000 logs/sec** budget to prevent console spam from hanging the browser:

```javascript
// These will be silently dropped if exceeding budget:
for (let i = 0; i < 10000; i++) {
  logger.debug('spam', 'message ' + i); // Only ~1000 will appear
}
```

---

## Troubleshooting

### Overlays not appearing?
- Press F3 to toggle visibility
- Check `?overlays=true` parameter
- Verify not in quiet mode (overlays disabled by default)

### No logs in tuning mode?
- Check browser console for errors
- Verify channel is not filtered: `?logChannels=...`
- Try setting explicit level: `?logLevel=debug`
- Make sure you're actually driving (some logs are sampled)

### Trace window not showing?
- Check `?traceChannel=...` and `?traceMs=...` parameters
- Trace window has a time limit (default 1500ms) — it auto-closes
- To re-open: Press Shift+Ctrl+T and select channel

### Fault overlay stuck on "FAULTS DETECTED"?
- This clears after 5 seconds without new fault events
- Or you can reload the page
- Use `?freezeOnError=true` to explicitly freeze on critical error

### Console flooded with logs despite quiet mode?
- Check that you're actually in quiet mode: Check URL for `?debugMode=quiet`
- Verify no overlapping logs from JavaScript (some libraries emit unfiltered logs)
- Open DevTools → Settings → uncheck "Show timestamps" to reduce visual clutter

---

## API Documentation

For detailed JSDoc references, see:
- `js/debug/logger.js` — Logger API methods
- `js/debug/events.js` — Event buffer methods
- `js/debug/config.js` — Config resolution functions
- `js/debug/faults.js` — Fault detection rules

Run tests to validate behavior:
```bash
npm test  # Runs vitest + Playwright suite
```

---

## See Also

- **Implementation Plan:** `/docs/observability-plan.md`
- **Test Suite:** `tests/logger.test.js`, `tests/events.test.js`, `tests/e2e/`
- **Constants:** `js/constants.js` (debug-related settings)
