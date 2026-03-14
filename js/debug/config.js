/**
 * Debug configuration resolver
 * Priority: URL params → localStorage → defaults
 * All values prefixed with vd17_debug_ in localStorage
 */

// Default configuration
const DEFAULTS = {
  mode: 'quiet', // quiet | tuning | trace (DEPRECATED: maps to controller.level)
  level: 'warn', // error | warn | info | debug | trace (DEPRECATED: use controller level mapping)
  channels: null, // null = all channels allowed, or array of allowed channel names (independent of controller)
  traceChannel: null, // if set, channel to trace
  traceMs: 1500, // trace window duration in milliseconds
  overlaysEnabled: true, // DEPRECATED: maps to controller.overlaysEnabled
  freezeOnError: false, // maps to controller.freezeOnError
};

// Mode presets: set recommended defaults when mode is selected
// NOTE: Keep old level values for backward compatibility with existing code/tests
// Controller will map these to new levels during initialization
const MODE_PRESETS = {
  quiet: {
    level: 'warn',       // Kept for backward compatibility
    channels: null,
    overlaysEnabled: false,
  },
  tuning: {
    level: 'debug',      // Kept for backward compatibility
    channels: null,
    overlaysEnabled: true,
  },
  trace: {
    level: 'trace',      // Kept for backward compatibility
    channels: null,
    overlaysEnabled: true,
  },
};

/**
 * Parse URL query parameters and localStorage to build config
 * @returns {Object} Resolved configuration object
 */
export function resolveConfig() {
  // Handle both browser (window.location) and Node.js (no window) environments
  const searchString = typeof window !== 'undefined' ? window.location.search : '';
  const urlParams = new URLSearchParams(searchString);
  const config = { ...DEFAULTS };

  // Priority 1: URL parameters (highest)
  if (urlParams.has('debugMode')) {
    const mode = urlParams.get('debugMode');
    if (MODE_PRESETS[mode]) {
      config.mode = mode;
      Object.assign(config, MODE_PRESETS[mode]);
    }
  }

  if (urlParams.has('logLevel')) {
    const level = urlParams.get('logLevel');
    if (['error', 'warn', 'info', 'debug', 'trace'].includes(level)) {
      config.level = level;
    }
  }

  if (urlParams.has('logChannels')) {
    const channels = urlParams
      .get('logChannels')
      .split(',')
      .map((c) => c.trim());
    config.channels = channels.length > 0 ? channels : null;
  }

  if (urlParams.has('traceChannel')) {
    config.traceChannel = urlParams.get('traceChannel');
  }

  if (urlParams.has('traceMs')) {
    config.traceMs = parseInt(urlParams.get('traceMs'), 10);
  }

  if (urlParams.has('overlays')) {
    config.overlaysEnabled = urlParams.get('overlays') === 'true' || urlParams.get('overlays') === '1';
  }

  if (urlParams.has('freezeOnError')) {
    config.freezeOnError = urlParams.get('freezeOnError') === 'true' || urlParams.get('freezeOnError') === '1';
  }

  // Priority 2: localStorage (medium) — only if not overridden by URL
  const stored = loadFromStorage();
  if (stored && !urlParams.has('debugMode')) {
    config.mode = stored.mode || config.mode;
  }
  if (stored && !urlParams.has('logLevel')) {
    config.level = stored.level || config.level;
  }
  if (stored && !urlParams.has('overlays')) {
    config.overlaysEnabled = stored.overlaysEnabled !== undefined ? stored.overlaysEnabled : config.overlaysEnabled;
  }

  return config;
}

/**
 * Save configuration to localStorage
 * @param {Object} config - Configuration object
 */
export function saveToStorage(config) {
  const toStore = {
    mode: config.mode,
    level: config.level,
    overlaysEnabled: config.overlaysEnabled,
  };
  try {
    localStorage.setItem('vd17_debug_config', JSON.stringify(toStore));
  } catch (e) {
    // Silently fail if localStorage unavailable (user may have disabled it)
    // No logger available here since config is loaded before logger init
  }
}

/**
 * Load configuration from localStorage
 * @returns {Object|null} Stored config or null if not found
 */
function loadFromStorage() {
  try {
    const stored = localStorage.getItem('vd17_debug_config');
    return stored ? JSON.parse(stored) : null;
  } catch (e) {
    // Silently fail if localStorage unavailable
    return null;
  }
}

/**
 * Clear stored configuration
 */
export function clearStoredConfig() {
  try {
    localStorage.removeItem('vd17_debug_config');
  } catch (e) {
    // Silently fail if localStorage unavailable
  }
}

/**
 * Get preset for a given mode
 * @param {string} mode - Mode name (quiet|tuning|trace)
 * @returns {Object} Preset configuration
 */
export function getModePreset(mode) {
  return MODE_PRESETS[mode] || {};
}
