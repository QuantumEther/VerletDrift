/**
 * Event ring buffer for state transitions and faults
 * Stores last N events with deduplication support
 * Auto-enriches events with frame and simulation time at boundary
 */

const DEFAULT_CAPACITY = 200;
const DEDUPE_WINDOW_MS = 500;

let events = [];
let eventId = 0;
let capacity = DEFAULT_CAPACITY;

// Track dedupe: dedupeKey → { lastEventId, lastTime }
const dedupeWindow = new Map();

// State reference for enrichment (set via setStateReference)
let stateRef = null;

/**
 * Set state reference for event enrichment
 * Called from main.js after state is initialized
 * @param {Object} state - The game state object
 */
export function setStateReference(state) {
  stateRef = state;
}

/**
 * Initialize event ring buffer
 * @param {number} maxCapacity - Maximum number of events to store
 */
export function initEvents(maxCapacity = DEFAULT_CAPACITY) {
  events = [];
  eventId = 0;
  capacity = maxCapacity;
  dedupeWindow.clear();
}

/**
 * Push an event to the ring buffer
 * Auto-enriches events with frame and simulation time from state if not provided.
 * @param {Object} eventData - Event object
 * @param {string} eventData.level - info | warn | error
 * @param {string} eventData.channel - Channel name
 * @param {string} eventData.type - Event type (e.g., wheel_lock_enter, smoke_enter)
 * @param {string} eventData.msg - Human-readable message
 * @param {Object} eventData.data - Optional structured data
 * @param {string} eventData.dedupeKey - Optional dedupe key
 * @param {number} eventData.tSimSec - Optional: override simulation time (auto-injected if missing)
 * @param {number} eventData.frame - Optional: override frame number (auto-injected if missing)
 * @returns {Object} Pushed event with timestamps and ID
 */
export function pushEvent(eventData) {
  // Check dedupe
  if (eventData.dedupeKey) {
    const entry = dedupeWindow.get(eventData.dedupeKey);
    const now = performance.now();
    if (entry && now - entry.lastTime < DEDUPE_WINDOW_MS) {
      return null; // Dedupe: event already fired within window
    }
  }

  // Create event object with metadata
  // Auto-inject frame and tSimSec from state if not provided by caller
  // (stateRef will be null in tests or before main.js initializes it, defaults to 0)
  const event = {
    id: eventId++,
    tWallMs: performance.now(),
    tSimSec: eventData.tSimSec ?? (stateRef?.loop?.simulationTime ?? 0),  // Auto-inject if missing
    frame: eventData.frame ?? (stateRef?.debug?.frame ?? 0),              // Auto-inject if missing
    level: eventData.level || 'info',
    channel: eventData.channel || 'global',
    type: eventData.type || 'generic',
    msg: eventData.msg || '',
    data: eventData.data,
  };

  // Push to ring buffer
  events.push(event);
  if (events.length > capacity) {
    events.shift(); // Remove oldest
  }

  // Update dedupe window
  if (eventData.dedupeKey) {
    dedupeWindow.set(eventData.dedupeKey, {
      lastTime: event.tWallMs,
    });
  }

  return event;
}

/**
 * Get recent events (newest first by default)
 * @param {number} limit - Maximum number of events to return
 * @param {boolean} newestFirst - If true, return newest first; else oldest first
 * @returns {Object[]} Array of events
 */
export function getEvents(limit = 50, newestFirst = true) {
  const result = events.slice(-limit);
  return newestFirst ? result.reverse() : result;
}

/**
 * Get all events
 * @returns {Object[]} All events in chronological order
 */
export function getAllEvents() {
  return [...events];
}

/**
 * Clear all events
 */
export function clearEvents() {
  events = [];
  dedupeWindow.clear();
}

/**
 * Get event count
 * @returns {number} Number of events in buffer
 */
export function getEventCount() {
  return events.length;
}

/**
 * Find events by type
 * @param {string} type - Event type to search for
 * @param {number} limit - Max results
 * @returns {Object[]} Matching events (newest first)
 */
export function findEventsByType(type, limit = 20) {
  const matches = events.filter((e) => e.type === type).slice(-limit);
  return matches.reverse();
}

/**
 * Find events by channel
 * @param {string} channel - Channel to search for
 * @param {number} limit - Max results
 * @returns {Object[]} Matching events (newest first)
 */
export function findEventsByChannel(channel, limit = 20) {
  const matches = events.filter((e) => e.channel === channel).slice(-limit);
  return matches.reverse();
}

/**
 * Get last N events before a given timestamp
 * @param {number} tWallMs - Wall-clock timestamp
 * @param {number} limit - Max results
 * @returns {Object[]} Events before timestamp (newest first)
 */
export function getEventsBefore(tWallMs, limit = 20) {
  const matches = events.filter((e) => e.tWallMs < tWallMs).slice(-limit);
  return matches.reverse();
}

export const eventBuffer = {
  initEvents,
  pushEvent,
  getEvents,
  getAllEvents,
  clearEvents,
  getEventCount,
  findEventsByType,
  findEventsByChannel,
  getEventsBefore,
};

export default eventBuffer;
