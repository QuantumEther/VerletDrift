import {it,expect} from 'vitest';
import {lighting,balloonHue,SCENE_DEFAULTS,LIGHT_PRESETS} from '../js/renderer/environment.js';
it('uses normalized world light directions and finite preset controls',()=>{
 for(const preset of Object.values(LIGHT_PRESETS)){const d=lighting({...SCENE_DEFAULTS,...preset});expect(Math.hypot(...d.slice(0,3))).toBeCloseTo(1,6);expect([...d].every(Number.isFinite)).toBe(true);expect(d[2]).toBeGreaterThan(0);}
 expect(lighting({...SCENE_DEFAULTS,sceneLightingEnabled:false})[7]).toBe(0);
});
it('maps balloon appearance deterministically without mutating source hue or random state',()=>{
 const hues=Array.from({length:1000},(_,i)=>i*.36);
 expect(hues.map(h=>balloonHue(h,{balloonAppearance:0}))).toEqual(hues);
 expect(hues.every(h=>balloonHue(h,{balloonAppearance:1})===350)).toBe(true);
 const a=hues.map(h=>balloonHue(h,{balloonAppearance:2,balloonCrimsonRatio:.35}));
 expect(a).toEqual(hues.map(h=>balloonHue(h,{balloonAppearance:2,balloonCrimsonRatio:.35})));
 const crimson=a.filter(h=>h===350).length;expect(crimson).toBeGreaterThan(280);expect(crimson).toBeLessThan(420);
 expect(hues.every(h=>balloonHue(h,{balloonAppearance:2,balloonCrimsonRatio:0})===h)).toBe(true);
 expect(hues.every(h=>balloonHue(h,{balloonAppearance:2,balloonCrimsonRatio:1})===350)).toBe(true);
});
