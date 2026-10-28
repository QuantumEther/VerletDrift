import {rotorEnergy} from './differential.js';
import {shaftState} from './gearbox.js';
// Read current coordinates, including impulses applied after the force stage.
// Excludes heave/pitch/axial actuator energy; those have separate ledgers.
export function reducedKineticEnergy(s){const p=s.planar,m=s.mass+s.corners.reduce((a,c)=>a+c.mass,0);return .5*m*(p.u*p.u+p.v*p.v)+.5*p.Iz*p.r*p.r+rotorEnergy(s.wheels,s.drivetrain)+.5*s.flywheel.inertia*s.flywheel.omega**2+.5*s.gearbox.inputInertia*shaftState(s).omega**2+.5*s.gearbox.selectorMass*s.gearbox.velocity**2;}
