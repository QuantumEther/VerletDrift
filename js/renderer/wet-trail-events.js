// Read-only visual snapshots. Independent of native skid culling and the physics RNG.
export const MAX_WET_TRANSFERS = 16384;
let ring = new Array(MAX_WET_TRANSFERS), head = 0, count = 0, serial = 0;
let observed = new WeakSet(), generation = 0, cached = null;
export function resetWetTireTransfers() {
 ring = new Array(MAX_WET_TRANSFERS);head=0;count=0;serial=0;
 observed=new WeakSet();generation++;cached=null;
}
export function recordWetTireTransfer(seg,time) {
 const saturation=seg.paintSaturation??1,width=seg.width??.28,alpha=seg.alpha??.55;
 if(observed.has(seg)||!(seg.hue>=0)||!(saturation>0)||!(alpha>0)||!(width>0))return;
 if(![seg.x1,seg.y1,seg.x2,seg.y2,width,seg.hue,time,alpha,saturation].every(Number.isFinite))return;
 observed.add(seg);
 const event=Object.freeze({id:++serial,x1:seg.x1,y1:seg.y1,x2:seg.x2,y2:seg.y2,
  width,hue:seg.hue,saturation:Math.min(1,saturation),dose:Math.min(1,Math.max(0,alpha)),time});
 ring[(head+count)%MAX_WET_TRANSFERS]=event;
 if(count<MAX_WET_TRANSFERS)count++;else head=(head+1)%MAX_WET_TRANSFERS;
 cached=null;
}
export function getWetTireTransfers() {
 if(!cached)cached=Array.from({length:count},(_,i)=>ring[(head+i)%MAX_WET_TRANSFERS]);
 return {events:cached,generation,serial};
}
