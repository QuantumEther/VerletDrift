import { createWheel, DEFAULT_DT, rotationalEnergy, stepWheel, totalKineticEnergy, translationalEnergy } from './wheel.js';

const canvas = document.querySelector('#wheel');
const ctx = canvas.getContext('2d');
const readout = id => document.querySelector(`#${id}`);
const input = id => document.querySelector(`#${id}`);
const wheel = createWheel({ inertia: Number(input('inertia').value), mass: Number(input('mass').value), radius: Number(input('radius').value), friction: Number(input('friction').value), slipStiffness: Number(input('stiffness').value) });
const keys = new Set();
let accumulator = 0;
let lastFrame = performance.now();
let netTorque = 0;
let stepCount = 0;
let rateStart = performance.now();
let rateSteps = 0;
let physicsHz = 0;
const TAU = Math.PI * 2;

function reset() {
  wheel.x = wheel.velocity = wheel.theta = wheel.omega = wheel.time = 0;
  wheel.lastContactForce = 0;
  accumulator = 0;
  netTorque = 0;
  stepCount = 0;
}

window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (['w', 's', 'r'].includes(key)) event.preventDefault();
  if (key === 'r' && !event.repeat) reset();
  keys.add(key);
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
input('inertia').addEventListener('change', () => {
  const value = Number(input('inertia').value);
  if (Number.isFinite(value) && value > 0) { wheel.inertia = value; reset(); }
  else input('inertia').value = wheel.inertia;
});

for (const [id, property, positive] of [['mass', 'mass', true], ['radius', 'radius', true], ['friction', 'friction', false], ['stiffness', 'slipStiffness', false]]) {
  input(id).addEventListener('change', () => {
    const value = Number(input(id).value);
    if (Number.isFinite(value) && (positive ? value > 0 : value >= 0)) {
      wheel[property] = value;
      wheel.normalLoad = wheel.mass * 9.81;
      reset(); // Configuration edits start a new experiment, with zero energy.
    } else input(id).value = wheel[property];
  });
}

function draw() {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const wheelRadius = Math.min(w, h) * 0.24;
  const pixelsPerMetre = 90;
  const travel = Math.tanh(wheel.x) * w * 0.15;
  const cameraX = wheel.x * pixelsPerMetre - travel;
  const cx = w / 2 + travel, roadY = h * 0.72, cy = roadY - wheelRadius;
  ctx.strokeStyle = '#8293a1'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, roadY + 2); ctx.lineTo(w, roadY + 2); ctx.stroke();
  ctx.fillStyle = '#8293a1';
  const markerOffset = -(cameraX % 70);
  for (let x = markerOffset; x < w; x += 70) ctx.fillRect(x, roadY + 14, 34, 4);
  const radius = wheelRadius;
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TAU); ctx.fillStyle = '#263747'; ctx.fill();
  ctx.lineWidth = 12; ctx.strokeStyle = '#9eabb5'; ctx.stroke();
  ctx.lineWidth = 4; ctx.strokeStyle = '#55d6be';
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(wheel.theta) * radius * 0.82, cy + Math.sin(wheel.theta) * radius * 0.82); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.fillStyle = '#eef4f8'; ctx.fill();
}

function frame(now) {
  const elapsed = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  accumulator += elapsed;
  const drive = keys.has('w') ? Number(input('drive').value) || 0 : 0;
  const brake = keys.has('s') ? Math.max(0, Number(input('brake').value) || 0) : 0;
  while (accumulator >= DEFAULT_DT) {
    ({ netTorque } = stepWheel(wheel, { driveTorque: drive, brakeTorque: brake }, DEFAULT_DT));
    accumulator -= DEFAULT_DT; stepCount++; rateSteps++;
  }
  if (now - rateStart >= 500) { physicsHz = rateSteps * 1000 / (now - rateStart); rateSteps = 0; rateStart = now; }
  draw();
  const rpm = wheel.omega * 60 / TAU;
  readout('dt').textContent = `${DEFAULT_DT * 1000} ms · ${physicsHz.toFixed(0)} steps/s`;
  readout('theta').textContent = `${wheel.theta.toFixed(3)} rad`;
  readout('omega').textContent = `${wheel.omega.toFixed(3)} rad/s`;
  readout('rpm').textContent = `${rpm.toFixed(1)} rpm`;
  readout('torque').textContent = `${netTorque.toFixed(2)} N·m`;
  readout('energy').textContent = `${rotationalEnergy(wheel).toFixed(3)} J`;
  readout('position').textContent = `${wheel.x.toFixed(3)} m`;
  readout('speed').textContent = `${wheel.velocity.toFixed(3)} m/s · ${(wheel.velocity * 3.6).toFixed(2)} km/h`;
  readout('circ-speed').textContent = `${(wheel.radius * wheel.omega).toFixed(3)} m/s`;
  readout('slip').textContent = `${(wheel.radius * wheel.omega - wheel.velocity).toFixed(3)} m/s`;
  readout('force').textContent = `${(wheel.lastContactForce || 0).toFixed(1)} N`;
  readout('normal').textContent = `${wheel.normalLoad.toFixed(1)} N`;
  readout('trans-energy').textContent = `${translationalEnergy(wheel).toFixed(3)} J`;
  readout('total-energy').textContent = `${totalKineticEnergy(wheel).toFixed(3)} J`;
  readout('direction').textContent = wheel.velocity > 0.01 ? 'Forward' : wheel.velocity < -0.01 ? 'Reverse' : 'Stationary';
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
