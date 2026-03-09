// =============================================================
// LOGGING — lightweight runtime-configurable diagnostics
// =============================================================

const LEVELS = {
  off: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

const DEFAULT_CATEGORY_FLAGS = {
  main: true,
  physics: false,
  ui: false,
  gpu: false,
};

const config = {
  level: 'warn',
  categoryFlags: { ...DEFAULT_CATEGORY_FLAGS },
};

function normalizeLevel(level) {
  return Object.prototype.hasOwnProperty.call(LEVELS, level) ? level : 'warn';
}

function shouldLog(level, category) {
  const activeLevel = LEVELS[config.level];
  const messageLevel = LEVELS[level];
  if (messageLevel > activeLevel) return false;
  if (category == null) return true;
  return config.categoryFlags[category] === true;
}

function emit(level, category, message, ...args) {
  if (!shouldLog(level, category)) return;

  const prefix = category ? `[${category}]` : '[log]';
  const text = typeof message === 'string' ? `${prefix} ${message}` : prefix;

  if (level === 'error') console.error(text, ...(typeof message === 'string' ? args : [message, ...args]));
  else if (level === 'warn') console.warn(text, ...(typeof message === 'string' ? args : [message, ...args]));
  else console.log(text, ...(typeof message === 'string' ? args : [message, ...args]));
}

export function configureLogger({ level, categoryFlags } = {}) {
  if (level != null) config.level = normalizeLevel(level);
  if (categoryFlags != null) {
    config.categoryFlags = {
      ...config.categoryFlags,
      ...categoryFlags,
    };
  }
}

export function setVerboseDiagnostics(enabled) {
  if (enabled) {
    configureLogger({
      level: 'debug',
      categoryFlags: {
        physics: true,
        ui: true,
        gpu: true,
      },
    });
  } else {
    config.level = 'warn';
    config.categoryFlags = { ...DEFAULT_CATEGORY_FLAGS };
  }
}

export function isVerboseDiagnosticsEnabled() {
  return config.level === 'debug';
}

export function initLoggerFromUrl(paramName = 'verboseLogs') {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(paramName);
  const enabled = raw === '1' || raw === 'true' || raw === 'on';
  setVerboseDiagnostics(enabled);
  return enabled;
}

export function createLogger(category) {
  return {
    error: (message, ...args) => emit('error', category, message, ...args),
    warn: (message, ...args) => emit('warn', category, message, ...args),
    info: (message, ...args) => emit('info', category, message, ...args),
    debug: (message, ...args) => emit('debug', category, message, ...args),
  };
}

export { LEVELS };
