// =============================================================
// BALLOON — spawn, collision detection, scoring, splat particles
// =============================================================
//
// ARCHITECTURE:
//   Balloons live in state.balloons as world-space circles (metres).
//   Splat particles live in state.splatParticles, updated each physics step.
//   The combo system lives in state.score.combo and resets after COMBO_TIME_WINDOW.
//
// CALL ORDER (in main.js runPhysicsStep, after computeBodyDerivedState):
//   checkBalloonCollisions(dt, currentTimeSeconds)
//   updateSplatParticles(dt)
//
// Rendering is handled in renderer.js:
//   drawBalloons(ctx)
//   drawSplatParticles(ctx)
//   drawScoreHud(ctx, canvasWidth, canvasHeight)
// =============================================================

import { gameplayState as state } from './state.js';
import {
  BALLOON_COUNT,
  BALLOON_RADIUS_MIN,
  BALLOON_RADIUS_MAX,
  BALLOON_SPAWN_MARGIN,
  SPLAT_PARTICLE_COUNT_MIN,
  SPLAT_PARTICLE_COUNT_MAX,
  SPLAT_LIFETIME_MIN,
  SPLAT_LIFETIME_MAX,
  SPLAT_MAX_REFERENCE_SPEED,
  SPLAT_SPEED_MIN,
  SPLAT_SPEED_MAX,
  SPLAT_RADIUS_MIN,
  SPLAT_RADIUS_MAX,
  COMBO_TIME_WINDOW,
  COMBO_MULTIPLIERS,
  BALLOON_BASE_SCORE,
  COMBO_FLASH_DURATION,
  BALLOON_HUE_RANGE,
  CAR_HALF_WIDTH,
  CAR_HALF_LENGTH,
} from './constants.js';
import { physicsRandom } from './random.js';


// =============================================================
// MATH HELPERS
// =============================================================

// Returns a uniformly random float between min (inclusive) and max (exclusive).
function randomBetween(minimum, maximum) {
  return minimum + physicsRandom() * (maximum - minimum);
}

// Returns a random integer from 0 to count-1 (inclusive).
function randomInt(count) {
  return Math.floor(physicsRandom() * count);
}


// =============================================================
// BALLOON SPAWNING
// =============================================================

// Spawns BALLOON_COUNT balloons at random positions across the map.
// Each balloon gets a random radius (within BALLOON_RADIUS_MIN/MAX)
// and a random hue so they each have a distinct colour.
// Called once at game start from main.js after initializeCarBody().
export function spawnBalloons() {
  state.balloons = [];

  const mapWidth  = state.params.mapWidth;
  const mapHeight = state.params.mapHeight;
  const margin    = BALLOON_SPAWN_MARGIN;

  // Safe spawn area: inset from map edges to avoid wall overlap.
  const spawnLeft   = margin;
  const spawnRight  = mapWidth  - margin;
  const spawnTop    = margin;
  const spawnBottom = mapHeight - margin;

  for (let balloonIndex = 0; balloonIndex < BALLOON_COUNT; balloonIndex++) {
    const balloonRadius = randomBetween(BALLOON_RADIUS_MIN, BALLOON_RADIUS_MAX);

    // Hue spread evenly across spectrum then jittered for variety.
    const baseHue     = (balloonIndex / BALLOON_COUNT) * BALLOON_HUE_RANGE;
    const jitteredHue = (baseHue + randomBetween(-20, 20) + BALLOON_HUE_RANGE) % BALLOON_HUE_RANGE;

    state.balloons.push({
      x:       randomBetween(spawnLeft,  spawnRight),
      y:       randomBetween(spawnTop,   spawnBottom),
      radius:  balloonRadius,
      hue:     jitteredHue,
      isPopped: false,
      // Deformation state: compress on approach, bounce back
      deformTime: 0,    // time since deformation started (seconds)
      deformScale: 1.0, // current deformation scale (< 1 = compressed)
      deformDir: { x: 0, y: 0 }, // direction of impact
    });
  }
}


// =============================================================
// BALLOON COLLISION DETECTION
// =============================================================

// Checks each live balloon against the four wheel particles.
// Uses simple circle-vs-point collision: if a wheel particle falls
// within the balloon's radius, the balloon pops.
//
// On pop:
//   1. Compute impact speed from the wheel's Verlet displacement.
//   2. Derive a "splat factor" [0, 1] from impact speed.
//   3. Compute score: BASE_SCORE × sizeBonus × splatFactor × comboMultiplier.
//   4. Spawn splat particles proportional to splat factor.
//   5. Play a pop sound pitched by balloon size and impact speed.
//   6. Update combo state.
//
// dt: fixed physics timestep in seconds (needed to convert displacement → speed).
// currentTimeSeconds: simulation time in seconds (from requestAnimationFrame timestamp).
export function checkBalloonCollisions(dt, currentTimeSeconds) {
  const wheels       = state.wheels;
  const body         = state.body;
  const balloons     = state.balloons;
  const score        = state.score;

  // Collect all four wheel positions for collision testing.
  const wheelParticles = [
    wheels.frontLeft,
    wheels.frontRight,
    wheels.rearLeft,
    wheels.rearRight,
  ];

  // Precompute each wheel's speed this step from its Verlet displacement.
  // Speed = displacement magnitude / dt. This is the actual per-wheel speed,
  // not body.speed — a wheel at the rear corner can move faster than CoM during rotation.
  const wheelSpeeds = wheelParticles.map(wheel => {
    const displacementX = wheel.x - wheel.prevX;
    const displacementY = wheel.y - wheel.prevY;
    return Math.hypot(displacementX, displacementY) / dt;
  });

  // Update deformation animation for all balloons (even not-hit ones, for pre-pop squeeze)
  for (const balloon of balloons) {
    if (balloon.isPopped) continue;
    if (balloon.deformTime > 0) {
      balloon.deformTime += dt;
      // Damped spring: compress then bounce back over ~0.3s
      const t = balloon.deformTime;
      const frequency = 12.0; // Hz — faster = stiffer balloon
      const damping   = 8.0;  // decay rate
      const compression = 0.35; // max compression amount
      // Spring response: starts at compression, oscillates back to 1.0
      const springResp = 1.0 - compression * Math.exp(-damping * t) * Math.cos(frequency * t * Math.PI * 2);
      balloon.deformScale = Math.max(0.5, Math.min(1.3, springResp));
      if (t > 0.8) balloon.deformTime = 0; // animation complete
    }
  }

  for (const balloon of balloons) {
    if (balloon.isPopped) continue;

    // Test each wheel particle against this balloon.
    let hitSpeed     = 0;
    let collisionFound = false;
    let closestDist  = Infinity;
    let hitWheelX = body.centerX, hitWheelY = body.centerY;

    for (let wheelIndex = 0; wheelIndex < wheelParticles.length; wheelIndex++) {
      const wheel          = wheelParticles[wheelIndex];
      const distanceToCenter = Math.hypot(wheel.x - balloon.x, wheel.y - balloon.y);

      // Collision radius = balloon radius + a small car contact radius.
      // Using CAR_HALF_WIDTH * 0.5 as the wheel contact radius so the balloon
      // pops before the wheel particle's point literally enters the balloon.
      const collisionRadius = balloon.radius + CAR_HALF_WIDTH * 0.5;

      // Pre-deformation zone: start squishing when within 1.5× collision radius
      if (distanceToCenter <= collisionRadius * 1.4 && balloon.deformTime === 0) {
        const dx = balloon.x - wheel.x;
        const dy = balloon.y - wheel.y;
        const len = Math.hypot(dx, dy) || 1;
        balloon.deformDir = { x: dx / len, y: dy / len };
        balloon.deformTime = 0.001; // start deformation
        balloon.deformScale = 0.82;
      }

      if (distanceToCenter <= collisionRadius) {
        collisionFound = true;
        // Use the fastest wheel if multiple wheels hit simultaneously.
        if (wheelSpeeds[wheelIndex] > hitSpeed) {
          hitSpeed = wheelSpeeds[wheelIndex];
        }
        if (distanceToCenter < closestDist) {
          closestDist = distanceToCenter;
          hitWheelX = wheel.x;
          hitWheelY = wheel.y;
        }
      }
    }

    if (!collisionFound) continue;

    // Apply an impulse to the car away from the balloon (satisfying bounce-back)
    // This makes the car feel physical rather than just passing through.
    const impulseDirX = body.centerX - balloon.x;
    const impulseDirY = body.centerY - balloon.y;
    const impulseMag = Math.hypot(impulseDirX, impulseDirY);
    if (impulseMag > 0.01) {
      const impulseStrength = Math.min(hitSpeed * 0.08, 1.5); // light bump proportional to impact
      const nx = impulseDirX / impulseMag;
      const ny = impulseDirY / impulseMag;
      // Nudge car velocity away from balloon
      body.velocityX += nx * impulseStrength;
      body.velocityY += ny * impulseStrength;
      // Also propagate to wheel particles for Verlet consistency
      for (const wh of [wheels.frontLeft, wheels.frontRight, wheels.rearLeft, wheels.rearRight]) {
        wh.prevX -= nx * impulseStrength * dt;
        wh.prevY -= ny * impulseStrength * dt;
      }
    }
    // --- Pop this balloon ---
    balloon.isPopped = true;

    // Splat factor [0, 1]: 0 = barely touching, 1 = full-speed impact.
    const splatFactor = Math.min(hitSpeed / SPLAT_MAX_REFERENCE_SPEED, 1.0);

    // Size bonus: larger balloons give more base points (they're harder to aim at precisely).
    const sizeRange  = BALLOON_RADIUS_MAX - BALLOON_RADIUS_MIN;
    const sizeBonus  = 1.0 + (balloon.radius - BALLOON_RADIUS_MIN) / sizeRange; // 1.0 – 2.0

    // Update combo: if within the time window, increment; otherwise reset.
    const timeSinceLastPop = currentTimeSeconds - score.combo.lastPopTime;
    if (timeSinceLastPop <= COMBO_TIME_WINDOW && score.combo.count > 0) {
      score.combo.count++;
    } else {
      // First pop or combo timed out — start fresh.
      score.combo.count = 1;
    }
    score.combo.lastPopTime = currentTimeSeconds;

    // Multiplier comes from the COMBO_MULTIPLIERS table, clamped to last entry.
    const multiplierIndex    = Math.min(score.combo.count - 1, COMBO_MULTIPLIERS.length - 1);
    score.combo.multiplier   = COMBO_MULTIPLIERS[multiplierIndex];
    score.combo.flashTimer   = COMBO_FLASH_DURATION;

    // Final score for this pop.
    const popScore = Math.round(
      BALLOON_BASE_SCORE * sizeBonus * (0.5 + splatFactor * 2.5) * score.combo.multiplier
    );
    score.totalScore += popScore;

    // Spawn splat particles.
    spawnSplatParticles(balloon, hitSpeed, splatFactor, body);

    // Trigger screen shake — proportional to impact speed, balloon size, and violence setting.
    const sizeNorm         = (balloon.radius - BALLOON_RADIUS_MIN) / (BALLOON_RADIUS_MAX - BALLOON_RADIUS_MIN);
    const violence         = state.params.splatViolence || 1.5;
    const shakeMagnitude   = splatFactor * (0.3 + sizeNorm * 1.2) * Math.sqrt(violence);
    if (shakeMagnitude > state.screenShake.magnitude) {
      state.screenShake.magnitude = shakeMagnitude;
    }
    // Collision blur spike: temporarily boost blur accumulator on impact
    const blurSpike = Math.min(0.5 + splatFactor * 0.5, 1.0);
    if (blurSpike > (state.blurAccumulator || 0)) {
      state.blurAccumulator = blurSpike;
    }

    // Store balloon hue so skid marks left immediately after a pop use that color.
    state.tractionState.lastBalloonHue = balloon.hue;
    state.tractionState.lastBalloonHueFrames = 0; // reset frame counter

    // Play pop sound.
    playBalloonPopSound(balloon.radius, splatFactor);
  }
}


// =============================================================
// SPLAT PARTICLE SPAWNING
// =============================================================

// Spawns paint-splatter particles at the balloon's position.
// BRUTALITY MODE: far more particles, directional blast, debris trails,
// secondary micro-particles, velocity-scaled spray cone.
//
// balloon:     the just-popped balloon object
// hitSpeed:    wheel speed at contact (m/s)
// splatFactor: normalized [0, 1] impact intensity
// body:        state.body (for car velocity direction to bias splatter away from)
function spawnSplatParticles(balloon, hitSpeed, splatFactor, body) {
  const violence = state.params.splatViolence || 1.5;

  // Base particle count scales with violence multiplier.
  // At full violence + full speed: 80–120 particles per pop.
  const baseCount = Math.round(
    SPLAT_PARTICLE_COUNT_MIN + splatFactor * (SPLAT_PARTICLE_COUNT_MAX - SPLAT_PARTICLE_COUNT_MIN)
  );
  const particleCount = Math.round(baseCount * violence);

  // Lifetime: violent hits spray further and last longer.
  const particleLifetime = (SPLAT_LIFETIME_MIN + splatFactor * (SPLAT_LIFETIME_MAX - SPLAT_LIFETIME_MIN)) * (0.8 + violence * 0.4);

  // Car's normalised velocity direction (splatter blasts away from car motion).
  const carSpeed  = Math.max(body.speed, 0.01);
  const carDirX   = body.velocityX / carSpeed;
  const carDirY   = body.velocityY / carSpeed;

  // Spread angle: harder hit = wider cone. Violence amplifies.
  // At max: nearly 180° hemisphere of destruction.
  const spreadAngle = (0.4 + splatFactor * 0.6) * (0.6 + violence * 0.4);

  const baseHue = balloon.hue;

  // ═══════════════════════════════════════════════════════════
  // MAIN BLAST — large directional spray
  // ═══════════════════════════════════════════════════════════
  for (let i = 0; i < particleCount; i++) {
    const rawAngle       = physicsRandom() * Math.PI * 2;
    const awayAngle      = Math.atan2(-carDirY, -carDirX);
    const blendedAngle   = rawAngle + spreadAngle * (
      Math.atan2(Math.sin(awayAngle - rawAngle), Math.cos(awayAngle - rawAngle))
    );

    // Speed: violence makes particles fly MUCH faster. Power distribution.
    const speedExponent = 0.5 + physicsRandom() * 0.5; // bias toward faster
    const rawSpeed = SPLAT_SPEED_MIN + Math.pow(physicsRandom(), speedExponent) * (SPLAT_SPEED_MAX - SPLAT_SPEED_MIN);
    const particleSpeed = rawSpeed * (0.5 + splatFactor * 0.5) * violence;

    // Hue variation: ±25° around balloon colour.
    const particleHue = (baseHue + randomBetween(-25, 25) + 360) % 360;

    // Power-law size distribution: many small, few large.
    // α = 2.0 (heavier tail than before — more visible large chunks).
    const u = physicsRandom();
    const alpha = 2.0;
    const rawRadius = SPLAT_RADIUS_MIN * Math.pow(1.0 - u + 0.001, -1.0 / alpha);
    const particleRadius = Math.min(rawRadius, SPLAT_RADIUS_MAX * 1.3) * (0.6 + splatFactor * 0.8) * Math.sqrt(violence);

    state.splatParticles.push({
      x:            balloon.x + (physicsRandom() - 0.5) * balloon.radius * 0.3,
      y:            balloon.y + (physicsRandom() - 0.5) * balloon.radius * 0.3,
      velX:         Math.cos(blendedAngle) * particleSpeed,
      velY:         Math.sin(blendedAngle) * particleSpeed,
      radius:       particleRadius,
      hue:          particleHue,
      alpha:        1.0,
      lifetime:     particleLifetime * (0.7 + physicsRandom() * 0.6),
      maxLifetime:  particleLifetime,
      hasLanded:    false,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // MICRO-DEBRIS — tiny fast particles that form the "mist" edge
  // Creates the atomized spray look of a real liquid explosion.
  // ═══════════════════════════════════════════════════════════
  const microCount = Math.round(particleCount * 0.6 * violence);
  for (let i = 0; i < microCount; i++) {
    const angle = physicsRandom() * Math.PI * 2;
    const speed = (8 + physicsRandom() * 15) * violence * splatFactor;

    state.splatParticles.push({
      x:            balloon.x + (physicsRandom() - 0.5) * balloon.radius * 0.5,
      y:            balloon.y + (physicsRandom() - 0.5) * balloon.radius * 0.5,
      velX:         Math.cos(angle) * speed,
      velY:         Math.sin(angle) * speed,
      radius:       0.02 + physicsRandom() * 0.06, // very small
      hue:          (baseHue + randomBetween(-15, 15) + 360) % 360,
      alpha:        0.7 + physicsRandom() * 0.3,
      lifetime:     0.15 + physicsRandom() * 0.3,
      maxLifetime:  0.5,
      hasLanded:    false,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // DIRECTIONAL JET — concentrated spray in the car's wake direction
  // Looks like the balloon was ripped open by the passing vehicle.
  // ═══════════════════════════════════════════════════════════
  const jetCount = Math.round(6 + splatFactor * 12 * violence);
  const jetAngle = Math.atan2(-carDirY, -carDirX);
  for (let i = 0; i < jetCount; i++) {
    const spread = (physicsRandom() - 0.5) * 0.4; // tight cone
    const speed = (12 + physicsRandom() * 20) * splatFactor * violence;

    state.splatParticles.push({
      x:            balloon.x,
      y:            balloon.y,
      velX:         Math.cos(jetAngle + spread) * speed,
      velY:         Math.sin(jetAngle + spread) * speed,
      radius:       0.06 + physicsRandom() * 0.15,
      hue:          (baseHue + randomBetween(-10, 10) + 360) % 360,
      alpha:        1.0,
      lifetime:     0.4 + physicsRandom() * 0.6,
      maxLifetime:  1.0,
      hasLanded:    false,
    });
  }
}


// =============================================================
// SPLAT PARTICLE UPDATE
// =============================================================

// Advances all splat particles by dt seconds.
// Particles decelerate (air resistance), fade in alpha, and are removed
// when their lifetime expires. Uses simple Euler integration since these
// are cosmetic — no Verlet needed.
//
// dt: physics timestep in seconds.
export function updateSplatParticles(dt) {
  const particles          = state.splatParticles;
  const decals             = state.splatDecals;
  const airResistanceFactor = 0.80;
  const LANDING_SPEED      = 2.0;
  const MAX_DECALS         = state.params.decalMaxCount  || 4000;
  const decalAlpha         = state.params.splatDecalPersistence || 0.7;
  const decalLifetime      = state.params.decalLifetime  || 30.0;
  const decalEvapRate      = state.params.decalEvapRate  || 0.008;

  let livingParticleCount = 0;

  for (let particleIndex = 0; particleIndex < particles.length; particleIndex++) {
    const particle = particles[particleIndex];

    particle.lifetime -= dt;
    if (particle.lifetime <= 0) {
      if (!particle.hasLanded && decals.length < MAX_DECALS) {
        decals.push({
          x:           particle.x,
          y:           particle.y,
          radius:      particle.radius * 1.8,
          hue:         particle.hue,
          alpha:       decalAlpha,
          age:         0,
          maxLifetime: decalLifetime,
        });
        particle.hasLanded = true;
      }
      continue;
    }

    particle.x += particle.velX * dt;
    particle.y += particle.velY * dt;

    const decay = Math.pow(airResistanceFactor, dt);
    particle.velX *= decay;
    particle.velY *= decay;

    const speed = Math.hypot(particle.velX, particle.velY);
    if (!particle.hasLanded && speed < LANDING_SPEED && decals.length < MAX_DECALS) {
      decals.push({
        x:           particle.x,
        y:           particle.y,
        radius:      particle.radius * 1.5,
        hue:         particle.hue,
        alpha:       decalAlpha * 0.85,
        age:         0,
        maxLifetime: decalLifetime,
      });
      particle.hasLanded = true;
    }

    const lifetimeFraction = particle.lifetime / particle.maxLifetime;
    particle.alpha = Math.pow(lifetimeFraction, 0.5);

    particles[livingParticleCount] = particle;
    livingParticleCount++;
  }

  particles.length = livingParticleCount;

  // --- DECAL EVAPORATION ---
  // Age all decals and evaporate them gradually, like paint drying on asphalt.
  let livingDecalCount = 0;
  for (let di = 0; di < decals.length; di++) {
    const d = decals[di];
    if (d.age === undefined) { d.age = 0; d.maxLifetime = decalLifetime; }
    d.age += dt;

    // Natural slow evaporation
    d.alpha -= decalEvapRate * dt;

    // Accelerated fade in last 30% of lifetime
    if (d.maxLifetime > 0) {
      const ageFrac = d.age / d.maxLifetime;
      if (ageFrac > 0.7) {
        const t = (ageFrac - 0.7) / 0.3;
        d.alpha -= t * t * 0.06 * dt;
      }
    }

    if (d.alpha > 0.005 && d.age < d.maxLifetime) {
      decals[livingDecalCount] = d;
      livingDecalCount++;
    }
  }
  decals.length = livingDecalCount;

  if (decals.length > MAX_DECALS) {
    decals.splice(0, decals.length - MAX_DECALS);
  }
}
// =============================================================
// COMBO TIMER UPDATE
// =============================================================

// Called each physics step to tick down the combo flash timer.
// When the combo window expires (no new pop), the multiplier stays
// until the next pop resets it — the count resets on the next pop.
export function updateComboTimer(dt) {
  const combo = state.score.combo;

  if (combo.flashTimer > 0) {
    combo.flashTimer = Math.max(0, combo.flashTimer - dt);
  }
}


// =============================================================
// BALLOON POP SOUND
// =============================================================

// Plays a violent "watermelon getting shredded" sound using the Web Audio API.
// Layers:
//   1. Deep sub-bass THUMP (the mass of the balloon exploding)
//   2. Mid-frequency WET CRACK (the skin/membrane rupturing)
//   3. High-frequency SPRAY HISS (liquid atomizing into the air)
//   4. Distorted noise SHRED texture (the brutal tearing character)
//
// balloonRadius: metres — larger balloons = deeper, longer, more violent sound.
// splatFactor:   [0, 1] — faster hit = louder, more distorted, more devastating.
function playBalloonPopSound(balloonRadius, splatFactor) {
  const audioContext = window.__verletAudioContext;
  if (!audioContext || audioContext.state === 'suspended') return;

  const now = audioContext.currentTime;
  const sampleRate = audioContext.sampleRate;
  const violence = state.params.splatViolence || 1.5;

  // Size-dependent parameters.
  const sizeRange = BALLOON_RADIUS_MAX - BALLOON_RADIUS_MIN;
  const sizeNorm = (balloonRadius - BALLOON_RADIUS_MIN) / sizeRange; // 0=small, 1=large

  // Read balloon pop sound parameters
  const popMasterGain = state.soundParams.popMasterGain || 0.3;
  const popBassTone = state.soundParams.popBassTone || 0.5;
  const popCrackBrightness = state.soundParams.popCrackBrightness || 0.5;
  const popSprayAmount = state.soundParams.popSprayAmount || 0.5;
  const popDistortion = state.soundParams.popDistortion || 0.3;
  const popSpeedSensitivity = state.soundParams.popSpeedSensitivity || 1.0;
  const popPitchShift = (state.soundParams.popPitchShift || 0) / 12; // Convert semitones to octaves

  // Speed responsiveness: how much impact speed affects amplitude
  const speedCurve = 0.4 + splatFactor * (0.6 * popSpeedSensitivity);
  const speedScaledGain = Math.min(speedCurve, 1.0);

  // Master gain for the entire pop event.
  const masterGain = audioContext.createGain();
  masterGain.gain.value = speedScaledGain * popMasterGain * Math.min(violence, 2.0);
  masterGain.connect(audioContext.destination);

  // ═══════════════════════════════════════════════════════════
  // LAYER 1: SUB-BASS THUMP — the mass exploding
  // Deep sine burst that you feel in your chest.
  // ═══════════════════════════════════════════════════════════
  const thumpDuration = 0.12 + sizeNorm * 0.08;
  const baseThumpFreq = 40 + (1 - sizeNorm) * 60; // 40–100 Hz (larger = deeper)
  const thumpFreq = baseThumpFreq * Math.pow(2, popPitchShift); // Apply pitch shift
  const thumpBuffer = audioContext.createBuffer(1, Math.round(sampleRate * thumpDuration), sampleRate);
  const thumpData = thumpBuffer.getChannelData(0);
  for (let i = 0; i < thumpData.length; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * (15 - sizeNorm * 5)); // fast decay
    // Sine with slight frequency drop (pitch bends down as pressure releases).
    const freqDrop = thumpFreq * (1.0 - t * 3);
    thumpData[i] = env * Math.sin(2 * Math.PI * Math.max(freqDrop, 20) * t) * 0.8;
  }
  const thumpSource = audioContext.createBufferSource();
  thumpSource.buffer = thumpBuffer;
  const thumpGain = audioContext.createGain();
  // Thump gain: 0.3–0.7 based on popBassTone slider, scaled by impact speed
  thumpGain.gain.value = (0.3 + popBassTone * 0.4) * (0.5 + splatFactor * 0.5);
  thumpSource.connect(thumpGain);
  thumpGain.connect(masterGain);
  thumpSource.start(now);

  // ═══════════════════════════════════════════════════════════
  // LAYER 2: WET CRACK — membrane rupture
  // Band-limited noise burst with resonant peak, like a whip-crack.
  // ═══════════════════════════════════════════════════════════
  const crackDuration = 0.06 + splatFactor * 0.04;
  const crackBuffer = audioContext.createBuffer(1, Math.round(sampleRate * crackDuration), sampleRate);
  const crackData = crackBuffer.getChannelData(0);
  for (let i = 0; i < crackData.length; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 40) * (1 + Math.sin(t * 800) * 0.3); // sharp attack with resonance
    const crack = (physicsRandom() * 2 - 1);
    // Add a tonal "snap" component — the skin breaking.
    const snapFreq = (400 + (1 - sizeNorm) * 300) * Math.pow(2, popPitchShift);
    const snap = Math.sin(2 * Math.PI * snapFreq * t) * Math.exp(-t * 60);
    crackData[i] = env * (crack * 0.7 + snap * 0.3);
  }
  const crackSource = audioContext.createBufferSource();
  crackSource.buffer = crackBuffer;
  // Bandpass to shape the crack character.
  const crackFilter = audioContext.createBiquadFilter();
  crackFilter.type = 'bandpass';
  const baseCrackFreq = 600 + splatFactor * 400;
  crackFilter.frequency.value = baseCrackFreq * Math.pow(2, popPitchShift);
  crackFilter.Q.value = 1.5;
  const crackGain = audioContext.createGain();
  // Crack gain: 0.2–0.6 based on popCrackBrightness, scaled by impact speed
  crackGain.gain.value = (0.2 + popCrackBrightness * 0.4) * (0.3 + splatFactor * 0.7);
  crackSource.connect(crackFilter);
  crackFilter.connect(crackGain);
  crackGain.connect(masterGain);
  crackSource.start(now);

  // ═══════════════════════════════════════════════════════════
  // LAYER 3: SPRAY HISS — liquid atomizing
  // Long-tail high-frequency noise that sounds like wet spray.
  // ═══════════════════════════════════════════════════════════
  const sprayDuration = 0.15 + splatFactor * 0.25 + sizeNorm * 0.1;
  const sprayBuffer = audioContext.createBuffer(1, Math.round(sampleRate * sprayDuration), sampleRate);
  const sprayData = sprayBuffer.getChannelData(0);
  for (let i = 0; i < sprayData.length; i++) {
    const t = i / sampleRate;
    // Envelope: quick attack, slow decay (spray lingers).
    const attack = Math.min(t / 0.005, 1.0); // 5ms attack
    const decay = Math.exp(-t * (6 - splatFactor * 2));
    sprayData[i] = attack * decay * (physicsRandom() * 2 - 1);
  }
  const spraySource = audioContext.createBufferSource();
  spraySource.buffer = sprayBuffer;
  const sprayFilter = audioContext.createBiquadFilter();
  sprayFilter.type = 'highpass';
  const baseSprayFreq = 2000 + splatFactor * 2000;
  sprayFilter.frequency.value = baseSprayFreq * Math.pow(2, popPitchShift);
  sprayFilter.Q.value = 0.5;
  const sprayGain = audioContext.createGain();
  // Spray gain: 0.1–0.5 based on popSprayAmount, scaled by impact speed
  sprayGain.gain.value = (0.1 + popSprayAmount * 0.4) * (0.2 + splatFactor * 0.8);
  spraySource.connect(sprayFilter);
  sprayFilter.connect(sprayGain);
  sprayGain.connect(masterGain);
  spraySource.start(now + 0.005); // slight delay — spray starts after the crack

  // ═══════════════════════════════════════════════════════════
  // LAYER 4: SHRED TEXTURE — distorted broadband destruction
  // Heavy waveshaped noise that gives the "being ripped apart" quality.
  // ═══════════════════════════════════════════════════════════
  const shredDuration = 0.08 + splatFactor * 0.06;
  const shredBuffer = audioContext.createBuffer(1, Math.round(sampleRate * shredDuration), sampleRate);
  const shredData = shredBuffer.getChannelData(0);
  for (let i = 0; i < shredData.length; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 25);
    // Generate noise then hard-clip it for distortion character.
    let sample = (physicsRandom() * 2 - 1) * env;
    // Waveshape: tanh gives soft clip, but intensity scales with popDistortion.
    const distortionAmount = 1 + (3 + splatFactor * 4) * popDistortion;
    sample = Math.tanh(sample * distortionAmount);
    sample = Math.tanh(sample * 2);
    shredData[i] = sample;
  }
  const shredSource = audioContext.createBufferSource();
  shredSource.buffer = shredBuffer;
  const shredGain = audioContext.createGain();
  // Shred gain: 0.05–0.4 based on popDistortion, scaled by impact speed
  shredGain.gain.value = (0.05 + popDistortion * 0.35) * (0.1 + splatFactor * 0.9);
  shredSource.connect(shredGain);
  shredGain.connect(masterGain);
  shredSource.start(now);
}
