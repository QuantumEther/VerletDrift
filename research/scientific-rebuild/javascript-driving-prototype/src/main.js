import {createQuarter, stepQuarter, forces, road, verticalEnergy} from './quarter.js';
import { createWheel, DEFAULT_DT, rotationalEnergy, stepWheel, totalKineticEnergy, translationalEnergy } from './wheel.js';

const canvas = document.querySelector('#wheel');
const ctx = canvas.getContext('2d');
const readout = id => document.querySelector(`#${id}`);
const input = id => document.querySelector(`#${id}`);
let quarter = createQuarter();
let wheel = quarter.wheel;
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
  quarter=createQuarter({unsprungMass:Number(input('mass').value),radius:Number(input('radius').value),inertia:Number(input('inertia').value),friction:Number(input('friction').value),slipStiffness:Number(input('stiffness').value)});
  wheel=quarter.wheel;
  accumulator = 0;
  netTorque = 0;
  stepCount = 0;
}

window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (['w', 's', 'r', ' ', 'b'].includes(key)) event.preventDefault();
  if (key === 'r' && !event.repeat) reset();
  if (key === ' ' && !event.repeat) quarter.vs += 0.5;
  if (key === 'b' && !event.repeat) quarter.bumpStart=quarter.time;
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

      reset(); // Configuration edits start a new experiment, with zero energy.
    } else input(id).value = wheel[property];
  });
}

function draw() {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const scale=190;
  const wheelRadius = wheel.radius*scale;
  const pixelsPerMetre = 90;
  const travel = Math.tanh(wheel.x) * w * 0.15;
  const cameraX = wheel.x * pixelsPerMetre - travel;
  const cx = w / 2 + travel, roadY = h * 0.88-road(quarter).height*scale, cy = h*.88-quarter.zu*scale;
  ctx.strokeStyle = '#8293a1'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, roadY + 2); ctx.lineTo(w, roadY + 2); ctx.stroke();
  ctx.fillStyle = '#8293a1';
  const markerOffset = -(cameraX % 70);
  for (let x = markerOffset; x < w; x += 70) ctx.fillRect(x, roadY + 14, 34, 4);
  const massY=h*.88-quarter.zs*scale;
  ctx.fillStyle='#dfb65d'; ctx.fillRect(cx-42,massY-18,84,22);
  ctx.strokeStyle='#dfb65d'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(cx-18,massY+4);
  for(let i=1;i<=12;i++) ctx.lineTo(cx-18+(i%2?8:-8),massY+4+(cy-massY-4)*i/13);
  ctx.lineTo(cx-18,cy); ctx.stroke();
  ctx.strokeRect(cx+14,(massY+cy)/2-12,12,24);
  ctx.beginPath();ctx.moveTo(cx+20,massY+4);ctx.lineTo(cx+20,cy);ctx.stroke();
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
    ({ netTorque } = stepQuarter(quarter, { driveTorque: drive, brakeTorque: brake }, DEFAULT_DT));

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
  const d=forces(quarter);
  readout('suspension').textContent=`Sprung z ${quarter.zs.toFixed(4)} m, v ${quarter.vs.toFixed(4)} m/s; unsprung z ${quarter.zu.toFixed(4)} m, v ${quarter.vu.toFixed(4)} m/s; suspension compression ${d.compression.toFixed(4)} m, force ${d.suspension.toFixed(2)} N; tire compression ${d.delta.toFixed(4)} m; radial spring ${d.tireSpring.toFixed(2)} N, damper ${d.tireDamper.toFixed(2)} N; contact ${d.contact}; vertical energy ${verticalEnergy(quarter).toFixed(3)} J; vertical KE ${(0.5*quarter.ms*quarter.vs**2+0.5*quarter.mu*quarter.vu**2).toFixed(3)} J; tire energy ${(0.5*quarter.kt*d.delta**2).toFixed(3)} J; spring energy ${(0.5*quarter.ks*d.compression**2).toFixed(3)} J; gravity PE ${(quarter.g*(quarter.ms*quarter.zs+quarter.mu*quarter.zu)).toFixed(3)} J`;
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
