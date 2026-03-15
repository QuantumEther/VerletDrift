/**
 * DOM-based debug overlay
 * Screen-space debug panels rendered as HTML above the simulation canvases.
 * Replaces canvas-drawn text panels — allows text selection, native scrolling,
 * and browser devtools inspection.
 *
 * World-space physics vectors (tire forces, slip arcs) remain on canvas in debug.js.
 */

import { logger } from '../debug/logger.js';

// DOM element references (populated by initDOMOverlay)
let elOverlay = null;
let elStatus = null;
let elFaultBanner = null;
let elTelemetry = null;
let elWheels = null;
let elEvents = null;

/**
 * Initialize DOM overlay — call once at startup after the DOM is ready.
 * Queries and caches element references used by syncDOMOverlay().
 */
export function initDOMOverlay() {
  elOverlay = document.getElementById('debugOverlay');
  if (!elOverlay) {
    logger.warn('overlay', '#debugOverlay not found — DOM overlay disabled');
    return;
  }
  elStatus      = document.getElementById('dbg-status');
  elFaultBanner = document.getElementById('dbg-fault-banner');
  elTelemetry   = document.getElementById('dbg-telemetry');
  elWheels      = document.getElementById('dbg-wheels');
  elEvents      = document.getElementById('dbg-events');
}

/**
 * Sync DOM overlay with current state — call unconditionally every frame.
 * Runs even when the simulation is frozen so the FROZEN banner is always current.
 *
 * @param {Object} state       - Physics state
 * @param {Object} eventBuffer - Event ring buffer (or null)
 */
export function syncDOMOverlay(state, eventBuffer) {
  if (!elOverlay) return;

  const { controller } = state.debug;
  const visible = controller.isOverlayVisible();

  elOverlay.classList.toggle('visible', visible);
  if (!visible) return;

  // --- Status line (top-left) ---
  if (elStatus) {
    const levelName = controller.level.toUpperCase();
    const traceInfo = controller.traceChannel ? ` | TRACE: ${controller.traceChannel}` : '';
    elStatus.textContent = `LEVEL: ${levelName}${traceInfo}`;
  }

  // --- Fault banner (top-left, right of status) ---
  if (elFaultBanner) {
    let faultText  = 'NOMINAL';
    let faultClass = 'nominal';
    if (state.debug.faults.isFrozen) {
      faultText  = 'FROZEN';
      faultClass = 'frozen';
    } else if (eventBuffer) {
      const recentFaults = eventBuffer.findEventsByChannel('fault', 1);
      if (recentFaults.length > 0) {
        const lastFaultAge = performance.now() - recentFaults[0].tWallMs;
        if (lastFaultAge < 5000) {
          faultText  = 'FAULTS DETECTED';
          faultClass = 'warn';
        }
      }
    }
    elFaultBanner.textContent = faultText;
    elFaultBanner.className   = 'dbg-fault-banner ' + faultClass;
  }

  // --- Telemetry panel (top-right) ---
  if (elTelemetry) {
    const dtMs    = state.debug.metrics.dtMs > 0 ? state.debug.metrics.dtMs.toFixed(1) : '—';
    const maxCorr = state.debug.metrics.constraintMaxCorr > 0
      ? state.debug.metrics.constraintMaxCorr.toFixed(4) : '—';
    const avgCorr = state.debug.metrics.constraintAvgCorr > 0
      ? state.debug.metrics.constraintAvgCorr.toFixed(4) : '—';
    const iters = state.debug.metrics.constraintIters ?? '—';
    elTelemetry.textContent =
      `FPS: ${state.loop.renderFps.toFixed(1)} / ${state.loop.physicsTps.toFixed(1)} TPS\n` +
      `Frame: ${state.debug.frame} | dt: ${dtMs}ms\n` +
      `Time: ${state.loop.simulationTime.toFixed(2)}s\n` +
      `Constraints: max=${maxCorr}m\n` +
      `             avg=${avgCorr}m iters=${iters}`;
  }

  // --- Per-wheel metrics (top-right, below telemetry) ---
  if (elWheels) {
    const names  = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'];
    const labels = ['FL', 'FR', 'RL', 'RR'];
    elWheels.textContent = names.map((w, i) => {
      const omega = (state.wheelOmega?.[w]    ?? 0).toFixed(1);
      const kappa = (state.wheelSlipRatio?.[w] ?? 0).toFixed(2);
      const alpha = (state.wheelSlipAngle?.[w] ?? 0).toFixed(2);
      return `${labels[i]}: ω=${omega} κ=${kappa} α=${alpha}`;
    }).join('\n');
  }

  // --- Recent events panel (bottom-right) ---
  if (elEvents && eventBuffer) {
    const events = eventBuffer.getEvents(10, true); // newest first
    const lines  = events.map(ev => {
      const msg = ev.msg.length > 45 ? ev.msg.substring(0, 42) + '...' : ev.msg;
      return `<span class="ev-${ev.level}">[${ev.channel}] ${msg}</span>`;
    });
    const count = eventBuffer.getEventCount();
    elEvents.innerHTML =
      lines.join('\n') +
      (lines.length > 0 ? '\n' : '') +
      `<span class="ev-count">Total events: ${count}</span>`;
  }
}

export default { initDOMOverlay, syncDOMOverlay };
