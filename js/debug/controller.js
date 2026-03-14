/**
 * DebugController — Unified debug state management
 * 
 * Consolidates three previously independent control paths:
 * - state.params.logsEnabled (HUD info bar checkbox)
 * - state.debug.mode (F2 keyboard cycling)
 * - state.debug.overlaysEnabled (F3 keyboard toggle)
 * 
 * Provides single source of truth for all debug configuration.
 */

// Level hierarchy (mirror of logger.js LEVEL_MAP)
const LEVEL_MAP = {
  silent: 0,    // No logs, no overlays (like logsEnabled: false)
  quiet: 1,     // Warn/error only
  info: 2,      // Sampled info/debug
  debug: 3,     // Full debug logs
  verbose: 4,   // Full verbose + trace
};

const LEVEL_NAMES = ['silent', 'quiet', 'info', 'debug', 'verbose'];

/**
 * DebugController manages all debug state with single source of truth.
 * 
 * Maps legacy three-path architecture:
 * - logsEnabled:true + mode='quiet'/'tuning' → level='quiet'/'info'
 * - logsEnabled:false → level='silent'
 * - overlaysEnabled → stored separately (not affected by level)
 */
export class DebugController {
  constructor(initialConfig = {}) {
    // Level controls console output and HUD visibility
    // silent: no logs, no HUD
    // quiet: warn/error only, HUD visible but quiet
    // info: sampled info+debug, HUD with metrics
    // debug: full debug, HUD with detailed metrics
    // verbose: trace-level, full diagnostics
    this.level = initialConfig.level || 'quiet';
    
    // Overlay visibility (independent of level)
    // Controls telemetry panel, event panel, fault indicator
    this.overlaysEnabled = initialConfig.overlaysEnabled !== false;
    
    // Trace configuration
    this.traceChannel = initialConfig.traceChannel || null;
    this.traceMs = initialConfig.traceMs || 1500;
    
    // Freeze on error (auto-pause on critical faults)
    this.freezeOnError = initialConfig.freezeOnError || false;
  }

  /**
   * Get current level as a number for comparisons
   */
  getLevelValue() {
    return LEVEL_MAP[this.level] || LEVEL_MAP.quiet;
  }

  /**
   * Check if a given level would be logged
   * 
   * Errors and warnings always pass.
   * Info/debug require level >= their threshold.
   */
  shouldLog(level) {
    if (level === 'error' || level === 'warn') {
      return true;
    }
    
    const levelValue = LEVEL_MAP[level] || 0;
    return levelValue <= this.getLevelValue();
  }

  /**
   * Check if logging is enabled (any level above silent)
   */
  isLoggingEnabled() {
    return this.level !== 'silent';
  }

  /**
   * Check if HUD (info bar) should be visible
   * Visible in all modes except 'silent'
   */
  isHUDVisible() {
    return this.isLoggingEnabled();
  }

  /**
   * Check if debug overlays (telemetry, events, faults) should be visible
   * Controlled independently from level
   */
  isOverlayVisible() {
    return this.overlaysEnabled && this.level !== 'silent';
  }

  /**
   * Set the debug level explicitly
   * Updates localStorage and applies changes immediately
   */
  setLevel(level) {
    if (!LEVEL_MAP.hasOwnProperty(level)) {
      console.warn(`[DebugController] Invalid level: ${level}`);
      return;
    }
    
    this.level = level;
    this._persistToStorage();
  }

  /**
   * Cycle through debug levels: silent → quiet → info → debug → verbose → silent
   * Convenient for F2 keyboard binding
   */
  cycleLevel() {
    const currentIdx = LEVEL_NAMES.indexOf(this.level);
    const nextIdx = (currentIdx + 1) % LEVEL_NAMES.length;
    this.level = LEVEL_NAMES[nextIdx];
    this._persistToStorage();
  }

  /**
   * Toggle overlay visibility on/off
   * Convenient for F3 keyboard binding
   */
  toggleOverlayVisibility() {
    this.overlaysEnabled = !this.overlaysEnabled;
    this._persistToStorage();
  }

  /**
   * Open trace window for a specific channel
   * @param {string} channel - Channel to trace (e.g., 'tires', 'engine')
   * @param {number} ms - Duration in milliseconds (default 1500)
   */
  openTraceWindow(channel, ms = 1500) {
    this.traceChannel = channel;
    this.traceMs = ms;
    this.level = 'verbose'; // Activate verbose to allow trace
    this._persistToStorage();
  }

  /**
   * Close trace window and return to previous level
   */
  closeTraceWindow() {
    this.traceChannel = null;
    // Optionally revert to 'quiet' here, or keep current level
  }

  /**
   * Enable auto-freeze on error (pause sim when critical fault detected)
   */
  setFreezeOnError(enabled) {
    this.freezeOnError = enabled;
    this._persistToStorage();
  }

  /**
   * Export current state for persistence or transmission
   */
  toJSON() {
    return {
      level: this.level,
      overlaysEnabled: this.overlaysEnabled,
      traceChannel: this.traceChannel,
      traceMs: this.traceMs,
      freezeOnError: this.freezeOnError,
    };
  }

  /**
   * Restore from JSON (e.g., from localStorage)
   */
  fromJSON(data) {
    if (data.level && LEVEL_MAP.hasOwnProperty(data.level)) {
      this.level = data.level;
    }
    if (data.overlaysEnabled !== undefined) {
      this.overlaysEnabled = data.overlaysEnabled;
    }
    if (data.traceChannel !== undefined) {
      this.traceChannel = data.traceChannel;
    }
    if (data.traceMs !== undefined) {
      this.traceMs = data.traceMs;
    }
    if (data.freezeOnError !== undefined) {
      this.freezeOnError = data.freezeOnError;
    }
  }

  /**
   * Save current state to localStorage
   * Uses vd17_debug_controller key for namespacing
   */
  _persistToStorage() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('vd17_debug_controller', JSON.stringify(this.toJSON()));
      }
    } catch (e) {
      // Silently fail if localStorage unavailable
    }
  }

  /**
   * Load state from localStorage
   * Returns new DebugController instance with loaded state
   */
  static loadFromStorage() {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('vd17_debug_controller');
        if (stored) {
          const data = JSON.parse(stored);
          return new DebugController(data);
        }
      }
    } catch (e) {
      // Silently fail on parse error
    }
    return new DebugController();
  }

  /**
   * Create controller from URL parameters
   * Priority: URL params → localStorage → defaults
   */
  static fromConfig(debugConfig = {}) {
    // Start with URL params if provided
    const controller = new DebugController({
      level: debugConfig.level || 'quiet',
      overlaysEnabled: debugConfig.overlaysEnabled !== false,
      traceChannel: debugConfig.traceChannel || null,
      traceMs: debugConfig.traceMs || 1500,
      freezeOnError: debugConfig.freezeOnError || false,
    });
    
    // Override with localStorage if no URL params
    if (!debugConfig.level) {
      const stored = DebugController.loadFromStorage();
      controller.level = stored.level;
      controller.overlaysEnabled = stored.overlaysEnabled;
    }
    
    return controller;
  }
}

export default DebugController;
