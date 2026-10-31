// Linearized, work-conjugate contact port for a future coupled solver.
// Coordinates: X,Y,yaw,z,pitch,roll,z_FL,z_FR,z_RL,z_RR.
// Pitch/roll follow vertical.js: mount height = z + x*pitch + y*roll.
// h is the reference chassis-CG/contact-plane separation, not a load-shift gain.
export function contactPort({x,y,height}){
 if(![x,y,height].every(Number.isFinite)||height<0)throw Error('Invalid reference geometry');
 const jx=[1,0,-y,0,height,0,0,0,0,0],jy=[0,1,x,0,0,height,0,0,0,0];
 return {velocity(v){return [jx.reduce((a,j,i)=>a+j*v[i],0),jy.reduce((a,j,i)=>a+j*v[i],0)];},
 reaction(fx,fy){return jx.map((j,i)=>j*fx+jy[i]*fy);},jx,jy};
}
export function wheelContactPorts(vertical,height){return vertical.corners.map(([x,y])=>contactPort({x,y,height}));}
