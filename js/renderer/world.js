// =============================================================
// RENDERER/WORLD — world-space canvas drawing
// =============================================================
// Exports: applyCameraTransform, removeCameraTransform, drawCheckerboard,
//          drawMapBoundary, drawCarGhosts, drawCar, drawSplatDecals,
//          drawSkidMarks, drawBalloons, drawSplatParticles, drawKinematicArrows

import { renderState as state } from '../state.js';
import { physicsRandom } from '../random.js';
import {
  CAR_HALF_WIDTH,
  CAR_HALF_LENGTH,
  PIXELS_PER_METER,
  WHEEL_RADIUS,
} from '../constants.js';

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;


// =============================================================
// PRE-BUILT WHEEL PATH2D CACHE (QW-5)
// Static rim geometry (spokes, hub, arcs) as cached Path2D objects.
// Eliminates 5×ctx.save/rotate/restore + 5 arc strokes per wheel per frame.
// =============================================================
const _wheelPaths = (() => {
  const tireW = WHEEL_RADIUS * 1.1;
  const tireH = WHEEL_RADIUS * 0.85;
  const rimW  = tireW * 0.68;
  const rimH  = tireH * 0.82;
  const spokeCount  = 5;
  const spokeWidth  = rimW * 0.22;
  const spokeLength = rimW * 0.82;

  // Rim background ellipse
  const rimBg = new Path2D();
  rimBg.ellipse(0, 0, rimW, rimH, 0, 0, Math.PI * 2);

  // Rim face ellipse
  const rimFace = new Path2D();
  rimFace.ellipse(0, 0, rimW * 0.88, rimH * 0.88, 0, 0, Math.PI * 2);

  // All 5 spokes pre-rotated into wheel-local frame
  const spokeMain   = new Path2D();
  const spokeShadow = new Path2D();
  for (let s = 0; s < spokeCount; s++) {
    const a  = (s / spokeCount) * Math.PI * 2;
    const c  = Math.cos(a), si = Math.sin(a);
    const rot = (x, y) => [x * c - y * si, x * si + y * c];

    const [m0x, m0y] = rot(-spokeWidth * 0.5,  0);
    const [m1x, m1y] = rot( spokeWidth * 0.5,  0);
    const [m2x, m2y] = rot( spokeWidth * 0.3,  spokeLength);
    const [m3x, m3y] = rot(-spokeWidth * 0.3,  spokeLength);
    spokeMain.moveTo(m0x, m0y);
    spokeMain.lineTo(m1x, m1y);
    spokeMain.lineTo(m2x, m2y);
    spokeMain.lineTo(m3x, m3y);
    spokeMain.closePath();

    const [s0x, s0y] = rot( spokeWidth * 0.1,  0);
    const [s1x, s1y] = rot( spokeWidth * 0.5,  0);
    const [s2x, s2y] = rot( spokeWidth * 0.3,  spokeLength);
    const [s3x, s3y] = rot( spokeWidth * 0.1,  spokeLength);
    spokeShadow.moveTo(s0x, s0y);
    spokeShadow.lineTo(s1x, s1y);
    spokeShadow.lineTo(s2x, s2y);
    spokeShadow.lineTo(s3x, s3y);
    spokeShadow.closePath();
  }

  // Between-spoke arcs (stroked) — all 5 as one Path2D
  const arcBetween = new Path2D();
  for (let s = 0; s < spokeCount; s++) {
    const a1 = ((s + 0.5) / spokeCount) * Math.PI * 2;
    const a2 = ((s + 1.5) / spokeCount) * Math.PI * 2;
    arcBetween.arc(0, 0, rimW * 0.72, a1, a2);
  }

  // Hub cap circle
  const hubCap = new Path2D();
  hubCap.arc(0, 0, rimW * 0.22, 0, Math.PI * 2);

  // Hub highlight
  const hubHL = new Path2D();
  hubHL.arc(-rimW * 0.06, -rimH * 0.06, rimW * 0.12, 0, Math.PI * 2);

  // Hub bolt
  const hubBolt = new Path2D();
  hubBolt.arc(0, 0, rimW * 0.06, 0, Math.PI * 2);

  // Tire sidewall ring (stroked)
  const sidewall = new Path2D();
  sidewall.ellipse(0, 0, rimW * 1.05, rimH * 1.05, 0, 0, Math.PI * 2);

  return { rimBg, rimFace, spokeMain, spokeShadow, arcBetween, hubCap, hubHL, hubBolt, sidewall, rimW, rimH, tireW, tireH };
})();


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
    // Prefer wheelGripState.smoothedGrip (0=slipping, 1=stable grip).
    // Fallback to inverted utilization: 1.0 - utilization (high util = low grip available)
    const grip = gws ? gws.smoothedGrip : Math.max(0, 1.0 - (state.wheelFrictionUtil[name] || 0));
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

    // === ALLOY RIM (uses pre-built Path2D cache — QW-5) ===
    const wp = _wheelPaths;

    // Rim background (brake disc / dark center)
    ctx.fillStyle = '#2a2a2a';
    ctx.fill(wp.rimBg);

    // Alloy face — light metallic silver
    ctx.fillStyle = '#c8c8cc';
    ctx.fill(wp.rimFace);

    // 5-spoke pattern — pre-rotated paths, no per-spoke save/restore
    ctx.fillStyle = '#a8a8ac';
    ctx.fill(wp.spokeMain);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill(wp.spokeShadow);

    // Between-spoke arcs (single batched stroke)
    ctx.strokeStyle = '#1e1e22';
    ctx.lineWidth   = wp.rimW * 0.08;
    ctx.stroke(wp.arcBetween);

    // Center hub cap
    ctx.fillStyle = '#404045';
    ctx.fill(wp.hubCap);
    // Hub highlight
    ctx.fillStyle = '#787880';
    ctx.fill(wp.hubHL);
    // Hub center bolt
    ctx.fillStyle = '#222';
    ctx.fill(wp.hubBolt);

    // Tire sidewall: a thin darker ring between tire and rim
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth   = tireW * 0.1;
    ctx.stroke(wp.sidewall);

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
}


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
