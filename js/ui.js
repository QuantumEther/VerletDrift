// =============================================================
// UI — slider binding, info bar updates, needle physics
// =============================================================
// Handles all DOM ↔ state synchronisation.
//
// initSliders() connects every HTML slider to its state.params field.
// updateInfoBar() refreshes the text displays in the info bar.
// createNeedlePhysics() returns a spring-damper object for gauge needles.
//
// The needle physics model is separate from the physics simulation —
// it only animates the visual gauge needle, never affects car behaviour.
// =============================================================

import state from './state.js';
import { updateSoundParam } from './soundStateManager.js';
import {
  NEEDLE_STIFFNESS,
  NEEDLE_DAMPING,
  NEEDLE_RISE_BOOST,
  NEEDLE_FALL_BOOST,
  NEEDLE_FLUTTER_THRESHOLD,
  KPH_TO_MPS,
} from './constants.js';

const INFO_BAR_CELL_IDS = [
  'velocityDisplay',
  'rpmDisplay',
  'gearDisplay',
  'headingDisplay',
  'clutchDisplay',
  'trailDisplay',
  'renderFpsDisplay',
  'physicsTpsDisplay',
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
// NEEDLE PHYSICS
// =============================================================

// Creates and returns a needle physics instance.
// The needle is a spring-damper system that smoothly tracks a target
// normalised position [0, 1] without explicit velocity storage.
//
// Usage:
//   const needle = createNeedlePhysics();
//   // each frame:
//   const displayNormalized = needle.step(targetNormalized);
//
// The needle has:
//   - Asymmetric response: faster rise (RISE_BOOST), slower fall (FALL_BOOST)
//   - Flutter at high readings (> FLUTTER_THRESHOLD) to simulate a real meter
//   - Spring stiffness and exponential damping for smooth, non-oscillating motion
export function createNeedlePhysics() {
  let needlePosition = 0;    // current spring position [0, 1]
  let needleVelocity = 0;    // spring velocity
  let elapsedSeconds = 0;    // real elapsed time for flutter (framerate-independent)

  // Reference framerate the constants were tuned for.
  const REF_HZ = 60.0;

  return {
    // Advances the needle toward targetNormalized and returns the new position.
    // dt: real elapsed seconds since last call (from renderFrame wall-clock time).
    // All spring constants are normalized to dt so behaviour is identical at any framerate.
    step(targetNormalized, dt) {
      // Accumulate real time for flutter oscillation.
      // Using elapsed seconds instead of frame counter means flutter frequency
      // is identical whether running at 30Hz or 240Hz.
      elapsedSeconds += dt;

      // Normalize dt to 60Hz reference so spring constants behave as designed.
      // At 60Hz: dtNorm=1.0 (no change). At 240Hz: dtNorm=0.25 (1/4 per frame).
      const dtNorm = dt * REF_HZ;

      // Spring force toward target — scaled by dtNorm so accumulation per second
      // is constant regardless of framerate.
      const springForce = (targetNormalized - needlePosition) * NEEDLE_STIFFNESS * dtNorm;

      // Asymmetric response: tachometers rise fast, fall slowly.
      const movingUp = springForce > 0;
      const boostFactor = movingUp ? NEEDLE_RISE_BOOST : NEEDLE_FALL_BOOST;

      needleVelocity += springForce * boostFactor;

      // Exponential damping: Math.pow(NEEDLE_DAMPING, dtNorm) gives identical
      // decay per second at any framerate.
      // At 60Hz: pow(0.855, 1) = 0.855. At 240Hz: pow(0.855, 0.25) = 0.962.
      needleVelocity *= Math.pow(NEEDLE_DAMPING, dtNorm);

      needlePosition += needleVelocity;

      // Flutter near the top of the scale: simulates a vibrating mechanical needle.
      // Uses elapsedSeconds so frequency is ~1.43Hz regardless of display framerate.
      if (needlePosition > NEEDLE_FLUTTER_THRESHOLD) {
        const flutterAmplitude = (needlePosition - NEEDLE_FLUTTER_THRESHOLD) * 0.012;
        needlePosition += Math.sin(elapsedSeconds * 9.0) * flutterAmplitude;
      }

      // Clamp to [0, 1].
      needlePosition = needlePosition < 0 ? 0 : needlePosition > 1 ? 1 : needlePosition;
      return needlePosition;
    },
  };
}


// =============================================================
// SLIDER BINDING
// =============================================================

// Connects all HTML sliders to their corresponding state.params fields.
// Each slider writes its value to state.params on the 'input' event,
// and reads the initial state.params value on setup.
//
// The function expects HTML elements with specific id attributes,
// matching the IDs in index.html. If an element is not found, that
// slider is silently skipped (no exception thrown).
export function initSliders() {
  initInfoBarCellCache();

  // Generic binder: links a slider element to a params field.
  // getValue:  slider string → typed value for state.params
  // getDisplay: typed value → display string for the label element
  // The label element is expected to have id = sliderId + 'Value'.
  function bindSlider(sliderId, getValue, getDisplay) {
    const slider = document.getElementById(sliderId);
    const label  = document.getElementById(sliderId + 'Value');
    if (!slider) return;

    // Read from slider into params on change.
    slider.addEventListener('input', () => {
      const value = getValue(slider.value);
      // Derive the params key from the slider id (camelCase convention).
      // The slider id IS the params key, so we use it directly.
      // Each call below explicitly maps id to params key for clarity.
    });
  }

  // We use explicit bindings rather than a generic mapping, because each
  // slider may need custom value conversion (log scale, inversion, etc.)
  // and we want the code to be readable without decoding a mapping table.

  function bind(sliderId, paramsKey, parseValue, formatDisplay) {
    const slider       = document.getElementById(sliderId);
    const displayLabel = document.getElementById(sliderId + 'Value');
    if (!slider) return;

    // Initialise slider from state.params (in case HTML default differs).
    // We do NOT set slider.value here because the HTML value is the source of
    // truth at startup — we set params from the slider on init.
    const initialValue = parseValue(slider.value);
    state.params[paramsKey] = initialValue;
    if (displayLabel) displayLabel.textContent = formatDisplay(initialValue);

    slider.addEventListener('input', () => {
      const value = parseValue(slider.value);
      state.params[paramsKey] = value;
      if (displayLabel) displayLabel.textContent = formatDisplay(value);
    });
  }

  // Helper formatters.
  const fmt1  = (v) => v.toFixed(1);
  const fmt2  = (v) => v.toFixed(2);
  const fmt3  = (v) => v.toFixed(3);
  const fmt4  = (v) => v.toFixed(4);
  const fmt5  = (v) => v.toFixed(5);
  const fmtInt = (v) => String(Math.round(v));
  const fmtPct = (v) => (v * 100).toFixed(0) + '%';
  const parseFloat1 = (s) => parseFloat(s);
  const parseInt1   = (s) => parseInt(s, 10);

  // ---- Simulation ----
  bind('simulationFps',    'simulationFps',    (s) => {
    // Snap to nearest 10 Hz.
    const raw    = parseInt(s, 10);
    const snapped = Math.round(raw / 10) * 10;
    return Math.max(10, Math.min(120, snapped));
  }, fmtInt);

  bind('maxSubstepsPerFrame', 'maxSubstepsPerFrame', parseInt1, fmtInt);
  bind('timeScale', 'timeScale', parseFloat1, fmt2);

  // ---- Car physics ----
  bind('carMassKg',             'carMassKg',            parseFloat1, fmtInt);
  bind('rollingResistanceCoeff','rollingResistanceCoeff',parseFloat1, fmt3);
  bind('aeroDragCoeff',         'aeroDragCoeff',         parseFloat1, fmt2);
  bind('tireFrictionCoeff',     'tireFrictionCoeff',     parseFloat1, fmt2);
  bind('cogHeight',             'cogHeight',             parseFloat1, fmt2);
  bind('bounciness',            'bounciness',            parseFloat1, fmt2);
  bind('stallResistance',       'stallResistance',       parseFloat1, fmt2);
  bind('yawDamping',            'yawDamping',            parseFloat1, fmt1);

  // ---- Clutch ----
  bind('clutchBitePoint',  'clutchBitePoint',  parseFloat1, fmt2);
  bind('clutchBiteRange',  'clutchBiteRange',  parseFloat1, fmt2);
  bind('clutchBiteCurve',  'clutchBiteCurve',  parseFloat1, fmt1);
  bind('clutchEngageTime', 'clutchEngageTime', parseFloat1, fmt2);

  // ---- Trail ----
  bind('trailSpawnInterval', 'trailSpawnInterval', (s) => {
    // Logarithmic mapping: 0.001 s to 10 s.
    const raw = parseFloat(s) / 100; // slider 0–100 → 0–1
    return 0.001 * Math.pow(10000, raw); // log scale
  }, (v) => v.toFixed(3) + 's');

  bind('trailLifespan', 'trailLifespan', parseFloat1, fmt1);
  bind('trailFade',     'trailFade',     parseFloat1, fmt2);

  // ---- Camera ----
  bind('cameraOmega',           'cameraOmega',           parseFloat1, fmt1);
  bind('cameraZeta',            'cameraZeta',            parseFloat1, fmt2);
  bind('cameraZoomSensitivity', 'cameraZoomSensitivity', parseFloat1, fmt2);

  // ---- Motion blur ----
  bind('motionBlurSamples',   'motionBlurSamples',   parseInt1,   fmtInt);
  bind('motionBlurIntensity', 'motionBlurIntensity', parseFloat1, fmt2);
  bind('motionBlurThreshold', 'motionBlurThreshold', parseFloat1, fmtInt);

  // ---- Map ----
  bind('mapWidth',  'mapWidth',  parseFloat1, fmtInt);
  bind('mapHeight', 'mapHeight', parseFloat1, fmtInt);

  // ---- Gauges ----
  bind('gaugeLabelScale', 'gaugeLabelScale', (s) => {
    // Slider 60–160 → scale 0.6–1.6
    return parseFloat(s) / 100;
  }, (v) => v.toFixed(1) + '×');

  // ---- Engine & Drivetrain ----
  bind('peakEngineTorqueNm', 'peakEngineTorqueNm', parseFloat1, fmtInt);
  bind('idleRpm',            'idleRpm',            parseFloat1, fmtInt);
  bind('redlineRpm',         'redlineRpm',         parseFloat1, fmtInt);
  bind('stallRpm',           'stallRpm',           parseFloat1, fmtInt);
  bind('wheelRadius',        'wheelRadius',        parseFloat1, fmt2);
  bind('finalDriveRatio',    'finalDriveRatio',    parseFloat1, fmt1);
  bind('brakeForce',         'brakeForce',         parseFloat1, fmtInt);
  bind('idleCreepForce',     'idleCreepForce',     parseFloat1, fmtInt);
  bind('gearRatio1',         'gearRatio1',         parseFloat1, fmt2);
  bind('gearRatio2',         'gearRatio2',         parseFloat1, fmt2);
  bind('gearRatio3',         'gearRatio3',         parseFloat1, fmt2);
  bind('gearRatio4',         'gearRatio4',         parseFloat1, fmt2);
  bind('gearRatio5',         'gearRatio5',         parseFloat1, fmt2);
  bind('gearRatio6',         'gearRatio6',         parseFloat1, fmt2);

  // ---- Tire Model ----
  bind('pacejkaB',              'pacejkaB',              parseFloat1, fmt1);
  bind('pacejkaC',              'pacejkaC',              parseFloat1, fmt2);
  bind('peakSlipAngleDeg',      'peakSlipAngleDeg',      parseFloat1, fmt1);
  bind('peakSlipRatio',         'peakSlipRatio',         parseFloat1, fmt2);
  bind('tireRelaxationLength',  'tireRelaxationLength',  parseFloat1, fmt2);

  // ---- World & Visual ----
  bind('constraintIterations',  'constraintIterations',  parseInt1,   fmtInt);
  bind('constraintDamping',     'constraintDamping',     parseFloat1, fmt2);
  bind('checkerboardTileSize',  'checkerboardTileSize',  parseFloat1, fmtInt);
  bind('maxTrailArrows',        'maxTrailArrows',        parseInt1,   fmtInt);
  bind('maxBalloons',           'maxBalloons',           parseInt1,   fmtInt);
  bind('balloonRespawnRate',    'balloonRespawnRate',    parseFloat1, fmt2);
  bind('cylinderCount',         'cylinderCount',         parseInt1,   fmtInt);

  // ---- Visual Effect Toggles (checkboxes) ----
  function bindCheckbox(elementId, paramsKey) {
    const checkbox = document.getElementById(elementId);
    if (!checkbox) return;
    // Init from HTML default.
    state.params[paramsKey] = checkbox.checked;
    checkbox.addEventListener('change', () => {
      state.params[paramsKey] = checkbox.checked;
    });
  }
  bindCheckbox('showKinematicArrows', 'showKinematicArrows');
  bindCheckbox('showSparks',          'showSparks');
  bindCheckbox('showSkidMarks',       'showSkidMarks');

  // ---- Debug Overlays ----
  bindCheckbox('debugShowTireForces',    'debugShowTireForces');
  bindCheckbox('debugShowSlipAngles',    'debugShowSlipAngles');
  bindCheckbox('debugShowSAT',           'debugShowSAT');
  bindCheckbox('debugShowSmoothingFilter', 'debugShowSmoothingFilter');
  bindCheckbox('debugShowCrossover',     'debugShowCrossover');
  bindCheckbox('debugShowWheelSpeeds',   'debugShowWheelSpeeds');
  bind('debugFontSize', 'debugFontSize', parseInt, fmtInt);

  // ---- Performance Profiler ----
  bindCheckbox('perfProfilerEnabled',    'perfProfilerEnabled');
  bindCheckbox('perfThrottleSimulation', 'perfThrottleSimulation');

  // ---- Spark Tuning ----
  bind('sparkIntensity',      'sparkIntensity',      parseFloat1, fmt1);
  bind('sparkSize',           'sparkSize',           parseFloat1, fmt1);
  bind('sparkLifetime',       'sparkLifetime',       parseFloat1, fmt1);
  bind('sparkGripThreshold',  'sparkGripThreshold',  parseFloat1, fmt2);

  // ---- Splatter Tuning ----
  bind('splatViolence',          'splatViolence',          parseFloat1, fmt1);
  bind('splatDecalPersistence',  'splatDecalPersistence',  parseFloat1, fmt2);

  // ---- Pixels per Metre ----
  bind('pixelsPerMeter', 'pixelsPerMeter', parseFloat1, fmtInt);

  // ---- Decal System ----
  bind('decalLifetime',    'decalLifetime',    parseFloat1, fmt1);
  bind('decalEvapRate',    'decalEvapRate',    parseFloat1, fmt3);
  bind('decalMaxCount',    'decalMaxCount',    parseInt1,   fmtInt);
  bind('decalMinRadius',   'decalMinRadius',   parseFloat1, fmt2);
  bind('decalMaxRadius',   'decalMaxRadius',   parseFloat1, fmt2);
  bind('decalEdgeSoftness','decalEdgeSoftness',parseFloat1, fmt2);

  // ---- Doppler Effect ----
  bind('dopplerStrength', 'dopplerStrength', parseFloat1, fmt3);
  bind('dopplerMaxShift', 'dopplerMaxShift', parseFloat1, fmt2);
  // dopplerEnabled checkbox
  const dopplerEnabledEl = document.getElementById('dopplerEnabled');
  if (dopplerEnabledEl) {
    dopplerEnabledEl.addEventListener('change', () => {
      state.params.dopplerEnabled = dopplerEnabledEl.checked;
    });
  }

  // ---- Exhaust & Burble ----
  bind('exhaustPopVolume',  'exhaustPopVolume',  parseFloat1, fmt2);
  bind('exhaustPopDensity', 'exhaustPopDensity', parseFloat1, fmt1);
  bind('backfireThreshold', 'backfireThreshold', parseInt1,   fmtInt);

  // ---- Skid Mark Tuning ----
  bind('skidGripThreshold', 'skidGripThreshold', parseFloat1, fmt2);
  bind('skidFadeRate',      'skidFadeRate',      parseFloat1, fmt1);
  bind('skidWidthMin',      'skidWidthMin',      parseFloat1, fmt2);
  bind('skidWidthMax',      'skidWidthMax',      parseFloat1, fmt2);
  bind('skidAlphaMin',      'skidAlphaMin',      parseFloat1, fmt2);
  bind('skidAlphaMax',      'skidAlphaMax',      parseFloat1, fmt2);
  bind('skidJerkBoostMax',  'skidJerkBoostMax',  parseFloat1, fmt2);
  bind('skidMaxSegments',   'skidMaxSegments',   parseInt1,   fmtInt);

  // ---- Paint Mixing ----
  bind('paintPickupRate',     'paintPickupRate',     parseFloat1, fmt1);
  bind('paintSatPickupRate',  'paintSatPickupRate',  parseFloat1, fmt2);
  bind('paintDepletionRate',  'paintDepletionRate',  parseFloat1, fmt2);
  bind('paintMinSat',         'paintMinSat',         parseFloat1, fmt2);
  bind('paintDecalDepletion', 'paintDecalDepletion', parseFloat1, fmt2);

  // ---- Motion Blur Advanced ----
  bind('blurSpeedWeight',   'blurSpeedWeight',   parseFloat1, fmt2);
  bind('blurDriftWeight',   'blurDriftWeight',   parseFloat1, fmt2);
  bind('blurAngularWeight', 'blurAngularWeight', parseFloat1, fmt2);
  bind('blurJerkWeight',    'blurJerkWeight',    parseFloat1, fmt2);
  bind('blurAttackRate',    'blurAttackRate',    parseFloat1, fmt2);
  bind('blurDecayRate',     'blurDecayRate',     parseFloat1, fmt3);
  bind('blurMaxOffset',     'blurMaxOffset',     parseFloat1, fmt1);

  // ---- Grip State Machine ----
  bind('gripLossThreshold',     'gripLossThreshold',     parseFloat1, fmt2);
  bind('gripRecoveryThreshold', 'gripRecoveryThreshold', parseFloat1, fmt2);
  bind('gripEmaStable',         'gripEmaStable',         parseFloat1, fmt2);
  bind('gripEmaSlipping',       'gripEmaSlipping',       parseFloat1, fmt2);

  // ---- SAT Steering Parameters ----
  bind('pneumaticTrail',         'pneumaticTrail',         parseFloat1, fmt3);
  bind('steeringColumnInertia',  'steeringColumnInertia',  parseFloat1, fmt2);
  bind('steeringViscousDamping', 'steeringViscousDamping', parseFloat1, fmt2);
  bind('steeringCoulombFriction','steeringCoulombFriction',parseFloat1, fmt2);
  bind('steeringDragRange',      'steeringDragRange',      parseFloat1, fmtInt);
  bind('steeringSelfCenterRate', 'steeringSelfCenterRate', parseFloat1, fmt1);
  bind('maxFrontWheelAngle',     'maxFrontWheelAngle',     parseFloat1, fmt2);

  // ---- Sound Parameters (bind to state.soundParams) ----
  bindSound('masterVol',      'masterVol',      parseFloat1, fmt2);
  bindSound('mainGain',       'mainGain',       parseFloat1, fmt2);
  bindSound('mainFltLow',     'mainFltLow',     parseInt1,   fmtInt);
  bindSound('mainFltHigh',    'mainFltHigh',    parseInt1,   fmtInt);
  bindSound('mainFltQ',       'mainFltQ',       parseFloat1, fmt2);
  bindSound('subGain',        'subGain',        parseFloat1, fmt2);
  bindSound('subMult',        'subMult',        parseFloat1, fmt2);
  bindSound('harmonicEnable', 'harmonicEnable', (s) => s === 'on', (v) => v ? 'ON' : 'OFF');
  bindSound('harmonicGain',   'harmonicGain',   parseFloat1, fmt2);
  bindSound('harmonicMult',   'harmonicMult',   parseFloat1, fmt2);
  bindSound('noiseGain',      'noiseGain',      parseFloat1, fmt2);
  bindSound('noiseLow',       'noiseLow',       parseInt1,   fmtInt);
  bindSound('noiseHigh',      'noiseHigh',      parseInt1,   fmtInt);
  bindSound('noiseQ',         'noiseQ',         parseFloat1, fmt2);
  bindSound('turboEnable',    'turboEnable',    (s) => s === 'on', (v) => v ? 'ON' : 'OFF');
  bindSound('turboGain',      'turboGain',      parseFloat1, fmt2);
  bindSound('turboMult',      'turboMult',      parseInt1,   fmtInt);
  bindSound('distDrive',      'distDrive',      parseFloat1, fmt2);
  bindSound('reverbMix',      'reverbMix',      parseFloat1, fmt2);
  // Exhaust bass layer
  bindSound('exhaustBassGain', 'exhaustBassGain', parseFloat1, fmt2);
  bindSound('exhaustBassTune', 'exhaustBassTune', parseInt1,   fmtInt);
  bindSound('exhaustBassQ',    'exhaustBassQ',    parseFloat1, fmt1);
  // Drift screech
  bindSound('driftScreechGain','driftScreechGain',parseFloat1, fmt2);
  // Pulse synthesis parameters
  bindSound('pulseDecayMs',    'pulseDecayMs',    parseInt1,   fmtInt);
  bindSound('jitterAmount',    'jitterAmount',    parseFloat1, fmt2);
  bindSound('derivativeMix',   'derivativeMix',   parseFloat1, fmt2);
  bindSound('exhaustConvMix',  'exhaustConvMix',  parseFloat1, fmt2);
  bindSound('agcThreshold',    'agcThreshold',    parseInt1,   fmtInt);

  // Balloon collision sound bindings
  bindSound('popMasterGain',       'popMasterGain',       parseFloat1, fmt2);
  bindSound('popBassTone',         'popBassTone',         parseFloat1, fmt2);
  bindSound('popCrackBrightness',  'popCrackBrightness',  parseFloat1, fmt2);
  bindSound('popSprayAmount',      'popSprayAmount',      parseFloat1, fmt2);
  bindSound('popDistortion',       'popDistortion',       parseFloat1, fmt2);
  bindSound('popSpeedSensitivity', 'popSpeedSensitivity', parseFloat1, fmt2);
  bindSound('popPitchShift',       'popPitchShift',       parseInt1,   fmtInt);

  // Helper function to bind sound parameters (stored in state.soundParams)
  function bindSound(elementId, paramName, parseValue, formatDisplay) {
    const element = document.getElementById(elementId);
    const label = document.getElementById(elementId + 'Value');
    if (!element) return;

    // Initialize from state.soundParams
    const initialValue = element.type === 'checkbox' ? element.checked : parseValue(element.value);
    state.soundParams[paramName] = initialValue;
    if (label) label.textContent = formatDisplay(initialValue);

    // Bind to soundStateManager — updates state, localStorage, and applies to audio nodes
    element.addEventListener('input', () => {
      const value = element.type === 'checkbox' ? element.checked : parseValue(element.value);
      if (label) label.textContent = formatDisplay(value);
      updateSoundParam(paramName, value);
    });

    // Listen for storage changes from other windows (cross-window sync)
    window.addEventListener('storage', (event) => {
      if (event.key === `soundParam_${paramName}`) {
        const newValue = event.newValue === 'true' ? true : event.newValue === 'false' ? false : parseValue(event.newValue);
        state.soundParams[paramName] = newValue;
        if (element.type === 'checkbox') {
          element.checked = newValue;
        } else {
          element.value = newValue;
        }
        if (label) label.textContent = formatDisplay(newValue);
      }
    });
  }

  // ---- Engine toggle button ----
  const engineToggleButton = document.getElementById('engineToggle');
  if (engineToggleButton) {
    engineToggleButton.addEventListener('click', () => {
      state.engine.isRunning = !state.engine.isRunning;
      if (state.engine.isRunning) {
        state.engine.isStalled = false;
        state.engine.rpm = 800; // restart at idle
        engineToggleButton.textContent = 'Engine ON';
        engineToggleButton.style.background = '#2ecc71';
      } else {
        engineToggleButton.textContent = 'Engine OFF';
        engineToggleButton.style.background = '#e74c3c';
      }
    });
  }

  // ---- Preset System ----
  initPresets();
}

// =============================================================
// PRESET SYSTEM
// =============================================================

// Five physically coherent presets. Each overrides state.params and
// state.soundParams. After applying, all sliders are refreshed.

const PRESETS = {
  driftCar: {
    label: '🚗 Drift Car',
    params: {
      mass: 900, tireFrictionCoeff: 1.55, peakSlipAngleDeg: 8.0,
      tireRelaxationLength: 0.22, pneumaticTrail: 0.025,
      yawDampingCoeff: 800, cogHeight: 0.55, brakeForceMult: 1.0,
      aeroDownforce: 0.5, finalDriveRatio: 4.2, rollResistCoeff: 0.006,
      brakeForce: 8000, steeringSelfCenterRate: 3.0, steeringCoulombFriction: 0.03,
      steeringViscousDamping: 0.3, steeringColumnInertia: 0.05,
    },
    soundParams: {
      exhaustBassGain: 0.6, exhaustBassTune: 55, exhaustBassQ: 2.0,
      driftScreechGain: 0.9, mainGain: 0.35, subGain: 0.3,
    },
  },
  heavySUV: {
    label: '🚙 Heavy SUV',
    params: {
      mass: 2200, tireFrictionCoeff: 1.15, peakSlipAngleDeg: 5.5,
      tireRelaxationLength: 0.45, pneumaticTrail: 0.055,
      yawDampingCoeff: 3500, cogHeight: 1.3, brakeForceMult: 1.2,
      aeroDownforce: 0.2, finalDriveRatio: 3.5, rollResistCoeff: 0.018,
      brakeForce: 18000, steeringSelfCenterRate: 8.0, steeringCoulombFriction: 0.12,
      steeringViscousDamping: 1.2, steeringColumnInertia: 0.25,
    },
    soundParams: {
      exhaustBassGain: 1.0, exhaustBassTune: 45, exhaustBassQ: 1.5,
      driftScreechGain: 0.25, mainGain: 0.28, subGain: 0.45,
    },
  },
  goKart: {
    label: '🏎️ Go-Kart',
    params: {
      mass: 165, tireFrictionCoeff: 2.1, peakSlipAngleDeg: 11.0,
      tireRelaxationLength: 0.12, pneumaticTrail: 0.010,
      yawDampingCoeff: 200, cogHeight: 0.25, brakeForceMult: 0.7,
      aeroDownforce: 0.05, finalDriveRatio: 6.5, rollResistCoeff: 0.003,
      brakeForce: 3500, steeringSelfCenterRate: 2.0, steeringCoulombFriction: 0.01,
      steeringViscousDamping: 0.1, steeringColumnInertia: 0.01,
      cylinderCount: 1,
    },
    soundParams: {
      exhaustBassGain: 0.1, exhaustBassTune: 120, exhaustBassQ: 0.8,
      driftScreechGain: 0.4, mainGain: 0.4, subGain: 0.1,
    },
  },
  iceSurface: {
    label: '❄️ Ice Surface',
    params: {
      mass: 1200, tireFrictionCoeff: 0.28, peakSlipAngleDeg: 4.0,
      tireRelaxationLength: 0.65, pneumaticTrail: 0.015,
      yawDampingCoeff: 450, cogHeight: 0.62, brakeForceMult: 0.4,
      aeroDownforce: 0.0, finalDriveRatio: 3.8, rollResistCoeff: 0.001,
      brakeForce: 4500, steeringSelfCenterRate: 1.5, steeringCoulombFriction: 0.02,
      steeringViscousDamping: 0.2, steeringColumnInertia: 0.07,
    },
    soundParams: {
      exhaustBassGain: 0.3, exhaustBassTune: 65, exhaustBassQ: 1.2,
      driftScreechGain: 0.15, mainGain: 0.3, subGain: 0.25,
    },
  },
  stockCar: {
    label: '🔧 Stock Road Car',
    params: {
      mass: 1350, tireFrictionCoeff: 1.35, peakSlipAngleDeg: 7.0,
      tireRelaxationLength: 0.30, pneumaticTrail: 0.038,
      yawDampingCoeff: 1800, cogHeight: 0.65, brakeForceMult: 1.0,
      aeroDownforce: 0.3, finalDriveRatio: 3.9, rollResistCoeff: 0.010,
      brakeForce: 12000, steeringSelfCenterRate: 6.0, steeringCoulombFriction: 0.06,
      steeringViscousDamping: 0.6, steeringColumnInertia: 0.10,
    },
    soundParams: {
      exhaustBassGain: 0.35, exhaustBassTune: 65, exhaustBassQ: 1.2,
      driftScreechGain: 0.55, mainGain: 0.30, subGain: 0.25,
    },
  },
};

function applyPreset(presetKey) {
  const preset = PRESETS[presetKey];
  if (!preset) return;
  // Apply params
  Object.assign(state.params, preset.params);
  // Apply soundParams
  Object.assign(state.soundParams, preset.soundParams);
  // Refresh all slider DOM values to match new state
  refreshAllSliders();
}

// Walk all range inputs and checkboxes and set their values from state.params / state.soundParams.
function refreshAllSliders() {
  document.querySelectorAll('input[type="range"]').forEach(el => {
    const id = el.id;
    let val;
    if (state.soundParams[id] !== undefined) {
      val = state.soundParams[id];
    } else if (state.params[id] !== undefined) {
      val = state.params[id];
    } else {
      return;
    }
    el.value = val;
    const label = document.getElementById(id + 'Value');
    if (label) label.textContent = typeof val === 'number' ? (val % 1 === 0 ? val : val.toFixed(2)) : val;
  });
}

function serializeCurrentState() {
  return { params: { ...state.params }, soundParams: { ...state.soundParams } };
}

function initPresets() {
  // Built-in preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.preset;
      applyPreset(key);
    });
  });

  // Export button
  const exportBtn = document.getElementById('exportPreset');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const data = serializeCurrentState();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `verlet-preset-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // Import button
  const importInput = document.getElementById('importPreset');
  if (importInput) {
    importInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (data.params) Object.assign(state.params, data.params);
          if (data.soundParams) Object.assign(state.soundParams, data.soundParams);
          refreshAllSliders();
        } catch (err) {
          console.warn('[Preset] Import failed:', err);
        }
        importInput.value = ''; // allow re-importing same file
      };
      reader.readAsText(file);
    });
  }

  // ---- Engine toggle button ----
  const engineToggleButton = document.getElementById('engineToggle');
  if (engineToggleButton) {
    engineToggleButton.addEventListener('click', () => {
      state.engine.isRunning = !state.engine.isRunning;
      if (state.engine.isRunning) {
        state.engine.isStalled = false;
        state.engine.rpm = 800;
        engineToggleButton.textContent = 'Engine ON';
        engineToggleButton.style.background = '#2ecc71';
      } else {
        engineToggleButton.textContent = 'Engine OFF';
        engineToggleButton.style.background = '#e74c3c';
      }
    });
  }
}


// =============================================================
// INFO BAR
// =============================================================

// Updates the text displays in the info bar at the bottom of the simulation canvas.
// Called once per animation frame from main.js.
// Reads from state.body and state.engine.
export function updateInfoBar() {
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

  setInfoCell('trailDisplay',
    `${trail.arrows.length} arrows`);

  // Render FPS and physics ticks-per-second (set by main.js into state.loop).
  setInfoCell('renderFpsDisplay',
    `${Math.round(state.loop.renderFps)} fps`);
  // Physics Hz is the slider value — the dynamic measurement was showing
  // display framerate (bug: 1 tick / wallFrameTime = displayHz, not physicsHz).
  setInfoCell('physicsTpsDisplay',
    `${state.params.simulationFps}Hz · max ${state.params.maxSubstepsPerFrame}/f · drop ${state.loop.droppedSubsteps} (last ${state.loop.droppedSubstepsLastFrame})`);
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
    const el = e.target;
    if (el.type === 'range' || el.type === 'text' || el.type === 'number') {
      console.log(`[UI] ${el.id} = ${el.value}`);
    }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    // Log select elements and checkboxes on change.
    if (el.tagName === 'SELECT' || el.type === 'checkbox') {
      console.log(`[UI] ${el.id} = ${el.value}`);
    }
  });
  document.addEventListener('click', (e) => {
    const el = e.target;
    if (el.tagName === 'BUTTON' && el.id) {
      console.log(`[UI] ${el.id} clicked`);
    }
  });
}


// =============================================================
// GAUGE REGISTRY — declarative gauge creation system
// =============================================================
//
// Usage:
//   const entry = registerGauge({
//     label:     'FL Grip',
//     getValue:  () => state.wheelGrip.frontLeft,
//     min:       0,
//     max:       1,
//     title:     'FL GRIP',
//     subtitle:  'traction',
//     majorStep: 0.25,
//     minorDivisions: 5,
//     redFrom:   null,
//     labelFormatter: v => v.toFixed(2),
//   });
//
// Call drawRegisteredGauges() each frame to render all registered gauges.
// Gauges are auto-placed in the gauge row container.
//

const gaugeRegistry = [];

/**
 * Registers a new analog gauge.
 * Creates a canvas element, needle physics instance (if not provided), and adds to the registry.
 *
 * @param {Object} config
 * @param {string} config.label - Short name for the badge
 * @param {Function} config.getValue - Function returning the current value (called each frame)
 * @param {number} config.min - Minimum value
 * @param {number} config.max - Maximum value
 * @param {string} [config.title] - Gauge face title (defaults to label)
 * @param {string} [config.subtitle] - Gauge face subtitle
 * @param {number} [config.majorStep] - Tick interval
 * @param {number} [config.minorDivisions] - Subdivisions between major ticks
 * @param {number|null} [config.redFrom] - Value above which red zone starts
 * @param {Function} [config.labelFormatter] - Formats tick labels
 * @param {Object} [config.needle] - Pre-created needle physics instance (skips creation if provided)
 * @param {string} [config.customRenderer] - Name of custom render function (e.g. 'drawYawStabilityGauge')
 * @param {string} [config.axle] - For friction gauges: 'front' or 'rear'
 * @param {Array} [config.radarNeedles] - For drift radar: array of 6 needle physics instances
 * @param {string} [config.containerId] - DOM id of parent container (default: 'gauge-row')
 * @returns {Object} The registry entry (for external reference if needed)
 */
export function registerGauge(config) {
  const {
    label,
    getValue,
    min = 0,
    max = 1,
    title = label,
    subtitle = '',
    majorStep = (max - min) / 4,
    minorDivisions = 5,
    redFrom = null,
    labelFormatter = (v) => String(Math.round(v)),
    needle = null,  // Optional pre-created needle
    customRenderer = null,  // Optional custom renderer name
    axle = null,  // Optional axle identifier for friction gauges
    radarNeedles = null,  // Optional array of needles for radar
    containerId = 'gauge-row',
  } = config;

  // Create DOM structure: gauge-frame > gauge-inner > canvas + badge
  const container = document.getElementById(containerId);
  if (!container) {
    console.warn(`[GaugeRegistry] Container #${containerId} not found`);
    return null;
  }

  const frame = document.createElement('div');
  frame.className = 'gauge-frame';

  const inner = document.createElement('div');
  inner.className = 'gauge-inner';

  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 780;
  canvas.className = 'gauge-canvas';
  const ctx = canvas.getContext('2d');

  const badge = document.createElement('div');
  badge.className = 'badge';
  badge.innerHTML = `<b>${title}</b> ${subtitle}`;

  inner.appendChild(canvas);
  inner.appendChild(badge);
  frame.appendChild(inner);
  container.appendChild(frame);

  // Use provided needle or create a new one (if not a custom renderer without needle).
  const needleInstance = needle || (customRenderer && !needle ? null : createNeedlePhysics());

  const entry = {
    label,
    getValue,
    min,
    max,
    title,
    subtitle,
    majorStep,
    minorDivisions,
    redFrom,
    labelFormatter,
    canvas,
    ctx,
    needle: needleInstance,
    customRenderer,  // Store custom renderer name
    axle,  // Store axle identifier if applicable
    radarNeedles,  // Store radar needles if applicable
  };

  gaugeRegistry.push(entry);
  return entry;
}


/**
 * Returns the gauge registry array (for main.js to iterate).
 */
export function getGaugeRegistry() {
  return gaugeRegistry;
}
