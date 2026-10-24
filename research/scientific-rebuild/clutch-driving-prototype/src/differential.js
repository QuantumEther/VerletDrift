export function createDifferential(mode='independent') {
 if(!['independent','open','locked'].includes(mode))throw new RangeError('Unknown differential mode');
 return {mode,carrierInertia:mode==='independent'?0:.4};
}
// Eliminate ideal gear constraints analytically. Carrier speed is derived,
// but its kinetic energy remains in the reduced rotational mass matrix.
export function inverseRotorMass(wheels,diff) {
 const B=wheels.map((w,i)=>wheels.map((_,j)=>i===j?1/w.inertia:0));
 const l=2,r=3,jl=wheels[l].inertia,jr=wheels[r].inertia,jc=diff.carrierInertia;
 if(diff.mode==='locked'&&Math.abs(wheels[2].omega-wheels[3].omega)>1e-10)throw new Error('Lock requires reset/equal initial shaft speeds');
 if(diff.mode==='open'){
  const a=jc/4,det=(jl+a)*(jr+a)-a*a;
  B[l][l]=(jr+a)/det;B[r][r]=(jl+a)/det;B[l][r]=B[r][l]=-a/det;
 } else if(diff.mode==='locked'){
  B[l][l]=B[r][r]=B[l][r]=B[r][l]=1/(jl+jr+jc);
 }
 return B;
}
export function rotorEnergy(wheels,diff,speeds=wheels.map(w=>w.omega)) {
 return wheels.reduce((e,w,i)=>e+.5*w.inertia*speeds[i]**2,0)+.5*diff.carrierInertia*((speeds[2]+speeds[3])/2)**2;
}
export function recordDifferential(diff,wheels,old,acc,ports,h,input) {
 const speed=wheels.map(w=>w.omega),mid=speed.map((v,i)=>(v+old[i])/2);
 diff.carrierSpeed=(speed[2]+speed[3])/2;diff.inputTorque=input;
 diff.outputs=[2,3].map(i=>wheels[i].inertia*acc[i]+wheels[i].radius*wheels[i].fx-wheels[i].brake);
 const carrierAcc=(acc[2]+acc[3])/2;
 diff.powerResidual=input*diff.carrierSpeed-diff.outputs[0]*speed[2]-diff.outputs[1]*speed[3]-diff.carrierInertia*carrierAcc*diff.carrierSpeed;
 const work=h*wheels.reduce((sum,w,i)=>sum+(ports[i]-w.radius*w.fx)*mid[i],0);
 diff.energyResidual=rotorEnergy(wheels,diff)-rotorEnergy(wheels,diff,old)-work;
 diff.constraintResidual=diff.mode==='locked'?speed[2]-speed[3]:0;
 diff.lockReaction=diff.mode==='locked'?(diff.outputs[0]-diff.outputs[1])/2:0;
}
