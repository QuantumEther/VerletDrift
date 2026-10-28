import {visualState} from './visual-state.js';

export function gaugeAngle(value,max) { return -135+270*Math.max(0,Math.min(1,value/max)); }
export function instrumentValues(state) {
  const v=visualState(state);
  return {engine:v.engineRPM,input:v.shaftRPM,speed:Math.hypot(state.planar.u,state.planar.v)*3.6,gear:v.gear};
}
const NS='http://www.w3.org/2000/svg';
function element(tag,attributes={},text) {
  const node=document.createElementNS(NS,tag);
  for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);
  if(text!==undefined)node.textContent=text;
  return node;
}
export function createInstrument(host,{label,unit,max,divisions=6}) {
  const svg=element('svg',{viewBox:'0 0 240 240',role:'img','aria-label':label,class:'analog-dial'});
  svg.append(element('circle',{cx:120,cy:120,r:112,class:'bezel'}),element('circle',{cx:120,cy:120,r:102,class:'dial-face'}));
  for(let i=0;i<=divisions*5;i++){
    const a=gaugeAngle(max*i/(divisions*5),max)*Math.PI/180,major=i%5===0,r=major?83:90;
    svg.append(element('line',{x1:120+r*Math.sin(a),y1:120-r*Math.cos(a),x2:120+97*Math.sin(a),y2:120-97*Math.cos(a),class:major?'tick major':'tick'}));
    if(major)svg.append(element('text',{x:120+70*Math.sin(a),y:124-70*Math.cos(a),class:'dial-number','text-anchor':'middle'},String(Math.round(max*i/(divisions*5)))));
  }
  svg.append(element('text',{x:120,y:157,class:'dial-label','text-anchor':'middle'},label),element('text',{x:120,y:174,class:'dial-unit','text-anchor':'middle'},unit));
  // Needle and hub share this SVG coordinate system. No CSS transform/origin.
  const pivot=element('g',{transform:'translate(120 120)',class:'needle-pivot'});
  const needle=element('g',{class:'needle',transform:'rotate(-135)'});
  needle.append(element('path',{d:'M -3 17 L -2 -69 L 0 -85 L 2 -69 L 3 17 Z'}));
  pivot.append(needle,element('circle',{cx:0,cy:0,r:7,class:'needle-hub'}));svg.append(pivot);host.append(svg);
  const reading=document.createElement('output');reading.className='dial-reading';host.append(reading);
  return value=>{needle.setAttribute('transform',`rotate(${gaugeAngle(value,max)})`);svg.dataset.value=value;svg.setAttribute('aria-label',`${label}: ${value.toFixed(1)} ${unit}`);reading.textContent=`${value.toFixed(0)} ${unit}${value<0||value>max?' · off scale':''}`;};
}
