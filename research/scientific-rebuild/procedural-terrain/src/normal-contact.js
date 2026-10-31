// Conservative terrain-normal contact using the inherited vertical-equivalent
// stiffness. Potential U = .5*k*max(r+h(x,y)-z,0)^2. Its gradient gives a force
// exactly parallel to the sampled normal, without a separate slope force.
// On slopes this parameter is vertical-gap stiffness, NOT constant normal-gap
// stiffness. Flat ground reduces exactly to the predecessor's compliant law.
export function evaluateTerrainNormal(terrain,position,radius,stiffness){
 if(position.length!==3||!position.every(Number.isFinite)||!(radius>0&&stiffness>0))throw Error('Invalid tire normal geometry');
 const sample=terrain.sample(position[0],position[1]);
 const penetration=Math.max(0,radius+sample.height-position[2]),verticalForce=stiffness*penetration;
 const force=[-sample.gradient[0]*verticalForce,-sample.gradient[1]*verticalForce,verticalForce];
 return {sample,penetration,normalCompression:penetration*sample.normal[2],force,normalForce:Math.hypot(...force),elasticEnergy:.5*stiffness*penetration**2,contact:penetration>0};
}
export function mapNormalReaction(contact,pointRows,velocity){
 if(pointRows.length!==3||pointRows.some(r=>r.length!==18)||velocity.length!==18)throw Error('Invalid contact Jacobian dimensions');
 const reaction=Array(18).fill(0);for(let i=0;i<18;i++)for(let k=0;k<3;k++)reaction[i]+=pointRows[k][i]*contact.force[k];
 return {reaction,power:reaction.reduce((sum,f,i)=>sum+f*velocity[i],0)};
}
