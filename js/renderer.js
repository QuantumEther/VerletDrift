// =============================================================
// RENDERER — all canvas drawing
// =============================================================
// Two render passes per frame:
//
//   WORLD SPACE (camera transform applied):
//     1. Checkerboard background (with optional motion blur)
//     2. Map boundary rectangle
//     3. Trail arrows
//     4. Car body rectangle
//
//   SCREEN SPACE (no transform, pixel-exact HUD):
//     5. Steering wheel indicator
//     6. Throttle bar
//     7. Brake bar
//     8. Clutch pedal bar (with bite zone marked)
//     9. Gear indicator (large character)
//
//   GAUGE CANVASES (separate canvas elements):
//    10. Tachometer (0–7000 RPM, redline at 6500)
//    11. Speedometer (0–200 km/h)
//    12. Third canvas: used as a lateral-G gauge (0–1.5 G)
//
// Each function is self-contained. A failure in one does not affect others.
// =============================================================

// Local utility
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

import state from './state.js';
import { physicsRandom } from './random.js';
import {
  CAR_HALF_WIDTH,
  CAR_HALF_LENGTH,
  CLUTCH_BITE_POINT,
  CLUTCH_BITE_RANGE,
  PIXELS_PER_METER,
  NEEDLE_STIFFNESS,
  NEEDLE_DAMPING,
  NEEDLE_RISE_BOOST,
  NEEDLE_FALL_BOOST,
  NEEDLE_FLUTTER_THRESHOLD,
  WHEEL_RADIUS,
} from './constants.js';


// =============================================================
// CAMERA TRANSFORM
// =============================================================

// Applies the camera transform to ctx before drawing world-space content.
// After this call, canvas coordinates match world coordinates scaled and
// offset by the camera's position and zoom.
export function applyCameraTransform(ctx, viewportWidth, viewportHeight) {
  const ppm = state.params.pixelsPerMeter || PIXELS_PER_METER;
  ctx.save();
  ctx.translate(viewportWidth * 0.5, viewportHeight * 0.5);
  ctx.scale(state.camera.zoom, state.camera.zoom);
  ctx.scale(ppm, ppm);
  ctx.translate(-state.camera.x, -state.camera.y);

  // Screen shake: apply world-space offset on top of camera position.
  // Because we're already in scaled world space, shakeX/Y in metres map directly.
  if (state.screenShake.magnitude > 0.001) {
    ctx.translate(state.screenShake.shakeX, state.screenShake.shakeY);
  }
}

// Restores the context to the state before applyCameraTransform.
// Must be called before drawing screen-space HUD elements.
export function removeCameraTransform(ctx) {
  ctx.restore();
}


// =============================================================
// CHECKERBOARD BACKGROUND
// =============================================================

// Draws the tiled checkerboard pattern, with an optional motion-blur effect
// that trails behind the car's movement direction.
// Only tiles visible in the current viewport + camera margin are drawn.
export function drawCheckerboard(ctx, viewportWidth, viewportHeight) {
  const camera = state.camera;
  const body   = state.body;
  const params = state.params;
  const ppm    = params.pixelsPerMeter || PIXELS_PER_METER;
  // Tile size in metres: the slider stores the visual px size; divide by scale to get world size.
  const tile   = params.checkerboardTileSize / ppm;

  // Effective pixels-per-metre including zoom; used to convert viewport px → metres.
  const effectiveScale = camera.zoom * ppm;

  // How many tiles the viewport covers in world-space (metres).
  const tilesAcross = (viewportWidth  / effectiveScale / tile) + 2;
  const tilesDown   = (viewportHeight / effectiveScale / tile) + 2;

  // Top-left visible tile index (camera.x/y are in metres).
  const startTileX = Math.floor((camera.x - viewportWidth  * 0.5 / effectiveScale) / tile) - 1;
  const startTileY = Math.floor((camera.y - viewportHeight * 0.5 / effectiveScale) / tile) - 1;

  // --- DYNAMIC MOTION BLUR — multi-factor temporally-coherent system ---
  const speed         = body.speed;
  const blurSamples   = params.motionBlurSamples;
  const blurIntensity = params.motionBlurIntensity;

  // Read tunable weights from params (with safe defaults)
  const blurSpeedW   = params.blurSpeedWeight   !== undefined ? params.blurSpeedWeight   : 0.50;
  const blurDriftW   = params.blurDriftWeight   !== undefined ? params.blurDriftWeight   : 0.70;
  const blurAngW     = params.blurAngularWeight !== undefined ? params.blurAngularWeight : 0.40;
  const blurJerkW    = params.blurJerkWeight    !== undefined ? params.blurJerkWeight    : 0.30;
  const blurMaxOff   = params.blurMaxOffset     !== undefined ? params.blurMaxOffset     : 5.0;
  const blurAttack   = params.blurAttackRate    !== undefined ? params.blurAttackRate    : 0.35;
  const blurDecay    = params.blurDecayRate     !== undefined ? params.blurDecayRate     : 0.04;

  // Forward speed component: non-linear curve
  const speedNorm = Math.max(0, (speed - params.motionBlurThreshold) / Math.max(1, 40 - params.motionBlurThreshold));
  const speedBlur = clamp01(speedNorm * speedNorm) * blurSpeedW;

  // Drift intensity contribution
  const driftBlur = (state.driftIntensity || 0) * blurDriftW;

  // Angular velocity contribution
  const angVelBlur = clamp01(Math.abs(body.angularVelocity) / 2.5) * blurAngW;

  // Jerk contribution
  const filtJerk  = (state.filteredBody && state.filteredBody.jerkMagnitude) || body.jerkMagnitude || 0;
  const jerkBlur  = clamp01(filtJerk / 400) * blurJerkW;

  const targetBlur = clamp01(speedBlur + driftBlur + angVelBlur + jerkBlur);

  // EMA accumulator — fast attack, slow cinematic decay
  const acc = state.blurAccumulator || 0;
  const blurAlpha = targetBlur > acc ? blurAttack : blurDecay;
  state.blurAccumulator = acc + (targetBlur - acc) * blurAlpha;
  const effectiveBlur = state.blurAccumulator * blurIntensity;

  let sampleCount = 1;
  let blurOffsetPerSample = 0;
  let rotBlurAngle = 0;

  if (effectiveBlur > 0.015 && blurSamples > 1) {
    sampleCount = blurSamples;
    blurOffsetPerSample = Math.min(speed * 0.12 * effectiveBlur * 2.0, blurMaxOff);
    rotBlurAngle = Math.abs(body.angularVelocity) * 0.04 * effectiveBlur;
  }

  for (let sample = sampleCount - 1; sample >= 0; sample--) {
    const sampleFraction = sample / Math.max(sampleCount - 1, 1);
    const sampleAlpha = sample === 0
      ? 1.0
      : effectiveBlur * (1 - sampleFraction) * 0.7;

    const invSpeed = speed > 0.001 ? 1 / speed : 0;
    const longOffsetX = -body.velocityX * invSpeed * blurOffsetPerSample * sampleFraction;
    const longOffsetY = -body.velocityY * invSpeed * blurOffsetPerSample * sampleFraction;
    const latSign = Math.sign(body.lateralAccel || 0);
    const latMag  = clamp01(Math.abs(body.lateralAccel || 0) / 15) * effectiveBlur * 1.5 * sampleFraction;
    const latOffsetX =  Math.cos(body.heading) * latMag * latSign;
    const latOffsetY =  Math.sin(body.heading) * latMag * latSign;

    const rotAngle = rotBlurAngle * sampleFraction * Math.sign(body.angularVelocity);
    const rotCos = Math.cos(rotAngle);
    const rotSin = Math.sin(rotAngle);
    const baseX = longOffsetX + latOffsetX;
    const baseY = longOffsetY + latOffsetY;
    const offsetX = baseX * rotCos - baseY * rotSin;
    const offsetY = baseX * rotSin + baseY * rotCos;

    ctx.globalAlpha = sampleAlpha;

    for (let col = 0; col <= tilesAcross; col++) {
      for (let row = 0; row <= tilesDown; row++) {
        const tileX     = (startTileX + col) * tile + offsetX;
        const tileY     = (startTileY + row) * tile + offsetY;
        const isLight   = (startTileX + col + startTileY + row) % 2 === 0;
        ctx.fillStyle   = isLight ? '#222026' : '#111416';
        ctx.fillRect(tileX, tileY, tile, tile);
      }
    }
  }

  ctx.globalAlpha = 1.0;
}


// =============================================================
// MAP BOUNDARY
// =============================================================

// Draws a dashed rectangle marking the edge of the driveable area.
export function drawMapBoundary(ctx) {
  const params = state.params;
  ctx.save();
  ctx.strokeStyle = 'rgba(80, 80, 80, 0.6)';
  ctx.lineWidth   = 3;
  ctx.setLineDash([20, 12]);
  ctx.strokeRect(0, 0, params.mapWidth, params.mapHeight);
  ctx.setLineDash([]);
  ctx.restore();
}


// =============================================================
// MOTION BLUR — Car ghost trail
// =============================================================
// Draws translucent copies of the car at past positions.
// This gives motion blur ON THE CAR ITSELF, not just the background.
export function drawCarGhosts(ctx) {
  const history   = state.carPoseHistory;
  const blur      = state.blurAccumulator || 0;
  const intensity = state.params.motionBlurIntensity || 0.6;
  const effectiveBlur = blur * intensity;

  if (effectiveBlur < 0.02 || history.length < 2) return;

  const tireW = WHEEL_RADIUS * 1.1;
  const tireH = WHEEL_RADIUS * 0.85;

  // Skip last entry (current pose — drawn by drawCar itself)
  const ghostCount = history.length - 1;
  for (let i = 0; i < ghostCount; i++) {
    const pose = history[i];
    const ageFraction = (i + 1) / (ghostCount + 1); // 0=oldest, 1=newest
    const ghostAlpha  = effectiveBlur * ageFraction * 0.5;
    if (ghostAlpha < 0.005) continue;

    ctx.save();
    ctx.globalAlpha = ghostAlpha;

    // Ghost wheels (simplified — just dark rectangles)
    const wheelDefs = [
      { name: 'frontLeft', isFront: true },
      { name: 'frontRight', isFront: true },
      { name: 'rearLeft', isFront: false },
      { name: 'rearRight', isFront: false },
    ];
    for (const { name, isFront } of wheelDefs) {
      const wh = pose.wheels[name];
      ctx.save();
      ctx.translate(wh.x, wh.y);
      ctx.rotate(pose.heading + (isFront ? pose.steerAngle : 0));
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.roundRect(-tireW, -tireH, tireW * 2, tireH * 2, tireW * 0.15);
      ctx.fill();
      ctx.restore();
    }

    // Ghost body
    ctx.save();
    ctx.translate(pose.cx, pose.cy);
    ctx.rotate(pose.heading);
    ctx.fillStyle = '#d4a017';
    ctx.beginPath();
    ctx.roundRect(-CAR_HALF_WIDTH, -CAR_HALF_LENGTH,
                  CAR_HALF_WIDTH * 2, CAR_HALF_LENGTH * 2, 0.12);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }
}


// =============================================================
// CAR BODY
// =============================================================

// Draws the car as a filled rectangle centred on body.centerX/Y
// and rotated to body.heading. Also draws a windshield strip and
// a heading marker line at the front to show orientation clearly.
//
// Wheels are now rendered at their actual Verlet particle positions,
// with front wheels rotated to match their physical steering angle.
export function drawCar(ctx) {
  const body       = state.body;
  const engine     = state.engine;
  const wheels     = state.wheels;
  const steerAngle = state.steering.frontWheelAngle;

  // Tire proportions (top-down view):
  // - wheelW: half the tire WIDTH (sidewall to sidewall) — relatively wide
  // - wheelH: half the CONTACT PATCH LENGTH (along rolling direction)
  // A real wide tire seen from above looks like a stubby rectangle.
  const tireW = WHEEL_RADIUS * 1.1;   // half tire width  (≈0.38m → 0.76m wide)
  const tireH = WHEEL_RADIUS * 0.85;  // half patch length (≈0.30m → 0.60m long)
  const rimW  = tireW * 0.68;         // rim is narrower than tire (inside the sidewall)
  const rimH  = tireH * 0.82;

  const wheelDefs = [
    { name: 'frontLeft',  isFront: true  },
    { name: 'frontRight', isFront: true  },
    { name: 'rearLeft',   isFront: false },
    { name: 'rearRight',  isFront: false },
  ];

  // Draw wheels BEHIND car body (z-order: tire → wheel → car body on top)
  for (const { name, isFront } of wheelDefs) {
    const wh   = wheels[name];
    const gws  = state.wheelGripState[name];
    const grip = gws ? gws.smoothedGrip : (state.wheelGrip[name] || 1);
    const tp   = state.tirePaint[name];
    const angle = body.heading + (isFront ? steerAngle : 0);

    ctx.save();
    ctx.translate(wh.x, wh.y);
    ctx.rotate(angle);

    // === TIRE BODY (outermost — rubber) ===
    // Color: near-black rubber base. Goes hot orange-red when losing grip.
    const gripLoss = Math.max(0, 1.0 - grip * 1.5);
    const hotR = Math.round(30 + gripLoss * 200);
    const hotG = Math.round(28 - gripLoss * 5);

    // If tire has paint, tint the rubber accordingly
    let tireColor;
    if (tp && tp.saturation > 0.06 && tp.hue >= 0) {
      const lightness = 20 + Math.round(tp.saturation * 12) + Math.round(gripLoss * 8);
      const sat = Math.round(55 + tp.saturation * 30);
      tireColor = `hsl(${tp.hue}, ${sat}%, ${lightness}%)`;
    } else {
      tireColor = `rgb(${hotR},${hotG},28)`;
    }

    // Tire outline / sidewall
    ctx.fillStyle = tireColor;
    ctx.beginPath();
    ctx.roundRect(-tireW, -tireH, tireW * 2, tireH * 2, tireW * 0.15);
    ctx.fill();

    // Tire tread texture: dark lateral grooves across the contact patch
    ctx.fillStyle = 'rgba(10,10,10,0.65)';
    const grooveSpacing = tireH * 0.38;
    for (let g = -1; g <= 1; g++) {
      ctx.fillRect(-tireW, g * grooveSpacing - 0.015, tireW * 2, 0.03);
    }
    // Shoulder groove (at edge of contact patch)
    ctx.fillStyle = 'rgba(8,8,8,0.5)';
    ctx.fillRect(-tireW, -tireH + tireH * 0.12, tireW * 2, tireH * 0.08);
    ctx.fillRect(-tireW,  tireH - tireH * 0.20, tireW * 2, tireH * 0.08);

    // === ALLOY RIM ===
    // Draw rim inset within the tire
    // Rim background (brake disc / dark center)
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.ellipse(0, 0, rimW, rimH, 0, 0, Math.PI * 2);
    ctx.fill();

    // Alloy face — light metallic silver
    ctx.fillStyle = '#c8c8cc';
    ctx.beginPath();
    ctx.ellipse(0, 0, rimW * 0.88, rimH * 0.88, 0, 0, Math.PI * 2);
    ctx.fill();

    // 5-spoke pattern — spokes emanate from hub to rim edge
    const spokeCount = 5;
    const spokeWidth  = rimW * 0.22;
    const spokeLength = rimW * 0.82;
    ctx.fillStyle = '#a8a8ac';
    for (let s = 0; s < spokeCount; s++) {
      const a = (s / spokeCount) * Math.PI * 2;
      ctx.save();
      ctx.rotate(a);
      // Trapezoidal spoke: wider at hub, narrower at rim
      ctx.beginPath();
      ctx.moveTo(-spokeWidth * 0.5,  0);
      ctx.lineTo( spokeWidth * 0.5,  0);
      ctx.lineTo( spokeWidth * 0.3,  spokeLength);
      ctx.lineTo(-spokeWidth * 0.3,  spokeLength);
      ctx.closePath();
      ctx.fill();

      // Spoke shadow for depth
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.moveTo( spokeWidth * 0.1,  0);
      ctx.lineTo( spokeWidth * 0.5,  0);
      ctx.lineTo( spokeWidth * 0.3,  spokeLength);
      ctx.lineTo( spokeWidth * 0.1,  spokeLength);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#a8a8ac'; // reset for next spoke
      ctx.restore();
    }

    // Between-spoke sections: dark face of rim (depth illusion)
    // Re-draw overlapping dark arcs between spokes
    ctx.strokeStyle = '#1e1e22';
    ctx.lineWidth   = rimW * 0.08;
    for (let s = 0; s < spokeCount; s++) {
      const a1 = ((s + 0.5) / spokeCount) * Math.PI * 2;
      const a2 = ((s + 1.5) / spokeCount) * Math.PI * 2; // wider arc
      ctx.beginPath();
      ctx.arc(0, 0, rimW * 0.72, a1, a2);
      ctx.stroke();
    }

    // Center hub cap
    ctx.fillStyle = '#404045';
    ctx.beginPath();
    ctx.arc(0, 0, rimW * 0.22, 0, Math.PI * 2);
    ctx.fill();
    // Hub highlight
    ctx.fillStyle = '#787880';
    ctx.beginPath();
    ctx.arc(-rimW * 0.06, -rimH * 0.06, rimW * 0.12, 0, Math.PI * 2);
    ctx.fill();
    // Hub center bolt
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(0, 0, rimW * 0.06, 0, Math.PI * 2);
    ctx.fill();

    // Tire sidewall: a thin darker ring between tire and rim
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth   = tireW * 0.1;
    ctx.beginPath();
    ctx.ellipse(0, 0, rimW * 1.05, rimH * 1.05, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Tire outer edge highlight (specular sheen on rubber)
    ctx.strokeStyle = `rgba(${hotR + 20}, ${hotG + 18}, 45, 0.35)`;
    ctx.lineWidth   = tireW * 0.06;
    ctx.beginPath();
    ctx.roundRect(-tireW, -tireH, tireW * 2, tireH * 2, tireW * 0.15);
    ctx.stroke();

    ctx.restore();
  }

  // --- Car body (drawn OVER the wheels) ---
  ctx.save();
  ctx.translate(body.centerX, body.centerY);
  ctx.rotate(body.heading);

  const W = CAR_HALF_WIDTH;
  const L = CAR_HALF_LENGTH;

  // Drop shadow
  ctx.shadowColor   = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur    = 0.25;
  ctx.shadowOffsetX = 0.07;
  ctx.shadowOffsetY = 0.12;

  // Reference image: boxy off-road truck/SUV, very square, wide body
  // Body proportions: front hood takes ~40% of length, cabin ~35%, rear cargo ~25%
  const frontTaper = W * 0.92;  // nearly full-width at front (boxy truck look)

  // === MAIN BODY SHELL ===
  ctx.fillStyle = '#d4a017';
  ctx.beginPath();
  ctx.moveTo(-frontTaper, -L);
  ctx.lineTo( frontTaper, -L);
  ctx.lineTo( W,           L);
  ctx.lineTo(-W,           L);
  ctx.closePath();
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur  = 0;

  // === HOOD SECTION (front 40%) — darker, ridged panel ===
  // Base hood color darker than body
  ctx.fillStyle = '#b8880e';
  ctx.beginPath();
  ctx.moveTo(-frontTaper, -L);
  ctx.lineTo( frontTaper, -L);
  ctx.lineTo( W * 0.88,   -L * 0.22);
  ctx.lineTo(-W * 0.88,   -L * 0.22);
  ctx.closePath();
  ctx.fill();

  // Hood ridge lines (horizontal louvres like reference image)
  ctx.strokeStyle = 'rgba(0,0,0,0.20)';
  ctx.lineWidth = 0.025;
  for (let i = 1; i <= 4; i++) {
    const y = -L + (i / 5) * (L * 0.78);  // 5 evenly spaced lines in hood area
    if (y < -L * 0.22) {
      ctx.beginPath();
      ctx.moveTo(-W * 0.82, y);
      ctx.lineTo( W * 0.82, y);
      ctx.stroke();
    }
  }

  // Hood center power bulge / scoop
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.beginPath();
  ctx.moveTo(-W * 0.22, -L + 0.06);
  ctx.lineTo( W * 0.22, -L + 0.06);
  ctx.lineTo( W * 0.16, -L * 0.20);
  ctx.lineTo(-W * 0.16, -L * 0.20);
  ctx.closePath();
  ctx.fill();

  // === CABIN / GREENHOUSE (middle 35%) ===
  ctx.fillStyle = '#1a2030';
  ctx.beginPath();
  ctx.roundRect(-W * 0.84, -L * 0.22, W * 1.68, L * 0.58, 0.06);
  ctx.fill();

  // Windshield — nearly vertical/flat (boxy truck style)
  ctx.fillStyle = 'rgba(110, 175, 220, 0.70)';
  ctx.beginPath();
  ctx.moveTo(-W * 0.77, -L * 0.21);
  ctx.lineTo( W * 0.77, -L * 0.21);
  ctx.lineTo( W * 0.70,  L * 0.00);
  ctx.lineTo(-W * 0.70,  L * 0.00);
  ctx.closePath();
  ctx.fill();

  // Windshield center divider
  ctx.strokeStyle = 'rgba(20,30,50,0.5)';
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.moveTo(0, -L * 0.21);
  ctx.lineTo(0,  L * 0.00);
  ctx.stroke();

  // A-pillars (thick — truck style)
  ctx.fillStyle = 'rgba(10,15,25,0.7)';
  // Left A-pillar
  ctx.beginPath();
  ctx.moveTo(-W * 0.84, -L * 0.22);
  ctx.lineTo(-W * 0.77, -L * 0.21);
  ctx.lineTo(-W * 0.70,  L * 0.00);
  ctx.lineTo(-W * 0.84,  L * 0.00);
  ctx.closePath();
  ctx.fill();
  // Right A-pillar
  ctx.beginPath();
  ctx.moveTo( W * 0.84, -L * 0.22);
  ctx.lineTo( W * 0.77, -L * 0.21);
  ctx.lineTo( W * 0.70,  L * 0.00);
  ctx.lineTo( W * 0.84,  L * 0.00);
  ctx.closePath();
  ctx.fill();

  // Rear window (smaller, more vertical)
  ctx.fillStyle = 'rgba(90, 150, 195, 0.55)';
  ctx.beginPath();
  ctx.moveTo(-W * 0.72, L * 0.04);
  ctx.lineTo( W * 0.72, L * 0.04);
  ctx.lineTo( W * 0.78, L * 0.32);
  ctx.lineTo(-W * 0.78, L * 0.32);
  ctx.closePath();
  ctx.fill();

  // === ROOF RACK (off-road feature) ===
  ctx.strokeStyle = '#253020';
  ctx.lineWidth   = 0.05;
  // Side rails
  for (const sx of [-W * 0.70, W * 0.70]) {
    ctx.beginPath();
    ctx.moveTo(sx, -L * 0.18);
    ctx.lineTo(sx,  L * 0.30);
    ctx.stroke();
  }
  // Cross members
  ctx.lineWidth = 0.035;
  for (const yFrac of [-0.08, 0.08, 0.22]) {
    ctx.beginPath();
    ctx.moveTo(-W * 0.70, L * yFrac);
    ctx.lineTo( W * 0.70, L * yFrac);
    ctx.stroke();
  }

  // === REAR CARGO AREA ===
  ctx.fillStyle = '#c09010';
  ctx.fillRect(-W * 0.88, L * 0.33, W * 1.76, L * 0.58);

  // Rear spare tire mounted externally — center of rear panel
  // Outer rubber
  ctx.fillStyle = '#1c1c1c';
  ctx.beginPath();
  ctx.arc(0, L * 0.65, W * 0.30, 0, Math.PI * 2);
  ctx.fill();
  // Inner ring
  ctx.fillStyle = '#2e2e2e';
  ctx.beginPath();
  ctx.arc(0, L * 0.65, W * 0.22, 0, Math.PI * 2);
  ctx.fill();
  // Rim face
  ctx.fillStyle = '#888890';
  ctx.beginPath();
  ctx.arc(0, L * 0.65, W * 0.18, 0, Math.PI * 2);
  ctx.fill();
  // 5-spoke pattern
  ctx.strokeStyle = '#555558';
  ctx.lineWidth = 0.05;
  for (let s = 0; s < 5; s++) {
    const a = (s / 5) * Math.PI * 2 - Math.PI * 0.5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * W * 0.06, L * 0.65 + Math.sin(a) * W * 0.06);
    ctx.lineTo(Math.cos(a) * W * 0.15, L * 0.65 + Math.sin(a) * W * 0.15);
    ctx.stroke();
  }
  // Hub center
  ctx.fillStyle = '#404040';
  ctx.beginPath();
  ctx.arc(0, L * 0.65, W * 0.05, 0, Math.PI * 2);
  ctx.fill();

  // Spare tire mount bracket
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.arc(0, L * 0.65, W * 0.31, 0, Math.PI * 2);
  ctx.stroke();

  // === FRONT GRILLE — prominent, bar-style (like reference) ===
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(-frontTaper * 0.92, -L, frontTaper * 1.84, 0.14);

  // Grille horizontal bars
  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = 0.012;
  for (let g = 0; g < 5; g++) {
    const gy = -L + 0.02 + g * 0.024;
    ctx.beginPath();
    ctx.moveTo(-frontTaper * 0.88, gy);
    ctx.lineTo( frontTaper * 0.88, gy);
    ctx.stroke();
  }

  // Grille vertical dividers (3 sections)
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 0.02;
  for (const gx of [-frontTaper * 0.30, 0, frontTaper * 0.30]) {
    ctx.beginPath();
    ctx.moveTo(gx, -L);
    ctx.lineTo(gx, -L + 0.14);
    ctx.stroke();
  }

  // Headlights — wide rectangular, stacked/angled (like ref image)
  ctx.fillStyle = 'rgba(255, 252, 210, 0.98)';
  // Left headlight (outer)
  ctx.beginPath();
  ctx.roundRect(-frontTaper + 0.02, -L + 0.01, frontTaper * 0.32, 0.12, 0.015);
  ctx.fill();
  // Right headlight (outer)
  ctx.beginPath();
  ctx.roundRect(frontTaper * 0.66 - 0.02, -L + 0.01, frontTaper * 0.32, 0.12, 0.015);
  ctx.fill();

  // Headlight inner glow tint
  ctx.fillStyle = 'rgba(200, 230, 255, 0.3)';
  ctx.beginPath();
  ctx.roundRect(-frontTaper + 0.03, -L + 0.02, frontTaper * 0.28, 0.08, 0.01);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(frontTaper * 0.69 - 0.02, -L + 0.02, frontTaper * 0.28, 0.08, 0.01);
  ctx.fill();

  // Front bumper / skid plate
  ctx.fillStyle = '#333';
  ctx.fillRect(-frontTaper * 0.95, -L, frontTaper * 1.90, 0.06);
  // Bumper crossbar detail
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 0.025;
  ctx.beginPath();
  ctx.moveTo(-frontTaper * 0.80, -L + 0.03);
  ctx.lineTo( frontTaper * 0.80, -L + 0.03);
  ctx.stroke();

  // DRL strip
  ctx.strokeStyle = 'rgba(255, 250, 230, 0.65)';
  ctx.lineWidth = 0.018;
  ctx.beginPath();
  ctx.moveTo(-frontTaper * 0.88, -L + 0.155);
  ctx.lineTo( frontTaper * 0.88, -L + 0.155);
  ctx.stroke();

  // === REAR TAIL LIGHTS ===
  ctx.fillStyle = 'rgba(210, 20, 20, 0.92)';
  ctx.beginPath();
  ctx.roundRect(-W + 0.02, L - 0.11, W * 0.38, 0.09, 0.01);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(W * 0.62, L - 0.11, W * 0.38, 0.09, 0.01);
  ctx.fill();
  // Center reflector strip
  ctx.fillStyle = 'rgba(180, 10, 10, 0.60)';
  ctx.fillRect(-W * 0.25, L - 0.10, W * 0.50, 0.07);

  // === BODY PANEL LINES ===
  // Outline
  ctx.strokeStyle = 'rgba(90, 65, 8, 0.88)';
  ctx.lineWidth   = 0.042;
  ctx.beginPath();
  ctx.moveTo(-frontTaper, -L);
  ctx.lineTo( frontTaper, -L);
  ctx.lineTo( W, L);
  ctx.lineTo(-W, L);
  ctx.closePath();
  ctx.stroke();

  // Body crease line (mid-height character line)
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 0.022;
  ctx.beginPath();
  ctx.moveTo(-W, -L * 0.15);
  ctx.lineTo(-W,  L * 0.55);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo( W, -L * 0.15);
  ctx.lineTo( W,  L * 0.55);
  ctx.stroke();

  // === STALL INDICATOR ===
  if (engine.isStalled) {
    ctx.fillStyle = 'rgba(200, 50, 50, 0.28)';
    ctx.fillRect(-W, -L, W * 2, L * 2);
  }

  ctx.restore();
}// =============================================================
// HUD — STEERING WHEEL
// =============================================================

// Draws a small steering wheel icon in the lower-right corner of the screen.
// The wheel rotates with the visual steering angle.
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
// SKID MARKS
// =============================================================

// Draws all recorded skid mark segments.
// Must be called inside the camera transform (world space).
// Skid marks are drawn below splat particles, balloons, and the car.
// =============================================================
// SPLAT DECALS (world space)
// =============================================================

// Draws persistent ground paint marks deposited by splat particles.
// Called in world space, below skid marks so tires can track through paint.
export function drawSplatDecals(ctx) {
  const decals = state.splatDecals;
  if (decals.length === 0) return;

  ctx.save();

  for (const decal of decals) {
    if (decal.alpha <= 0.005) continue;

    const seed1 = decal.x * 137.3 + decal.y * 271.7;
    const seed2 = decal.x * 97.1  + decal.y * 53.3;
    const segments = Math.max(6, Math.min(12, Math.round(decal.radius * 8)));

    ctx.save();
    ctx.globalAlpha = Math.min(decal.alpha, 1.0);

    // Flat colored irregular blob — no gradient, no specular, no satellite dots
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const t     = i / segments;
      const angle = t * Math.PI * 2;
      const w1 = Math.sin(seed1 + i * 2.731 + 1.0) * 0.5 + 0.5;
      const w2 = Math.sin(seed2 + i * 1.618 + 3.0) * 0.5 + 0.5;
      const wobble = 0.55 + w1 * 0.28 + w2 * 0.17;
      const r  = decal.radius * wobble;
      const px = decal.x + Math.cos(angle) * r;
      const py = decal.y + Math.sin(angle) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = `hsl(${decal.hue}, 80%, 40%)`;
    ctx.fill();

    ctx.restore();
  }

  ctx.restore();
}


// =============================================================
// SKID MARKS (world space)
// =============================================================
//
// hue === -1  → rubber black (normal tire marks)
// hue >= 0    → balloon paint color (colored skids after a pop)
export function drawSkidMarks(ctx) {
  const skidMarks = state.skidMarks;
  if (skidMarks.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';

  for (const segment of skidMarks) {
    ctx.beginPath();
    ctx.moveTo(segment.x1, segment.y1);
    ctx.lineTo(segment.x2, segment.y2);

    // Use per-segment alpha (from grip-based recording), fallback for legacy segments.
    const alpha = segment.alpha !== undefined ? segment.alpha : 0.55;

    if (segment.hue >= 0) {
      // Colored balloon-paint skid — saturation encodes paint richness
      // Low saturation = paint depleting → fade toward dark/desaturated
      const paintSat = segment.paintSaturation !== undefined ? segment.paintSaturation : 1.0;
      const sat = Math.round(30 + paintSat * 65); // 30–95% color saturation
      const light = Math.round(20 + paintSat * 30); // 20–50% lightness — vivid when fresh
      ctx.strokeStyle = `hsla(${segment.hue}, ${sat}%, ${light}%, ${alpha})`;
    } else {
      // Standard rubber-black tire mark
      ctx.strokeStyle = `rgba(20, 15, 10, ${alpha})`;
    }

    // Use per-segment width (from grip-based recording), fallback for legacy.
    ctx.lineWidth = segment.width !== undefined ? segment.width : 0.28;
    ctx.stroke();
  }

  ctx.restore();
}


// =============================================================
// BALLOONS
// =============================================================

// Draws all live balloons as filled circles with a highlight dot and a string.
// Balloons are in world space (metres), so this must be called inside
// the camera transform (after applyCameraTransform, before removeCameraTransform).
export function drawBalloons(ctx) {
  for (const balloon of state.balloons) {
    if (balloon.isPopped) continue;

    const hue = balloon.hue;
    ctx.save();
    ctx.translate(balloon.x, balloon.y);

    // Simple flat circle — no gradients, no shading, no highlights.
    // Performance-first: at gameplay speed these are indistinguishable from shaded spheres.
    ctx.beginPath();
    ctx.arc(0, 0, balloon.radius, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue}, 85%, 55%)`;
    ctx.fill();

    // Thin darker stroke for definition against checkerboard
    ctx.strokeStyle = `hsl(${hue}, 75%, 35%)`;
    ctx.lineWidth = balloon.radius * 0.06;
    ctx.stroke();

    // String: minimal wavy line below
    ctx.beginPath();
    ctx.moveTo(0, balloon.radius);
    ctx.quadraticCurveTo(balloon.radius * 0.12, balloon.radius * 1.5,
                         0, balloon.radius * 1.9);
    ctx.strokeStyle = `hsl(${hue}, 60%, 40%)`;
    ctx.lineWidth = 0.03;
    ctx.stroke();

    ctx.restore();
  }
}


// =============================================================
// SPLAT PARTICLES
// =============================================================

// Draws all living splat particles as small filled circles.
// Must be called inside the camera transform (world space).
export function drawSplatParticles(ctx) {
  for (const particle of state.splatParticles) {
    ctx.save();
    ctx.globalAlpha = particle.alpha;

    const speed = Math.hypot(particle.velX, particle.velY);
    const hue = particle.hue;

    if (speed > 3.0 && particle.alpha > 0.3) {
      // Fast-moving particles: draw as velocity-aligned streaks (motion blur).
      // This makes the splatter look violent and directional.
      const streakLength = Math.min(speed * 0.04, 0.5); // metres, proportional to speed
      const angle = Math.atan2(particle.velY, particle.velX);
      const tailX = particle.x - Math.cos(angle) * streakLength;
      const tailY = particle.y - Math.sin(angle) * streakLength;

      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(particle.x, particle.y);
      ctx.strokeStyle = `hsla(${hue}, 85%, 55%, ${particle.alpha})`;
      ctx.lineWidth = particle.radius * 2;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Bright core at the leading edge.
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 90%, 70%, ${particle.alpha})`;
      ctx.fill();
    } else {
      // Slow/landing particles: standard circle with slight glow.
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${hue}, 85%, 55%)`;
      ctx.fill();
    }

    ctx.restore();
  }
  ctx.globalAlpha = 1.0;
}


// =============================================================
// SCORE HUD
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


// Draws a complete analog gauge on a separate canvas context.
// This is the generic gauge renderer used for tachometer, speedometer,
// and any other gauge. Each gauge is independent — a failure here
// affects only that canvas, not the simulation.
//
// config: {
//   value:          current reading (in gauge units)
//   min:            minimum scale value
//   max:            maximum scale value
//   title:          text below the needle pivot
//   subtitle:       smaller text below title (e.g., "km/h")
//   majorStep:      interval between major tick marks with labels
//   minorDivisions: how many minor ticks between each major tick
//   redFrom:        gauge value at which the red zone begins (null = no red zone)
//   needleNormalized: 0–1 normalised position from the needle physics spring
//   labelFormatter: function(value) → string for major tick labels
//   labelFontScale: multiplier for tick label font size (from params.gaugeLabelScale)
// }
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

  // --- Face background ---
  const faceGradient = ctx.createRadialGradient(centreX, centreY, 0, centreX, centreY, radius);
  faceGradient.addColorStop(0, '#f5f0e8');
  faceGradient.addColorStop(1, '#d9c9a8');
  ctx.beginPath();
  ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
  ctx.fillStyle = faceGradient;
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
  const needleAngle = startAngle + sweepAngle * needleNormalized + jitterOffset;

  ctx.save();
  ctx.translate(centreX, centreY);
  ctx.rotate(needleAngle);

  // Needle shadow.
  ctx.shadowColor   = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur    = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  // Needle body: red, tapers to a point.
  ctx.beginPath();
  ctx.moveTo(-3, 0);
  ctx.lineTo(0, -(radius * 0.80)); // tip
  ctx.lineTo(3, 0);
  ctx.lineTo(0, radius * 0.15);    // tail counterweight
  ctx.closePath();
  ctx.fillStyle = '#c0392b';
  ctx.fill();

  ctx.shadowColor = 'transparent';

  // Pivot cap (circle at centre, covers needle base).
  const pivotGradient = ctx.createRadialGradient(-2, -2, 1, 0, 0, 10);
  pivotGradient.addColorStop(0, '#fff');
  pivotGradient.addColorStop(1, '#888');
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fillStyle = pivotGradient;
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

  // --- Vignette: darkened ring around the edge for realism ---
  const vignetteGradient = ctx.createRadialGradient(centreX, centreY, radius * 0.6,
                                                     centreX, centreY, radius);
  vignetteGradient.addColorStop(0, 'rgba(0,0,0,0)');
  vignetteGradient.addColorStop(1, 'rgba(0,0,0,0.15)');
  ctx.beginPath();
  ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
  ctx.fillStyle = vignetteGradient;
  ctx.fill();
}


// =============================================================
// ACCELERATION & JERK ARROWS (world space)
// =============================================================

// Draws an arrow from (originX, originY) in world space.
// direction is a unit vector (dx, dy), magnitude scales the length.
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

// Draws acceleration (cyan) and jerk (magenta) vectors from the car centre.
// Called in world space (between applyCameraTransform and removeCameraTransform).
export function drawKinematicArrows(ctx) {
  // Use filtered derivatives — raw Verlet differentiation is noisy from
  // constraint impulses. The filtered values in state.filteredBody are
  // EMA-smoothed versions that preserve magnitude and direction.
  const fb = state.filteredBody;
  const cx = state.body.centerX;
  const cy = state.body.centerY;

  // Acceleration arrow (cyan)
  const accelMag = Math.hypot(fb.accelX, fb.accelY);
  if (accelMag > 0.5) {
    drawArrow(ctx, cx, cy,
      fb.accelX / accelMag, fb.accelY / accelMag,
      accelMag, 'rgba(0, 220, 255, 0.8)', 8);
  }

  // Jerk arrow (magenta)
  const jerkMag = fb.jerkMagnitude;
  if (jerkMag > 5.0) {
    const jerkNorm = Math.hypot(fb.jerkX, fb.jerkY);
    if (jerkNorm > 0.01) {
      drawArrow(ctx, cx, cy,
        fb.jerkX / jerkNorm, fb.jerkY / jerkNorm,
        jerkMag * 0.02, 'rgba(255, 50, 200, 0.7)', 6);
    }
  }
}


// =============================================================
// HDR SPARKS (world space)
// =============================================================

// Spark particle pool. Particles are recycled via the `alive` flag.
const sparkPool = [];
const MAX_SPARKS = 300;

// Pre-allocate the pool.
for (let i = 0; i < MAX_SPARKS; i++) {
  sparkPool.push({
    x: 0, y: 0, vx: 0, vy: 0,
    life: 0, maxLife: 0, size: 0,
    alive: false,
    hdrIndex: 0, // index into color palette
  });
}

// HDR-capable spark colors using display-p3 gamut.
// On SDR displays these clamp to bright white/yellow — still looks good.
const SPARK_COLORS_HDR = [
  'color(display-p3 1.0 0.95 0.5)',   // bright HDR yellow
  'color(display-p3 1.0 0.85 0.3)',   // golden
  'color(display-p3 1.0 0.6 0.2)',    // HDR orange
  'color(display-p3 1.0 1.0 0.85)',   // near-white hot
  'color(display-p3 1.0 0.7 0.1)',    // deep gold
];

// Fallback sRGB colors for browsers that don't support display-p3.
const SPARK_COLORS_SDR = [
  '#fff8a0',
  '#ffd966',
  '#ff9933',
  '#ffffdd',
  '#ffb31a',
];

// Test display-p3 support once.
let useHDR = false;
try {
  const testCanvas = document.createElement('canvas');
  const testCtx = testCanvas.getContext('2d');
  testCtx.fillStyle = 'color(display-p3 1 0 0)';
  // If it parsed successfully, fillStyle won't be reset to default.
  useHDR = testCtx.fillStyle !== '#000000' && testCtx.fillStyle.includes('color');
} catch (e) {
  useHDR = false;
}
const SPARK_COLORS = useHDR ? SPARK_COLORS_HDR : SPARK_COLORS_SDR;

// Spawns sparks at wheels where grip is below threshold.
// Called each physics step from main.js.
export function updateSparks(dt) {
  const body = state.body;
  const grip = state.wheelGrip;
  const wheels = state.wheels;
  const heading = body.heading;
  const speed = body.speed;
  const params = state.params;

  const GRIP_THRESHOLD = params.sparkGripThreshold; // tunable via slider
  const intensityMult = params.sparkIntensity;       // spawn rate multiplier
  const sizeMult = params.sparkSize;                 // particle size multiplier
  const lifeMult = params.sparkLifetime;             // lifetime multiplier
  const wheelNames = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'];
  const isFront = { frontLeft: true, frontRight: true, rearLeft: false, rearRight: false };

  for (const name of wheelNames) {
    const g = grip[name];
    if (g >= GRIP_THRESHOLD || speed < 2.0) continue;

    // Spark intensity: stronger with lower grip, higher speed, higher jerk.
    const gripLoss = 1.0 - g / GRIP_THRESHOLD;
    // Use filtered jerk to avoid constraint-noise spikes.
    const jerkFactor = Math.min(state.filteredBody.jerkMagnitude / 200, 1.0);
    const intensity = speed * gripLoss * (0.3 + 0.7 * jerkFactor) * intensityMult;

    // Spawn rate proportional to intensity.
    const spawnCount = Math.floor(intensity * 0.15 * (60 * dt));
    if (spawnCount < 1 && physicsRandom() > intensity * 0.1) continue;

    const wheel = wheels[name];
    const steerAngle = isFront[name] ? state.steering.frontWheelAngle : 0;

    // Wheel tangent direction (direction of travel at wheel).
    const armX = wheel.x - body.centerX;
    const armY = wheel.y - body.centerY;
    const wheelVelX = body.velocityX + (-body.angularVelocity * armY);
    const wheelVelY = body.velocityY + ( body.angularVelocity * armX);
    const wheelSpeed = Math.hypot(wheelVelX, wheelVelY);

    for (let s = 0; s < Math.max(1, spawnCount); s++) {
      // Find a dead particle to reuse.
      let spark = null;
      for (let i = 0; i < MAX_SPARKS; i++) {
        if (!sparkPool[i].alive) { spark = sparkPool[i]; break; }
      }
      if (!spark) break; // pool full

      // Spawn at wheel position with slight random offset.
      spark.x = wheel.x + (physicsRandom() - 0.5) * 0.2;
      spark.y = wheel.y + (physicsRandom() - 0.5) * 0.2;

      // Velocity: tangent to wheel motion + random spread + upward bias (world Y is down)
      const tangentScale = 2.0 + physicsRandom() * 4.0;
      const spread = (physicsRandom() - 0.5) * 3.0;
      if (wheelSpeed > 0.1) {
        spark.vx = (wheelVelX / wheelSpeed) * tangentScale + spread;
        spark.vy = (wheelVelY / wheelSpeed) * tangentScale + spread - (1.0 + physicsRandom() * 2.0);
      } else {
        spark.vx = (physicsRandom() - 0.5) * 4.0;
        spark.vy = -(1.0 + physicsRandom() * 3.0);
      }

      spark.life = 0;
      spark.maxLife = (0.1 + physicsRandom() * 0.25) * lifeMult;
      spark.size = (0.03 + physicsRandom() * 0.06) * sizeMult;
      spark.alive = true;
      spark.hdrIndex = Math.floor(physicsRandom() * SPARK_COLORS.length);
    }
  }

  // Age and kill particles.
  for (let i = 0; i < MAX_SPARKS; i++) {
    const p = sparkPool[i];
    if (!p.alive) continue;

    p.life += dt;
    if (p.life >= p.maxLife) {
      p.alive = false;
      continue;
    }

    // Simple physics: gravity (world Y down) + drag.
    p.vy += 9.81 * dt; // gravity pulls sparks down
    p.vx *= 0.97;      // air drag
    p.vy *= 0.97;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

// Draws all alive sparks. Called in world space.
export function drawSparks(ctx) {
  for (let i = 0; i < MAX_SPARKS; i++) {
    const p = sparkPool[i];
    if (!p.alive) continue;

    const t = p.life / p.maxLife; // 0→1 over lifetime
    const alpha = 1.0 - t * t;   // quadratic fade out
    const size = p.size * (1.0 - t * 0.5); // shrink slightly

    ctx.globalAlpha = alpha;
    ctx.fillStyle = SPARK_COLORS[p.hdrIndex];
    ctx.fillRect(p.x - size * 0.5, p.y - size * 0.5, size, size);
  }
  ctx.globalAlpha = 1.0;
}

// =============================================================
// DEBUG OVERLAYS — Visualization tools for stability diagnosis
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

      // Grip color indicator
      const grip = state.wheelGrip[name] || 0;
      let gripColor = grip > 0.7 ? '#00ff00' : grip > 0.3 ? '#ffff00' : '#ff0000';
      ctx.fillStyle = gripColor;
      const rectSize = 0.08 * sizeScale;  // ~0.08m square
      ctx.fillRect(wheel.x - rectSize, wheel.y - rectSize, rectSize * 2, rectSize * 2);
    }
  }

  // === SLIP ANGLES ===
  if (params.debugShowSlipAngles) {
    for (const name of wheelNames) {
      const wheel = wheels[name];
      // Slip angle is computed in physics.js but not stored per-wheel
      // We'll show grip indicator as proxy for slip state
      const grip = state.wheelGrip[name] || 0;
      const isSlipping = grip < 0.7;

      ctx.fillStyle = isSlipping ? '#ff0000' : '#00ff00';
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(wheel.x, wheel.y, (0.15 + (1 - grip) * 0.25) * sizeScale, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Show grip percentage
      ctx.fillStyle = '#00ff00';
      ctx.font = `bold ${params.debugFontSize - 4}px monospace`;
      ctx.fillText(`${Math.round(grip * 100)}%`, wheel.x - 0.4, wheel.y + 0.2);  // world units
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
