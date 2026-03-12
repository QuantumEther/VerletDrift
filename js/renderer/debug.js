// =============================================================
// DEBUG OVERLAYS — Visualization tools for stability diagnosis
// =============================================================
// Exports: drawDebugOverlays

import { renderState as state } from '../state.js';


// =============================================================
// PRIVATE HELPERS
// =============================================================

function drawArrowAt(ctx, fromX, fromY, toX, toY, color, label = '') {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return;

  const angle = Math.atan2(dy, dx);
  const headSize = Math.max(0.04, len * 0.15);  // world units (meters), not pixels

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 0.05;  // world units (meters)
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headSize * Math.cos(angle - Math.PI / 6), toY - headSize * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - headSize * Math.cos(angle + Math.PI / 6), toY - headSize * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();

  if (label) {
    ctx.font = `bold 11px monospace`;
    ctx.fillStyle = color;
    ctx.fillText(label, toX + 0.2, toY - 0.15);  // world units (meters)
  }
}


// =============================================================
// EXPORTS
// =============================================================

export function drawDebugOverlays(ctx) {
  const params = state.params;
  const body = state.body;
  const wheels = state.wheels;
  const wheelNames = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'];

  ctx.save();
  ctx.font = `${params.debugFontSize}px monospace`;
  ctx.fillStyle = params.debugFontColor;

  // Size scale factor: makes overlays scale with font size (8px = 1.0x, 14px = 1.75x)
  const sizeScale = params.debugFontSize / 8;

  // === TIRE FORCES ===
  if (params.debugShowTireForces && state.perWheelLateralForce) {
    for (const name of wheelNames) {
      const wheel = wheels[name];
      const latForce = state.perWheelLateralForce[name] || 0;
      const lonForce = state.perWheelLongitudinalForce[name] || 0;

      // Wheel frame: forward = car heading, right = heading + 90°
      const fwd = Math.cos(body.heading);
      const right = Math.sin(body.heading);

      // Lateral force arrow (perpendicular to heading)
      const latScale = params.debugForceScale;
      const latX = wheel.x + latForce * latScale * (-right);
      const latY = wheel.y + latForce * latScale * (-fwd);
      drawArrowAt(ctx, wheel.x, wheel.y, latX, latY, '#ff9900', `${Math.round(latForce)}N`);

      // Longitudinal force arrow (parallel to heading)
      const lonScale = params.debugForceScale;
      const lonX = wheel.x + lonForce * lonScale * fwd;
      const lonY = wheel.y + lonForce * lonScale * right;
      drawArrowAt(ctx, wheel.x, wheel.y, lonX, lonY, '#00ff66', `${Math.round(lonForce)}N`);

      // Utilization color indicator (using wheelFrictionUtil for semantic clarity)
      // Green = low utilization (safe grip available), Red = high utilization (near limit)
      const utilization = state.wheelFrictionUtil[name] || 0;
      let utilColor = utilization < 0.3 ? '#00ff00' : utilization < 0.7 ? '#ffff00' : '#ff0000';
      ctx.fillStyle = utilColor;
      const rectSize = 0.08 * sizeScale;  // ~0.08m square
      ctx.fillRect(wheel.x - rectSize, wheel.y - rectSize, rectSize * 2, rectSize * 2);
    }
  }

  // === SLIP ANGLES ===
  if (params.debugShowSlipAngles) {
    for (const name of wheelNames) {
      const wheel = wheels[name];
      // Display friction circle utilization: green when safe, red when near limit
      const utilization = state.wheelFrictionUtil[name] || 0;
      const isSlipping = utilization > 0.85;  // Slipping when near traction limit

      ctx.fillStyle = isSlipping ? '#ff0000' : '#00ff00';
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      // Radius scales with utilization: 0→small, 1→large
      ctx.arc(wheel.x, wheel.y, (0.15 + utilization * 0.25) * sizeScale, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Show grip percentage
      ctx.fillStyle = '#00ff00';
      ctx.font = `bold ${params.debugFontSize - 4}px monospace`;
      ctx.fillText(`${Math.round(utilization * 100)}%`, wheel.x - 0.4, wheel.y + 0.2);  // world units
    }
  }

  // === SELF-ALIGNING TORQUE (SAT) ===
  if (params.debugShowSAT) {
    const sat = state.steering.selfAligningTorque || 0;
    const satMax = 25; // Match the clamp in physics.js

    // Draw as curved arrow from car center
    const satNorm = Math.max(-1, Math.min(1, sat / satMax));
    const satRadius = 0.3 * sizeScale;  // ~0.3 meters (world units, not pixels!)
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + satNorm * Math.PI * 0.6;

    ctx.strokeStyle = sat > 0 ? '#ff0066' : '#0066ff';
    ctx.lineWidth = 0.04 * sizeScale;  // World units
    ctx.beginPath();
    ctx.arc(body.centerX, body.centerY, satRadius, startAngle, endAngle);
    ctx.stroke();

    // Arrowhead at end
    const headX = body.centerX + satRadius * Math.cos(endAngle);
    const headY = body.centerY + satRadius * Math.sin(endAngle);
    const headSize = 0.08 * sizeScale;  // world units (meters)
    ctx.beginPath();
    ctx.moveTo(headX, headY);
    ctx.lineTo(headX - headSize * Math.cos(endAngle - Math.PI / 6), headY - headSize * Math.sin(endAngle - Math.PI / 6));
    ctx.lineTo(headX - headSize * Math.cos(endAngle + Math.PI / 6), headY - headSize * Math.sin(endAngle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    // Label (offset in world units, not pixels!)
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${params.debugFontSize}px monospace`;
    const labelOffsetX = -0.5 * sizeScale;  // ~0.5m to the left (world units)
    const labelOffsetY = -0.5 * sizeScale;  // ~0.5m up (world units)
    ctx.fillText(`SAT: ${sat.toFixed(1)} N·m`, body.centerX + labelOffsetX, body.centerY + labelOffsetY);
  }

  // === SMOOTHING FILTER (Raw vs Smoothed Lateral Velocity) ===
  if (params.debugShowSmoothingFilter) {
    const frontLat = state.smoothedWheelLat.frontLeft || 0;
    const rawLat = state.wheelLateralSpeed?.frontLeft || 0; // Approximate

    ctx.strokeStyle = '#ff0000';
    ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
    ctx.lineWidth = 0.02;  // world units (meters)

    // Scale: -5 to +5 m/s vertically
    const wheelFL = wheels.frontLeft;
    const graphHeight = 1.5 * sizeScale;  // World units, not pixels!
    const graphScale = graphHeight / 10;

    // Raw signal (thin red)
    const rawY = wheelFL.y - (rawLat * graphScale);
    const graphWidth = 0.6 * sizeScale;  // World units
    ctx.beginPath();
    ctx.moveTo(wheelFL.x - graphWidth, wheelFL.y);
    ctx.lineTo(wheelFL.x + graphWidth, rawY);
    ctx.stroke();

    // Smoothed signal (thick green)
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 0.06 * sizeScale;  // World units
    const smoothY = wheelFL.y - (frontLat * graphScale);
    ctx.beginPath();
    ctx.moveTo(wheelFL.x - graphWidth, wheelFL.y);
    ctx.lineTo(wheelFL.x + graphWidth, smoothY);
    ctx.stroke();

    // Scale labels (offset in world units)
    ctx.fillStyle = '#00ff00';
    ctx.font = `${params.debugFontSize - 6}px monospace`;
    const labelOffsetXF = 0.4 * sizeScale;  // World units
    const labelOffsetY1 = -0.3 * sizeScale;
    const labelOffsetY2 = 0.3 * sizeScale;
    ctx.fillText(`Raw: ${rawLat.toFixed(2)} m/s`, wheelFL.x + labelOffsetXF, wheelFL.y + labelOffsetY1);
    ctx.fillText(`Smooth: ${frontLat.toFixed(2)} m/s`, wheelFL.x + labelOffsetXF, wheelFL.y + labelOffsetY2);
  }

  // === SIGN FLIP CROSSOVER ===
  if (params.debugShowCrossover) {
    // Monitor smoothedWheelLat for sign changes
    if (!state._crossoverPulseTime) state._crossoverPulseTime = 0;

    for (const name of wheelNames) {
      const lat = state.smoothedWheelLat[name] || 0;
      const wheel = wheels[name];

      // Pulse circle when crossing zero
      if (Math.abs(lat) < 0.1) {
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 0.04 * sizeScale;  // World units
        const pulseRadius = (0.1 + Math.sin(state._crossoverPulseTime * 10) * 0.05) * sizeScale;
        ctx.beginPath();
        ctx.arc(wheel.x, wheel.y, pulseRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    state._crossoverPulseTime += 0.016; // ~60Hz tick
  }

  // === WHEEL VELOCITIES ===
  if (params.debugShowWheelSpeeds) {
    for (const name of wheelNames) {
      const wheel = wheels[name];
      const armX = wheel.x - body.centerX;
      const armY = wheel.y - body.centerY;
      const wheelVelX = body.velocityX + (-body.angularVelocity * armY);
      const wheelVelY = body.velocityY + ( body.angularVelocity * armX);

      // Draw velocity vector (0.5 scale for visibility)
      const scale = 0.5;
      drawArrowAt(ctx, wheel.x, wheel.y, wheel.x + wheelVelX * scale, wheel.y + wheelVelY * scale, '#6666ff', '');

      // Show components
      const vMag = Math.hypot(wheelVelX, wheelVelY);
      ctx.fillStyle = '#6666ff';
      ctx.font = `${params.debugFontSize - 4}px monospace`;
      ctx.fillText(`${vMag.toFixed(1)}m/s`, wheel.x + 0.3, wheel.y - 0.3);  // world units
    }
  }

  ctx.restore();
}
