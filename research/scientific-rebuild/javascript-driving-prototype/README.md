# Torque driven wheel sandbox

A standalone JavaScript ES-module experiment for one rotating wheel. It has no dependency on production physics or native Chrono.

## Run

From the repository root, start the existing static server:

```bash
python3 serve.py
```

Open `http://localhost:8000/research/scientific-rebuild/javascript-driving-prototype/` (or the URL printed by the server). Use **W** to apply drive torque, **S** to apply opposing brake torque, and **R** to reset. Inertia and torque magnitudes are configurable in the page.

Run the deterministic mechanics test from the repository root (Node.js built-in test runner; no Vitest/Rollup required):

```bash
node --test research/scientific-rebuild/javascript-driving-prototype/tests/wheel.test.js
```

For constant torque, semi-implicit Euler with fixed `h = 0.001 s` gives `ω = (T/I)t` up to floating-point accumulation. Over 3 seconds (`T=7.2 N·m`, `I=2.4 kg·m²`), expected angular acceleration is `3 rad/s²`, angular speed is `9 rad/s`, and energy is `97.2 J`. The automated test reports its numerical errors if a tolerance fails.
