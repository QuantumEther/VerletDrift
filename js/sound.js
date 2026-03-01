// =============================================================
// js/sound.js — Engine Sound Module
// =============================================================
// Synthesizes a Pagani Zonda F V12 character engine sound using
// the Web Audio API. All sound is procedural — no samples.
//
// ZONDA F ACOUSTIC SIGNATURE (7.3L NA V12, AMG M297):
//   - 12 cylinders, exotic firing order (1-7-5-11-3-9-6-12-2-8-4-10)
//   - Redline 6150 RPM, peak torque at 4000 RPM
//   - Deep bark at low RPM → vocal howl at high RPM
//   - Intake resonance: high-harmonic "scream" at full throttle/high RPM
//   - Exhaust pops (backfire/deceleration burble) on throttle lift
//   - Sharp manual gearbox crack on gear change
//   - Tire squeal on traction loss
//
// AUDIO NODE GRAPH:
//   [mainOsc sawtooth]  → mainGain → mainFilter → summingGain
//   [subOsc sine]       → subGain              → summingGain
//   [harmonicOsc tri]   → harmonicGain         → summingGain
//   [intakeOsc sine]    → intakeGain           → summingGain  (intake howl)
//   [noiseBuffer]       → noiseBandpass → noiseGain → summingGain
//   summingGain → waveshaper → dryGain → masterGain → output
//                           → convolver → wetGain → masterGain
//
// One-shot sounds (gear crack, exhaust pop, tire squeal) are created
// as transient BufferSource nodes connected directly to masterGain.
//
// Exports:
//   startEngine()
//   stopEngine()
//   updateEngineSound(rpm, maxRpm, throttle, prevThrottle, isSlipping, gear)
//   triggerGearChange(isUpshift)
//   setSoundParam(paramName, newValue)
// =============================================================

import state from './state.js';

// =============================================================
// MODULE-LEVEL AUDIO NODES
// =============================================================

let audioCtx         = null;
let masterGain       = null;
let summingGain      = null;
let waveshaper       = null;
let dryGain          = null;
let wetGain          = null;
let convolver        = null;

// Continuous oscillator sources
let mainOsc          = null;   // Sawtooth — main engine bark
let subOsc           = null;   // Sine — sub bass body
let harmonicOsc      = null;   // Triangle — upper harmonic texture
let intakeOsc        = null;   // Sine — intake resonance / induction howl
let noiseSource      = null;   // White noise — exhaust/intake hiss

// Per-source gain and filter nodes
let mainGainNode     = null;
let mainFilter       = null;
let subGainNode      = null;
let harmonicGainNode = null;
let intakeGainNode   = null;   // Intake howl gain (ramps at high RPM+throttle)
let intakeBandpass   = null;   // Bandpass shaping for intake howl
let noiseBandpass    = null;
let noiseGainNode    = null;

// =============================================================
// STATE
// =============================================================

let isRunning        = false;
let lastUpdateTime   = -1;
let prevThrottleRef  = 0;     // previous throttle for deceleration pop detection
let exhaustPopAccum  = 0;     // time accumulator for random exhaust pop scheduling
let nextPopDelay     = 0;     // seconds until next exhaust pop (Poisson process)
let skidSoundActive  = false; // true while squeal sound is playing
let skidGainNode     = null;  // gain node for continuous skid sound
let skidNoiseSource  = null;  // noise source for skid sound
let skidBandpass     = null;  // bandpass for skid squeal frequency

// Drift screech — separate high-pitched noise layer that activates at high drift
let driftScreechActive = false;
let driftScreechSource = null;  // looping noise buffer source
let driftScreechFilter = null;  // high-pass + bandpass for screech texture
let driftScreechGain   = null;  // gain node, modulated by driftIntensity

// Exhaust bass layer — low-frequency rumble independent of main osc
let exhaustBassOsc    = null;  // low oscillator (sawtooth/sine)
let exhaustBassFilter = null;  // bandpass around 60-120 Hz
let exhaustBassGain   = null;  // gain node

const DEBOUNCE_THRESHOLD = 0.001; // seconds
const SMOOTH_TIME        = 0.04;  // ramp time for AudioParam changes

// Zonda F: RPM range
const MIN_RPM  = 600;
const IDLE_RPM = 800;

// =============================================================
// HELPERS — Buffer creation
// =============================================================

// Fills a mono AudioBuffer with white noise. Used for noise source and transients.
function createNoiseBuffer(ctx, durationSeconds) {
  const sampleRate = ctx.sampleRate;
  const length     = Math.floor(sampleRate * durationSeconds);
  const buffer     = ctx.createBuffer(1, length, sampleRate);
  const data       = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

// Generates a stereo exponentially-decaying noise impulse for reverb convolver.
function createReverbImpulse(ctx, durationSeconds, decayRate) {
  const sampleRate = ctx.sampleRate;
  const length     = Math.floor(sampleRate * durationSeconds);
  const buffer     = ctx.createBuffer(2, length, sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const timeNormalized = i / sampleRate;
      const envelope       = Math.exp(-decayRate * timeNormalized);
      data[i]              = (Math.random() * 2 - 1) * envelope;
    }
  }
  return buffer;
}

// Builds a soft-clip waveshaper curve. drive=0 is linear, drive=1 is heavy clip.
function buildDistortionCurve(drive) {
  const sampleCount = 2048;
  const curve       = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const x        = (i / (sampleCount - 1)) * 2 - 1;
    const linearPart  = 1 - drive;
    const clippedPart = drive;
    curve[i] = linearPart * x + clippedPart * Math.tanh(3 * x);
  }
  return curve;
}

function setDistortionCurve(drive) {
  if (waveshaper) waveshaper.curve = buildDistortionCurve(drive);
}

// =============================================================
// ZONDA F SOUND CHARACTER — frequency and harmonic calculation
// =============================================================

// Firing frequency for a 4-stroke engine:
//   firings/sec = RPM/60 × cylinders/2
//   = RPM × cylinders / 120
//
// For V12 with exotic firing order: the fundamental firing frequency
// is the same formula, but the HARMONIC CONTENT is richer because
// pairs of cylinders fire 60° apart (not evenly spaced like a smooth V12).
// We model this by boosting odd harmonics in the filter.
function computeFiringFrequency(rpm, cylinderCount) {
  return rpm * cylinderCount / 120;
}

// Intake resonance frequency: at high RPM and full throttle, the intake
// trumpets on a large NA V12 resonate at approximately 4× the firing frequency.
// This is the "scream" or "howl" people describe on the Zonda F.
function computeIntakeFrequency(firingFreq) {
  return firingFreq * 4.2;
}

// =============================================================
// INTERNAL — Apply all continuous audio parameters
// =============================================================

function applyAllAudioParams(rpm, maxRpm, throttlePosition) {
  if (!isRunning || !audioCtx) return;

  const cylinderCount = state.params.cylinderCount || 12;
  const firingFreq    = computeFiringFrequency(rpm, cylinderCount);
  const rpmNorm       = Math.max(0, Math.min(1, (rpm - MIN_RPM) / (maxRpm - MIN_RPM)));

  const now    = audioCtx.currentTime;
  const rampTo = now + SMOOTH_TIME;

  // ── Master volume ─────────────────────────────────────────
  masterGain.gain.linearRampToValueAtTime(state.soundParams.masterVol, rampTo);

  // ── Main oscillator (sawtooth — engine bark) ──────────────
  // Filter sweeps from mainFltLow at idle to mainFltHigh at redline.
  // At high RPM the filter opens up, revealing the harsh top-end character.
  const mainCutoff = state.soundParams.mainFltLow +
    rpmNorm * (state.soundParams.mainFltHigh - state.soundParams.mainFltLow);

  mainOsc.frequency.linearRampToValueAtTime(firingFreq, rampTo);
  mainGainNode.gain.linearRampToValueAtTime(state.soundParams.mainGain, rampTo);
  mainFilter.frequency.linearRampToValueAtTime(mainCutoff, rampTo);
  mainFilter.Q.linearRampToValueAtTime(state.soundParams.mainFltQ, rampTo);

  // ── Sub oscillator (sine — deep body thump) ───────────────
  // Sub runs at subMult × firing frequency for the low chest-feel.
  subOsc.frequency.linearRampToValueAtTime(firingFreq * state.soundParams.subMult, rampTo);
  subGainNode.gain.linearRampToValueAtTime(state.soundParams.subGain, rampTo);

  // ── Harmonic oscillator (triangle — upper texture) ────────
  const harmonicActive = state.soundParams.harmonicEnable ? state.soundParams.harmonicGain : 0;
  harmonicOsc.frequency.linearRampToValueAtTime(firingFreq * state.soundParams.harmonicMult, rampTo);
  harmonicGainNode.gain.linearRampToValueAtTime(harmonicActive, rampTo);

  // ── Intake resonance / induction howl (Zonda signature) ───
  // Only audible at high RPM (>70% of redline) and high throttle (>0.6).
  // Models the intake trumpet resonance of the AMG M297 at full chat.
  // Gain ramps smoothly so it doesn't snap on/off.
  const intakeRpmFactor      = Math.max(0, (rpmNorm - 0.55) / 0.45); // 0 below 55%, 1 at redline
  const intakeThrottleFactor = Math.max(0, (throttlePosition - 0.5) / 0.5); // 0 below 50% throttle
  const intakeGainValue      = intakeRpmFactor * intakeThrottleFactor * 0.18;
  const intakeFreq           = computeIntakeFrequency(firingFreq);

  intakeOsc.frequency.linearRampToValueAtTime(intakeFreq, rampTo);
  intakeBandpass.frequency.linearRampToValueAtTime(intakeFreq * 1.1, rampTo);
  intakeBandpass.Q.linearRampToValueAtTime(3.0, rampTo);
  intakeGainNode.gain.linearRampToValueAtTime(intakeGainValue, rampTo);

  // ── Turbo oscillator (optional, legacy slider) ────────────
  // On the Zonda F (NA) this is 0. But the slider exists for experimentation.
  // We expose it under the existing soundParams.turboEnable/turboGain/turboMult.

  // ── Exhaust / intake noise (bandpass white noise) ─────────
  // Center frequency climbs from noiseLow at idle to noiseHigh at redline.
  // Throttle boost makes the intake hiss louder at full throttle.
  const noiseCenter    = state.soundParams.noiseLow +
    rpmNorm * (state.soundParams.noiseHigh - state.soundParams.noiseLow);
  const noiseGainBoost = state.soundParams.noiseGain * (1 + throttlePosition * 0.4);

  noiseGainNode.gain.linearRampToValueAtTime(noiseGainBoost, rampTo);
  noiseBandpass.frequency.linearRampToValueAtTime(noiseCenter, rampTo);
  noiseBandpass.Q.linearRampToValueAtTime(state.soundParams.noiseQ, rampTo);

  // ── Distortion and reverb ─────────────────────────────────
  setDistortionCurve(state.soundParams.distDrive);
  dryGain.gain.linearRampToValueAtTime(1 - state.soundParams.reverbMix, rampTo);
  wetGain.gain.linearRampToValueAtTime(state.soundParams.reverbMix, rampTo);
}

// =============================================================
// ONE-SHOT SOUNDS — transient BufferSource nodes
// =============================================================

// Creates and plays a short synthesized sound, self-contained.
// The node auto-disconnects when playback ends.
function playOneShot(buffer, gainValue, pitchRate) {
  if (!audioCtx || !masterGain) return;
  const source     = audioCtx.createBufferSource();
  const gainNode   = audioCtx.createGain();
  source.buffer    = buffer;
  source.playbackRate.value = pitchRate || 1.0;
  gainNode.gain.value = gainValue;
  source.connect(gainNode);
  gainNode.connect(masterGain);
  source.start();
}

// ── GEAR CHANGE CRACK ─────────────────────────────────────────
// A short mechanical snap. Upshift = higher pitch, crisper.
// Downshift = lower, heftier crack + brief RPM bark.
//
// Synthesis: very short noise burst shaped by a fast exponential decay.
// The "crack" character comes from the initial transient before the decay.
export function triggerGearChange(isUpshift) {
  if (!audioCtx || !isRunning) return;

  const sampleRate    = audioCtx.sampleRate;
  const durationSecs  = isUpshift ? 0.08 : 0.14;
  const bufferLength  = Math.round(sampleRate * durationSecs);
  const buffer        = audioCtx.createBuffer(1, bufferLength, sampleRate);
  const data          = buffer.getChannelData(0);

  // Upshift: fast decay, high frequency click.
  // Downshift: slower decay, lower frequency thud.
  const decayRate  = isUpshift ? 60 : 30;
  const toneFreq   = isUpshift ? 280 : 140;
  const noiseMix   = isUpshift ? 0.7 : 0.5; // more noise on upshift = mechanical snap

  for (let i = 0; i < bufferLength; i++) {
    const timeSeconds  = i / sampleRate;
    const envelope     = Math.exp(-decayRate * timeSeconds);
    const toneComp     = Math.sin(2 * Math.PI * toneFreq * timeSeconds);
    const noiseComp    = Math.random() * 2 - 1;
    data[i] = envelope * (noiseMix * noiseComp + (1 - noiseMix) * toneComp);
  }

  const gainValue = isUpshift ? 0.35 : 0.5;
  playOneShot(buffer, gainValue*2.000, 1.0);

  // Downshift: also play a brief RPM blip bark (the sound of the throttle blip).
  if (!isUpshift) {
    setTimeout(() => {
      if (!audioCtx || !isRunning) return;
      const blipLength = Math.round(audioCtx.sampleRate * 0.06);
      const blipBuf    = audioCtx.createBuffer(1, blipLength, audioCtx.sampleRate);
      const blipData   = blipBuf.getChannelData(0);
      const blipFreq   = computeFiringFrequency(
        state.engine.rpm * 1.4, // blip raises RPM momentarily
        state.params.cylinderCount || 12
      );
      for (let i = 0; i < blipLength; i++) {
        const t   = i / audioCtx.sampleRate;
        const env = Math.exp(-25 * t);
        blipData[i] = env * Math.sin(2 * Math.PI * blipFreq * t) * 0.6;
      }
      playOneShot(blipBuf, 0.4*2.000, 1.0);
    }, 30); // 30ms after the crack
  }
}

// ── EXHAUST POPS / BACKFIRE (deceleration burble) ─────────────
// Called when throttle drops from high to low at high RPM.
// Each pop: short thump + bandpass noise burst, mimics hot exhaust gas ignition.
function playExhaustPop(rpm, cylinderCount, volumeOverride) {
  if (!audioCtx || !isRunning) return;

  const sampleRate   = audioCtx.sampleRate;
  // Pop duration: 25–55ms — longer than before for more audible crack
  const durationSecs = 0.025 + Math.random() * 0.03;
  const bufferLength = Math.round(sampleRate * durationSecs);
  const buffer       = audioCtx.createBuffer(1, bufferLength, sampleRate);
  const data         = buffer.getChannelData(0);

  // Two components: low thump (firing frequency) + high crack (2× freq noise)
  const baseFreq  = computeFiringFrequency(rpm, cylinderCount);
  const crackFreq = baseFreq * (1.5 + Math.random() * 0.8);
  const thumpFreq = baseFreq * (0.7 + Math.random() * 0.15);

  for (let i = 0; i < bufferLength; i++) {
    const t = i / sampleRate;
    // Fast attack, exponential decay — classic percussive transient
    const env    = Math.exp(-18 * t);          // decay in ~55ms
    const noise  = Math.random() * 2 - 1;
    const crack  = Math.sin(2 * Math.PI * crackFreq * t);
    const thump  = Math.sin(2 * Math.PI * thumpFreq * t);
    data[i] = env * (0.45 * noise + 0.30 * crack + 0.25 * thump);
  }

  // Each pop slightly different volume and pitch for organic feel
  const baseVol   = volumeOverride !== undefined ? volumeOverride : 0.5;
  const gainValue = baseVol * (0.7 + Math.random() * 0.6);
  const pitchRate = 0.9 + Math.random() * 0.2;
  playOneShot(buffer, gainValue * 2.5, pitchRate);
}

// ── TIRE SQUEAL — continuous filtered noise while slipping ────
// Starts a looping bandpass-noise node when slipping begins,
// stops it when slipping ends. Gain modulates with slip intensity.
function startSkidSound() {
  if (!audioCtx || !isRunning || skidSoundActive) return;

  const noiseBuffer   = createNoiseBuffer(audioCtx, 1.0);
  skidNoiseSource     = audioCtx.createBufferSource();
  skidNoiseSource.buffer = noiseBuffer;
  skidNoiseSource.loop   = true;

  skidBandpass        = audioCtx.createBiquadFilter();
  skidBandpass.type   = 'bandpass';
  skidBandpass.frequency.value = 900;  // Hz — tire squeal center frequency
  skidBandpass.Q.value         = 2.5;

  skidGainNode        = audioCtx.createGain();
  skidGainNode.gain.value = 0;  // Start silent, ramp up

  skidNoiseSource.connect(skidBandpass);
  skidBandpass.connect(skidGainNode);
  skidGainNode.connect(masterGain);
  skidNoiseSource.start();

  skidSoundActive = true;
}

function stopSkidSound() {
  if (!skidSoundActive) return;
  if (skidGainNode) {
    skidGainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);
  }
  setTimeout(() => {
    try { skidNoiseSource && skidNoiseSource.stop(); } catch (_) {}
    try { skidNoiseSource && skidNoiseSource.disconnect(); } catch (_) {}
    try { skidBandpass && skidBandpass.disconnect(); } catch (_) {}
    try { skidGainNode && skidGainNode.disconnect(); } catch (_) {}
    skidNoiseSource = skidBandpass = skidGainNode = null;
    skidSoundActive = false;
  }, 150);
}

function updateSkidSound(isSlipping, lateralSlipSpeed) {
  if (isSlipping && !skidSoundActive) {
    startSkidSound();
  } else if (!isSlipping && skidSoundActive) {
    stopSkidSound();
  }

  if (skidSoundActive && skidGainNode && audioCtx) {
    // Volume proportional to slip severity. lateralSlipSpeed in m/s.
    const slipIntensity = Math.min(lateralSlipSpeed / 8.0, 1.0);
    skidGainNode.gain.linearRampToValueAtTime(
      slipIntensity * 0.3,
      audioCtx.currentTime + 0.05
    );
    // Frequency shifts slightly with speed — higher speed = higher pitch squeal.
    if (skidBandpass) {
      skidBandpass.frequency.linearRampToValueAtTime(
        700 + slipIntensity * 600,
        audioCtx.currentTime + 0.05
      );
    }
  }
}

// =============================================================
// EXPORT — startEngine()
// =============================================================

export function startEngine() {
  if (isRunning) return;

  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const cylinders = state.params.cylinderCount || 12;
  const initFreq  = computeFiringFrequency(MIN_RPM, cylinders);

  // ── Master gain ───────────────────────────────────────────
  masterGain = audioCtx.createGain();
  masterGain.gain.value = state.soundParams.masterVol;

  // ── Summing bus ───────────────────────────────────────────
  summingGain = audioCtx.createGain();
  summingGain.gain.value = 1;

  // ── Distortion ────────────────────────────────────────────
  waveshaper = audioCtx.createWaveShaper();
  waveshaper.oversample = '4x';
  setDistortionCurve(state.soundParams.distDrive);

  // ── Reverb ────────────────────────────────────────────────
  dryGain   = audioCtx.createGain();
  wetGain   = audioCtx.createGain();
  convolver = audioCtx.createConvolver();
  convolver.buffer = createReverbImpulse(audioCtx, 2.0, 3.0);

  summingGain.connect(waveshaper);
  waveshaper.connect(dryGain);
  waveshaper.connect(convolver);
  convolver.connect(wetGain);
  dryGain.connect(masterGain);
  wetGain.connect(masterGain);
  masterGain.connect(audioCtx.destination);

  // ── Main oscillator (sawtooth — engine bark) ──────────────
  mainOsc = audioCtx.createOscillator();
  mainOsc.type = 'sawtooth';
  mainOsc.frequency.value = initFreq;

  mainGainNode = audioCtx.createGain();
  mainGainNode.gain.value = state.soundParams.mainGain;

  mainFilter = audioCtx.createBiquadFilter();
  mainFilter.type = 'lowpass';
  mainFilter.frequency.value = state.soundParams.mainFltLow;
  mainFilter.Q.value = state.soundParams.mainFltQ;

  mainOsc.connect(mainGainNode);
  mainGainNode.connect(mainFilter);
  mainFilter.connect(summingGain);

  // ── Sub oscillator (sine — deep body) ────────────────────
  subOsc = audioCtx.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.value = initFreq * state.soundParams.subMult;

  subGainNode = audioCtx.createGain();
  subGainNode.gain.value = state.soundParams.subGain;

  subOsc.connect(subGainNode);
  subGainNode.connect(summingGain);

  // ── Harmonic oscillator (triangle — upper texture) ────────
  harmonicOsc = audioCtx.createOscillator();
  harmonicOsc.type = 'triangle';
  harmonicOsc.frequency.value = initFreq * state.soundParams.harmonicMult;

  harmonicGainNode = audioCtx.createGain();
  harmonicGainNode.gain.value = state.soundParams.harmonicEnable
    ? state.soundParams.harmonicGain : 0;

  harmonicOsc.connect(harmonicGainNode);
  harmonicGainNode.connect(summingGain);

  // ── Intake resonance oscillator (Zonda intake howl) ───────
  // Sine wave at ~4× firing frequency, narrow bandpass-shaped.
  // Only audible at high RPM + high throttle.
  intakeOsc = audioCtx.createOscillator();
  intakeOsc.type = 'sine';
  intakeOsc.frequency.value = initFreq * 4.2;

  intakeBandpass = audioCtx.createBiquadFilter();
  intakeBandpass.type = 'bandpass';
  intakeBandpass.frequency.value = initFreq * 4.2 * 1.1;
  intakeBandpass.Q.value = 3.0;

  intakeGainNode = audioCtx.createGain();
  intakeGainNode.gain.value = 0; // starts silent

  intakeOsc.connect(intakeBandpass);
  intakeBandpass.connect(intakeGainNode);
  intakeGainNode.connect(summingGain);

  // ── Noise source (exhaust hiss / intake rush) ─────────────
  const noiseBuffer = createNoiseBuffer(audioCtx, 2);
  noiseSource = audioCtx.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  noiseSource.loop   = true;

  noiseBandpass = audioCtx.createBiquadFilter();
  noiseBandpass.type = 'bandpass';
  noiseBandpass.frequency.value = state.soundParams.noiseLow;
  noiseBandpass.Q.value = state.soundParams.noiseQ;

  noiseGainNode = audioCtx.createGain();
  noiseGainNode.gain.value = state.soundParams.noiseGain;

  noiseSource.connect(noiseBandpass);
  noiseBandpass.connect(noiseGainNode);
  noiseGainNode.connect(summingGain);

  // ── Start all continuous sources ──────────────────────────
  mainOsc.start(0);
  subOsc.start(0);
  harmonicOsc.start(0);
  intakeOsc.start(0);
  noiseSource.start(0);

  // ── Exhaust bass layer — low rumble from 60–120 Hz ────────
  // Sawtooth at very low frequency gives exhaust "body" and chest-feel.
  // Independent of firing frequency so it stays fat even at low RPM.
  exhaustBassOsc    = audioCtx.createOscillator();
  exhaustBassOsc.type = 'sawtooth';
  exhaustBassOsc.frequency.value = state.soundParams.exhaustBassTune || 65;

  exhaustBassFilter = audioCtx.createBiquadFilter();
  exhaustBassFilter.type = 'bandpass';
  exhaustBassFilter.frequency.value = state.soundParams.exhaustBassTune || 65;
  exhaustBassFilter.Q.value = state.soundParams.exhaustBassQ || 1.2;

  exhaustBassGain = audioCtx.createGain();
  exhaustBassGain.gain.value = state.soundParams.exhaustBassGain || 0;

  exhaustBassOsc.connect(exhaustBassFilter);
  exhaustBassFilter.connect(exhaustBassGain);
  exhaustBassGain.connect(masterGain); // bypass summing bus — direct to master for fat low end
  exhaustBassOsc.start(0);

  // ── Drift screech layer — raw high-freq noise, dormant until drift ─
  const screechBuffer = createNoiseBuffer(audioCtx, 1.0);
  driftScreechSource  = audioCtx.createBufferSource();
  driftScreechSource.buffer = screechBuffer;
  driftScreechSource.loop   = true;

  // Two-stage filter: highpass to remove mud, then bandpass for screech texture
  const screechHP = audioCtx.createBiquadFilter();
  screechHP.type  = 'highpass';
  screechHP.frequency.value = 2800;
  screechHP.Q.value = 0.7;

  driftScreechFilter = audioCtx.createBiquadFilter();
  driftScreechFilter.type = 'bandpass';
  driftScreechFilter.frequency.value = 5500;
  driftScreechFilter.Q.value = 3.5;

  driftScreechGain = audioCtx.createGain();
  driftScreechGain.gain.value = 0; // silent until drift

  driftScreechSource.connect(screechHP);
  screechHP.connect(driftScreechFilter);
  driftScreechFilter.connect(driftScreechGain);
  driftScreechGain.connect(masterGain);
  driftScreechSource.start(0);
  driftScreechActive = true;

  isRunning      = true;
  lastUpdateTime = -1;
  prevThrottleRef = 0;
  exhaustPopAccum = 0;
  nextPopDelay    = 0.1;

  // Expose audio context globally for balloon pop sounds.
  window.__verletAudioContext = audioCtx;

  window.addEventListener('beforeunload', stopEngine);
}

// =============================================================
// EXPORT — stopEngine()
// =============================================================

export function stopEngine() {
  if (!isRunning) return;

  stopSkidSound();

  // Stop drift screech
  try { driftScreechSource && driftScreechSource.stop(0); } catch (_) {}
  try { driftScreechSource && driftScreechSource.disconnect(); } catch (_) {}
  try { driftScreechFilter && driftScreechFilter.disconnect(); } catch (_) {}
  try { driftScreechGain   && driftScreechGain.disconnect();   } catch (_) {}
  driftScreechSource = driftScreechFilter = driftScreechGain = null;
  driftScreechActive = false;

  // Stop exhaust bass
  try { exhaustBassOsc    && exhaustBassOsc.stop(0);       } catch (_) {}
  try { exhaustBassOsc    && exhaustBassOsc.disconnect();  } catch (_) {}
  try { exhaustBassFilter && exhaustBassFilter.disconnect(); } catch (_) {}
  try { exhaustBassGain   && exhaustBassGain.disconnect(); } catch (_) {}
  exhaustBassOsc = exhaustBassFilter = exhaustBassGain = null;

  const nodesToStop = [mainOsc, subOsc, harmonicOsc, intakeOsc, noiseSource];
  nodesToStop.forEach(node => { try { node && node.stop(0); } catch (_) {} });

  const nodesToDisconnect = [
    mainOsc, subOsc, harmonicOsc, intakeOsc, noiseSource,
    mainGainNode, subGainNode, harmonicGainNode, intakeGainNode, noiseGainNode,
    mainFilter, intakeBandpass, noiseBandpass,
    summingGain, waveshaper, dryGain, wetGain, convolver, masterGain,
  ];
  nodesToDisconnect.forEach(node => {
    try { node && node.disconnect(); } catch (_) {}
  });

  mainOsc = subOsc = harmonicOsc = intakeOsc = noiseSource = null;
  mainGainNode = subGainNode = harmonicGainNode = intakeGainNode = noiseGainNode = null;
  mainFilter = intakeBandpass = noiseBandpass = null;
  summingGain = waveshaper = dryGain = wetGain = convolver = masterGain = null;

  isRunning = false;
  if (audioCtx && audioCtx.state === 'running') audioCtx.suspend();
}

// =============================================================
// EXPORT — updateEngineSound(rpm, maxRpm, throttle, isSlipping, lateralSlipSpeed)
// =============================================================
// Called every physics sub-step from main.js.
// isSlipping:       true when lateral tire slip exceeds threshold
// lateralSlipSpeed: max lateral wheel speed this step (m/s)

export function updateEngineSound(rpm, maxRpm, throttle, isSlipping, lateralSlipSpeed) {
  if (!isRunning || !audioCtx) return;

  if (audioCtx.currentTime - lastUpdateTime < DEBOUNCE_THRESHOLD) return;

  const dt = audioCtx.currentTime - (lastUpdateTime > 0 ? lastUpdateTime : audioCtx.currentTime);
  lastUpdateTime = audioCtx.currentTime;

  if (rpm === 0) {
    masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2);
    prevThrottleRef = 0;
    return;
  }

  masterGain.gain.linearRampToValueAtTime(
    state.soundParams.masterVol,
    audioCtx.currentTime + SMOOTH_TIME
  );

  applyAllAudioParams(rpm, maxRpm, throttle);

  // ── Doppler pitch shift ───────────────────────────────────
  // Simulate perceived pitch change. The camera follows the car, so the
  // effect is subtle but noticeable at high speed.
  if (state.params.dopplerEnabled !== false) {
    const dopplerStrength = state.params.dopplerStrength || 0.008;
    const dopplerMaxShift = state.params.dopplerMaxShift || 0.25;
    const forwardSpeed    = state.body ? state.body.speed * 0.5 : 0;
    const dopplerShift    = Math.max(-dopplerMaxShift, Math.min(dopplerMaxShift, forwardSpeed * dopplerStrength));
    const pitchRatio      = 1.0 + dopplerShift;
    const cylinders       = state.params.cylinderCount || 12;
    const dopplerRampTo   = audioCtx.currentTime + SMOOTH_TIME;
    if (mainOsc) mainOsc.frequency.linearRampToValueAtTime(
      computeFiringFrequency(rpm, cylinders) * pitchRatio, dopplerRampTo);
  }

  // ── Exhaust pops / backfire ───────────────────────────────
  const backfireThreshold  = state.params.backfireThreshold || 1500;
  const exhaustPopVol      = state.params.exhaustPopVolume  || 0.5;
  const exhaustPopDensity  = state.params.exhaustPopDensity || 1.5;
  // Trigger on throttle lift: was >0.25, drop below 0.1
  const throttleDrop       = prevThrottleRef > 0.15 && throttle < 0.08;
  const isDecelerating     = throttleDrop && rpm > backfireThreshold;

  if (isDecelerating) {
    const cylinders  = state.params.cylinderCount || 12;
    const popRate    = (rpm / 1000) * (cylinders / 4) * exhaustPopDensity;
    const cappedRate = Math.min(popRate, 35);

    exhaustPopAccum += dt;
    if (exhaustPopAccum >= nextPopDelay) {
      exhaustPopAccum = 0;
      nextPopDelay    = (1 / cappedRate) * (0.4 + Math.random() * 0.8);
      playExhaustPop(rpm, cylinders, exhaustPopVol);
    }
  } else {
    exhaustPopAccum = 0;
    nextPopDelay    = 0.05;
  }

  // ── Exhaust bass layer update ─────────────────────────────
  if (exhaustBassOsc && exhaustBassGain && exhaustBassFilter) {
    const bassGainTarget = state.soundParams.exhaustBassGain || 0;
    const bassTune       = state.soundParams.exhaustBassTune || 65;
    const bassQ          = state.soundParams.exhaustBassQ    || 1.2;
    // Bass frequency scales slightly with RPM — rises from idle to redline
    const rpmNorm = Math.max(0, Math.min(1, (rpm - 600) / (maxRpm - 600)));
    const bassFreq = bassTune * (1.0 + rpmNorm * 0.6); // shifts up as RPM rises
    exhaustBassOsc.frequency.linearRampToValueAtTime(bassFreq, audioCtx.currentTime + SMOOTH_TIME);
    exhaustBassFilter.frequency.linearRampToValueAtTime(bassFreq, audioCtx.currentTime + SMOOTH_TIME);
    exhaustBassFilter.Q.linearRampToValueAtTime(bassQ, audioCtx.currentTime + SMOOTH_TIME);
    // Volume scales with RPM + throttle
    const bassVol = bassGainTarget * (0.4 + rpmNorm * 0.5 + throttle * 0.1);
    exhaustBassGain.gain.linearRampToValueAtTime(bassVol, audioCtx.currentTime + SMOOTH_TIME);
  }

  // ── Drift screech layer ───────────────────────────────────
  // Activates above drift threshold — independent harsh screech on top of normal squeal
  if (driftScreechGain && driftScreechFilter) {
    const driftIntensity  = state.driftIntensity || 0;
    const screechThresh   = 0.38; // starts above this drift level
    const screechGainPeak = state.soundParams.driftScreechGain !== undefined
      ? state.soundParams.driftScreechGain : 0.55;
    const screechTarget = driftIntensity > screechThresh
      ? Math.min(1.0, (driftIntensity - screechThresh) / 0.35) * screechGainPeak
      : 0;
    // Fast attack, medium release — snap on, fade off
    const screechAlpha = screechTarget > (driftScreechGain.gain.value || 0) ? 0.08 : 0.25;
    driftScreechGain.gain.linearRampToValueAtTime(
      screechTarget,
      audioCtx.currentTime + screechAlpha
    );
    // Pitch rises with drift severity — more violent = higher screech
    if (driftIntensity > screechThresh) {
      const screechFreq = 4000 + (driftIntensity - screechThresh) * 6000;
      driftScreechFilter.frequency.linearRampToValueAtTime(
        Math.min(screechFreq, 9000),
        audioCtx.currentTime + 0.1
      );
    }
  }

  // ── Skid / tire squeal ────────────────────────────────────
  updateSkidSound(isSlipping, lateralSlipSpeed || 0);

  prevThrottleRef = throttle;
}

// =============================================================
// EXPORT — setSoundParam()
// =============================================================

export function setSoundParam(paramName, newValue) {
  if (!audioCtx) return;

  state.soundParams[paramName] = newValue;

  const now  = audioCtx.currentTime;
  const time = now + SMOOTH_TIME;

  switch (paramName) {
    case 'masterVol':
      if (masterGain) masterGain.gain.linearRampToValueAtTime(newValue, time);
      break;
    case 'mainGain':
      if (mainGainNode) mainGainNode.gain.linearRampToValueAtTime(newValue, time);
      break;
    case 'subGain':
      if (subGainNode) subGainNode.gain.linearRampToValueAtTime(newValue, time);
      break;
    case 'harmonicEnable':
    case 'harmonicGain':
      if (harmonicGainNode) {
        const gain = state.soundParams.harmonicEnable ? state.soundParams.harmonicGain : 0;
        harmonicGainNode.gain.linearRampToValueAtTime(gain, time);
      }
      break;
    case 'noiseGain':
      if (noiseGainNode) noiseGainNode.gain.linearRampToValueAtTime(newValue, time);
      break;
    case 'reverbMix':
      if (dryGain && wetGain) {
        dryGain.gain.linearRampToValueAtTime(Math.max(0, 1 - newValue), time);
        wetGain.gain.linearRampToValueAtTime(Math.min(1, newValue), time);
      }
      break;
    default:
      break;
  }
}
