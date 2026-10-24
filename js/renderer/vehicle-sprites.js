import { renderState as state } from '../state.js';
import { lighting, lightColor } from './environment.js';
import { BODY_CROP, WHEEL_CROP, BODY_RECT, getTireSpriteDimensions } from './vehicle-geometry.js';
import { drawVehicleCalibration } from './vehicle-calibration.js';

// Rendering-only switch; disabling this restores the original car and ghosts.
export const vehicleSpriteSettings = {
  enabled: true,
  calibration: typeof location !== 'undefined' && new URLSearchParams(location.search).get('vehicleCalibration') === '1',
};

function loadImage(path) {
  if (typeof Image === 'undefined') return null;
  const image = new Image();
  image.src = new URL(path, import.meta.url).href;
  return image;
}

const bodyImage = loadImage('../../assets/vehicles/delorean/DeLorean.png');
const wheelImage = loadImage('../../assets/vehicles/delorean/DeLorean_Wheel.png');

let relitBody=null,relitSource=null,relitKey='',shadowStamp=null;
// A single bounded cache for heading-independent brightness/temperature work.
let litBase=null,litBaseKey='';
const lightData=new Float32Array(8);
function bodyArtwork(pose){
 if(state.params.sceneLightingEnabled===false||pose.isGhost)return null;
 lighting(state.params,lightData);
 const angle=Math.round(pose.heading*24)/24;
 const key=[angle,...lightData].join(':');
 if(key===relitKey)return relitSource;
 if(!relitBody)relitBody=typeof OffscreenCanvas==='undefined'?document.createElement('canvas'):new OffscreenCanvas(384,672);
 const w=384,h=Math.round(w*BODY_CROP[3]/BODY_CROP[2]);
 if(relitBody.width!==w||relitBody.height!==h){relitBody.width=w;relitBody.height=h;}
 const ctx=relitBody.getContext('2d');ctx.clearRect(0,0,w,h);
 // Only the directional gradient below depends on heading. Reusing this
 // same-size base avoids filtering/rasterizing the PNG at every heading bucket.
 // Keep the original final bitmap and composite order for identical artwork.
 const baseKey=key.slice(key.indexOf(':')+1);
 if(baseKey!==litBaseKey){
  if(!litBase)litBase=typeof OffscreenCanvas==='undefined'?document.createElement('canvas'):new OffscreenCanvas(w,h);
  if(litBase.width!==w||litBase.height!==h){litBase.width=w;litBase.height=h;}
  const baseCtx=litBase.getContext('2d');baseCtx.clearRect(0,0,w,h);
  const exposure=Math.pow(Math.max(.05,lightData[4]*.7+lightData[3]*.9*lightData[2]),1/2.2);
  baseCtx.filter=`brightness(${exposure})`;baseCtx.drawImage(bodyImage,...BODY_CROP,0,0,w,h);baseCtx.filter='none';
  baseCtx.globalCompositeOperation='source-atop';
  const color=lightColor(lightData[6]);baseCtx.fillStyle=`rgba(${color.map(x=>Math.round(x*255)).join(',')},${Math.abs(lightData[6])*.07})`;baseCtx.fillRect(0,0,w,h);
  baseCtx.globalCompositeOperation='source-over';
  litBaseKey=baseKey;
 }
 ctx.drawImage(litBase,0,0);
 ctx.globalCompositeOperation='source-atop';
 const c=Math.cos(angle),s=Math.sin(angle),side=lightData[0]*c+lightData[1]*s;
 const gradient=ctx.createLinearGradient(0,0,w,0);gradient.addColorStop(0,`rgba(255,255,255,${Math.max(0,-side)*.045*lightData[3]})`);gradient.addColorStop(.5,'rgba(255,255,255,0)');gradient.addColorStop(1,`rgba(255,255,255,${Math.max(0,side)*.045*lightData[3]})`);
 ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);ctx.globalCompositeOperation='source-over';relitSource?.close?.();relitSource=relitBody.transferToImageBitmap?.()??relitBody;relitSource.vehicleBodySprite=true;relitKey=key;return relitSource;
}
function contactShadow(ctx,pose){
 if(!pose.groundShadow||pose.isGhost||state.params.sceneLightingEnabled===false)return;
 lighting(state.params,lightData);
 const dx=-lightData[0]/Math.max(.25,lightData[2])*.65,dy=-lightData[1]/Math.max(.25,lightData[2])*.65;
 if(!shadowStamp){
  shadowStamp=typeof OffscreenCanvas==='undefined'?document.createElement('canvas'):new OffscreenCanvas(128,128);shadowStamp.width=shadowStamp.height=128;
  const stamp=shadowStamp.getContext('2d');
  const g=stamp.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(0,0,0,1)');g.addColorStop(1,'rgba(0,0,0,0)');stamp.fillStyle=g;stamp.fillRect(0,0,128,128);shadowStamp=shadowStamp.transferToImageBitmap?.()??shadowStamp;shadowStamp.environmentShadow=true;
 }
 const alpha=ctx.globalAlpha;
 const circle=(x,y,rx,ry,a)=>{ctx.globalAlpha=alpha*a;ctx.drawImage(shadowStamp,x-rx,y-ry,rx*2,ry*2);};
 for(let i=-1;i<=1;i++){const d=i*BODY_RECT.length*.25,x=pose.cx-Math.sin(pose.heading)*d,y=pose.cy+Math.cos(pose.heading)*d;circle(x+dx,y+dy,BODY_RECT.width*(.48+lightData[5]*.15),BODY_RECT.width*(.48+lightData[5]*.15),.28);circle(x,y,BODY_RECT.width*.48,BODY_RECT.width*.48,.30);}
 for(const [name]of WHEELS){const w=pose.wheels[name];circle(w.x,w.y,.20,.27,.45);}
 ctx.globalAlpha=alpha;
}

const WHEELS = [
  ['frontLeft', true], ['frontRight', true],
  ['rearLeft', false], ['rearRight', false],
];

const ready = image => image?.complete && image.naturalWidth > 0;

// Future motion sprites can be selected using this wheel's angular speed (rad/s).
function selectWheelImage(_name, _angularSpeed) {
  return wheelImage;
}

// Coordinates are already in world metres under the existing camera transform.
// Returns false until BOTH images load, so a failed asset keeps the full old car.
export function drawVehicleSprites(ctx, pose) {
  if(![pose.cx,pose.cy,pose.heading].every(Number.isFinite))return false;
  if (!vehicleSpriteSettings.enabled || !ready(bodyImage) || !ready(wheelImage)) return false;

  contactShadow(ctx,pose);
  for (const [name, isFront] of WHEELS) {
    const tire = getTireSpriteDimensions(pose.wheelRadius, name);
    const wheel = pose.wheels[name];
    const image = selectWheelImage(name, pose.wheelOmega?.[name] ?? 0);
    ctx.save();
    ctx.translate(wheel.x, wheel.y);
    ctx.rotate(pose.heading + (isFront ? pose.steerAngle : 0));
    ctx.drawImage(image, ...WHEEL_CROP, -tire.width / 2, -tire.length / 2,
      tire.width, tire.length);
    ctx.restore();
  }

  ctx.save();
  ctx.translate(pose.cx, pose.cy);
  ctx.rotate(pose.heading);
  const lit=bodyArtwork(pose);
  ctx.drawImage(lit??bodyImage,...(lit?[0,0,lit.width,lit.height]:BODY_CROP),BODY_RECT.x,BODY_RECT.y,BODY_RECT.width,BODY_RECT.length);
  if (pose.isStalled) {
    ctx.fillStyle = 'rgba(200, 50, 50, 0.28)';
    ctx.fillRect(BODY_RECT.x, BODY_RECT.y, BODY_RECT.width, BODY_RECT.length);
  }
  ctx.restore();
  if (vehicleSpriteSettings.calibration && !pose.isGhost) drawVehicleCalibration(ctx, pose);
  return true;
}
