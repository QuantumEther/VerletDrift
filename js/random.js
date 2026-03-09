import { uiState as state } from './state.js';

let deterministicSeed = 1;
let lastConfiguredSeed = null;
let lastDeterminismMode = false;

function normalizeSeed(rawSeed) {
  const seed = Number.isFinite(rawSeed) ? Math.floor(rawSeed) >>> 0 : 1;
  return seed === 0 ? 1 : seed;
}

function syncDeterministicSeed() {
  const configuredSeed = normalizeSeed(state.params.determinismSeed);
  if (configuredSeed !== lastConfiguredSeed) {
    deterministicSeed = configuredSeed;
    lastConfiguredSeed = configuredSeed;
  }
}

export function physicsRandom() {
  const determinismMode = !!state.params.determinismMode;
  if (!determinismMode) {
    lastDeterminismMode = false;
    return Math.random();
  }

  if (!lastDeterminismMode) {
    lastConfiguredSeed = null;
    lastDeterminismMode = true;
  }

  syncDeterministicSeed();

  // Stabilizer #4 — isolate physics-tick randomness behind a seeded stream.
  // Physical rationale: gameplay side-effects (balloon spawn, sparks, shake)
  // should not perturb mechanical evolution when deterministic playback is on.
  // Feel impact: same seed/input reproduces runs exactly; normal mode remains lively.
  // Mulberry32-style integer hashing. Deterministic and fast for gameplay randomness.
  deterministicSeed = (deterministicSeed + 0x6D2B79F5) >>> 0;
  let t = deterministicSeed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
