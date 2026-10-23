// Exercise the exact production mechanical prefix without browser/render/audio.
// Fail loudly if its source boundaries move; never duplicate force equations.
import fs from 'node:fs';
import * as physics from '../../js/physics/index.js';
import state from '../../js/state.js';
import { physicalGeometry } from '../../js/physics/vehicle-geometry.js';
const main = fs.readFileSync(new URL('../../js/main.js', import.meta.url), 'utf8');
const marker = 'function runPhysicsStep(dt) {';
const begin = main.indexOf(marker) + marker.length;
const end = main.indexOf('  // 16. Camera:', begin);
if (begin < marker.length || end < begin) throw Error('Production step markers changed');
const env = { ...physics, state, physicalGeometry };
export const mechanicalStep = new Function(...Object.keys(env), 'dt', main.slice(begin, end)).bind(null, ...Object.values(env));
