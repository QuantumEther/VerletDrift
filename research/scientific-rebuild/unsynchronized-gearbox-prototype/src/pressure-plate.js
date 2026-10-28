// Illustrative axial assembly, SI units; not calibrated to a production clutch.
// x>0 compresses the contact spring, x<0 is an actual separation.
export function createPressurePlate(){return {x:-.001,v:0,mass:.08,servoStiffness:100000,contactStiffness:500000,damping:440,openTravel:.001,commandTravel:.006,mu:.3,effectiveRadius:.1,faces:2,normal:0,capacity:0,energy:0,commandWork:0,dampingHeat:0,numericalLoss:0,target:-.001};}
export function plateEnergy(a,target=a.target){return .5*a.mass*a.v**2+.5*a.servoStiffness*(a.x-target)**2+.5*a.contactStiffness*Math.max(0,a.x)**2;}
export function advancePressurePlate(a,command,h){
 if(!(command>=0&&command<=1&&h>0))throw new RangeError('Invalid clutch command/timestep');
 const target=-a.openTravel+(a.commandTravel+a.openTravel)*command,oldEnergy=plateEnergy(a),commandWork=plateEnergy(a,target)-oldEnergy,x0=a.x,v0=a.v;
 let next;
 // Backward Euler with two exact linear active sets. No root search, substeps,
 // position reset or locking timer. Unilateral spring force is continuous at x=0.
 for(const contact of [false,true]){const k=a.servoStiffness+(contact?a.contactStiffness:0),v=(a.mass*v0+h*a.servoStiffness*(target-x0)-h*(contact?a.contactStiffness*x0:0))/(a.mass+h*a.damping+h*h*k),x=x0+h*v;if(contact?x>=0:x<=0){next={x,v};break;}}
 if(!next)throw new Error('Pressure plate active set unresolved');
 Object.assign(a,next,{target});a.normal=a.contactStiffness*Math.max(0,a.x);a.capacity=a.faces*a.mu*a.effectiveRadius*a.normal;
 const damping=h*a.damping*a.v**2,energy=plateEnergy(a),loss=oldEnergy+commandWork-energy-damping;
 if(loss< -1e-8)throw new Error('Pressure plate energy inequality violated');
 a.energy=energy;a.commandWork+=commandWork;a.dampingHeat+=damping;a.numericalLoss+=Math.max(0,loss);
 return a;
}
