// Laboratory clock and artistic settings only. No simulator imports or RNG.
export const IMPACT_TIME = .55;
export const DURATION = 4.8;
export const DEFAULTS = Object.freeze({ speed: 22, volume: 18, breakup: 1.1, concentration: 1.35, seed: 1337, quality: 'balanced' });
const clamp = (v,lo,hi,fallback) => Number.isFinite(Number(v)) ? Math.min(hi,Math.max(lo,Number(v))) : fallback;
export function settingsFrom(values = {}) {
  return {
    speed: clamp(values.speed ?? DEFAULTS.speed,5,45,DEFAULTS.speed),
    volume: clamp(values.volume ?? DEFAULTS.volume,3,40,DEFAULTS.volume),
    breakup: clamp(values.breakup ?? DEFAULTS.breakup,.25,2,DEFAULTS.breakup),
    concentration: clamp(values.concentration ?? DEFAULTS.concentration,.2,2.5,DEFAULTS.concentration),
    seed: Math.round(clamp(values.seed ?? DEFAULTS.seed,0,999999,DEFAULTS.seed)),
    quality: ['performance','balanced','high'].includes(values.quality) ? values.quality : DEFAULTS.quality,
  };
}
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
export function makeSheetMesh(angular=160, radial=18) {
  const vertices=new Float32Array((angular+1)*(radial+1)*2);
  const indices=new Uint32Array(angular*radial*6);
  let v=0,i=0;
  for(let a=0;a<=angular;a++)for(let r=0;r<=radial;r++) {vertices[v++]=a/angular;vertices[v++]=r/radial;}
  for(let a=0;a<angular;a++)for(let r=0;r<radial;r++) {
    const p=a*(radial+1)+r,q=p+radial+1;
    indices.set([p,q,p+1,p+1,q,q+1],i);i+=6;
  }
  return {vertices,indices};
}
export function makeStrandMesh(segments=36) {
  const vertices=new Float32Array((segments+1)*4),indices=new Uint32Array(segments*6);
  for(let i=0;i<=segments;i++)vertices.set([i/segments,-1,i/segments,1],i*4);
  for(let i=0;i<segments;i++)indices.set([i*2,i*2+1,i*2+2,i*2+2,i*2+1,i*2+3],i*6);
  return {vertices,indices};
}
export const QUALITY = Object.freeze({
  performance: {resolution:.8,maxPixels:1400000,sheets:1,strands:36,drops:650,detail:2},
  balanced: {resolution:1,maxPixels:2400000,sheets:2,strands:54,drops:1200,detail:3},
  high: {resolution:1.2,maxPixels:4000000,sheets:3,strands:72,drops:2000,detail:4},
});
