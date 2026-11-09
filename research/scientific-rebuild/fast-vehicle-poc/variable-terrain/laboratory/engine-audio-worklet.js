import {anchorWeights} from './audio-samples.js';

'use strict';

/* =====================================================================
   APEX DYNO — engine acoustic worklet
   A sample-accurate, firing-event driven engine synthesiser.

   The engine is modelled as:
     external RPM -> cylinder firing events -> exhaust pressure pulses
     -> header/collector resonances -> intake + mechanical noise -> stereo
   ===================================================================== */

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
function lerp(a, b, t) { return a + (b - a) * t; }
function finite(x) { return x === x && x !== Infinity && x !== -Infinity; }

/* A cheap, stable tanh-ish soft clipper. */
function softClip(x) {
  if (x < -3) return -1;
  if (x > 3) return 1;
  const x2 = x * x;
  return x * (27 + x2) / (27 + 9 * x2);
}

function asymClip(x) {
  return softClip(x + 0.16) - 0.158;
}

class OnePole {
  constructor() {
    this.y = 0;
    this.a = 0.1;
  }
  set(fc) {
    fc = clamp(fc, 5, sampleRate * 0.45);
    this.a = 1 - Math.exp(-TAU * fc / sampleRate);
  }
  process(x) {
    this.y += (x - this.y) * this.a;
    return this.y;
  }
  reset() { this.y = 0; }
}

class DCBlock {
  constructor() {
    this.x1 = 0;
    this.y1 = 0;
    this.r = 0.996;
  }
  process(x) {
    const y = x - this.x1 + this.r * this.y1;
    this.x1 = x;
    this.y1 = y;
    return y;
  }
  reset() { this.x1 = this.y1 = 0; }
}

class Biquad {
  constructor() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0;
    this.a1 = 0; this.a2 = 0;
    this.x1 = 0; this.x2 = 0;
    this.y1 = 0; this.y2 = 0;
  }
  bandpass(fc, q, clear) {
    fc = clamp(fc, 20, sampleRate * 0.45);
    q = clamp(q, 0.25, 20);
    const w = TAU * fc / sampleRate;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    const c = Math.cos(w);
    this.b0 = alpha / a0;
    this.b1 = 0;
    this.b2 = -alpha / a0;
    this.a1 = -2 * c / a0;
    this.a2 = (1 - alpha) / a0;
    if (clear) this.reset();
  }
  lowpass(fc, q, clear) {
    fc = clamp(fc, 20, sampleRate * 0.45);
    q = clamp(q, 0.25, 20);
    const w = TAU * fc / sampleRate;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    const c = Math.cos(w);
    const b1 = 1 - c;
    this.b0 = b1 * 0.5 / a0;
    this.b1 = b1 / a0;
    this.b2 = b1 * 0.5 / a0;
    this.a1 = -2 * c / a0;
    this.a2 = (1 - alpha) / a0;
    if (clear) this.reset();
  }
  highpass(fc, q, clear) {
    fc = clamp(fc, 20, sampleRate * 0.45);
    q = clamp(q, 0.25, 20);
    const w = TAU * fc / sampleRate;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    const c = Math.cos(w);
    const b1 = 1 + c;
    this.b0 = b1 * 0.5 / a0;
    this.b1 = -b1 / a0;
    this.b2 = b1 * 0.5 / a0;
    this.a1 = -2 * c / a0;
    this.a2 = (1 - alpha) / a0;
    if (clear) this.reset();
  }
  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2
      - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
  reset() {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
}

class Noise {
  constructor(seed) {
    this.s = seed | 0 || 0x9e3779b9;
    this.p0 = this.p1 = this.p2 = this.p3 = this.p4 = this.p5 = this.p6 = 0;
  }
  next() {
    /* xorshift32 */
    let x = this.s;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.s = x | 0;
    return (x | 0) / 2147483648;
  }
  pink() {
    const w = this.next();
    this.p0 = 0.99886 * this.p0 + w * 0.0555179;
    this.p1 = 0.99332 * this.p1 + w * 0.0750759;
    this.p2 = 0.96900 * this.p2 + w * 0.1538520;
    this.p3 = 0.86650 * this.p3 + w * 0.3104856;
    this.p4 = 0.55000 * this.p4 + w * 0.5329522;
    this.p5 = -0.7616 * this.p5 - w * 0.0168980;
    const out = this.p0 + this.p1 + this.p2 + this.p3 + this.p4 + this.p5 + this.p6 + w * 0.5362;
    this.p6 = w * 0.115926;
    return out * 0.11;
  }
}


// Acoustic DSP adapted from the local v5 experiment; no engine or gearbox dynamics.
class EngineProcessor extends AudioWorkletProcessor {
  constructor(options={}) {
    super();
    this.profile = null;
    this.mode = 'off';
    this.sampleRate = sampleRate;
    this.t = 0;
    this.frame = 0;
    this.telemetryCountdown = 0;
    this.noise = new Noise(0x51ed270b);

    this.throttleTarget = 0;
    this.throttle = 0;
    this.rpm = 0;
    this.omega = 0;
    this.angle = 0;
    this.prevAngle = 0;
    this.cycle = 0;
    this.fuel = false;
    this.limiterCut = false;
    this.overrun = false;
    this.cranking = 0;
    this.starter = 0;

    this.lopePhase = 0;

    this.events = [];
    this.eventCount = 0;
    this.banks = 2;

    this.exEnv = [0, 0];
    this.exNoiseEnv = [0, 0];
    this.exCrackEnv = [0, 0];
    this.exPrevEnv = [0, 0];
    this.exDecay = 0.999;
    this.exNoiseDecay = 0.999;
    this.intakeEnv = 0;
    this.intakeDecay = 0.999;

    this.exLp = [new OnePole(), new OnePole()];
    this.exHp = [new DCBlock(), new DCBlock()];
    this.outHpL = new Biquad();
    this.outHpR = new Biquad();
    this.outLpL = new Biquad();
    this.outLpR = new Biquad();
    this.sparkA = [new Biquad(), new Biquad()];
    this.sparkB = [new Biquad(), new Biquad()];
    this.exMidHp = [new Biquad(), new Biquad()];
    this.exCrackHp = [new Biquad(), new Biquad()];
    this.bodyEq = new Biquad();
    this.presenceEq = new Biquad();
    this.outHpL.highpass(46, 0.68, true);
    this.outHpR.highpass(46, 0.68, true);
    this.outLpL.lowpass(7600, 0.62, true);
    this.outLpR.lowpass(7600, 0.62, true);
    this.sparkA[0].bandpass(2400, 1.10, true);
    this.sparkA[1].bandpass(2400, 1.10, true);
    this.sparkB[0].bandpass(4600, 0.85, true);
    this.sparkB[1].bandpass(4600, 0.85, true);
    this.exMidHp[0].highpass(480, 0.72, true);
    this.exMidHp[1].highpass(480, 0.72, true);
    this.exCrackHp[0].highpass(620, 0.70, true);
    this.exCrackHp[1].highpass(620, 0.70, true);
    this.bodyEq.bandpass(130, 0.9, true);
    this.presenceEq.bandpass(2100, 1.1, true);
    this.exModeA = [new Biquad(), new Biquad()];
    this.exModeB = [new Biquad(), new Biquad()];
    this.exModeC = [new Biquad(), new Biquad()];
    this.intakeBp = new Biquad();
    this.intakePulseBp = new Biquad();
    this.intakeLp = new OnePole();
    this.raspBp = new Biquad();
    this.raspHp = new Biquad();
    this.raspLp = new OnePole();
    this.tickHp = new Biquad();
    this.tickBp = new Biquad();

    this.popEnv = 0;
    this.popDecay = 0.999;
    this.popTonePhase = 0;
    this.popToneFreq = 90;
    this.popNoise = 0;

    this.turboSpool = 0;
    this.turboPhase = 0;
    this.bovEnv = 0;
    this.bovDecay = 0.999;

    this.tickEnv = 0;
    this.tickDecay = 0.999;
    this.tickPhase = 0;
    this.injectorEnv = 0;

    this.boost = 0;


    this.soundLoad = 0.1;
    this.tipIn = 0;
    this.pulseBuf = [new Float32Array(128), new Float32Array(128)];
    this.pulseIdx = 0;
    this.refined = true; this.layers = [1,1,1,0]; this.layerTargets = [1,1,1,0]; this.refineAmount = 1;
    this.bankDrift = [0, 0];

    this.flowBp = new Biquad();
    this.flowLp = new OnePole();
    this.flowBp.bandpass(760, 0.72, true);
    this.flowLp.set(420);

    this.outL = 0;
    this.outR = 0;

    this.targetRPM=0;this.external=null;this.anchors=[];this.weights=new Float64Array(16);this.targetWeights=new Float64Array(16);this.rpmAlpha=1-Math.exp(-1/(sampleRate*.015));this.fadeAlpha=1-Math.exp(-1/(sampleRate*.025));this.weightAlpha=1-Math.exp(-1/(sampleRate*.04));this.fuelAlpha=1-Math.exp(-1/(sampleRate*.005));this.combustionMix=0;this.masterGain=0;this.phases=new Float64Array(16);this.options={mode:'recorded',master:.6,engine:1,blend:.12,sampleGain:.6,starter:true};this.sampleLevel=0;this.sampleMix=0;this.procMix=0;this.spinPhase=0;this.envelope=0;this.requestPending=false;this.requestCountdown=0;this.receivedFrame=0;this.sequence=0;this.peak=0;this.clipped=0;this.blocks=0;this.stale=false;
    this.port.onmessage=e=>this.receive(e.data);
    const initial=options.processorOptions;if(initial?.profile)this.configure(initial.profile);if(initial?.anchors)this.receive({type:'samples',anchors:initial.anchors});if(initial?.settings)this.receive({type:'options',value:initial.settings});if(initial?.telemetry)this.receive({type:'telemetry',value:initial.telemetry,sequence:1});
  }

  configure(p) {
    if (!p) return;
    this.profile = p;
    this.events = p.firing.map((f) => ({
      angle: f.a,
      bank: f.b,
      gain: f.g == null ? 1 : f.g,
      off: f.o || 0
    }));
    this.eventCount = this.events.length;
    this.banks = p.banks || 2;

    const modes = p.exhaustModes || [90, 230, 620];
    for (let b = 0; b < 2; b++) {
      this.exModeA[b].bandpass(modes[0] * (1 + b * (p.bankTrim || 0.02)), 1.1, true);
      this.exModeB[b].bandpass(modes[1] * (1 + b * (p.bankTrim || 0.02)), 1.6, true);
      this.exModeC[b].bandpass(modes[2] * (1 + b * (p.bankTrim || 0.02)), 0.9, true);
      this.exLp[b].reset();
      this.exHp[b].reset();
    }
    this.intakeBp.bandpass(750, 0.85, true);
    this.intakePulseBp.bandpass(520, 1.1, true);
    this.intakeLp.set(2400);
    this.raspBp.bandpass(1500, 0.7, true);
    this.raspHp.highpass(110, 0.7, true);
    this.raspLp.set(5200);
    this.tickHp.highpass(1400, 0.8, true);
    this.tickBp.bandpass(2800, 1.2, true);

    this.rpm = 0;
    this.omega = 0;
    this.angle = 0;
    this.mode = 'off';
    this.fuel = false;
    this.throttle = 0;
    this.throttleTarget = 0;
    this.overrun = false;
    this.limiterCut = false;
    this.turboSpool = 0;
    this.bovEnv = 0;
    this.soundLoad = 0.1;
    this.pulseBuf = [new Float32Array(128), new Float32Array(128)];
    this.pulseIdx = 0;

  }

  noteFired(ev) {
    const p = this.profile;
    if(!this.fuel)return;
    const idleish = this.rpm < p.idle * 1.6;
    let cycleVar = 1 + (this.noise.next() - 0.5) * 0.24;
    if (idleish) cycleVar *= 1 + (this.noise.next() - 0.5) * 0.18;
    if (idleish && this.noise.next() < 0.035) cycleVar *= 0.52;
    let amp = 0;

    if (this.mode === 'running') {
      const throttle = this.throttle;
      const load = clamp(0.20 + this.soundLoad * 0.92, 0, 1.35);
      const firing = this.fuel && !this.limiterCut;
      const overrun = this.overrun;

      if (firing) {
        amp = (0.12 + 0.88 * Math.pow(load, 0.68)) * cycleVar *
          (0.92 + 0.20 * clamp(this.soundLoad, 0, 1.3)) * (1 + this.tipIn * 0.22);
        if (idleish) {
          const lopeAmt = p.idleLope == null ? 1 : p.idleLope;
          amp *= 1 + 0.06 * lopeAmt * Math.sin(this.lopePhase * 2.0 + ev.bank * 1.7);
          amp *= 0.94 + 0.12 * lopeAmt * Math.sin(this.lopePhase * 5.1 + ev.angle * 0.03);
        }
        amp *= 0.9 + 0.10 * Math.sin(this.t * 7.3 + ev.bank);
      } else if (overrun) {
        amp = 0.026 + 0.010 * Math.pow(load, 0.5);
      } else {
        amp = 0.035;
      }
    } else if (this.mode === 'cranking') {
      amp = 0.105 + 0.025 * (0.5 + 0.5 * Math.sin(this.cranking * 8.0));
    } else if (this.mode === 'stopping') {
      amp = 0.04 * clamp(this.rpm / 500, 0, 1);
    } else {
      return;
    }

    if (this.mode === 'running' && this.fuel && !this.limiterCut && !this.overrun &&
        this.throttle < 0.03 && this.rpm > p.idle * 1.55) {
      amp *= 0.34;
    }

    const bank = ev.bank || 0;
    const gain = ev.gain * (0.92 + this.noise.next() * 0.16);
    const pulse = amp * gain;

    this.exEnv[bank] += pulse * 1.28;
    if (this.exEnv[bank] > 2.6) this.exEnv[bank] = 2.6;
    this.exNoiseEnv[bank] += pulse * (0.10 + this.throttle * 0.34);
    if (this.exNoiseEnv[bank] > 3.2) this.exNoiseEnv[bank] = 3.2;
    this.exCrackEnv[bank] += pulse * (0.22 + this.throttle * 0.32);
    if (this.exCrackEnv[bank] > 2.2) this.exCrackEnv[bank] = 2.2;
    const b = this.pulseBuf[bank];
    const idx = this.pulseIdx;
    const delay = 4 + ((this.noise.next() * 7) | 0);
    const drive = pulse * (1.35 + this.throttle * 0.85) * (1 + this.bankDrift[bank]);
    b[(idx + delay) & 127] += drive;
    b[(idx + delay + 11) & 127] -= drive * 0.86;
    b[(idx + delay + 27) & 127] += drive * 0.42;
    b[(idx + delay + 46) & 127] -= drive * 0.16;

    this.intakeEnv += pulse * (0.12 + this.throttle * 0.44);
    if (this.intakeEnv > 1.6) this.intakeEnv = 1.6;

    this.tickEnv += pulse * (0.55 + this.throttle * 0.45);
    if (this.tickEnv > 1.2) this.tickEnv = 1.2;
    this.injectorEnv = Math.min(1, this.injectorEnv + 0.5 * pulse);

  }

  startPop(strength) {
    this.popEnv = Math.min(2.0, this.popEnv + strength);
    this.popToneFreq = 65 + this.noise.next() * 105;
    this.popNoise = 0.5 + this.noise.next() * 0.5;
  }

  updateEnvelopes(dt) {
    const p = this.profile;
    if (!p) return;
    const fireFreq = Math.max(1, (this.rpm / 120) * p.cyl);
    const period = 1 / fireFreq;
    const tau = clamp(period * 0.19, 0.00032, 0.045);
    this.exDecay = Math.exp(-dt / tau);
    this.exNoiseDecay = Math.exp(-dt / Math.max(0.0013, tau * 1.9));
    const crackDecay = Math.exp(-dt / 0.0022);
    this.intakeDecay = Math.exp(-dt / Math.max(0.0011, tau * 1.2));
    this.tickDecay = Math.exp(-dt / 0.0021);
    this.popDecay = Math.exp(-dt / 0.060);
    this.bovDecay = Math.exp(-dt / 0.065);
    this.tipIn *= Math.exp(-dt / 0.16);

    if ((this.frame & 255) === 0) {
      this.bankDrift[0] += (this.noise.next() - 0.5) * 0.010;
      this.bankDrift[1] += (this.noise.next() - 0.5) * 0.010;
      this.bankDrift[0] *= 0.985;
      this.bankDrift[1] *= 0.985;
    }
    const running = this.mode === 'running';
    const x = clamp(this.rpm / p.redline, 0, 1.2);
    const th = this.actualThrottle == null ? this.throttle : this.actualThrottle;

    for (let b = 0; b < 2; b++) {
      this.exEnv[b] *= this.exDecay;
      this.exNoiseEnv[b] *= this.exNoiseDecay;
      this.exCrackEnv[b] *= crackDecay;
    }
    this.intakeEnv *= this.intakeDecay;
    this.tickEnv *= this.tickDecay;
    this.popEnv *= this.popDecay;
    this.injectorEnv *= Math.exp(-dt / 0.006);

    const open = running ? clamp(th, 0, 1) : 0;
    const drive = clamp(this.soundLoad, 0, 1.4);
    const cutoff = clamp(
      100 + this.rpm * 0.085 + open * (900 + this.rpm * 0.26) + drive * 360 + x * 380,
      90, 7600
    );
    this.exLp[0].set(cutoff);
    this.exLp[1].set(cutoff * 1.06);
    this.intakeLp.set(900 + this.rpm * 0.20 + open * 1600 + drive * 250);
    this.raspLp.set(2200 + this.rpm * 0.24 + open * 2400 + drive * 500);
    this.flowLp.set(180 + this.rpm * 0.030 + drive * 210);

    if ((this.frame & 31) === 0) {
      const intakeCenter = clamp(460 + this.rpm * 0.25 + open * 950 + drive * 180, 280, 5200);
      this.intakeBp.bandpass(intakeCenter, 0.72 + open * 0.5);
      const raspCenter = clamp(760 + this.rpm * 0.30 + open * 1000 + drive * 260, 500, 5600);
      this.raspBp.bandpass(raspCenter, 0.62);
      this.flowBp.bandpass(clamp(240 + this.rpm * 0.075 + drive * 180, 160, 1400), 0.62);
    }
  }

  renderSample(dt) {
    const p = this.profile;
    if (!p) { this.outL = this.outR = 0; return; }

    this.updateEnvelopes(dt);

    const sr = sampleRate;
    const degPerSample = (this.rpm * 6) / sr;
    this.angle += degPerSample;
    if (this.angle >= 720) {
      this.angle -= 720;
      this.cycle++;
    }

    const step = degPerSample + 1e-7;
    for (let i = 0; i < this.eventCount; i++) {
      const ev = this.events[i];
      let d = this.angle - ev.angle;
      if (d < 0) d += 720;
      if (d < step && this.rpm > 1.5) this.noteFired(ev);
    }

    /* ---- exhaust pressure pulses ---- */
    const n1 = this.noise.next();
    const n2 = this.noise.next();
    const thr = this.actualThrottle == null ? this.throttle : this.actualThrottle;
    const open = this.mode === 'running' ? clamp(thr, 0, 1) : 0;
    const x = clamp(this.rpm / p.redline, 0, 1.2);
    const pink = this.noise.pink();
    const flow = this.flowBp.process(pink) * (0.0035 + this.soundLoad * 0.014) *
      (0.30 + open * 0.70);
    const flowLow = this.flowLp.process(pink) * (0.0018 + this.soundLoad * 0.007);

    let exL = 0;
    let exR = 0;
    let envTotal = 0;

    for (let b = 0; b < 2; b++) {
      const env = this.exEnv[b];
      const imp = this.pulseBuf[b][this.pulseIdx];
      this.pulseBuf[b][this.pulseIdx] = 0;
      const noiseEnv = this.exNoiseEnv[b];
      envTotal += env;

      const low = this.exLp[b].process(env * 0.12);
      const m1 = this.exModeA[b].process(imp * 1.05 + env * 0.075);
      const m2 = this.exModeB[b].process(imp * 0.68 + env * 0.042);
      const m3 = this.exModeC[b].process(imp * 0.30 + env * 0.018);
      const edge = (env - this.exPrevEnv[b]) * 0.14;
      this.exPrevEnv[b] = env;

      const spark = this.sparkA[b].process(imp * 0.65 + edge * 2.0) * 0.52 +
        this.sparkB[b].process(imp * 0.34 + edge * 1.0) * 0.30;
      const loadTone = clamp(this.soundLoad, 0, 1.4);
      const body = low * (0.30 + loadTone * 0.11) + m1 * (0.80 + loadTone * 0.14) +
        m2 * 0.56 + m3 * 0.30 + edge + spark + imp * 0.72;
      const mid = this.exMidHp[b].process(body + imp * 1.1);
      const originalShaped = asymClip((body + mid * 1.15) * (1.55 + open * 1.2 + this.soundLoad * 0.28)) * 0.56;
      const gentleShaped = (body + mid * 0.22) * (0.42 + open * 0.16 + this.soundLoad * 0.06);
      const shaped = lerp(originalShaped, gentleShaped, this.refineAmount);
      const n = b === 0 ? n1 : n2;
      const raspGain = 0.0012 + noiseEnv * (0.075 + open * 0.34 * (0.35 + 0.65 * x) + this.soundLoad * 0.10);
      const rasp = (this.raspBp.process(n * 0.63) * 0.46 +
        this.raspLp.process(n * 0.9) * 0.08) * raspGain;
      const crack = this.exCrackHp[b].process(n * 0.8) * this.exCrackEnv[b] * 0.22;
      const value = this.exHp[b].process(shaped + rasp * (1 - .90 * this.refineAmount) + crack * (1 - .98 * this.refineAmount) + flow + flowLow);
      if (b === 0) exL = value;
      else exR = value;
    }
    this.pulseIdx = (this.pulseIdx + 1) & 127;

    /* No artificial sawtooth: the pressure pulses themselves create the
       firing-order harmonics and the cross-plane bank roughness. */

    /* ---- intake ---- */
    const intakeNoise = this.noise.next();
    this.intakeLp.process(intakeNoise * 0.4);
    const intakeBand = this.intakeBp.process(intakeNoise * 0.8) *
      (0.008 + open * 0.105 + this.soundLoad * 0.018);
    const intakeRoar = this.intakeEnv * (0.018 + open * 0.075 + this.soundLoad * 0.025);
    const intakePulse = this.intakePulseBp.process(this.intakeEnv * 0.10) * (0.32 + open * 0.62);
    let intake = intakeBand + intakeRoar + intakePulse;
    if (this.mode === 'cranking') intake += this.intakeLp.process(this.noise.next() * 0.28) * 0.22;

    /* ---- valvetrain / injector mechanical noise ---- */
    this.tickPhase += dt * (this.rpm / 120) * p.cyl * 2;
    this.tickPhase -= Math.floor(this.tickPhase);
    const tickNoise = this.noise.next();
    const tick = this.tickHp.process(tickNoise) * this.tickEnv * 0.12 +
      this.tickBp.process(tickNoise) * this.tickEnv * 0.055;
    const injector = this.injectorEnv * (this.noise.next() * 0.5) * 0.016;

    /* ---- exhaust crackle / overrun pops ---- */
    let pop = 0;
    if (this.popEnv > 0.0005) {
      this.popTonePhase += TAU * this.popToneFreq / sr;
      if (this.popTonePhase > TAU) this.popTonePhase -= TAU;
      const tone = Math.sin(this.popTonePhase) * this.popEnv * 0.15;
      const crackN = this.noise.next();
      const crack = (this.raspBp.process(crackN * 0.5) * 1.8 + crackN * 0.18) *
        this.popEnv * this.popNoise * 0.30;
      pop = softClip((tone + crack) * 1.7) * 0.48;
    }

    /* ---- turbo whistle and compressor surge ---- */
    let turbo = 0;
    if (p.turbo && (this.turboSpool > 0.01 || this.bovEnv > 0.005)) {
      const whistleFreq = 1250 + this.turboSpool * 3100 + this.rpm * 0.045;
      this.turboPhase += TAU * whistleFreq / sr;
      if (this.turboPhase > TAU) this.turboPhase -= TAU;
      const whistle = Math.sin(this.turboPhase) * (0.006 + this.turboSpool * 0.036) *
        (0.3 + open * 0.7);
      const gear = Math.sin(this.turboPhase * 2.01) * 0.22;
      const flutter = 0.55 + 0.45 * Math.sin(this.t * TAU * 27.0);
      const bov = this.noise.next() * this.bovEnv * 0.060 * flutter;
      turbo = (whistle + whistle * gear + bov) * (this.starter > 0.02 ? 0.8 : 1);
    }

    /* ---- starter motor ---- */
    let starter = 0;
    if (this.starter > 0.001 && this.mode === 'cranking') {
      const rpmFrac = clamp(this.rpm / Math.max(120, p.starterRpm), 0, 1.4);
      const f = 820 + rpmFrac * 940 + 34 * Math.sin(this.t * 21);
      this.starterPhase = (this.starterPhase || 0) + TAU * f / sr;
      if (this.starterPhase > TAU) this.starterPhase -= TAU;
      const motor = Math.sin(this.starterPhase) * 0.020 +
        Math.sin(this.starterPhase * 2.0) * 0.011 +
        Math.sin(this.starterPhase * 3.02) * 0.006;
      starter = (motor + this.noise.next() * 0.006) * this.starter;
    }

    const gearWhine=0,clunk=0;
    /* ---- stereo placement ---- */
    const pan = p.bankPan || [0.72, 1.0];
    const bankLGain = pan[0];
    const bankRGain = pan[1];

    let exMixL;
    let exMixR;
    if (p.banks === 1) {
      /* A single exhaust bank is heard centred, with a tiny amount of
         stereo spread from the intake/mechanical layers. */
      exMixL = exL;
      exMixR = exL * 0.96;
    } else {
      exMixL = exL * bankLGain + exR * 0.20;
      exMixR = exR * bankRGain + exL * 0.20;
    }

    const smoothing = Math.min(1, dt * 35);
    this.refineAmount += ((this.refined ? 1 : 0) - this.refineAmount) * smoothing;
    for (let i=0;i<4;i++) this.layers[i] += (this.layerTargets[i] - this.layers[i]) * smoothing;
    const popGain = this.layers[3] * (1 - .65 * this.refineAmount);
    let l = exMixL * this.layers[0] + intake * 0.92 * this.layers[1] + tick * (0.72 - 0.42 * this.refineAmount) * this.layers[2] + pop * popGain + turbo * 0.8 + starter + gearWhine + clunk;
    let r = exMixR * this.layers[0] + intake * 0.72 * this.layers[1] + tick * (0.72 - 0.42 * this.refineAmount) * this.layers[2] + pop * popGain + turbo * 0.8 + starter + gearWhine + clunk;

    /* A tiny amount of bank crosstalk and mechanical common-mode. */
    if (this.mode === 'off') {
      const fade = Math.exp(-dt / 0.08);
      this.outL *= fade;
      this.outR *= fade;
    } else {
      this.outL = l;
      this.outR = r;
    }

    let mixL = this.outHpL.process(this.outL);
    let mixR = this.outHpR.process(this.outR);
    const body = this.bodyEq.process(mixL + mixR) * 0.07;
    const presence = this.presenceEq.process(mixL + mixR) * 0.03;
    mixL = this.outLpL.process(mixL + body + presence);
    mixR = this.outLpR.process(mixR + body + presence);
    const gain = p.outputGain || 0.63;
    this.outL = lerp(softClip(mixL * gain), Math.tanh(mixL * gain * 0.65), this.refineAmount);
    this.outR = lerp(softClip(mixR * gain), Math.tanh(mixR * gain * 0.65), this.refineAmount);

    if (!finite(this.outL)) this.outL = 0;
    if (!finite(this.outR)) this.outR = 0;
  }

  receive(d){
    if(d.type==='profile'){this.configure(d.profile);return;}
    if(d.type==='samples'){this.anchors=d.anchors.sort((a,b)=>a.rpm-b.rpm);this.phases.fill(0);return;}
    if(d.type==='options'){Object.assign(this.options,d.value);return;}
    if(d.type!=='telemetry')return;
    this.requestPending=false;
    const t=d.value;if(!t||!Number.isFinite(t.engineRPM)){this.external=null;return;}
    if(this.external?.epoch!==t.epoch){this.exEnv.fill(0);this.exNoiseEnv.fill(0);this.exCrackEnv.fill(0);this.pulseBuf.forEach(x=>x.fill(0));this.envelope=0;this.rpm=0;this.phases.fill(0);}
    this.external=t;this.sequence=d.sequence;this.receivedFrame=this.frame;this.targetRPM=Math.abs(t.engineRPM);
  }
  prepareExternal(){
    // Message callbacks cannot interleave an audio quantum: these quantities are invariant here.
    const t=this.external,o=this.options;this.stale=(this.frame-this.receivedFrame)>sampleRate*2;
    this.throttle=t?.effectiveOpening??0;this.actualThrottle=this.throttle;this.soundLoad=.08+.85*(t?.loadProxy??0);this.fuel=!!t&&t.engineMode==='running'&&t.combustionTorque>0;
    this.starter=o.starter&&t?.starterTorque>0?1:0;this.limiterCut=!!t?.fuelCut;this.overrun=!!t&&t.throttle<.02&&t.engineMode==='running';
    this.sampleTarget=o.mode==='recorded'||o.mode==='hybrid'?1:0;this.proceduralTarget=o.mode==='procedural'?1:o.mode==='hybrid'?o.blend:this.starter>0?.2:0;
    this.transportTarget=t&&t.engineMode!=='unsupported'&&!t.simulationPaused&&!t.focusLost&&!t.simulationFaulted&&!this.stale&&o.mode!=='muted'?1:0;
    this.combustionTarget=t?.engineMode==='running'?(t.fuelCut?.12:t.combustionTorque>0?1:.28):0;this.masterTarget=o.master*o.engine;this.sampleTargetLevel=o.sampleGain;this.recordedLevel=.45+.55*(t?.loadProxy??0);
  }
  updateExternal(dt){
    this.t+=dt;this.rpm+=(this.targetRPM-this.rpm)*this.rpmAlpha;
    this.sampleMix+=(this.sampleTarget-this.sampleMix)*this.fadeAlpha;this.procMix+=(this.proceduralTarget-this.procMix)*this.fadeAlpha;
    this.omega=this.rpm*Math.PI/30;this.spinPhase=(this.spinPhase+this.omega*dt)%TAU;
    this.mode=this.fuel?'running':this.starter>0?'cranking':this.targetRPM>1?'stopping':'off';
    this.lopePhase+=dt*2;this.cranking+=dt;this.envelope+=(this.transportTarget-this.envelope)*this.fadeAlpha;
  }
  process(inputs,outputs){
    const out=outputs[0],l=out[0],r=out[1]??l;if(!l)return true;
    const t=this.external,o=this.options,mode=o.mode;
    this.prepareExternal();anchorWeights(this.targetRPM,this.anchors,this.targetWeights);
    const dt=1/sampleRate,synth=mode==='procedural'||mode==='hybrid'||this.procMix>1e-5||this.starter>0;
    if(mode==='muted'&&this.envelope<1e-7){l.fill(0);if(r!==l)r.fill(0);this.frame+=l.length;this.rpm=this.targetRPM;this.stale=(this.frame-this.receivedFrame)>sampleRate*2;this.blocks++;this.requestTelemetry(l.length,t);return true;}
    for(let i=0;i<l.length;i++){
      this.frame++;this.updateExternal(dt);this.combustionMix+=(this.combustionTarget-this.combustionMix)*this.fuelAlpha;this.masterGain+=(this.masterTarget-this.masterGain)*this.fadeAlpha;this.sampleLevel+=(this.sampleTargetLevel-this.sampleLevel)*this.fadeAlpha;
      if(synth&&this.profile)this.renderSample(dt);else this.outL=this.outR=0;
      let left=0,right=0;
      const running=t?.engineMode==='running';
      for(let k=0;k<this.anchors.length;k++){
        this.weights[k]+=(this.targetWeights[k]-this.weights[k])*this.weightAlpha;const a=this.anchors[k],n=a.channels[0].length;let phase=this.phases[k];const j=Math.floor(phase),f=phase-j,next=(j+1)%n;
        if(this.weights[k]>0&&this.sampleMix>1e-6&&this.combustionMix>1e-8){const gain=this.combustionMix*this.sampleMix*this.weights[k]*this.sampleLevel*(a.gain??1)*this.recordedLevel;const x=a.channels[0],y=a.channels[1]??x;left+=(x[j]+f*(x[next]-x[j]))*gain;right+=(y[j]+f*(y[next]-y[j]))*gain;}
        phase+=this.rpm/a.rpm*a.sampleRate/sampleRate;this.phases[k]=phase%n;
      }
      const procedural=this.procMix;
      const mechanical=o.starter&&!running&&this.targetRPM>1?Math.sin(this.spinPhase*2)*.002:0;
      const gain=this.envelope*this.masterGain;
      left=(left+this.outL*procedural+mechanical)*gain;right=(right+this.outR*procedural+mechanical)*gain;
      const al=left<0?-left:left,ar=right<0?-right:right;if(al>this.peak)this.peak=al;if(ar>this.peak)this.peak=ar;if(al>.98||ar>.98)this.clipped++;
      l[i]=left<-.98?-.98:left>.98?.98:left;if(r!==l)r[i]=right<-.98?-.98:right>.98?.98:right;
    }
    this.blocks++;this.requestTelemetry(l.length,t);return true;
  }
  requestTelemetry(length,t){
    this.requestCountdown-=length;
    if(this.requestCountdown<=0&&!this.requestPending){this.requestPending=true;this.requestCountdown=sampleRate/50;this.port.postMessage({type:'request',sequence:this.sequence,rpm:this.rpm,targetRPM:this.targetRPM,weights:Array.from(this.weights.slice(0,this.anchors.length)),anchors:this.anchors.map(a=>a.rpm),mode:this.mode,peak:this.peak,clipped:this.clipped,blocks:this.blocks,stale:this.stale,simulationTime:t?.simulationTime??null,gearboxMode:t?.gearboxMode??null,engagedGear:t?.engagedGear??null});this.peak=0;}
  }
}
registerProcessor('schweinemotorwerke-engine',EngineProcessor);
