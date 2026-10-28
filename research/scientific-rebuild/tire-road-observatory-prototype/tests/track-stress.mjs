// Synthetic prescribed-contact telemetry for storage/render stress ONLY.
// This does not drive or reset a vehicle, and is not a handling experiment.
export function stressSample(time,{rolling=false,stationary=false}={}){
 const x=stationary?0:8*time,sx=rolling?0:8,force=rolling?0:-225;
 return {time,center:{x,y:0,z:0},bump:null,heading:0,wheels:[0,1,2,3].map(i=>({name:['FL','FR','RL','RR'][i],position:{x:x+(i<2?1:-1),y:i%2?-.6:.6,z:0},heading:0,forceHeading:0,omega:rolling?25:0,normal:250,mu:.9,sx,sy:0,fx:force,fy:0,power:-force*sx,slidingSpeed:Math.abs(sx),utilization:rolling?0:1,supported:true,geometryContact:true,saturated:!rolling,brakeTorque:0}))};
}
