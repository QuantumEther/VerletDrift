export const RATIOS={N:0,'1':3.5,'2':2};
export function createGearbox(){return {selected:'1',inputInertia:.1,bearingDrag:.005,neutralOmega:0,neutralAngle:0,phase:0,reason:'',pending:null,transitionEnergy:0};}
export function shaftState(s){const g=s.gearbox,G=RATIOS[g.selected],w=s.wheels;return G?{omega:G*(w[2].omega+w[3].omega)/2,angle:g.phase+G*(w[2].angle+w[3].angle)/2}:{omega:g.neutralOmega,angle:g.neutralAngle};}
export function syncGearParameters(s){const g=s.gearbox; s.flywheel.ratio=RATIOS[g.selected];s.flywheel.gearbox=g;s.drivetrain.additionalCarrierInertia=g.inputInertia*s.flywheel.ratio**2;}
export function requestGear(s,target){
 const g=s.gearbox;if(!(target in RATIOS))throw new RangeError('Unknown gear');
 const reject=reason=>{g.reason=reason;return false;};
 if(s.flywheel.engagement>0)return reject('Disengage clutch before shifting');
 if(target===g.selected){g.reason='';return true;}
 if(target!=='N'&&g.selected!=='N')return reject('Select neutral before another ratio');
 const shaft=shaftState(s),carrier=(s.wheels[2].omega+s.wheels[3].omega)/2;
 if(target!=='N'&&Math.abs(shaft.omega-RATIOS[target]*carrier)>1e-7)return reject('Shaft speed mismatch: no synchronizer');
 if(target==='N'){g.neutralOmega=shaft.omega;g.neutralAngle=shaft.angle;}
 else {g.phase=shaft.angle-RATIOS[target]*(s.wheels[2].angle+s.wheels[3].angle)/2;g.transitionEnergy+=.5*g.inputInertia*((RATIOS[target]*carrier)**2-shaft.omega**2);}
 g.selected=target;g.reason='';g.pending=null;syncGearParameters(s);return true;
}
export function armGear(s,target){if(!['1','2'].includes(target)){s.gearbox.reason='Request a forward ratio before arming the gate';return false;}if(s.gearbox.selected!=='N'||s.flywheel.engagement!==0){s.gearbox.reason='Matching gate requires neutral and open clutch';return false;}s.gearbox.pending=target;s.gearbox.reason='Waiting for natural shaft speed match (no synchronizer torque)';return true;}
