// =============================================================
// GAUGE RENDERERS — Independent gauge canvas displays
// =============================================================
// Analog gauges (tachometer, speedometer), custom physics visualizers (yaw stability,
// friction circles, slip angles, drift radar, wheel slip). Each gauge is rendered
// to its own canvas element; a failure in one does not affect others.
// =============================================================

import state from '../state.js';
import { physicsRandom } from '../random.js';

// Local utility
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;


const _needleTrailCache = new WeakMap(); // CanvasRenderingContext2D → [{ t, value }]

function _updateNeedleTrail(ctx, needleNormalized, nowSeconds, maxSamples) {
  let history = _needleTrailCache.get(ctx);
  if (!history) {
    history = [];
    _needleTrailCache.set(ctx, history);
  }

  history.push({ t: nowSeconds, value: clamp01(needleNormalized) });
  while (history.length > maxSamples) history.shift();

  return history;
}

// =============================================================
// GAUGE GRADIENT CACHE (QW-1)
// ctx.createRadialGradient is expensive; gradients are purely
// geometric and only need to be rebuilt when the canvas resizes.
// =============================================================
const _gaugeGradCache = new WeakMap(); // CanvasRenderingContext2D → { w, h, face, vignette, pivot }

function _getGaugeGrads(ctx, canvasWidth, canvasHeight) {
  const cx = canvasWidth  * 0.5;
  const cy = canvasHeight * 0.55;
  const r  = Math.min(canvasWidth, canvasHeight) * 0.40;

  const existing = _gaugeGradCache.get(ctx);
  if (existing && existing.w === canvasWidth && existing.h === canvasHeight) return existing;

  const face = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  face.addColorStop(0, '#f5f0e8');
  face.addColorStop(1, '#d9c9a8');

  const vignette = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.15)');

  // Pivot gradient: in pivot local space (after translate+rotate) — coordinates
  // are always (-2,-2)→(0,0) in local frame, canvas-size independent.
  const pivot = ctx.createRadialGradient(-2, -2, 1, 0, 0, 10);
  pivot.addColorStop(0, '#fff');
  pivot.addColorStop(1, '#888');

  const entry = { w: canvasWidth, h: canvasHeight, face, vignette, pivot };
  _gaugeGradCache.set(ctx, entry);
  return entry;
}

// Yaw gauge uses slightly different geometry; cached separately per-context.
const _yawGradCache = new WeakMap();

function _getYawGrads(ctx, canvasWidth, canvasHeight) {
  const cx = canvasWidth  * 0.5;
  const cy = canvasHeight * 0.5;
  const r  = Math.min(canvasWidth, canvasHeight) * 0.4;

  const existing = _yawGradCache.get(ctx);
  if (existing && existing.w === canvasWidth && existing.h === canvasHeight) return existing;

  const face = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
  face.addColorStop(0, '#f5f0e8');
  face.addColorStop(1, '#d9c9a8');

  const pivot = ctx.createRadialGradient(cx, cy, 0, cx, cy, 8);
  pivot.addColorStop(0, '#fff');
  pivot.addColorStop(1, '#999');

  const entry = { w: canvasWidth, h: canvasHeight, face, pivot };
  _yawGradCache.set(ctx, entry);
  return entry;
}


export function drawAnalogGauge(ctx, canvasWidth, canvasHeight, config) {
  const {
    value,
    min,
    max,
    title,
    subtitle,
    majorStep,
    minorDivisions,
    redFrom,
    needleNormalized,
    labelFormatter,
    labelFontScale,
    speedJitter,   // amplitude of high-speed vibration jitter [0–1]
  } = config;

  const centreX = canvasWidth  * 0.5;
  const centreY = canvasHeight * 0.55;
  const radius  = Math.min(canvasWidth, canvasHeight) * 0.40;

  // Gauge sweep: from 225° to −45° (clockwise), i.e., 270° of arc.
  const startAngle = (225 / 180) * Math.PI;
  const endAngle   = (-45  / 180) * Math.PI;
  const sweepAngle = Math.PI * 1.5; // 270° in radians

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // --- Face background (cached gradient) ---
  const _gg = _getGaugeGrads(ctx, canvasWidth, canvasHeight);
  ctx.beginPath();
  ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
  ctx.fillStyle = _gg.face;
  ctx.fill();

  // Face border.
  ctx.strokeStyle = '#5a4a2a';
  ctx.lineWidth   = 2.5;
  ctx.stroke();

  // --- Red zone ---
  if (redFrom !== null && redFrom < max) {
    const redStartAngle = startAngle + sweepAngle * ((redFrom - min) / (max - min));
    ctx.beginPath();
    ctx.arc(centreX, centreY, radius * 0.85, redStartAngle, endAngle);
    ctx.arc(centreX, centreY, radius * 0.70, endAngle, redStartAngle, true);
    ctx.closePath();
    ctx.fillStyle = 'rgba(200, 40, 40, 0.35)';
    ctx.fill();
  }

  // --- Tick marks and labels ---
  const totalRange = max - min;
  const majorCount = Math.round(totalRange / majorStep);

  for (let major = 0; major <= majorCount; major++) {
    const majorValue = min + major * majorStep;
    const majorAngle = startAngle + sweepAngle * (major / majorCount);

    // Major tick.
    const outerR  = radius * 0.90;
    const innerR  = radius * 0.75;
    const labelR  = radius * 0.60;

    ctx.save();
    ctx.translate(centreX, centreY);
    ctx.rotate(majorAngle);

    ctx.beginPath();
    ctx.moveTo(0, -innerR);
    ctx.lineTo(0, -outerR);
    ctx.strokeStyle = '#3a2a0a';
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Label at major tick.
    ctx.rotate(-majorAngle); // un-rotate for text
    const labelX = Math.cos(majorAngle - Math.PI * 0.5) * labelR;
    const labelY = Math.sin(majorAngle - Math.PI * 0.5) * labelR;
    const fontSize = Math.round(radius * 0.12 * (labelFontScale || 1.0));
    ctx.font       = `${fontSize}px sans-serif`;
    ctx.fillStyle  = '#2a1a00';
    ctx.textAlign  = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelFormatter ? labelFormatter(majorValue) : String(majorValue),
                 labelX, labelY);

    // Minor ticks between major ticks (skip on last major).
    if (major < majorCount && minorDivisions > 1) {
      for (let minor = 1; minor < minorDivisions; minor++) {
        const minorAngle = majorAngle + sweepAngle * (minor / minorDivisions / majorCount);
        ctx.save();
        ctx.rotate(minorAngle);
        ctx.beginPath();
        ctx.moveTo(0, -outerR);
        ctx.lineTo(0, -(outerR - (outerR - innerR) * 0.5));
        ctx.strokeStyle = '#5a4a2a';
        ctx.lineWidth   = 1;
        ctx.stroke();
        ctx.restore();
        ctx.rotate(-minorAngle + majorAngle); // compensate parent rotate
      }
    }

    ctx.restore();
  }

  // --- Needle ---
  // Add speed-proportional jitter: at high vehicle speed the whole instrument
  // cluster trembles from chassis vibration. speedJitter is [0, 1]; we apply
  // a random angular offset scaled by the jitter amplitude and sweep angle.
  const jitterOffset  = speedJitter
    ? (Math.random() * 2 - 1) * speedJitter * sweepAngle * 0.04
    : 0;
  const clampedNeedle = clamp01(needleNormalized);
  const needleAngle = startAngle + sweepAngle * clampedNeedle + jitterOffset;

  // Motion-blur trail for visible Canvas2D gauge needles.
  // Source of truth is the same needleNormalized produced by createNeedlePhysics().
  const nowSeconds = performance.now() * 0.001;
  const trailSamples = Math.max(2, Math.min(state.params.motionBlurSamples || 6, 16));
  const trail = _updateNeedleTrail(ctx, clampedNeedle, nowSeconds, trailSamples);
  const trailDuration = 0.11 + (state.params.motionBlurIntensity || 0.6) * 0.12;

  const drawNeedleShape = (angle, color, alpha = 1.0, widthScale = 1.0) => {
    ctx.save();
    ctx.translate(centreX, centreY);
    ctx.rotate(angle);

    ctx.shadowColor = alpha >= 0.99 ? 'rgba(0,0,0,0.35)' : 'transparent';
    ctx.shadowBlur = alpha >= 0.99 ? 4 : 0;
    ctx.shadowOffsetX = alpha >= 0.99 ? 2 : 0;
    ctx.shadowOffsetY = alpha >= 0.99 ? 2 : 0;

    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(-3 * widthScale, 0);
    ctx.lineTo(0, -(radius * 0.80));
    ctx.lineTo(3 * widthScale, 0);
    ctx.lineTo(0, radius * 0.15);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  };

  for (let i = 0; i < trail.length - 1; i++) {
    const sample = trail[i];
    const ageNorm = (nowSeconds - sample.t) / trailDuration;
    if (ageNorm <= 0 || ageNorm >= 1) continue;

    const blurAlpha = (1 - ageNorm) * 0.22;
    const sampleAngle = startAngle + sweepAngle * sample.value + jitterOffset;
    drawNeedleShape(sampleAngle, '#9b2e23', blurAlpha, 0.85);
  }

  // Current needle on top.
  drawNeedleShape(needleAngle, '#c0392b', 1.0, 1.0);

  // Pivot cap (circle at centre, covers needle base) — cached gradient.
  ctx.save();
  ctx.translate(centreX, centreY);
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fillStyle = _gg.pivot;
  ctx.fill();
  ctx.restore();

  // --- Title and subtitle ---
  ctx.fillStyle  = '#2a1a00';
  ctx.textAlign  = 'center';

  const titleFontSize = Math.round(radius * 0.14);
  ctx.font         = `bold ${titleFontSize}px sans-serif`;
  ctx.textBaseline = 'bottom';
  ctx.fillText(title, centreX, centreY + radius * 0.40);

  const subtitleFontSize = Math.round(radius * 0.11);
  ctx.font         = `${subtitleFontSize}px sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(subtitle, centreX, centreY + radius * 0.40);

  // --- Vignette: darkened ring around the edge (cached gradient) ---
  ctx.beginPath();
  ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
  ctx.fillStyle = _gg.vignette;
  ctx.fill();
}


// =============================================================
// CUSTOM GAUGE RENDERERS (v15 new gauges)
// =============================================================

/**
 * Yaw Stability Margin Gauge: circular dial where needle rotates ±140° AND grows in length
 * with margin usage.
 */
export function drawYawStabilityGauge(ctx, canvasWidth, canvasHeight, config) {
  const { value, needleNormalized, labelFontScale, speedJitter } = config;
  const yawRate = value;  // rad/s
  const yawLimit = 2.0;   // rad/s (tunable default)
  const marginUsed = Math.abs(yawRate) / yawLimit;
  const marginPercent = marginUsed * 100;

  const centreX = canvasWidth * 0.5;
  const centreY = canvasHeight * 0.5;
  const radius = Math.min(canvasWidth, canvasHeight) * 0.4;

  // Background gradient (cached)
  const _yg = _getYawGrads(ctx, canvasWidth, canvasHeight);
  ctx.beginPath();
  ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
  ctx.fillStyle = _yg.face;
  ctx.fill();

  // Tick marks (simplified — just major ticks at ±140°)
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  const sweepAngle = (140 * Math.PI / 180);
  const startAngle = Math.PI / 2 - sweepAngle / 2;

  for (let i = 0; i <= 4; i++) {
    const angle = startAngle + (sweepAngle / 4) * i;
    const x1 = centreX + radius * 0.85 * Math.cos(angle);
    const y1 = centreY + radius * 0.85 * Math.sin(angle);
    const x2 = centreX + radius * 0.95 * Math.cos(angle);
    const y2 = centreY + radius * 0.95 * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Tick label
    if (i === 0) {
      ctx.fillStyle = '#333';
      ctx.font = `${12 * labelFontScale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('-140%', x1 - 15, y1);
    } else if (i === 4) {
      ctx.fillStyle = '#333';
      ctx.font = `${12 * labelFontScale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+140%', x1 + 15, y1);
    }
  }

  // Needle: rotates ±140° and grows in length
  const needleBaseLength = radius * 0.6;
  const needleMaxLength = radius * 1.0;
  const needleLength = needleBaseLength + Math.max(marginUsed - 0.5, 0) * (needleMaxLength - needleBaseLength);

  const needleAngle = startAngle + sweepAngle * needleNormalized + (Math.random() * 2 - 1) * speedJitter * sweepAngle * 0.04;
  const needleTipX = centreX + needleLength * Math.cos(needleAngle);
  const needleTipY = centreY + needleLength * Math.sin(needleAngle);

  // Needle shadow
  ctx.beginPath();
  ctx.moveTo(centreX + 3, centreY + 3);
  ctx.lineTo(needleTipX + 3, needleTipY + 3);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Needle itself (red, tapered)
  const needleWidthBase = 5;
  ctx.beginPath();
  ctx.moveTo(centreX, centreY);
  ctx.lineTo(needleTipX, needleTipY);
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = needleWidthBase;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Pivot cap (cached gradient)
  ctx.beginPath();
  ctx.arc(centreX, centreY, 8, 0, Math.PI * 2);
  ctx.fillStyle = _yg.pivot;
  ctx.fill();

  // Title and margin text
  ctx.fillStyle = '#333';
  ctx.font = `bold ${16 * labelFontScale}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('YAW STABILITY', centreX, centreY + radius + 20);

  ctx.font = `${14 * labelFontScale}px sans-serif`;
  ctx.fillText(`${Math.min(marginPercent, 999).toFixed(0)}% Margin`, centreX, centreY + radius + 45);
}

/**
 * Friction Circle Gauge: plots normalized axle forces (FxN, FyN) inside a unit circle.
 * Saturation = hypot(FxN, FyN).
 */
export function drawFrictionCircle(ctx, canvasWidth, canvasHeight, config) {
  const { axle, labelFontScale } = config;  // axle: 'front' or 'rear'

  const axleForces = axle === 'front' ? state.axleForces.front : state.axleForces.rear;
  const tireFrictionCoeff = state.params.tireFrictionCoeff;

  // Normalize forces to friction circle coordinates
  const fxN = axleForces.N > 0 ? axleForces.fx / (tireFrictionCoeff * axleForces.N) : 0;
  const fyN = axleForces.N > 0 ? axleForces.fy / (tireFrictionCoeff * axleForces.N) : 0;
  const saturation = Math.hypot(fxN, fyN);

  const centreX = canvasWidth * 0.5;
  const centreY = canvasHeight * 0.5;
  const radius = Math.min(canvasWidth, canvasHeight) * 0.35;

  // Background
  ctx.fillStyle = '#f5f0e8';
  ctx.beginPath();
  ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
  ctx.fill();

  // Grid lines: 0.5 and 1.0 friction circles
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  for (const level of [0.5, 1.0]) {
    ctx.beginPath();
    ctx.arc(centreX, centreY, radius * level, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Axes (X and Y force directions)
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(centreX - radius, centreY);
  ctx.lineTo(centreX + radius, centreY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(centreX, centreY - radius);
  ctx.lineTo(centreX, centreY + radius);
  ctx.stroke();

  // Operating point (dot at FxN, FyN scaled to canvas)
  const dotX = centreX + (fxN / 1.25) * radius;
  const dotY = centreY - (fyN / 1.25) * radius;
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.arc(dotX, dotY, 6, 0, Math.PI * 2);
  ctx.fill();

  // Saturation text
  ctx.fillStyle = '#333';
  ctx.font = `bold ${14 * labelFontScale}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`${(saturation * 100).toFixed(0)}%`, centreX, centreY + radius + 15);

  // Axle label
  ctx.font = `${12 * labelFontScale}px sans-serif`;
  ctx.fillText(axle.toUpperCase() + ' AXLE', centreX, centreY + radius + 35);
}

/**
 * Slip Angle Meter (β): horizontal bar with moving indicator.
 */
export function drawSlipAngleMeter(ctx, canvasWidth, canvasHeight, config) {
  const { value, needleNormalized, labelFontScale, speedJitter } = config;
  const betaDeg = value;  // degrees, ±45°

  const barX = canvasWidth * 0.15;
  const barY = canvasHeight * 0.5;
  const barWidth = canvasWidth * 0.7;
  const barHeight = 30;

  // Background bar
  ctx.fillStyle = '#d9c9a8';
  ctx.fillRect(barX, barY - barHeight / 2, barWidth, barHeight);

  // Center zero marking
  const centreX = barX + barWidth * 0.5;
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centreX, barY - barHeight / 2 - 10);
  ctx.lineTo(centreX, barY + barHeight / 2 + 10);
  ctx.stroke();

  // Tick marks at ±15°, ±30°, ±45°
  ctx.lineWidth = 1;
  ctx.font = `${10 * labelFontScale}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const deg of [-45, -30, -15, 15, 30, 45]) {
    const normalizedPos = (deg + 45) / 90;  // [0, 1]
    const x = barX + barWidth * normalizedPos;
    ctx.beginPath();
    ctx.moveTo(x, barY - barHeight / 2);
    ctx.lineTo(x, barY - barHeight / 2 - 8);
    ctx.stroke();
    ctx.fillStyle = '#666';
    ctx.fillText(deg.toString(), x, barY + barHeight / 2 + 5);
  }

  // Moving indicator (spring-smoothed)
  const indicatorPos = barX + barWidth * needleNormalized;
  const indicatorJitter = (Math.random() * 2 - 1) * speedJitter * 2;
  const actualPos = indicatorPos + indicatorJitter;

  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.arc(actualPos, barY, 8, 0, Math.PI * 2);
  ctx.fill();

  // Value text
  ctx.fillStyle = '#333';
  ctx.font = `bold ${16 * labelFontScale}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`β = ${betaDeg.toFixed(1)}°`, canvasWidth * 0.5, barY - barHeight / 2 - 20);
}

/**
 * Drift Stability Radar: 6-axis spider chart with spring-smoothed polygon.
 */
export function drawDriftRadar(ctx, canvasWidth, canvasHeight, config) {
  const { radarNeedles, labelFontScale } = config;

  // Compute normalized values for each axis
  const yawRate = state.body.angularVelocity;
  const yawLimit = 2.0;
  const yawMargin = Math.max(Math.abs(yawRate) / yawLimit, 0);

  const frontFxN = state.axleForces.front.N > 0 ? state.axleForces.front.fx / (state.params.tireFrictionCoeff * state.axleForces.front.N) : 0;
  const frontFyN = state.axleForces.front.N > 0 ? state.axleForces.front.fy / (state.params.tireFrictionCoeff * state.axleForces.front.N) : 0;
  const rearFxN = state.axleForces.rear.N > 0 ? state.axleForces.rear.fx / (state.params.tireFrictionCoeff * state.axleForces.rear.N) : 0;
  const rearFyN = state.axleForces.rear.N > 0 ? state.axleForces.rear.fy / (state.params.tireFrictionCoeff * state.axleForces.rear.N) : 0;

  const rearSaturation = Math.hypot(rearFxN, rearFyN);
  const frontSaturation = Math.hypot(frontFxN, frontFyN);
  const frontAuthority = 1.0 - Math.min(frontSaturation, 1.0);

  const heading = state.body.heading;
  const vLong = state.body.velocityX * Math.sin(heading) + state.body.velocityY * -Math.cos(heading);
  const vLat = state.body.velocityX * Math.cos(heading) + state.body.velocityY * Math.sin(heading);
  const beta = Math.atan2(vLat, Math.max(Math.abs(vLong), 0.25));
  const slipAngle = Math.min(Math.abs(beta) / (35 * Math.PI / 180), 1.0);

  const steerAngle = state.steering.frontWheelAngle;
  const steerRef = 0.35;
  const counterSteerAlign = Math.max(1.0 - Math.abs(Math.sign(beta) * steerAngle) / steerRef, 0.0);

  const speedRef = 25;  // m/s
  const speedRatio = Math.min(state.body.speed / speedRef, 1.0);

  // Raw values (before needle smoothing)
  const rawValues = [
    Math.min(yawMargin, 1.25) / 1.25,
    Math.min(rearSaturation, 1.25) / 1.25,
    frontAuthority,
    slipAngle,
    counterSteerAlign,
    speedRatio,
  ];

  // Smooth each value using its needle physics (6 axes)
  const smoothedValues = rawValues.map((val, idx) =>
    (radarNeedles && radarNeedles[idx]) ? radarNeedles[idx].step(Math.max(Math.min(val, 1.0), 0.0), 0.016) : val
  );

  const centreX = canvasWidth * 0.5;
  const centreY = canvasHeight * 0.5;
  const radarRadius = Math.min(canvasWidth, canvasHeight) * 0.35;

  // Background
  ctx.fillStyle = '#f5f0e8';
  ctx.beginPath();
  ctx.arc(centreX, centreY, radarRadius, 0, Math.PI * 2);
  ctx.fill();

  // Grid rings at 0.25, 0.5, 0.75, 1.0
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  for (const level of [0.25, 0.5, 0.75, 1.0]) {
    ctx.beginPath();
    ctx.arc(centreX, centreY, radarRadius * level, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Axes (6 equally spaced)
  const axisLabels = ['Yaw', 'Rear Sat', 'Front Auth', 'Slip β', 'Steer Align', 'Speed'];
  const axisAngles = axisLabels.map((_, i) => (Math.PI * 2 / 6) * i - Math.PI / 2);

  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1;
  axisAngles.forEach(angle => {
    const x = centreX + radarRadius * Math.cos(angle);
    const y = centreY + radarRadius * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(centreX, centreY);
    ctx.lineTo(x, y);
    ctx.stroke();
  });

  // Polygon (filled shape connecting the 6 values)
  ctx.beginPath();
  smoothedValues.forEach((val, idx) => {
    const angle = axisAngles[idx];
    const x = centreX + radarRadius * val * Math.cos(angle);
    const y = centreY + radarRadius * val * Math.sin(angle);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(192, 57, 43, 0.2)';  // Red with transparency
  ctx.fill();
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Axis labels
  ctx.fillStyle = '#333';
  ctx.font = `${11 * labelFontScale}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  axisLabels.forEach((label, idx) => {
    const angle = axisAngles[idx];
    const x = centreX + (radarRadius + 30) * Math.cos(angle);
    const y = centreY + (radarRadius + 30) * Math.sin(angle);
    ctx.fillText(label, x, y);
  });

  // Title
  ctx.font = `bold ${14 * labelFontScale}px sans-serif`;
  ctx.fillText('DRIFT RADAR', centreX, centreY - radarRadius - 30);
}

function drawArrow(ctx, originX, originY, dx, dy, magnitude, color, maxLength) {
  const length = Math.min(magnitude * 0.3, maxLength); // 0.3 m per m/s² or m/s³
  if (length < 0.05) return; // too small to see

  const tipX = originX + dx * length;
  const tipY = originY + dy * length;

  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(tipX, tipY);
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.12; // metres (world space)
  ctx.lineCap = 'round';
  ctx.stroke();

  // Arrowhead
  const headLength = Math.min(length * 0.3, 0.4);
  const angle = Math.atan2(tipY - originY, tipX - originX);
  const headAngle = 0.45; // radians

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - headLength * Math.cos(angle - headAngle),
             tipY - headLength * Math.sin(angle - headAngle));
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - headLength * Math.cos(angle + headAngle),
             tipY - headLength * Math.sin(angle + headAngle));
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.10;
  ctx.stroke();
}

export function drawWheelSlipGauge(ctx, canvasWidth, canvasHeight, config) {
  const {
    slipRatio,           // κ ∈ [-1, +1]
    utilization,         // u ∈ [0, 1]
    wheelName,           // "frontLeft", "frontRight", "rearLeft", "rearRight"
    peakSlipRatio,       // ~0.12 for Pacejka peak
  } = config;

  // Clamp slip ratio for stability
  const safeSlipRatio = Math.max(-1, Math.min(1, slipRatio));

  const cx = canvasWidth * 0.5;
  const cy = canvasHeight * 0.45;  // Slightly higher for labels below
  const barWidth = canvasWidth * 0.65;
  const barHeight = canvasHeight * 0.12;
  const barLeft = cx - barWidth * 0.5;
  const barRight = cx + barWidth * 0.5;

  // --- Background ---
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // --- Gauge bar background (dark) ---
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(barLeft - 5, cy - barHeight * 0.5 - 5, barWidth + 10, barHeight + 10);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  ctx.strokeRect(barLeft - 5, cy - barHeight * 0.5 - 5, barWidth + 10, barHeight + 10);

  // --- Color zones within the bar ---
  const greenZoneKappa = 0.08;
  const redZoneKappa = peakSlipRatio;

  // Green zone: |κ| < 0.08 (pure rolling)
  const greenLeft = cx - (greenZoneKappa / 1.0) * (barWidth * 0.5);
  const greenRight = cx + (greenZoneKappa / 1.0) * (barWidth * 0.5);
  ctx.fillStyle = '#22aa2244';  // Translucent green
  ctx.fillRect(greenLeft, cy - barHeight * 0.5, greenRight - greenLeft, barHeight);

  // Yellow zones: 0.08 < |κ| < peakSlipRatio (optimal traction)
  const yellowLeftStart = cx - (redZoneKappa / 1.0) * (barWidth * 0.5);
  const yellowLeftEnd = greenLeft;
  const yellowRightStart = greenRight;
  const yellowRightEnd = cx + (redZoneKappa / 1.0) * (barWidth * 0.5);

  ctx.fillStyle = '#cc880044';  // Translucent yellow
  ctx.fillRect(yellowLeftStart, cy - barHeight * 0.5, yellowLeftEnd - yellowLeftStart, barHeight);
  ctx.fillRect(yellowRightStart, cy - barHeight * 0.5, yellowRightEnd - yellowRightStart, barHeight);

  // Red zones: |κ| > peakSlipRatio (traction degrading)
  ctx.fillStyle = '#cc222244';  // Translucent red
  ctx.fillRect(barLeft, cy - barHeight * 0.5, yellowLeftStart - barLeft, barHeight);
  ctx.fillRect(yellowRightEnd, cy - barHeight * 0.5, barRight - yellowRightEnd, barHeight);

  // --- Markings and labels ---
  ctx.strokeStyle = '#666';
  ctx.fillStyle = '#999';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  // Draw tick marks and labels: -1, -0.5, 0, +0.5, +1
  const ticks = [-1, -0.5, 0, 0.5, 1];
  for (const tickValue of ticks) {
    const tickX = cx + (tickValue / 1.0) * (barWidth * 0.5);
    const tickY = cy - barHeight * 0.5;

    // Draw tick line
    ctx.lineWidth = tickValue === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(tickX, tickY - 8);
    ctx.lineTo(tickX, tickY);
    ctx.stroke();

    // Label below the bar
    ctx.fillStyle = tickValue === 0 ? '#ddd' : '#999';
    ctx.fillText(tickValue.toFixed(1), tickX, tickY + 20);
  }

  // --- Center line (κ = 0) ---
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - barHeight * 0.5);
  ctx.lineTo(cx, cy + barHeight * 0.5);
  ctx.stroke();

  // --- Needle (centered at κ = 0) ---
  const needleX = cx + (safeSlipRatio / 1.0) * (barWidth * 0.5);
  const needleBaseY = cy - barHeight * 0.5 - 10;
  const needlePointY = cy + barHeight * 0.5 + 10;

  // Needle shadow
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(needleX + 1, needleBaseY + 1);
  ctx.lineTo(needleX + 1, needlePointY + 1);
  ctx.stroke();

  // Needle body - color based on zone
  let needleColor = '#22aa22';  // Green: safe zone
  if (Math.abs(safeSlipRatio) > redZoneKappa) {
    needleColor = '#cc2222';  // Red: degraded traction
  } else if (Math.abs(safeSlipRatio) > greenZoneKappa) {
    needleColor = '#cc8800';  // Yellow: optimal
  }
  ctx.strokeStyle = needleColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(needleX, needleBaseY);
  ctx.lineTo(needleX, needlePointY);
  ctx.stroke();

  // Needle cap
  ctx.fillStyle = needleColor;
  ctx.beginPath();
  ctx.arc(needleX, needleBaseY, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.stroke();

  // --- Info display below the gauge ---
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Wheel name (short form: FL, FR, RL, RR)
  const wheelLabel = wheelName
    .replace('frontLeft', 'FL')
    .replace('frontRight', 'FR')
    .replace('rearLeft', 'RL')
    .replace('rearRight', 'RR');
  ctx.fillStyle = '#eee';
  ctx.fillText(wheelLabel, cx, cy + barHeight * 0.5 + 40);

  // Slip ratio and utilization values
  ctx.font = '12px monospace';
  ctx.fillStyle = '#999';
  ctx.fillText(`κ = ${safeSlipRatio.toFixed(3)}  u = ${utilization.toFixed(2)}`, cx, cy + barHeight * 0.5 + 60);
}
