// Laboratory clock and artistic settings only. No simulator imports or RNG.
export const IMPACT_TIME = .55;
// Full drying + the longest supported spatial dye-weathering tail.
export const DURATION = 300;
export const DRYING_START_AGE = 6;
export { DEFAULTS, MATERIAL_PRESETS, settingsFrom } from '../../js/renderer/liquid-settings.js';
const clamp = (v,lo,hi,fallback) => Number.isFinite(Number(v)) ? Math.min(hi,Math.max(lo,Number(v))) : fallback;
export class LabClock {
  constructor() { this.time=0; this.rate=1; this.playing=true; this.last=null; }
  tick(now) {
    if (this.last !== null && this.playing) this.time=Math.min(DURATION,this.time+Math.max(0,(now-this.last)/1000)*this.rate);
    this.last=now;
    if(this.time>=DURATION)this.playing=false;
    return this.time;
  }
  seek(time) { this.time=clamp(time,0,DURATION,0);this.playing=false;this.last=null; }
  replay() { this.time=0;this.playing=true;this.last=null; }
  toggle() { if(this.time>=DURATION)this.time=0;this.playing=!this.playing;this.last=null; }
}
export { makeSheetMesh, makeStrandMesh } from '../../js/renderer/liquid-mesh.js';
export { QUALITY } from '../../js/renderer/liquid-settings.js';
