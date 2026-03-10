// =============================================================
// PHYSICS / KINEMATICS
// Verlet body kinematics: angle utilities, car initialization,
// and derived body state (center, heading, velocity, acceleration).
// =============================================================

import { physicsState as state } from '../state.js';
import { CAR_HALF_WIDTH, CAR_HALF_LENGTH, TAU } from '../constants.js';

// --------------- private helpers ---------------

function dot(ax, ay, bx, by) {
  return ax * bx + ay * by;
}

// -----------------------------------------------


// Wraps an angle in radians to the range (-π, π].
// Used to find the shortest angular distance between two headings.
export function wrapAngle(angle) {
  while (angle >  Math.PI) angle -= TAU;
  while (angle < -Math.PI) angle += TAU;
  return angle;
}


// Places the four wheel particles in a rectangle centred at
// (worldCenterX, worldCenterY) with the car facing up (heading = 0).
// Must be called once before the game loop starts.
// Previous positions are set equal to current so initial velocity = 0.
export function initializeCarBody(worldCenterX, worldCenterY) {
  const wheels = state.wheels;

  // The car faces "up" initially. In canvas coordinates +Y is down,
  // so "front" of the car is at smaller Y (towards the top of the screen).
  wheels.frontLeft.x  = worldCenterX - CAR_HALF_WIDTH;
  wheels.frontLeft.y  = worldCenterY - CAR_HALF_LENGTH;

  wheels.frontRight.x = worldCenterX + CAR_HALF_WIDTH;
  wheels.frontRight.y = worldCenterY - CAR_HALF_LENGTH;

  wheels.rearLeft.x   = worldCenterX - CAR_HALF_WIDTH;
  wheels.rearLeft.y   = worldCenterY + CAR_HALF_LENGTH;

  wheels.rearRight.x  = worldCenterX + CAR_HALF_WIDTH;
  wheels.rearRight.y  = worldCenterY + CAR_HALF_LENGTH;

  // Set previous = current so Verlet starts at rest.
  for (const wheel of Object.values(wheels)) {
    wheel.prevX = wheel.x;
    wheel.prevY = wheel.y;
  }

  // Place camera at the body centre.
  state.camera.x     = worldCenterX;
  state.camera.y     = worldCenterY;
  state.camera.prevX = worldCenterX;
  state.camera.prevY = worldCenterY;

  // Initialize wheel omegas to pure rolling state: ω = v_long / R
  // Car starts at rest (v = 0), so all omegas begin at zero.
  // NOTE: If wheels ever need to init with velocity, use longitudinal speed:
  //   forwardX = sin(body.heading); forwardY = -cos(body.heading);
  //   wheelLongitudinalSpeed = dot(body.velocityX, body.velocityY, forwardX, forwardY);
  //   omega = wheelLongitudinalSpeed / wheelRad;
  // This ensures ω = v_long / R, not total speed / R (which would be wrong).
  for (const name of Object.keys(state.wheelOmega)) {
    state.wheelOmega[name] = 0;  // Car starts at rest
  }
}


// Computes all quantities that depend on wheel positions:
// centre, heading, velocity, angular velocity, and accelerations.
// Must be called at the TOP of each physics sub-step before anything
// else reads from state.body. Also called again at the END of the step
// so camera and render get up-to-date values.
export function computeBodyDerivedState(dt) {
  const wheels = state.wheels;
  const body   = state.body;

  // Save last frame's velocity so we can derive acceleration this frame.
  body.prevVelocityX = body.velocityX;
  body.prevVelocityY = body.velocityY;
  body.prevHeading   = body.heading;

  // Front-axle midpoint and rear-axle midpoint.
  const frontMidX = (wheels.frontLeft.x + wheels.frontRight.x) * 0.5;
  const frontMidY = (wheels.frontLeft.y + wheels.frontRight.y) * 0.5;
  const rearMidX  = (wheels.rearLeft.x  + wheels.rearRight.x)  * 0.5;
  const rearMidY  = (wheels.rearLeft.y  + wheels.rearRight.y)  * 0.5;

  // Centre of mass = midpoint between front and rear axle midpoints.
  body.centerX = (frontMidX + rearMidX) * 0.5;
  body.centerY = (frontMidY + rearMidY) * 0.5;

  // Heading: angle of the vector from rear midpoint to front midpoint.
  // atan2 returns the angle of a vector in standard maths convention.
  // We add PI/2 to rotate so heading 0 means facing up (−Y in canvas).
  body.heading = Math.atan2(frontMidY - rearMidY, frontMidX - rearMidX) + Math.PI * 0.5;

  // Derive linear velocity from centre-of-mass Verlet displacement.
  // Average the four wheel velocities to get the body's CoM velocity.
  let avgVelX = 0, avgVelY = 0;
  for (const wheel of Object.values(wheels)) {
    avgVelX += (wheel.x - wheel.prevX);
    avgVelY += (wheel.y - wheel.prevY);
  }
  // Divide by count (4) and by dt to get px/s.
  const inverseFourDt = 1 / (4 * dt);
  body.velocityX = avgVelX * inverseFourDt;
  body.velocityY = avgVelY * inverseFourDt;
  body.speed     = Math.hypot(body.velocityX, body.velocityY);

  // Angular velocity from heading change. wrapAngle handles wraparound.
  body.angularVelocity = wrapAngle(body.heading - body.prevHeading) / dt;

  // Accelerations: change in velocity per second.
  // These are used by computeWeightTransfer() to shift tyre loads.
  const invDt = 1 / dt;
  const accelX = (body.velocityX - body.prevVelocityX) * invDt;
  const accelY = (body.velocityY - body.prevVelocityY) * invDt;

  // --- Jerk (3rd derivative): rate of change of acceleration ---
  // Store previous acceleration before overwriting.
  body.prevAccelX = body.accelX;
  body.prevAccelY = body.accelY;
  body.accelX = accelX;
  body.accelY = accelY;

  // Jerk = (currentAccel - previousAccel) / dt
  body.jerkX = (accelX - body.prevAccelX) * invDt;
  body.jerkY = (accelY - body.prevAccelY) * invDt;
  body.jerkMagnitude = Math.hypot(body.jerkX, body.jerkY);

  // --- Filtered derivatives for rendering (EMA) ---
  // Raw accel/jerk from Verlet differentiation contains constraint impulse noise.
  // Smooth with exponential moving average so HUD arrows don't glitch.
  const filterAlpha = 1.0 - Math.exp(-dt / 0.08); // 80ms time constant
  const fb = state.filteredBody;
  fb.accelX += (accelX - fb.accelX) * filterAlpha;
  fb.accelY += (accelY - fb.accelY) * filterAlpha;
  const jerkFilterAlpha = 1.0 - Math.exp(-dt / 0.12); // 120ms for jerk (noisier)
  fb.jerkX += (body.jerkX - fb.jerkX) * jerkFilterAlpha;
  fb.jerkY += (body.jerkY - fb.jerkY) * jerkFilterAlpha;
  fb.jerkMagnitude = Math.hypot(fb.jerkX, fb.jerkY);

  // Project world-space acceleration onto car-forward and car-right axes.
  const forwardX = Math.sin(body.heading);  // car forward vector
  const forwardY = -Math.cos(body.heading);
  const rightX   = Math.cos(body.heading);  // car right vector (perpendicular)
  const rightY   = Math.sin(body.heading);

  body.longitudinalAccel = dot(accelX, accelY, forwardX, forwardY);
  body.lateralAccel      = dot(accelX, accelY, rightX,   rightY);
}
