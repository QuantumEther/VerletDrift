import {chromium} from '@playwright/test';
import {bootSimulatorLiquid,renderSimulatorLiquid,impactSimulatorLiquid} from '../../../tests/e2e/helpers/simulator-liquid.js';
const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({baseURL:process.env.AUDIT_URL || 'http://localhost:8000'});if(!await bootSimulatorLiquid(p))throw Error('WebGPU initialization failed');await impactSimulatorLiquid(p);
const controls=await p.evaluate(async()=>{const {CONTROLS}=await import('/js/ui/control-data.js');return CONTROLS.filter(c=>c.subsystem==='Rendering'&&c.type==='range').map(c=>({id:c.id,min:c.min,max:c.max}));});
let failures=0;for(const c of controls){const orig=await p.evaluate(c=>window.__liquidHarness.s.params[c.id],c);for(const v of [c.min,c.max]){await p.evaluate(({c,v})=>window.__liquidHarness.s.params[c.id]=v,{c,v});try{const r=await renderSimulatorLiquid(p,.7);if(r.errors.length||r.stats.liquidError||!r.stats.liquid?.airborne){failures++;console.log(c.id,v,JSON.stringify(r));}}catch(e){failures++;console.log(c.id,v,e.message);}}await p.evaluate(({c,orig})=>window.__liquidHarness.s.params[c.id]=orig,{c,orig});}
await b.close();console.log({controls:controls.length,endpoints:controls.length*2,failures});if(failures)process.exitCode=1;
