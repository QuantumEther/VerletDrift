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

// Symmetric coordinate-increment discrete gradient of the SAME vertical-gap
// potential. This is a force evaluator for an implicit update, not another
// vehicle/contact solver. At finite displacement its direction is a discrete
// terrain gradient; it converges to the local normal as displacement vanishes.
export function discreteTerrainNormal(terrain,start,end,radius,stiffness){
 const a=evaluateTerrainNormal(terrain,start,radius,stiffness),b=evaluateTerrainNormal(terrain,end,radius,stiffness);
 const [x,y,z]=start,[X,Y,Z]=end,dx=X-x,dy=Y-y;
 const h00=a.sample.height,h11=b.sample.height,h10=terrain.sample(X,y).height,h01=terrain.sample(x,Y).height;
 const gx=dx!==0?((h10-h00)+(h11-h01))/(2*dx):(terrain.sample(x,y).gradient[0]+terrain.sample(x,Y).gradient[0])/2;
 const gy=dy!==0?((h01-h00)+(h11-h10))/(2*dy):(terrain.sample(x,y).gradient[1]+terrain.sample(X,y).gradient[1])/2;
 const gap0=radius+h00-z,gap1=radius+h11-Z;
 const pressure=gap1!==gap0?(b.elasticEnergy-a.elasticEnergy)/(gap1-gap0):stiffness*Math.max(0,gap0);
 const force=[-pressure*gx,-pressure*gy,pressure],displacement=end.map((v,i)=>v-start[i]);
 const work=force.reduce((s,f,i)=>s+f*displacement[i],0);
 return {force,pressure,work,energyBefore:a.elasticEnergy,energyAfter:b.elasticEnergy,residual:b.elasticEnergy-a.elasticEnergy+work};
}
