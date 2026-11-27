import {motionDefaults} from './motion-blur.js';

export function mountMotionBlurControls(container,backend,onChange,query){
 const section=document.createElement('details');
 section.innerHTML=`<summary>Motion blur</summary><div class="motion-controls"></div>
 <p class="note">Virtual shutter sets exposure in milliseconds. Camera and object motion follow the scene. Blur leaves the HUD sharp.</p>
 <button type="button">Reset motion settings</button>`;
 const fields=section.querySelector('.motion-controls'),inputs={};
 function control(key,label,type,attributes={}){
  const row=document.createElement('label');
  row.textContent=label+' ';
  const input=document.createElement(type==='select'?'select':'input');
  if(type!=='select')input.type=type;
  Object.assign(input,attributes);
  row.append(input);fields.append(row);inputs[key]=input;
  return input;
 }
 control('enabled','Enable motion blur','checkbox');
 const quality=control('quality','Quality','select');
 for(const [id,name] of [['fast','Fast · 4'],['balanced','Balanced · 8'],['cinematic','Cinematic · 16'],['ultra','Ultra · 24']])quality.add(new Option(name,id));
 control('intensity','Intensity','number',{min:0,max:2,step:.05});
 control('shutter','Shutter exposure (ms)','number',{min:1,max:25,step:1});
 control('periphery','Peripheral enhancement','number',{min:0,max:1,step:.05});
 control('camera','Camera motion','number',{min:0,max:2,step:.05});
 control('body','Vehicle body motion','number',{min:0,max:2,step:.05});
 control('wheels','Wheel rotation blur','checkbox');
 control('radius','Maximum span (px)','number',{min:2,max:48,step:1});
 control('depth','Reject across depth edges','checkbox');
 function apply(settings){
  for(const [key,input] of Object.entries(inputs)){
   if(input.type==='checkbox')input.checked=settings[key];else input.value=settings[key];
  }
 }
 apply({...motionDefaults,enabled:backend==='webgpu'&&query.get('motion')!=='off'});
 const read=()=>Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.type==='checkbox'?input.checked:input.type==='number'
  ?Math.max(Number(input.min),Math.min(Number(input.max),input.valueAsNumber||0)):input.value]));
 section.addEventListener('change',()=>onChange(read()));
 section.querySelector('button').onclick=()=>{apply(motionDefaults);onChange(read());};
 if(backend!=='webgpu'){
  section.querySelector('p').textContent='Motion blur is available with the WebGPU renderer.';
  for(const input of section.querySelectorAll('input,select,button'))input.disabled=true;
 }
 container.append(section);
 return read;
}
