import {createTerrain} from '../../procedural-terrain/src/terrain.js';
export const plane=(angle=0,mu=.9)=>({settings:{type:'plane',angle,mu},sample:(x,y)=>({height:Math.tan(angle)*x,gradient:[Math.tan(angle),0],friction:mu})});
export const crest={settings:{type:'sinusoidal-crest',height:.12,wavenumber:.7},sample:(x,y)=>({height:.12*Math.cos(.7*x)+.025*Math.sin(.8*y),gradient:[-.084*Math.sin(.7*x),.02*Math.cos(.8*y)],friction:.9})};
export const flat=plane();
export const cases=[
 {id:'flat-acceleration',terrain:flat,initial:{engine:40},duration:.6,input:()=>({throttle:.65,clutch:.5})},
 {id:'slope-hold',terrain:plane(5*Math.PI/180),initial:{equilibrium:true},duration:1,input:()=>({serviceBrake:1,clutch:1,ignition:false})},
 {id:'slope-insufficient-grip',terrain:plane(5*Math.PI/180,.03),initial:{engine:0},duration:.6,input:()=>({serviceBrake:1,clutch:1,ignition:false})},
 {id:'uphill',terrain:plane(5*Math.PI/180),initial:{},duration:.6,input:()=>({throttle:.8,clutch:.5})},
 {id:'downhill',terrain:plane(-5*Math.PI/180),initial:{engine:0},duration:.6,input:()=>({clutch:0,ignition:false})},
 {id:'hills',terrain:createTerrain({preset:'hills',amplitude:.25,roughness:.5,seed:23}),initial:{speed:4},duration:1,input:()=>({throttle:.5,clutch:.5})},
 {id:'uneven-braking',terrain:createTerrain({preset:'rough',amplitude:.15,roughness:.7,seed:29}),initial:{speed:4},duration:.6,input:t=>({serviceBrake:t>=.1?.8:0,clutch:0,ignition:false})},
 {id:'uneven-drift',terrain:createTerrain({preset:'rough',amplitude:.12,roughness:.6,seed:31}),initial:{speed:4,lateral:1,yaw:.3},duration:.6,input:t=>({steer:t<.3?.15:-.1,handbrake:t>=.2&&t<.4?.7:0,clutch:.4,throttle:.4})},
 {id:'crest',terrain:crest,initial:{speed:5,x:-2},duration:1,input:()=>({throttle:.3,clutch:.3})},
 {id:'recontact',terrain:crest,initial:{speed:3},lift:.12,duration:.6,input:()=>({clutch:.8,throttle:.4,serviceBrake:.15})},
 {id:'clutch-transition',terrain:crest,initial:{speed:2,engine:60},duration:.6,input:t=>({clutch:t<.2?0:1,throttle:.2})},
 {id:'road-shoulder',terrain:createTerrain({preset:'road',amplitude:.15,roughness:.5,seed:7}),initial:{speed:3,lateral:1,heading:.3,y:4.5},duration:.6,input:()=>({clutch:0,ignition:false})}
];
export function initialize(create,c){const s=create(c.terrain,c.initial);if(c.lift){s.y[6]+=c.lift;for(let i=9;i<13;i++)s.y[i]+=c.lift;}return s;}
