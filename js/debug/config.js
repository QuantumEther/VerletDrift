/**
 * Debug configuration resolver
 * Priority: URL params → localStorage → defaults
 * All values prefixed with vd17_debug_ in localStorage
 */

// Default configuration
const DEFAULTS = {
  mode: 'quiet', // quiet | tuning | trace
  level: 'warn', // error | warn | info | debug | trace
  channels: null, // null = all channels allowed, or array of allowed channel names
  traceChannel: null, // if set, channel to trace
  traceMs: 1500, // trace window duration in milliseconds
  overlaysEnabled: true,
  freezeOnError: false,
};

// Mode presets: set recommended defaults when mode is selected
const MODE_PRESETS = {
  quiet: {
    level: 'warn',
    channels: null,
    overlaysEnabled: false,
  },
  tuning: {
    level: 'debug',
    channels: null,
    overlaysEnabled: true,
  },
  trace: {
    level: 'trace',
    channels: null, // will be overridden by traceChannel if set
    overlaysEnabled: true,
  },
};

/**
 * Parse URL query parameters and localStorage to build config
 * @returns {Object} Resolved configuration object
 */
export function resolveConfig() {
  const urlParams = new URLSearchParams(window.location.search);
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
    console.warn('[DEBUG CONFIG] localStorage save failed:', e.message);
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
    console.warn('[DEBUG CONFIG] localStorage load failed:', e.message);
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
    console.warn('[DEBUG CONFIG] localStorage clear failed:', e.message);
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
