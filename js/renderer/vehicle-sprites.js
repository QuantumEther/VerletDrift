import { renderState as state } from '../state.js';
import { lighting, lightColor } from './environment.js';
import { BODY_CROP, WHEEL_CROP, BODY_RECT } from './vehicle-geometry.js';
import { getVehicleModel, visualTireDimensions } from './vehicle-models.js';
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
const bmwBodyImage = loadImage('../../assets/vehicles/bmw-e30-m3/body.png');
const bmwWheelImage = loadImage('../../assets/vehicles/bmw-e30-m3/wheel.svg');

let relitBody=null,relitSource=null,relitKey='',bmwRelitBody=null,bmwRelitSource=null,bmwRelitKey='',shadowStamp=null;
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
 const exposure=Math.pow(Math.max(.05,lightData[4]*.7+lightData[3]*.9*lightData[2]),1/2.2);
 ctx.filter=`brightness(${exposure})`;ctx.drawImage(bodyImage,...BODY_CROP,0,0,w,h);ctx.filter='none';
 ctx.globalCompositeOperation='source-atop';
 const color=lightColor(lightData[6]);ctx.fillStyle=`rgba(${color.map(x=>Math.round(x*255)).join(',')},${Math.abs(lightData[6])*.07})`;ctx.fillRect(0,0,w,h);
 const c=Math.cos(angle),s=Math.sin(angle),side=lightData[0]*c+lightData[1]*s;
 const gradient=ctx.createLinearGradient(0,0,w,0);gradient.addColorStop(0,`rgba(255,255,255,${Math.max(0,-side)*.045*lightData[3]})`);gradient.addColorStop(.5,'rgba(255,255,255,0)');gradient.addColorStop(1,`rgba(255,255,255,${Math.max(0,side)*.045*lightData[3]})`);
 ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);ctx.globalCompositeOperation='source-over';relitSource?.close?.();relitSource=relitBody.transferToImageBitmap?.()??relitBody;relitSource.vehicleBodySprite=true;relitKey=key;return relitSource;
}
function bmwBodyArtwork(pose){
 if(state.params.sceneLightingEnabled===false||pose.isGhost)return null;
 lighting(state.params,lightData);
 const angle=Math.round(pose.heading*24)/24,key=[angle,...lightData].join(':');
 if(key===bmwRelitKey)return bmwRelitSource;
 if(!bmwRelitBody)bmwRelitBody=typeof OffscreenCanvas==='undefined'?document.createElement('canvas'):new OffscreenCanvas(384,994);
 const w=384,h=Math.round(w*bmwBodyImage.naturalHeight/bmwBodyImage.naturalWidth);
 if(bmwRelitBody.width!==w||bmwRelitBody.height!==h){bmwRelitBody.width=w;bmwRelitBody.height=h;}
 const ctx=bmwRelitBody.getContext('2d');ctx.clearRect(0,0,w,h);
 const exposure=Math.pow(Math.max(.05,lightData[4]*.7+lightData[3]*.9*lightData[2]),1/2.2);
 ctx.filter=`brightness(${exposure})`;ctx.drawImage(bmwBodyImage,0,0,w,h);ctx.filter='none';
 ctx.globalCompositeOperation='source-atop';
 const color=lightColor(lightData[6]);ctx.fillStyle=`rgba(${color.map(x=>Math.round(x*255)).join(',')},${Math.abs(lightData[6])*.07})`;ctx.fillRect(0,0,w,h);
 const c=Math.cos(angle),s=Math.sin(angle),side=lightData[0]*c+lightData[1]*s;
 const gradient=ctx.createLinearGradient(0,0,w,0);gradient.addColorStop(0,`rgba(255,255,255,${Math.max(0,-side)*.045*lightData[3]})`);gradient.addColorStop(.5,'rgba(255,255,255,0)');gradient.addColorStop(1,`rgba(255,255,255,${Math.max(0,side)*.045*lightData[3]})`);
 ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);ctx.globalCompositeOperation='source-over';
 bmwRelitSource?.close?.();bmwRelitSource=bmwRelitBody.transferToImageBitmap?.()??bmwRelitBody;bmwRelitSource.vehicleBodySprite=true;bmwRelitKey=key;return bmwRelitSource;
}
function contactShadow(ctx,pose,model,wheels){
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
 const rect=model.bodyRect;
 for(let i=-1;i<=1;i++){const d=i*rect.length*.25,x=pose.cx-Math.sin(pose.heading)*d,y=pose.cy+Math.cos(pose.heading)*d;circle(x+dx,y+dy,model.bodyWidth*(.48+lightData[5]*.15),model.bodyWidth*(.48+lightData[5]*.15),.28);circle(x,y,model.bodyWidth*.48,model.bodyWidth*.48,.30);}
 for(const [name]of WHEELS){const w=wheels[name];circle(w.x,w.y,.20,.27,.45);}
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
  const model=getVehicleModel(pose.modelId??state.visualVehicleModel);
  const isBMW=model.id==='bmw-e30-m3';
  const carBody=isBMW?bmwBodyImage:bodyImage, carWheel=isBMW?bmwWheelImage:wheelImage;
  if (!vehicleSpriteSettings.enabled || !ready(carBody) || !ready(carWheel)) return false;
  const wheels=pose.visualWheels??pose.wheels;

  contactShadow(ctx,pose,model,wheels);
  for (const [name, isFront] of WHEELS) {
    const tire = visualTireDimensions(model.id,name,pose.wheelRadius);
    const wheel = wheels[name];
    const image = isBMW ? carWheel : selectWheelImage(name, pose.wheelOmega?.[name] ?? 0);
    ctx.save();
    ctx.translate(wheel.x, wheel.y);
    ctx.rotate(pose.heading + (isFront ? pose.steerAngle : 0));
    if(isBMW)ctx.drawImage(image,-tire.width/2,-tire.length/2,tire.width,tire.length);
    else ctx.drawImage(image, ...WHEEL_CROP, -tire.width / 2, -tire.length / 2,tire.width, tire.length);
    ctx.restore();
  }

  const c=Math.cos(pose.heading),s=Math.sin(pose.heading),ox=model.originOffset.x,oy=model.originOffset.y;
  ctx.save();
  ctx.translate(pose.cx+ox*c-oy*s,pose.cy+ox*s+oy*c);
  ctx.rotate(pose.heading);
  const lit=isBMW?bmwBodyArtwork(pose):bodyArtwork(pose);
  const rect=model.bodyRect;
  if(isBMW)ctx.drawImage(lit??carBody,...(lit?[0,0,lit.width,lit.height]:[]),rect.x,rect.y,rect.width,rect.length);
  else ctx.drawImage(lit??carBody,...(lit?[0,0,lit.width,lit.height]:BODY_CROP),BODY_RECT.x,BODY_RECT.y,BODY_RECT.width,BODY_RECT.length);
  if (pose.isStalled) {
    ctx.fillStyle = 'rgba(200, 50, 50, 0.28)';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.length);
  }
  ctx.restore();
  if (vehicleSpriteSettings.calibration && !pose.isGhost) drawVehicleCalibration(ctx, { ...pose, modelId:model.id, visualWheels:wheels });
  return true;
}
