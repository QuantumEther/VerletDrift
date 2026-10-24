import { createWheel, DEFAULT_DT, rotationalEnergy, stepWheel } from './wheel.js';

const canvas = document.querySelector('#wheel');
const ctx = canvas.getContext('2d');
const readout = id => document.querySelector(`#${id}`);
const input = id => document.querySelector(`#${id}`);
const wheel = createWheel({ inertia: Number(input('inertia').value) });
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
  wheel.theta = wheel.omega = wheel.time = 0;
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
  if (Number.isFinite(value) && value > 0) wheel.inertia = value;
  else input('inertia').value = wheel.inertia;
});

function draw() {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, radius = Math.min(w, h) * 0.34;
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
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
