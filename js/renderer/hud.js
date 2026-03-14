// =============================================================
// HUD RENDERING — Screen-space UI elements
// =============================================================
// Steering wheel, throttle/brake/clutch/handbrake bars, gear indicator, score display, logs toggle.
// All functions use screen-space coordinates (pixels), no camera transform.
// =============================================================

import state from '../state.js';
import {
  CLUTCH_BITE_POINT,
  CLUTCH_BITE_RANGE,
} from '../constants.js';

// Local utility
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

// =============================================================
// HUD — STEERING WHEEL
// =============================================================

export function drawSteeringWheelHud(ctx, canvasWidth, canvasHeight) {
  const wheelRadius = 30;
  const marginRight  = 60;
  const marginBottom = 60;
  const centreX = canvasWidth  - marginRight;
  const centreY = canvasHeight - marginBottom;

  ctx.save();
  ctx.translate(centreX, centreY);
  ctx.rotate(state.steering.wheelAngle);

  // Outer ring.
  ctx.beginPath();
  ctx.arc(0, 0, wheelRadius, 0, Math.PI * 2);
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth   = 3;
  ctx.stroke();

  // Crosshair spokes.
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth   = 2;
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI * 0.5) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * wheelRadius * 0.7, Math.sin(angle) * wheelRadius * 0.7);
    ctx.stroke();
  }

  // Red dot at the 12 o'clock position to show absolute rotation.
  ctx.beginPath();
  ctx.arc(0, -wheelRadius * 0.7, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#e74c3c';
  ctx.fill();

  // Centre hub.
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#aaa';
  ctx.fill();

  ctx.restore();
}


// =============================================================
// HUD — THROTTLE BAR
// =============================================================

// Draws a vertical bar showing current throttle position.
// Full height = 100% throttle. Colour shifts warm as throttle increases.
export function drawThrottleBar(ctx, canvasWidth, canvasHeight) {
  const input  = state.input;
  let throttle = 0;
  if (input.mouseThrottleActive) {
    throttle = input.mouseThrottleAmount;
  } else if (input.throttleKeyHeld) {
    throttle = 1.0;
  }

  const barWidth  = 16;
  const barHeight = 80;
  const marginRight  = 100;
  const marginBottom = 30;
  const barLeft = canvasWidth  - marginRight;
  const barTop  = canvasHeight - marginBottom - barHeight;

  // Background (empty bar).
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(barLeft, barTop, barWidth, barHeight);

  // Fill level.
  const fillHeight = barHeight * throttle;
  let barColor;
  if (throttle < 0.5) {
    barColor = `rgb(0, ${Math.round(180 + 60 * throttle * 2)}, ${Math.round(220 * (1 - throttle * 2))})`;
  } else if (throttle < 0.8) {
    const fraction = (throttle - 0.5) / 0.3;
    barColor = `rgb(${Math.round(255 * fraction)}, ${Math.round(240 - 80 * fraction)}, 0)`;
  } else {
    barColor = '#e74c3c';
  }
  ctx.fillStyle = barColor;
  ctx.fillRect(barLeft, barTop + barHeight - fillHeight, barWidth, fillHeight);

  // Border.
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(barLeft, barTop, barWidth, barHeight);

  // Label.
  ctx.fillStyle  = 'rgba(255,255,255,0.7)';
  ctx.font       = '10px monospace';
  ctx.textAlign  = 'center';
  ctx.fillText('THR', barLeft + barWidth * 0.5, barTop - 6);
}


// =============================================================
// HUD — BRAKE BAR
// =============================================================

// Draws a vertical bar showing brake pedal state (binary: off / full).
export function drawBrakeBar(ctx, canvasWidth, canvasHeight) {
  const brakeAmount = state.input.brakeKeyHeld ? 1.0 : 0.0;

  const barWidth  = 16;
  const barHeight = 80;
  const marginRight  = 122;  // left of throttle bar
  const marginBottom = 30;
  const barLeft = canvasWidth  - marginRight;
  const barTop  = canvasHeight - marginBottom - barHeight;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(barLeft, barTop, barWidth, barHeight);

  const fillHeight = barHeight * brakeAmount;
  ctx.fillStyle = brakeAmount > 0 ? '#e74c3c' : 'rgba(255,255,255,0.1)';
  ctx.fillRect(barLeft, barTop + barHeight - fillHeight, barWidth, fillHeight);

  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(barLeft, barTop, barWidth, barHeight);

  ctx.fillStyle  = 'rgba(255,255,255,0.7)';
  ctx.font       = '10px monospace';
  ctx.textAlign  = 'center';
  ctx.fillText('FBK', barLeft + barWidth * 0.5, barTop - 6);
}


// =============================================================
// HUD — HANDBRAKE BAR
// =============================================================

export function drawHandbrakeBar(ctx, canvasWidth, canvasHeight) {
  const hbVal = state.input.handbrakeValue || 0;

  const barWidth  = 16;
  const barHeight = 80;
  const marginRight  = 144; // left of front brake bar
  const marginBottom = 30;
  const barLeft = canvasWidth  - marginRight;
  const barTop  = canvasHeight - marginBottom - barHeight;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(barLeft, barTop, barWidth, barHeight);

  const fillHeight = barHeight * hbVal;
  // Handbrake: orange-yellow distinct from red front brake
  ctx.fillStyle = hbVal > 0.05 ? `rgba(255, ${Math.round(180 - hbVal * 140)}, 20, 0.9)` : 'rgba(255,255,255,0.1)';
  ctx.fillRect(barLeft, barTop + barHeight - fillHeight, barWidth, fillHeight);

  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(barLeft, barTop, barWidth, barHeight);

  ctx.fillStyle  = 'rgba(255,255,255,0.7)';
  ctx.font       = '10px monospace';
  ctx.textAlign  = 'center';
  ctx.fillText('HBK', barLeft + barWidth * 0.5, barTop - 6);
}


// =============================================================
// HUD — CLUTCH BAR
// =============================================================

// Draws a vertical bar showing the clutch pedal position.
// The bite zone is marked with two horizontal lines so the driver can
// see where engagement begins (bottom line) and where it is fully engaged
// (top line). Between the lines is where the car responds to clutch control.
//
// Bar fill from bottom = pedal released (engaged).
// Bar empty = pedal on floor (disengaged).
export function drawClutchBar(ctx, canvasWidth, canvasHeight) {
  const engine    = state.engine;
  const params    = state.params;

  const pedalPosition = engine.clutchPedalPosition; // 0 = floor, 1 = released

  const barWidth  = 16;
  const barHeight = 80;
  const marginRight  = 166; // left of handbrake bar
  const marginBottom = 30;
  const barLeft = canvasWidth  - marginRight;
  const barTop  = canvasHeight - marginBottom - barHeight;

  // Background.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(barLeft, barTop, barWidth, barHeight);

  // Fill: pedal position (0 = bottom = disengaged, 1 = full height = released/engaged).
  const fillHeight = barHeight * pedalPosition;
  ctx.fillStyle = 'rgba(100, 200, 255, 0.7)';
  ctx.fillRect(barLeft, barTop + barHeight - fillHeight, barWidth, fillHeight);

  // Bite zone markers: two horizontal lines showing where grip starts and ends.
  // Bottom line = bitePoint (engagement begins).
  // Top line = bitePoint + biteRange (fully engaged above here).
  const bitePoint     = params.clutchBitePoint;
  const biteRange     = params.clutchBiteRange;
  const biteTopY      = barTop + barHeight * (1 - (bitePoint + biteRange));
  const biteBottomY   = barTop + barHeight * (1 - bitePoint);

  // Yellow zone between the bite lines.
  ctx.fillStyle = 'rgba(255, 220, 0, 0.25)';
  ctx.fillRect(barLeft, biteTopY, barWidth, biteBottomY - biteTopY);

  // Bite zone border lines.
  ctx.strokeStyle = '#f1c40f';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(barLeft, biteTopY);
  ctx.lineTo(barLeft + barWidth, biteTopY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(barLeft, biteBottomY);
  ctx.lineTo(barLeft + barWidth, biteBottomY);
  ctx.stroke();

  // Bar border.
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(barLeft, barTop, barWidth, barHeight);

  // Label.
  ctx.fillStyle  = 'rgba(255,255,255,0.7)';
  ctx.font       = '10px monospace';
  ctx.textAlign  = 'center';
  ctx.fillText('CLT', barLeft + barWidth * 0.5, barTop - 6);
}


// =============================================================
// HUD — GEAR INDICATOR
// =============================================================

// Draws a large character showing the current gear.
// Positioned in the lower-left corner of the screen.
// Colour: green for 1–6, white for Neutral, red for Reverse.
export function drawGearIndicator(ctx, canvasWidth, canvasHeight) {
  const gear        = state.engine.currentGear;
  const isStalled   = state.engine.isStalled;

  let gearColor;
  if (isStalled) {
    gearColor = '#e74c3c'; // red when stalled
  } else if (gear === 'N') {
    gearColor = 'rgba(255,255,255,0.85)';
  } else if (gear === 'R') {
    gearColor = '#e67e22'; // orange for reverse
  } else {
    gearColor = '#2ecc71'; // green for forward gears
  }

  const displayChar = isStalled ? 'STALL' : gear;

  ctx.save();
  ctx.font         = isStalled ? 'bold 20px monospace' : 'bold 52px monospace';
  ctx.fillStyle    = gearColor;
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'bottom';
  // Add a subtle shadow for readability on the checkerboard.
  ctx.shadowColor  = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur   = 4;
  ctx.fillText(displayChar, 20, canvasHeight - 20);
  ctx.restore();
}


// =============================================================
// HUD — SCORE DISPLAY
// =============================================================

// Draws the score and combo multiplier in the top-left corner of the screen.
// Uses screen space (call after removeCameraTransform).
export function drawScoreHud(ctx, canvasWidth, canvasHeight) {
  const score = state.score;
  const combo = score.combo;

  ctx.save();

  // --- Total score ---
  ctx.font         = 'bold 28px monospace';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  ctx.shadowColor  = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur   = 4;
  ctx.fillStyle    = '#ffffff';
  ctx.fillText(`Score: ${score.totalScore.toLocaleString()}`, 16, 16);

  // --- Combo multiplier (only shown when combo count > 1) ---
  if (combo.count > 1) {
    // Flash: pulse size and brightness during the flash timer.
    const flashProgress = combo.flashTimer > 0
      ? combo.flashTimer / 0.5  // 0 (expired) to 1 (just triggered)
      : 0;

    const scalePulse     = 1.0 + flashProgress * 0.4;
    const comboBrightness = Math.round(80 + flashProgress * 20); // 80%–100% lightness

    ctx.save();
    ctx.translate(16, 56);
    ctx.scale(scalePulse, scalePulse);

    ctx.font      = 'bold 22px monospace';
    ctx.fillStyle = `hsl(45, 100%, ${comboBrightness}%)`; // golden yellow
    ctx.shadowColor = 'rgba(255, 180, 0, 0.6)';
    ctx.shadowBlur  = flashProgress * 12;
    ctx.fillText(`×${combo.multiplier} COMBO  (${combo.count} hits)`, 0, 0);

    ctx.restore();
  }

  ctx.restore();
}


// =============================================================
// HUD — LOGS TOGGLE CHECKBOX
// =============================================================
