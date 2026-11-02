// Authored, analytic height fields and road corridors. SI units; synthetic grip.
// Height is independent of surface classification and artwork.
import {createTerrain} from '../../../procedural-terrain/src/terrain.js';
export const authored=['mountain','yard','rally'];
const configs={
 mountain:{name:'Alpine pass',width:3.2,shoulder:1.25,road:'asphalt',off:'rock',mu:.9,offMu:.46,curve:x=>[3.6*Math.sin(x*.045),.162*Math.cos(x*.045)],height:(x,y)=>{const a=.16*x+.09*y,b=.045*x-.08*y;return [.65*Math.sin(b)+.18*Math.sin(a),.65*.045*Math.cos(b)+.18*.16*Math.cos(a),-.65*.08*Math.cos(b)+.18*.09*Math.cos(a)];}},
 yard:{name:'Industrial proving ground',width:3.4,shoulder:1.1,road:'concrete',off:'gravel',mu:.88,offMu:.6,curve:x=>[0,0],height:(x,y)=>[.16*Math.sin(x*.035),.0056*Math.cos(x*.035),0]},
 rally:{name:'Highland gravel stage',width:2.8,shoulder:1.3,road:'dirt',off:'grass',mu:.58,offMu:.43,curve:x=>[2.7*Math.sin(x*.065)+.7*Math.sin(x*.14),.1755*Math.cos(x*.065)+.098*Math.cos(x*.14)],height:(x,y)=>{const a=.08*x+.045*y,b=.12*x-.07*y;return [.36*Math.sin(a)+.12*Math.sin(b),.0288*Math.cos(a)+.0144*Math.cos(b),.0162*Math.cos(a)-.0084*Math.cos(b)];}}
};
export function createMap(settings){
 if(!authored.includes(settings.preset))return createTerrain(settings);
 const cfg=configs[settings.preset];
 if(!Number.isInteger(settings.seed)||!Number.isFinite(settings.amplitude)||settings.amplitude<0||settings.amplitude>.5||!Number.isFinite(settings.roughness)||settings.roughness<0||settings.roughness>1)throw Error('Invalid terrain settings');
 function layout(x,y){const [center,slope]=cfg.curve(x),distance=y-center,d=Math.abs(distance),surface=d<=cfg.width?cfg.road:d<=cfg.width+cfg.shoulder?'gravel':cfg.off,friction=d<=cfg.width?cfg.mu:d<=cfg.width+cfg.shoulder?.6:cfg.offMu;return {surface,friction,road:{center,slope,distance,width:cfg.width*2,shoulder:cfg.shoulder}};}
 function sample(x,y){if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Invalid map coordinate');const [height,hx,hy]=cfg.height(x,y),n=Math.hypot(hx,hy,1);return {height,gradient:[hx,hy],normal:[-hx/n,-hy/n,1/n],...layout(x,y)};}
 return Object.freeze({settings:Object.freeze({...settings}),name:cfg.name,sample,paint:(x,y)=>mapColor(layout(x,y),x,y,settings.preset)});
}
export function mapColor(sample,x,y,preset){
 const palettes={mountain:{asphalt:[65,70,72],gravel:[135,127,111],rock:[102,111,103]},yard:{concrete:[119,123,119],gravel:[108,105,95]},rally:{dirt:[137,101,68],gravel:[162,138,103],grass:[77,99,68]}};
 const palette=palettes[preset];if(!palette)return null;
 const rgb=palette[sample.surface]||[87,102,76],r=sample.road,d=Math.abs(r.distance),width=r.width/2;
 // Painted lines are visual overlays placed from the same analytic corridor.
 if(preset==='mountain'&&sample.surface==='asphalt'&&((Math.abs(d-(width-.24))<.16)||(Math.abs(r.distance)<.12&&((x%8+8)%8)<4.2)))return [218,210,174];
 if(preset==='yard'&&sample.surface==='concrete'&&(Math.abs(d-(width-.28))<.16||(Math.abs(r.distance)<.12&&((x%10+10)%10)<5)||(((x%18+18)%18)<.17&&d<width-.5)))return [206,181,83];
 if(preset==='rally'&&sample.surface==='dirt'&&Math.abs(d-(width-.2))<.12&&((x%10+10)%10)<1.1)return [184,159,119];
 // Low-amplitude deterministic material variation; never feeds contact physics.
 const grain=2.7*Math.sin(x*2.7+y*3.9)+1.7*Math.sin(x*8.1-y*6.3);
 const seam=preset==='yard'&&sample.surface==='concrete'&&((x%5+5)%5)<.09?-9:0;
 return rgb.map(c=>Math.max(0,Math.min(255,Math.round(c+grain+seam))));
}
