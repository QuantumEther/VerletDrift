/**
 * Debug overlay rendering — telemetry panels and event list
 * Draws on-canvas for in-sim diagnostics without devtools context-switch
 */

import state from '../state.js';
import { logger } from '../debug/logger.js';
import { eventBuffer } from '../debug/events.js';

// Panel positioning
const PANEL_MARGIN = 12;
const PANEL_PADDING = 8;
const LINE_HEIGHT = 14;
const FONT_SIZE = 11;
const SMALL_FONT_SIZE = 9;

// Colors
const PANEL_BG = 'rgba(0, 0, 0, 0.8)';
const PANEL_TEXT = '#0f0';
const PANEL_BORDER = '#0f0';
const ERROR_COLOR = '#f00';
const WARN_COLOR = '#f90';
const INFO_COLOR = '#0f0';

/**
 * Draw telemetry panel (top-right of screen)
 * Shows per-wheel metrics and global health
 * @param {CanvasRenderingContext2D} ctx - 2D rendering context
 * @param {number} canvasWidth - Canvas width in CSS pixels
 * @param {number} canvasHeight - Canvas height in CSS pixels
 */
export function drawTelemetryPanel(ctx, canvasWidth, canvasHeight) {
  // Phase B: Use unified controller for overlay visibility check
  if (!state.debug.controller.isOverlayVisible()) {
    return;
  }

  ctx.save();
  ctx.font = `${FONT_SIZE}px monospace`;
  ctx.fillStyle = PANEL_TEXT;
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 1;

  let x = canvasWidth - 280 - PANEL_MARGIN;
  let y = PANEL_MARGIN;
  const w = 280;
  const lineH = LINE_HEIGHT;

  // Draw panel background
  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(x - PANEL_PADDING, y - PANEL_PADDING, w, lineH * 15);
  ctx.strokeStyle = PANEL_BORDER;
  ctx.strokeRect(x - PANEL_PADDING, y - PANEL_PADDING, w, lineH * 15);

  // Header
  ctx.fillStyle = PANEL_TEXT;
  ctx.fillText('=== TELEMETRY ===', x, y);
  y += lineH;

  // FPS and timing
  ctx.fillText(`FPS: ${state.loop.renderFps.toFixed(1)} / ${state.loop.physicsTps.toFixed(1)} TPS`, x, y);
  y += lineH;

  // dt with safety check (avoid showing "0.0ms" if uninitialized)
  const dtDisplay = state.debug.metrics.dtMs > 0 ? state.debug.metrics.dtMs.toFixed(1) : '—';
  ctx.fillText(`Frame: ${state.debug.frame} | dt: ${dtDisplay}ms`, x, y);
  y += lineH;
  ctx.fillText(`Time: ${state.loop.simulationTime.toFixed(2)}s`, x, y);
  y += lineH;

  // Constraint metrics
  ctx.fillText(`Constraints:`, x, y);
  y += lineH;
  const maxCorrDisplay = state.debug.metrics.constraintMaxCorr > 0 ? state.debug.metrics.constraintMaxCorr.toFixed(4) : '—';
  const avgCorrDisplay = state.debug.metrics.constraintAvgCorr > 0 ? state.debug.metrics.constraintAvgCorr.toFixed(4) : '—';
  ctx.fillText(`  max=${maxCorrDisplay}m avg=${avgCorrDisplay}m`, x, y);
  y += lineH;
  ctx.fillText(`  iters=${state.debug.metrics.constraintIters}`, x, y);
  y += lineH;

  // Per-wheel summary (simple one-liner)
  const wheels = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'];
  const wheelShort = ['FL', 'FR', 'RL', 'RR'];
  ctx.fillText('--- WHEELS ---', x, y);
  y += lineH;

  for (let i = 0; i < wheels.length; i++) {
    const wheelName = wheels[i];
    const wheelOmega = state.wheelOmega?.[wheelName] ?? 0;
    const wheelSlipRatio = state.wheelSlipRatio?.[wheelName] ?? 0;
    const wheelSlipAngle = state.wheelSlipAngle?.[wheelName] ?? 0;
    const wheelLoad = state.wheelLoads?.[wheelName] ?? 0;
    const wheelGripState = state.wheelGripState?.[wheelName]?.state ?? 'unknown';

    ctx.fillText(
      `${wheelShort[i]}: ω=${wheelOmega.toFixed(1)} κ=${wheelSlipRatio.toFixed(2)} α=${wheelSlipAngle.toFixed(2)}`,
      x,
      y
    );
    y += lineH;
  }

  ctx.restore();
}

/**
 * Draw recent events panel (bottom-right of screen)
 * Shows last N events from ring buffer
 * @param {CanvasRenderingContext2D} ctx - 2D rendering context
 * @param {number} canvasWidth - Canvas width in CSS pixels
 * @param {number} canvasHeight - Canvas height in CSS pixels
 */
export function drawEventPanel(ctx, canvasWidth, canvasHeight) {
  // Phase B: Use unified controller for overlay visibility check
  if (!state.debug.controller.isOverlayVisible()) {
    return;
  }

  if (!eventBuffer) {
    return;
  }

  ctx.save();
  ctx.font = `${SMALL_FONT_SIZE}px monospace`;
  ctx.fillStyle = PANEL_TEXT;
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 1;

  const x = canvasWidth - 380 - PANEL_MARGIN;
  const y = canvasHeight - 200 - PANEL_MARGIN;
  const w = 380;
  const h = 200;
  const lineH = LINE_HEIGHT - 2;

  // Draw panel background
  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(x - PANEL_PADDING, y - PANEL_PADDING, w, h);
  ctx.strokeStyle = PANEL_BORDER;
  ctx.strokeRect(x - PANEL_PADDING, y - PANEL_PADDING, w, h);

  // Header
  ctx.fillStyle = PANEL_TEXT;
  ctx.fillText('=== RECENT EVENTS ===', x, y + lineH);

  // Get last 10 events
  const events = eventBuffer.getEvents(10, true); // newest first
  let eventY = y + lineH * 2;

  for (const event of events) {
    // Color by severity
    if (event.level === 'error') {
      ctx.fillStyle = ERROR_COLOR;
    } else if (event.level === 'warn') {
      ctx.fillStyle = WARN_COLOR;
    } else {
      ctx.fillStyle = INFO_COLOR;
    }

    // Truncate long messages
    const msg = event.msg.length > 40 ? event.msg.substring(0, 37) + '...' : event.msg;
    ctx.fillText(`[${event.channel}] ${msg}`, x, eventY);
    eventY += lineH;

    if (eventY > y + h - lineH) {
      break; // Stop if we've filled the panel
    }
  }

  // Show event count
  ctx.fillStyle = PANEL_TEXT;
  ctx.font = `${SMALL_FONT_SIZE - 1}px monospace`;
  ctx.fillText(`Total events: ${eventBuffer.getEventCount()}`, x, y + h - 4);

  ctx.restore();
}

/**
 * Canvas debug overlay draw call — screen-space text panels migrated to DOM.
 * syncDOMOverlay() in debug-overlay-dom.js now handles telemetry, events,
 * fault status, and the FROZEN banner as HTML elements above the canvas.
 * World-space physics vectors (tire forces, slip arcs) remain in debug.js on canvas.
 *
 * This stub is kept so existing callers (main.js, window.drawDebugPanels) don't break.
 */
export function drawDebugPanels(ctx, canvasWidth, canvasHeight) {
  // Screen-space text panels now rendered as DOM in debug-overlay-dom.js.
}

export default {
  drawTelemetryPanel,
  drawEventPanel,
  drawDebugPanels,
};
