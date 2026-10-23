// =============================================================
// INPUT — keyboard and mouse event handlers
// =============================================================
// Writes to: state.input, state.steering (via mouse drag)
// Reads from: constants (steering geometry, key definitions)
// Calls: handleGearChange() from physics.js when a gear key is pressed
//
// Control scheme:
//   D key:            full throttle (binary; mouse drag gives analog)
//   S key:            brake
//   A key:            clutch pedal to floor (hold to disengage, release to engage)
//   Right-click drag: steering wheel (horizontal drag)
//   Left-click drag:  analog throttle (vertical drag, up = more throttle)
//   Shift+left-click: also steering (alternative for one-button mice)
//
//   Gear changes (while A is held or at any time):
//     Top-row 1–6 → gears 1–6; top-row 7 → Reverse
//     Numpad 7 → 1st gear
//     Numpad 1 → 2nd gear
//     Numpad 8 → 3rd gear
//     Numpad 2 → 4th gear
//     Numpad 9 → 5th gear
//     Numpad 3 → 6th gear
//     Numpad 4 / 5 / 6 → Neutral
//     Q + Numpad 1 → Reverse
// =============================================================

import { uiState as state } from './state.js';
import { handleGearChange } from './physics/index.js';
import { requestEngineStart } from './physics/engine.js';
import {
  STEERING_DRAG_RANGE_PX,
  MAX_FRONT_WHEEL_ANGLE_RAD,
} from './constants.js';


// Keys that should have their default browser behaviour suppressed
// (e.g., numpad keys scroll the page; space opens quick-find).
const KEYS_TO_SUPPRESS_DEFAULT = new Set([
  'KeyD', 'KeyS', 'KeyA', 'KeyF', 'KeyQ', 'KeyR',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7',
  'Numpad1', 'Numpad2', 'Numpad3',
  'Numpad4', 'Numpad5', 'Numpad6',
  'Numpad7', 'Numpad8', 'Numpad9',
  'Space',
]);

// Maximum vertical drag distance for full throttle (pixels).
// Dragging the mouse this many pixels upward from the drag start = 100% throttle.
const THROTTLE_DRAG_RANGE_PX = 120;

// Maximum visual steering wheel angle the HUD indicator can show (radians).
// This is deliberately larger than MAX_FRONT_WHEEL_ANGLE_RAD to give an
// arcade-style steering wheel with many turns of lock visible on screen.
const MAX_VISUAL_WHEEL_ANGLE_RAD = Math.PI * 2.5;
let initialized = false;
let diagnosticPanel = null;

const TEXT_ENTRY_SELECTOR = [
  'textarea', '[contenteditable]:not([contenteditable="false"])',
  'input:not([type])', 'input[type="text"]', 'input[type="search"]',
  'input[type="email"]', 'input[type="url"]', 'input[type="tel"]',
  'input[type="password"]', 'input[type="number"]', 'input[type="date"]',
  'input[type="time"]', 'input[type="datetime-local"]', 'input[type="month"]',
  'input[type="week"]',
].join(',');


// =============================================================
// INITIALISATION
// =============================================================

// Attaches all keyboard and mouse event listeners to the simulation canvas.
// Must be called once from main.js after the canvas is created.
export function initInput(simulationCanvas) {
  if (initialized) return;
  initialized = true;
  document.addEventListener('keydown',  onKeyDown);
  document.addEventListener('keyup',    onKeyUp);
  const releaseInput = () => {
    state.input.heldKeys = {};
    state.input.throttleKeyHeld = state.input.brakeKeyHeld = false;
    state.input.handbrakeKeyHeld = state.input.clutchKeyHeld = false;
    state.input.mouseThrottleActive = false;
    state.steering.isDragging = false;
    refreshInputDiagnostics();
  };
  window.addEventListener('blur', releaseInput);
  document.addEventListener('visibilitychange', () => { if(document.hidden) releaseInput(); });

  if (new URLSearchParams(location.search).get('inputDebug') === '1') {
    diagnosticPanel = document.createElement('pre');
    diagnosticPanel.id = 'input-diagnostics';
    diagnosticPanel.setAttribute('aria-label', 'Keyboard input diagnostics');
    Object.assign(diagnosticPanel.style, {
      position: 'fixed', right: '8px', bottom: '8px', zIndex: '10000',
      margin: '0', padding: '8px', maxWidth: 'min(420px, 90vw)',
      color: '#d8f3ff', background: 'rgba(0, 12, 20, .88)',
      border: '1px solid #4a879e', borderRadius: '4px',
      font: '12px/1.4 monospace', whiteSpace: 'pre-wrap', pointerEvents: 'none',
    });
    document.body.append(diagnosticPanel);
    refreshInputDiagnostics();
  }

  simulationCanvas.addEventListener('mousedown',  onMouseDown);
  simulationCanvas.addEventListener('mousemove',  onMouseMove);
  simulationCanvas.addEventListener('mouseup',    onMouseUp);
  simulationCanvas.addEventListener('mouseleave', onMouseUp); // treat leaving as release

  // Prevent context menu on right-click so right-drag works without interruption.
  simulationCanvas.addEventListener('contextmenu', (event) => event.preventDefault());
}


// =============================================================
// KEYBOARD EVENTS
// =============================================================

function onKeyDown(event) {
  noteKeyEvent(event, 'keydown');
  if (isTextEntry(event.target)) return;
  // Only bare R belongs to the starter. Preserve browser/OS shortcuts before
  // default prevention, held-key mutation, or starter dispatch.
  if (event.code === 'KeyR' && (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)) return;
  // Keep browser shortcuts such as Cmd+1 / Ctrl+1 available.
  if (event.code.startsWith('Digit') && (event.metaKey || event.ctrlKey || event.altKey)) return;
  if (event.code === 'Space' && event.target.closest?.('button')) return;
  if (KEYS_TO_SUPPRESS_DEFAULT.has(event.code)) {
    event.preventDefault();
  }

  const wasHeld = Boolean(state.input.heldKeys[event.code]);
  state.input.heldKeys[event.code] = true;

  switch (event.code) {
    case 'KeyD':
      state.input.throttleKeyHeld = true;
      break;

    case 'KeyS':
      state.input.brakeKeyHeld = true;
      break;

    case 'KeyF':
      state.input.handbrakeKeyHeld = true;
      break;

    case 'KeyA':
      state.input.clutchKeyHeld = true;
      break;

    case 'KeyR':
      if (!event.repeat && !wasHeld) requestEngineStart();
      break;

    // Gear selection via the number row or the original numpad layout.
    // The gear is selectable at any time; holding A first is conventional
    // but not enforced — the engine/clutch model handles the consequence.
    case 'Digit1':
    case 'Digit2':
    case 'Digit3':
    case 'Digit4':
    case 'Digit5':
    case 'Digit6': selectGear(event.code.slice(-1), event); break;
    case 'Digit7': selectGear('R', event); break;
    case 'Numpad7': selectGear('1', event); break;
    case 'Numpad1': selectGear(isQHeld() ? 'R' : '2', event); break;
    case 'Numpad8': selectGear('3', event); break;
    case 'Numpad2': selectGear('4', event); break;
    case 'Numpad9': selectGear('5', event); break;
    case 'Numpad3': selectGear('6', event); break;
    case 'Numpad4':
    case 'Numpad5':
    case 'Numpad6':
      selectGear('N', event);
      break;
  }
  refreshInputDiagnostics();
}

function onKeyUp(event) {
  noteKeyEvent(event, 'keyup');
  delete state.input.heldKeys[event.code];

  switch (event.code) {
    case 'KeyD':
      state.input.throttleKeyHeld = false;
      break;

    case 'KeyS':
      state.input.brakeKeyHeld = false;
      break;

    case 'KeyF':
      state.input.handbrakeKeyHeld = false;
      break;

    case 'KeyA':
      state.input.clutchKeyHeld = false;
      break;
  }
  refreshInputDiagnostics();
}

function isTextEntry(target) {
  return Boolean(target?.isContentEditable || target?.closest?.(TEXT_ENTRY_SELECTOR));
}

function noteKeyEvent(event, type) {
  state.input.lastKeyEvent = {
    type, code: event.code, repeat: Boolean(event.repeat),
    editableTarget: isTextEntry(event.target), time: performance.now(),
  };
}

export function updateInputDiagnostics() {
  refreshInputDiagnostics();
}

function refreshInputDiagnostics() {
  if (!diagnosticPanel) return;
  const input = state.input;
  const last = input.lastKeyEvent;
  const engine = state.engine;
  const gear = engine.shiftState === 'engaged' || engine.shiftState === 'neutral'
    ? engine.currentGear : `${engine.currentGear} → ${engine.requestedGear} (${engine.shiftState})`;
  diagnosticPanel.textContent = [
    'INPUT DEBUG · ?inputDebug=1',
    `last: ${last ? `${last.type} ${last.code}${last.repeat ? ' (repeat)' : ''}${last.editableTarget ? ' [text field]' : ''}` : 'none'}`,
    `held: ${Object.keys(input.heldKeys).join(', ') || 'none'}`,
    `throttle ${input.mouseThrottleActive ? input.mouseThrottleAmount.toFixed(2) : Number(input.throttleKeyHeld)} · brake ${Number(input.brakeKeyHeld)} · clutch ${Number(input.clutchKeyHeld)} · handbrake ${Number(input.handbrakeKeyHeld)}`,
    `engine ${engine.mode || (engine.isRunning ? 'running' : engine.isStalled ? 'stalled' : 'stopped')} · gear ${gear}`,
    `rpm ${Math.round(engine.rpm || 0)} · speed ${(state.body.speed || 0).toFixed(2)} m/s`,
  ].join('\n');
}

// Returns true if the Q key is currently held.
// Q + Numpad1 selects Reverse.
function isQHeld() {
  return !!state.input.heldKeys['KeyQ'];
}

// Maps a gear letter to a call to handleGearChange in physics.js.
// gear: 'N', 'R', '1' through '6'
function selectGear(gear, _event) {
  handleGearChange(gear);
}


// =============================================================
// MOUSE EVENTS
// =============================================================

function onMouseDown(event) {
  event.preventDefault();

  // Right mouse button (button 2) OR Shift+Left button (button 0):
  //   → steering drag
  const isSteeringButton = event.button === 2 ||
                           (event.button === 0 && event.shiftKey);

  // Left mouse button without Shift: → throttle drag
  const isThrottleButton = event.button === 0 && !event.shiftKey;

  if (isSteeringButton) {
    state.steering.isDragging    = true;
    state.steering.dragStartX    = event.clientX;
    state.steering.dragStartAngle = state.steering.wheelAngle;
    state.steering.dragButton    = event.button;
  }

  if (isThrottleButton) {
    state.input.mouseThrottleActive       = true;
    state.input.mouseThrottleDragStartY   = event.clientY;
  }
}

function onMouseMove(event) {
  // Steering: horizontal drag from the drag start position maps to wheel angle.
  // Full STEERING_DRAG_RANGE_PX pixels of drag = full visual steering lock.
  if (state.steering.isDragging) {
    const dragDelta     = event.clientX - state.steering.dragStartX;
    const normalisedDrag = dragDelta / (state.params.steeringDragRange || STEERING_DRAG_RANGE_PX); // can exceed ±1

    // Visual wheel angle: larger range than physical tyre angle for feel.
    state.steering.wheelAngle = state.steering.dragStartAngle + normalisedDrag * MAX_VISUAL_WHEEL_ANGLE_RAD;
    // Clamp so the visual doesn't spin forever with large drags.
    const maxVisual = MAX_VISUAL_WHEEL_ANGLE_RAD;
    if (state.steering.wheelAngle >  maxVisual) state.steering.wheelAngle =  maxVisual;
    if (state.steering.wheelAngle < -maxVisual) state.steering.wheelAngle = -maxVisual;
  }

  // Throttle: vertical drag, up from start = more throttle.
  // Canvas Y increases downward, so dragging up = negative delta = more throttle.
  if (state.input.mouseThrottleActive) {
    const dragDelta       = event.clientY - state.input.mouseThrottleDragStartY;
    const normalisedDrag  = -dragDelta / THROTTLE_DRAG_RANGE_PX; // negative = up
    state.input.mouseThrottleAmount = Math.max(0, Math.min(1, normalisedDrag));
  }
}

function onMouseUp(event) {
  // Release the button that started steering even if Shift was released first.
  if (event.button === state.steering.dragButton ||
      event.type === 'mouseleave') {
    state.steering.isDragging = false;
  }

  if (event.button === 0 || event.type === 'mouseleave') {
    state.input.mouseThrottleActive = false;
    // Do NOT reset mouseThrottleAmount here — let physics read the last value
    // for one more frame; it will be suppressed because mouseThrottleActive=false.
    // Actually, we do want to reset it so the car doesn't hold throttle if the
    // user releases without dragging back to zero.
    state.input.mouseThrottleAmount = 0;
  }
}
