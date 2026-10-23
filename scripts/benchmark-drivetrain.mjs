// Headless production mechanical prefix: excludes rendering/audio, includes all
// chassis, steering, suspension and contact work. --root compares another tree.
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
const arg=process.argv.indexOf('--root');
const root=resolve(arg<0?'.':process.argv[arg+1]);
const load=p=>import(pathToFileURL(resolve(root,p)));
const {default:state}=await load('js/state.js');
const {mechanicalStep}=await load('tests/helpers/mechanical-step.js');
const {initializeCarBody,computeBodyDerivedState,handleGearChange}=await load('js/physics/index.js');
const initial=structuredClone(state);
function reset(profile,dt){
 Object.assign(state,structuredClone(initial));
 Object.assign(state.params,{mapWidth:100000,mapHeight:100000});
 initializeCarBody(1000,1000);computeBodyDerivedState(dt);
 state.engine.currentGear='1';
 if(profile==='wheelspin')state.params.tireFrictionCoeff=.15;
 if(profile==='idle'){state.engine.currentGear='N';state.engine.rpm=1000;}
 if(profile==='starter'){
  state.engine.currentGear='N';Object.assign(state.engine,{mode:'starting',omega:0,rpm:0,isRunning:false});
 }
 if(profile==='gentle')state.params.clutchEngageTime=2;
}
function driver(profile,t,dt){
 state.input.clutchKeyHeld=t<.6;
 state.input.throttleKeyHeld=!['clutch','idle','starter','gentle'].includes(profile);
 state.input.brakeKeyHeld=profile==='clutch';
 if(profile==='idle'||profile==='starter')state.input.clutchKeyHeld=true;
 if(profile==='gentle')state.input.clutchKeyHeld=false;
 if(profile==='shifts'){
  state.input.clutchKeyHeld=t<.6||(t>=2&&t<2.4)||(t>=3&&t<3.4);
  if(t>=2&&t<2+dt*.5)handleGearChange('2');
  if(t>=3&&t<3+dt*.5)handleGearChange('1');
 }
}
function run(profile,hz,measure=false){
 const dt=1/hz;reset(profile,dt);
 const samples=[];let stallAt=null,lockAt=null,maxSlip=0;
 for(let i=0;i<4*hz;i++){
  const t=i*dt;driver(profile,t,dt);
  const begin=performance.now();mechanicalStep(dt);
  if(measure)samples.push(performance.now()-begin);
  if(state.engine.isStalled&&stallAt===null)stallAt=(i+1)*dt;
  if(state.engine.drivetrainLocked&&lockAt===null)lockAt=(i+1)*dt;
  maxSlip=Math.max(maxSlip,Math.abs(state.engine.clutchSlipRadS||0));
 }
 return {samples,rpm:state.engine.rpm,speed:state.body.speed,mode:state.engine.mode,
  gear:state.engine.currentGear,stallAt,lockAt,maxSlip,
  clutchHeatJ:state.engine.clutchHeatJ,frictionHeatJ:state.engine.frictionHeatJ};
}
if(process.argv.includes('--convergence')){
 for(const profile of ['idle','starter','gentle','launch','clutch','shifts'])
  for(const hz of [50,100,200,400]){const r=run(profile,hz);delete r.samples;console.log(JSON.stringify({profile,hz,...r}));}
}else{
 for(const profile of ['clutch','launch','shifts','wheelspin']){
  for(let i=0;i<3;i++)run(profile,100);
  const begin=performance.now(),samples=[];
  for(let i=0;i<8;i++)samples.push(...run(profile,100,true).samples);
  const elapsed=(performance.now()-begin)/1000;
  samples.sort((a,b)=>a-b);
  console.log(JSON.stringify({profile,steps:samples.length,meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,
   p95Ms:samples[Math.ceil(samples.length*.95)-1],worstMs:samples.at(-1),stepsPerWallSecond:samples.length/elapsed}));
 }
}
