// Pure read-only mapping; all angles are mechanical coordinates or gear-derived.
export function visualState(s){
 const f=s.flywheel,w=s.wheels,carrierSpeed=(w[2].omega+w[3].omega)/2,carrierAngle=(w[2].angle+w[3].angle)/2;
 const shaftSpeed=f.ratio*carrierSpeed,power=f.torque*shaftSpeed;
 return {state:f.state,mode:s.drivetrain.mode,engineAngle:f.angle,engineSpeed:f.omega,engineRPM:f.omega*60/(2*Math.PI),shaftAngle:f.ratio*carrierAngle,shaftSpeed,shaftRPM:shaftSpeed*60/(2*Math.PI),carrierAngle,carrierSpeed,rearAngles:[w[2].angle,w[3].angle],rearSpeeds:[w[2].omega,w[3].omega],slip:f.omega-shaftSpeed,torque:f.torque,capacity:f.engagement*f.ratedTorque,heatPower:f.heatingPower,heat:f.heat,heating:f.heatingPower>1e-9,flow:power>1e-9?'engine to wheels':power< -1e-9?'wheels to engine':'no transmitted power',gap:f.state==='locked'?0:1-f.engagement,outputTorque:s.drivetrain.outputs||[0,0]};
}
