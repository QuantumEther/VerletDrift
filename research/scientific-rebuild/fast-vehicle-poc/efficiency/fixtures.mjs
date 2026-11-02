import {create,P} from '../model.js';
export const cases=['acceleration','steering','braking','drift-recovery','recontact','clutch-transition','hold-release'];
export function ports(name,t){return {throttle:['acceleration','steering'].includes(name)?.2:0,ignition:['acceleration','steering','clutch-transition','hold-release'].includes(name),starter:name==='hold-release',steer:name==='steering'?.03:name==='drift-recovery'?(t<.4?.05:-.03):0,serviceBrake:name==='braking'||name==='hold-release'&&t<.5?1:0,handbrake:name==='drift-recovery'&&t>=.2&&t<.4?.3:0,clutch:name==='clutch-transition'?(t<.2?0:.6):name==='hold-release'?1:.3};}
export function init(name){const moving=!['acceleration','recontact','hold-release'].includes(name),s=create({speed:moving?5:0,lateral:name==='drift-recovery'?1:0,yaw:name==='drift-recovery'?-.1:0,engine:name==='hold-release'?0:moving?P.gear*5/P.R:40});if(name==='recontact')s.y[9]=.35;if(name==='drift-recovery')s.y[22]=s.y[23]=7/P.R;return s;
}

import {execFileSync} from 'node:child_process';import {readFile} from 'node:fs/promises';import {posix} from 'node:path';
export const BASE='a8be5c99d16140dafc042282691ae95b972a2181';
export async function baseline(){
 const root=new URL('../',import.meta.url),path='research/scientific-rebuild/fast-vehicle-poc/';
 for(const name of ['./model.js','./constraints.js','../four-corner-load-transfer/src/vertical.js','../tire-road-observatory-prototype/src/engine.js','../tire-road-observatory-prototype/src/brakes.js']){const expected=execFileSync('git',['show',BASE+':'+posix.normalize(path+name)],{encoding:'utf8'});if(expected!==await readFile(new URL(name,root),'utf8'))throw Error('Baseline dependency changed: '+name);}
 const source=execFileSync('git',['show',BASE+':'+path+'consistent-model.js'],{encoding:'utf8'});
 const pinned=source.replace(/from '([^']+)'/g,(_,name)=>"from '"+new URL(name,root).href+"'");
 return import('data:text/javascript;base64,'+Buffer.from(pinned).toString('base64'));
}
