// Deterministic C1 height field. Illustrative surface friction, not calibration.
export function createTerrain({preset='flat',seed=1,amplitude=.2,roughness=.25}={}){
 if(!['flat','hills','rough','road'].includes(preset)||!Number.isInteger(seed)||!Number.isFinite(amplitude)||amplitude<0||amplitude>.5||!Number.isFinite(roughness)||roughness<0||roughness>1)throw Error('Unsupported terrain settings');
 let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const phases=Array.from({length:6},()=>random()*2*Math.PI);
 function landscape(x,y){const modes=[[.08,.04,1],[.045,-.065,.6],[.13,.09,.25],[.7,.3,roughness*.12],[.4,-.8,roughness*.1],[1.1,.5,roughness*.06]];let z=0,dx=0,dy=0;for(let i=0;i<modes.length;i++){const [kx,ky,w]=modes[i],arg=kx*x+ky*y+phases[i],a=amplitude*w*(preset==='hills'&&i>=3?0:preset==='rough'&&i<3?.2:1);z+=a*Math.sin(arg);dx+=a*kx*Math.cos(arg);dy+=a*ky*Math.cos(arg);}return {z,dx,dy};}
 function sample(x,y){
  if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Nonfinite terrain position');
  if(preset==='flat')return {height:0,gradient:[0,0],normal:[0,0,1],surface:'asphalt',friction:.9,road:null};
  let h=landscape(x,y),surface=preset==='rough'?'dirt':'grass',friction=surface==='dirt'?.55:.45,road=null;
  if(preset==='road'){
   const center=2*Math.sin(x*.025+phases[0]),slope=.05*Math.cos(x*.025+phases[0]),distance=y-center,d=Math.abs(distance),width=3,shoulder=2;
   const u=Math.max(0,Math.min(1,(d-width)/shoulder)),blend=u*u*(3-2*u),db=(u>0&&u<1?6*u*(1-u)/shoulder:0)*Math.sign(distance);
   const grade=landscape(x,center),gradeDx=grade.dx+grade.dy*slope,delta=h.z-grade.z;
   h={z:grade.z+blend*delta,dx:gradeDx+blend*(h.dx-gradeDx)-db*slope*delta,dy:blend*h.dy+db*delta};
   surface=d<=width?'asphalt':d<width+shoulder?'gravel':'grass';friction=surface==='asphalt'?.9:surface==='gravel'?.6:.45;road={center,width:2*width,shoulder};
  }
  const length=Math.hypot(h.dx,h.dy,1);return {height:h.z,gradient:[h.dx,h.dy],normal:[-h.dx/length,-h.dy/length,1/length],surface,friction,road};
 }
 return Object.freeze({settings:Object.freeze({preset,seed,amplitude,roughness}),sample});
}
