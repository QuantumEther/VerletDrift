// Info-bar rendering and delegated diagnostic logging. Controls and instruments
// have their own modules under ui/.

import { uiState as state } from './state.js';
import {
  KPH_TO_MPS,
  CAR_HALF_LENGTH,
  CAR_HALF_WIDTH,
} from './constants.js';

import { logger } from './debug/logger.js';

const INFO_BAR_CELL_IDS = [
  'velocityDisplay',
  'rpmDisplay',
  'gearDisplay',
  'headingDisplay',
  'clutchDisplay',
  'wheelOmegaDisplay',
  'trailDisplay',
  'renderFpsDisplay',
  'physicsTpsDisplay',
  'motionEnergyTotal',
  'motionEnergyLinear',
  'motionEnergyYaw',
  'motionEnergyWheels',
];

const infoBarCellCache = new Map();
const infoBarTextCache = new Map();

function initInfoBarCellCache() {
  if (infoBarCellCache.size > 0) return;

  for (const id of INFO_BAR_CELL_IDS) {
    infoBarCellCache.set(id, document.getElementById(id));
  }
}


// =============================================================
// INFO BAR
// =============================================================

// Updates the text displays in the info bar at the bottom of the simulation canvas.
// Called once per animation frame from main.js.
// Reads from state.body and state.engine.
export function updateInfoBar() {
  const suspensionReadout = document.getElementById('suspensionReadout');
  if (suspensionReadout) {
    const s = state.suspension;
    suspensionReadout.textContent = state.params.suspensionEnabled
      ? `Pitch ${(s.pitch * 180 / Math.PI).toFixed(1)}° · Roll ${(s.roll * 180 / Math.PI).toFixed(1)}° · Loads FL/FR/RL/RR ${Object.values(state.wheelLoads).map(n => Math.round(n)).join('/')} N`
      : 'Instant weight transfer';
  }
  // The info bar remains live independently of in-canvas HUD visibility.

  initInfoBarCellCache();

  const body   = state.body;
  const engine = state.engine;
  const trail  = state.trail;

  setInfoCell('velocityDisplay',
    `${(body.speed / KPH_TO_MPS).toFixed(1)} km/h`);

  setInfoCell('rpmDisplay',
    engine.isStalled ? 'STALL' :
    !engine.isRunning ? 'OFF' :
    `${Math.round(engine.rpm)} rpm`);

  setInfoCell('gearDisplay', engine.currentGear);

  setInfoCell('headingDisplay',
    `${((((body.heading * 180 / Math.PI) % 360) + 360) % 360).toFixed(0)}°`);

  setInfoCell('clutchDisplay',
    `${(engine.clutchEngagement * 100).toFixed(0)}%`);

  // Wheel angular velocities (rad/s)
  const flOmega = state.wheelOmega.frontLeft || 0;
  const frOmega = state.wheelOmega.frontRight || 0;
  const rlOmega = state.wheelOmega.rearLeft || 0;
  const rrOmega = state.wheelOmega.rearRight || 0;
  // Per-frame wheel omega logging moved to debug overlay and logger (trace mode only)
  const formatOmega = (val) => {
    const sign = val >= 0 ? '+' : '';
    const absVal = Math.abs(val);
    let decimals;
    if (absVal < 10) decimals = 2;
    else if (absVal < 100) decimals = 1;
    else decimals = 0;
    return sign + val.toFixed(decimals);
  };
  setInfoCell('wheelOmegaDisplay',
    `FL:${formatOmega(flOmega)} FR:${formatOmega(frOmega)}\nRL:${formatOmega(rlOmega)} RR:${formatOmega(rrOmega)}`);

  // Render FPS and physics ticks-per-second (set by main.js into state.loop).
  setInfoCell('renderFpsDisplay',
    `${Math.round(state.loop.renderFps)} fps`);
  // Physics Hz is the slider value — the dynamic measurement was showing
  // display framerate (bug: 1 tick / wallFrameTime = displayHz, not physicsHz).
  setInfoCell('physicsTpsDisplay',
    `${state.params.simulationFps}Hz · max ${state.params.maxSubstepsPerFrame}/f · drop ${state.loop.droppedSubsteps} (last ${state.loop.droppedSubstepsLastFrame})`);

  // Kinetic energy estimate only: body translation, body yaw, and physical
  // wheel spin. Engine inertia reflected into the rear wheel solver is omitted
  // here to avoid counting drivetrain energy twice.
  const mass = Math.max(0, state.params.carMassKg);
  const yawInertia = mass * (CAR_HALF_LENGTH ** 2 + CAR_HALF_WIDTH ** 2) / 3;
  const linearJ = 0.5 * mass * (body.velocityX ** 2 + body.velocityY ** 2);
  const yawJ = 0.5 * yawInertia * body.angularVelocity ** 2;
  const wheelInertia = Math.max(0, state.params.wheelInertia || 0);
  const wheelJ = Object.values(state.wheelOmega).reduce(
    (sum, omega) => sum + 0.5 * wheelInertia * omega ** 2, 0);
  const toKJ = (joules) => `${(joules / 1000).toFixed(2)} kJ`;
  setInfoCell('motionEnergyTotal', toKJ(linearJ + yawJ + wheelJ));
  setInfoCell('motionEnergyLinear', toKJ(linearJ));
  setInfoCell('motionEnergyYaw', toKJ(yawJ));
  setInfoCell('motionEnergyWheels', toKJ(wheelJ));
}

// Sets the textContent of an info cell by id, silently skipping if not found.
function setInfoCell(elementId, text) {
  const element = infoBarCellCache.get(elementId);
  if (!element) return;

  if (infoBarTextCache.get(elementId) === text) return;
  infoBarTextCache.set(elementId, text);
  element.textContent = text;
}


// =============================================================
// CHANGE LOGGER
// =============================================================

// Attaches delegated event listeners to the document that log every
// UI input change to the browser console. Uses a single listener for
// each event type rather than per-element listeners, so it catches
// any slider or button added to the page without needing extra wiring.
//
// Call once at startup from main.js. Output format:
//   [UI] sliderId = 1234
//   [UI] buttonId clicked
export function initChangeLogger() {
  document.addEventListener('input', (e) => {
    // Phase B: logger.shouldLog() now checks controller level (replaces logsEnabled)
    if (!logger.shouldLog('debug', 'ui')) return;

    const el = e.target;
    if (el.type === 'range' || el.type === 'text' || el.type === 'number') {
      logger.debug('ui', `${el.id} = ${el.value}`);
    }
  });
  document.addEventListener('change', (e) => {
    // Phase B: logger.shouldLog() now checks controller level (replaces logsEnabled)
    if (!logger.shouldLog('debug', 'ui')) return;

    const el = e.target;
    // Log select elements and checkboxes on change.
    if (el.tagName === 'SELECT' || el.type === 'checkbox') {
      logger.debug('ui', `${el.id} = ${el.value}`);
    }
  });
  document.addEventListener('click', (e) => {
    // Phase B: logger.shouldLog() now checks controller level (replaces logsEnabled)
    if (!logger.shouldLog('debug', 'ui')) return;

    const el = e.target;
    if (el.tagName === 'BUTTON' && el.id) {
      logger.debug('ui', `${el.id} clicked`);
    }
  });
}
