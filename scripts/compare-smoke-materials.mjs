import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {bootSmokeMaterial} from '../tests/e2e/helpers/smoke-material.js';
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1];};const out=arg('--output','/tmp/smoke-materials');mkdirSync(out,{recursive:true});
const b=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:process.argv.includes('--native')?['--no-sandbox','--enable-unsafe-webgpu']:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{const p=await b.newPage({baseURL:'http://localhost:8000',viewport:{width:900,height:750}});const info=await bootSmokeMaterial(p,{profile:true});const frames=[];
 for(const scene of ['sparse','dense','overlap'])for(const light of ['daylight','overcast','side','back'])for(const mode of [0,1,2]){
  const r=await p.evaluate(async({scene,light,mode})=>{const a=window.__material,env=await import('/js/renderer/environment.js');a.seed(scene);Object.assign(a.s.params,env.LIGHT_PRESETS[light]??{...env.LIGHT_PRESETS.daylight,sceneLightElevation:20,sceneLightAzimuth:light==='back'?270:0});a.render(mode);await a.paint();const pix=await a.pixels();let hash=2166136261;for(const x of pix)hash=Math.imul(hash^x,16777619)>>>0;return {hash,errors:a.errors,bytes:a.volume.bytes};},{scene,light,mode});
  if(r.errors.length)throw Error(JSON.stringify(r));await p.locator('#smoke-material').screenshot({path:`${out}/${scene}-${light}-${mode}.png`});frames.push({scene,light,mode,...r});
 }
 writeFileSync(`${out}/validation.json`,JSON.stringify({info,frames},null,2));console.log({out,frames:frames.length});
}finally{await b.close();}
