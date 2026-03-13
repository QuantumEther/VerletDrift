/**
 * Central logger with levels, channels, sampling, and trace windows
 * Integrates with event ring buffer for warn/error persistence
 */

import { resolveConfig, saveToStorage, getModePreset } from './config.js';

// Level hierarchy: 0 (error) to 4 (trace)
const LEVEL_MAP = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

const LEVEL_NAMES = ['error', 'warn', 'info', 'debug', 'trace'];
const LEVEL_METHODS = {
  error: 'error',
  warn: 'warn',
  info: 'log',
  debug: 'log',
  trace: 'log',
};

// Global logger state
let config = resolveConfig();
let eventRingBuffer = null;
let frameCount = 0;

// Per-channel trace windows (channel → { startMs, durationMs })
const traceWindows = new Map();

// Sampling state (channel + everyNFrames → lastFrame)
const frameCounters = new Map();
const msCounters = new Map();

// Value tracking for onChange
const valueTracking = new Map();

// Log budget for spam prevention (max logs per second)
const LOG_BUDGET_PER_SEC = 1000;
let logBudgetUsed = 0;
let logBudgetResetMs = performance.now();

/**
 * Initialize logger with event ring buffer reference
 * @param {Object} ringBuffer - Ring buffer module (must have pushEvent)
 */
export function initLogger(ringBuffer) {
  eventRingBuffer = ringBuffer;
}

/**
 * Set active debug mode and apply preset defaults
 * @param {string} mode - quiet | tuning | trace
 */
export function setMode(mode) {
  const preset = getModePreset(mode);
  config.mode = mode;
  if (preset.level) config.level = preset.level;
  if (preset.overlaysEnabled !== undefined) config.overlaysEnabled = preset.overlaysEnabled;
  if (preset.channels !== undefined) config.channels = preset.channels;
  saveToStorage(config);
}

/**
 * Set minimum log level
 * @param {string} level - error | warn | info | debug | trace
 */
export function setLevel(level) {
  if (LEVEL_MAP[level] !== undefined) {
    config.level = level;
    saveToStorage(config);
  }
}

/**
 * Set channel allowlist (null = all allowed)
 * @param {string[] | null} channels - List of allowed channels or null
 */
export function setChannelsAllowlist(channels) {
  config.channels = channels;
  saveToStorage(config);
}

/**
 * Open a trace window for a specific channel (time-bounded)
 * @param {string} channel - Channel name
 * @param {number} ms - Duration in milliseconds (default 1500)
 */
export function setTraceWindow(channel, ms = 1500) {
  const now = performance.now();
  traceWindows.set(channel, { startMs: now, durationMs: ms });
}

/**
 * Close trace window for a channel
 * @param {string} channel - Channel name
 */
export function closeTraceWindow(channel) {
  traceWindows.delete(channel);
}

/**
 * Toggle overlays on/off
 * @param {boolean} enabled - True to enable overlays
 */
export function setOverlaysEnabled(enabled) {
  config.overlaysEnabled = enabled;
  saveToStorage(config);
}

/**
 * Get current configuration
 * @returns {Object} Current config
 */
export function getConfig() {
  return { ...config };
}

/**
 * Increment frame counter (call once per render frame)
 */
export function incrementFrameCount() {
  frameCount++;
}

/**
 * Get current frame count
 * @returns {number}
 */
export function getFrameCount() {
  return frameCount;
}

/**
 * Core decision: should a log at this level/channel be emitted?
 * @param {string} level - error | warn | info | debug | trace
 * @param {string} channel - Channel name
 * @returns {boolean} True if log should be emitted
 */
export function shouldLog(level, channel) {
  // Errors and warnings always pass
  if (level === 'error' || level === 'warn') {
    return true;
  }

  // Check configured minimum level
  const levelValue = LEVEL_MAP[level];
  const configLevelValue = LEVEL_MAP[config.level];
  if (levelValue > configLevelValue) {
    return false;
  }

  // Check channel allowlist
  if (config.channels !== null && !config.channels.includes(channel)) {
    return false;
  }

  // Trace only emitted inside trace window
  if (level === 'trace') {
    const window = traceWindows.get(channel);
    if (!window) {
      return false;
    }
    const now = performance.now();
    if (now > window.startMs + window.durationMs) {
      traceWindows.delete(channel);
      return false;
    }
  }

  return true;
}

/**
 * Core logging function
 * @param {string} level - error | warn | info | debug | trace
 * @param {string} channel - Channel name
 * @param {string | Function} message - Message string or function that returns string
 * @param {Object} data - Optional structured data to log
 */
function logMessage(level, channel, message, data) {
  if (!shouldLog(level, channel)) {
    return;
  }

  // Check log budget
  const now = performance.now();
  if (now > logBudgetResetMs + 1000) {
    logBudgetUsed = 0;
    logBudgetResetMs = now;
  }
  if (logBudgetUsed >= LOG_BUDGET_PER_SEC) {
    return; // Drop message, budget exhausted
  }
  logBudgetUsed++;

  // Evaluate message if lazy function
  const msg = typeof message === 'function' ? message() : message;

  // Format output
  const formatted = `[${channel.toUpperCase()}] ${msg}`;

  // Emit to console
  const method = LEVEL_METHODS[level];
  if (data) {
    console[method](formatted, data);
  } else {
    console[method](formatted);
  }

  // Push warn/error to event ring buffer
  if (eventRingBuffer && (level === 'warn' || level === 'error')) {
    eventRingBuffer.pushEvent({
      level,
      channel,
      type: 'log_' + level,
      msg,
      data,
    });
  }
}

// Public API
export const logger = {
  error: (ch, msg, data) => logMessage('error', ch, msg, data),
  warn: (ch, msg, data) => logMessage('warn', ch, msg, data),
  info: (ch, msg, data) => logMessage('info', ch, msg, data),
  debug: (ch, msg, data) => logMessage('debug', ch, msg, data),
  trace: (ch, msg, data) => logMessage('trace', ch, msg, data),

  /**
   * Emit a log every N frames
   * @param {string} level - Log level
   * @param {string} channel - Channel name
   * @param {number} everyNFrames - Emit every N frames
   * @param {Function} msgFn - Function that returns message or data object
   */
  sampleEvery: (level, channel, everyNFrames, msgFn) => {
    const key = `${level}:${channel}:${everyNFrames}`;
    const lastFrame = frameCounters.get(key) ?? -everyNFrames;
    if (frameCount - lastFrame >= everyNFrames) {
      frameCounters.set(key, frameCount);
      const result = msgFn();
      if (typeof result === 'string') {
        logMessage(level, channel, result);
      } else {
        logMessage(level, channel, () => JSON.stringify(result), result);
      }
    }
  },

  /**
   * Emit a log every N milliseconds
   * @param {string} level - Log level
   * @param {string} channel - Channel name
   * @param {number} everyMs - Emit every N milliseconds
   * @param {Function} msgFn - Function that returns message
   */
  sampleEveryMs: (level, channel, everyMs, msgFn) => {
    const key = `${level}:${channel}:${everyMs}`;
    const lastMs = msCounters.get(key) ?? -everyMs;
    const now = performance.now();
    if (now - lastMs >= everyMs) {
      msCounters.set(key, now);
      const result = msgFn();
      if (typeof result === 'string') {
        logMessage(level, channel, result);
      } else {
        logMessage(level, channel, () => JSON.stringify(result), result);
      }
    }
  },

  /**
   * Emit a log when a tracked value changes
   * @param {string} level - Log level
   * @param {string} channel - Channel name
   * @param {string} key - Unique key for this tracked value
   * @param {any} nextValue - Current value
   * @param {Function} msgFn - Function that returns message (given prevValue and nextValue)
   */
  onChange: (level, channel, key, nextValue, msgFn) => {
    const trackKey = `${channel}:${key}`;
    const prevValue = valueTracking.get(trackKey);
    if (prevValue !== nextValue) {
      valueTracking.set(trackKey, nextValue);
      const result = msgFn(prevValue, nextValue);
      logMessage(level, channel, result);
    }
  },

  shouldLog,
  setMode,
  setLevel,
  setChannelsAllowlist,
  setTraceWindow,
  closeTraceWindow,
  setOverlaysEnabled,
  getConfig,
  incrementFrameCount,
  getFrameCount,
};

export default logger;
