// Actual simulator WGSL captures. Software GPU timings are not hardware benchmarks.
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {bootSimulatorLiquid,renderSimulatorLiquid,impactSimulatorLiquid} from '../tests/e2e/helpers/simulator-liquid.js';
import {mkdirSync,writeFileSync} from 'node:fs';
const option=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const mode=option('--mode','daylight');
const root=resolve(option('--output','/tmp/coherence-capture'));mkdirSync(root,{recursive:true});
const b=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{const p=await b.newPage({baseURL:option('--url','http://localhost:8000'),viewport:{width:900,height:900}});if(!await bootSimulatorLiquid(p))throw Error('GPU failed');
 await p.evaluate(async(mode)=>{const{s,target}=window.__liquidHarness;target.width=900;target.height=900;s.params.pixelsPerMeter=58;s.skidMarks=Array.from({length:24},(_,i)=>({x1:-4+i*.22,y1:2+Math.sin(i*.16),x2:-4+(i+1)*.22,y2:2+Math.sin((i+1)*.16),width:.25,hue:-1,alpha:.7}));const {LIGHT_PRESETS}=await import('/js/renderer/environment.js');if(mode==='legacy')s.params.sceneLightingEnabled=false;else Object.assign(s.params,LIGHT_PRESETS[mode]??{});if(mode==='crimson')s.params.balloonAppearance=1;if(mode==='mixed'){s.params.balloonAppearance=2;s.params.balloonCrimsonRatio=.5;}if(mode==='detail'){s.params.pixelsPerMeter=145;}if(mode==='rotated'){const angle=1,c=Math.cos(angle),sn=Math.sin(angle);s.body.heading=angle;s.steering.frontWheelAngle=.3;for(const w of Object.values(s.wheels)){const x=w.x-s.body.centerX,y=w.y-s.body.centerY;w.x=s.body.centerX+x*c-y*sn;w.y=s.body.centerY+x*sn+y*c;}}
 s.balloons=[0,90,210,315].map((hue,i)=>({x:-4+i*2.6,y:-4.8,radius:.47,hue,isPopped:false}));},mode);
 await impactSimulatorLiquid(p,{hue:mode==='crimson'?350:0});
 const result=[];for(const[t,name]of[[0,'dry'],[.7,'impact'],[5,'wet']]){const f=await renderSimulatorLiquid(p,t,true);await p.locator('#liquid-capture').screenshot({path:`${root}/${name}.png`});result.push({name,time:t,...f});}writeFileSync(`${root}/measurements.json`,JSON.stringify(result,null,2));
}finally{await b.close();}
