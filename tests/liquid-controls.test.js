import {it,expect} from 'vitest';
import {LIQUID_CONTROLS,LIQUID_DEFAULTS,liquidSettings,liquidPreset} from '../js/renderer/liquid-controls.js';
import {DEFAULTS} from '../js/renderer/liquid-settings.js';
it('binds each live liquid control to a finite default and shares the laboratory material values',()=>{
 expect(new Set(LIQUID_CONTROLS.map(c=>c.id)).size).toBe(LIQUID_CONTROLS.length);
 for(const c of LIQUID_CONTROLS){expect(LIQUID_DEFAULTS[c.id]).toBe(c.value);if(typeof c.value==='number'){expect(c.value).toBeGreaterThanOrEqual(c.min);expect(c.value).toBeLessThanOrEqual(c.max);}}
 const live=liquidSettings(LIQUID_DEFAULTS);
 for(const key of ['membraneThickness','roughness','dryingDuration','residueLifetime','bodyRunoff'])expect(live[key]).toBe(DEFAULTS[key]);
 expect(liquidPreset('deep-pool')).toMatchObject({liquidPuddleDepth:1.36,liquidConcentration:1.65});
 expect(liquidPreset('unknown')).toEqual({});
});
