/**
 * GPU-based Gauge Rendering System
 * Manages gauge state, motion blur history, and instance data for GPU rendering.
 *
 * Unlike Canvas 2D gauges, GPU gauges are rendered via WebGPU render passes.
 * This module handles:
 * - Gauge registry (speedometer, RPM, lateral G)
 * - Motion blur history buffers (per-gauge: 4 historical angles + timestamps)
 * - Instance data packing for GPU upload
 */

const MAX_GAUGES = 16;  // Maximum number of concurrent gauges

// Gauge state class
class GaugeState {
  constructor(name, screenX, screenY, size, color) {
    this.name = name;
    this.screenX = screenX;  // Screen-space X (pixels)
    this.screenY = screenY;  // Screen-space Y (pixels)
    this.size = size;         // Gauge radius in pixels
    this.color = color;       // [r, g, b]

    // Current needle state
    this.needleAngle = 0;     // Current angle (radians, 0-1.5π)
    this.needleTimestamp = 0; // Timestamp of last update

    // Motion blur history: 4 samples (oldest to newest, before current)
    this.historyAngles = [0, 0, 0, 0];  // [angle0, angle1, angle2, angle3]
    this.historyTimes = [0, 0, 0, 0];   // Timestamps for decay calculation
    this.historyIndex = 0;               // Circular buffer write head
  }

  /**
   * Update gauge needle state and track history
   * @param {number} normalizedAngle - Normalized needle position [0, 1]
   * @param {number} currentTime - Current timestamp (seconds)
   */
  updateNeedle(normalizedAngle, currentTime) {
    // Convert normalized [0, 1] to angle [0, 1.5π]
    const newAngle = normalizedAngle * Math.PI * 1.5;

    // Shift history: store previous angle if it changed
    if (Math.abs(newAngle - this.needleAngle) > 0.001) {
      this.historyAngles[this.historyIndex] = this.needleAngle;
      this.historyTimes[this.historyIndex] = this.needleTimestamp;
      this.historyIndex = (this.historyIndex + 1) % 4;
    }

    this.needleAngle = newAngle;
    this.needleTimestamp = currentTime;
  }

  /**
   * Get packed instance data for GPU: [screenX, screenY, needleAngle, gaugeType, size, r, g, b, h0, h1, h2, h3]
   * Returns Float32Array of 12 floats
   */
  getInstanceData(gaugeType) {
    const data = new Float32Array(12);
    data[0] = this.screenX;
    data[1] = this.screenY;
    data[2] = this.needleAngle;
    data[3] = gaugeType;  // 0=speedometer, 1=rpm, 2=lateral-g
    data[4] = this.size;
    data[5] = this.color[0];
    data[6] = this.color[1];
    data[7] = this.color[2];
    data[8] = this.historyAngles[0];
    data[9] = this.historyAngles[1];
    data[10] = this.historyAngles[2];
    data[11] = this.historyAngles[3];
    return data;
  }
}

// Global gauge registry
let gaugeRegistry = new Map();  // name → GaugeState
let instanceDataBuffer = new Float32Array(MAX_GAUGES * 12);  // Staging buffer for GPU
let activeGaugeCount = 0;

/**
 * Initialize GPU gauge system
 * Call once during app startup
 */
export function initGaugeSystem() {
  gaugeRegistry.clear();

  // Register core 3 gauges (screen position and size tuned for typical layout)
  // Positions are in screen-space pixels, size is gauge radius in pixels

  registerGauge('speedometer', {
    screenX: 100,
    screenY: 100,
    size: 60,
    color: [0.9, 0.3, 0.2],  // Red
  });

  registerGauge('rpm', {
    screenX: 300,
    screenY: 100,
    size: 60,
    color: [0.3, 0.6, 0.9],  // Blue
  });

  registerGauge('lateral-g', {
    screenX: 100,
    screenY: 300,
    size: 60,
    color: [0.3, 0.9, 0.3],  // Green
  });

  console.log('[GPU Gauges] Initialized with', gaugeRegistry.size, 'gauges');
}

/**
 * Register a gauge in the system
 * @param {string} name - Gauge identifier
 * @param {Object} config - { screenX, screenY, size, color }
 */
function registerGauge(name, config) {
  const gauge = new GaugeState(name, config.screenX, config.screenY, config.size, config.color);
  gaugeRegistry.set(name, gauge);
}

/**
 * Update gauge needle state
 * Call once per frame for each active gauge
 * @param {string} gaugeName - Name of gauge to update
 * @param {number} normalizedAngle - Normalized needle angle [0, 1]
 * @param {number} currentTime - Current timestamp (performance.now() / 1000)
 */
export function updateGaugeNeedle(gaugeName, normalizedAngle, currentTime) {
  const gauge = gaugeRegistry.get(gaugeName);
  if (gauge) {
    gauge.updateNeedle(normalizedAngle, currentTime);
  }
}

/**
 * Pack all gauge instance data for GPU upload
 * Returns Float32Array suitable for device.queue.writeBuffer()
 * @returns {Float32Array} Instance data buffer
 */
export function getGaugeInstanceData() {
  let writeOffset = 0;
  const gaugeTypes = {
    'speedometer': 0,
    'rpm': 1,
    'lateral-g': 2,
  };

  for (const [name, gauge] of gaugeRegistry) {
    const gaugeType = gaugeTypes[name] ?? 0;
    const data = gauge.getInstanceData(gaugeType);
    instanceDataBuffer.set(data, writeOffset);
    writeOffset += 12;
  }

  activeGaugeCount = gaugeRegistry.size;
  return instanceDataBuffer;
}

/**
 * Get number of active gauges
 * @returns {number} Count of registered gauges
 */
export function getGaugeCount() {
  return gaugeRegistry.size;
}

/**
 * Get gauge by name
 * @param {string} name - Gauge name
 * @returns {GaugeState|undefined} Gauge state or undefined if not found
 */
export function getGauge(name) {
  return gaugeRegistry.get(name);
}

/**
 * Get all gauges
 * @returns {Map} gaugeRegistry map
 */
export function getAllGauges() {
  return gaugeRegistry;
}

/**
 * Reset gauge system (for testing/cleanup)
 */
export function resetGaugeSystem() {
  gaugeRegistry.clear();
  activeGaugeCount = 0;
}

/**
 * Update gauge screen position (for responsive layout)
 * @param {string} name - Gauge name
 * @param {number} screenX - New screen X
 * @param {number} screenY - New screen Y
 */
export function updateGaugePosition(name, screenX, screenY) {
  const gauge = gaugeRegistry.get(name);
  if (gauge) {
    gauge.screenX = screenX;
    gauge.screenY = screenY;
  }
}

/**
 * Update gauge size (for responsive layout)
 * @param {string} name - Gauge name
 * @param {number} size - New gauge radius in pixels
 */
export function updateGaugeSize(name, size) {
  const gauge = gaugeRegistry.get(name);
  if (gauge) {
    gauge.size = size;
  }
}
