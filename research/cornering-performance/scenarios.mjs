// Road steering radians; prescribed input is reasserted before each RAF so the
// audit branch's input-loss bug cannot confound matched mechanics/timing.
const rolling={speed:15,gear:'2',pedal:1};
export const scenarios=[
 {name:'idle',speed:0,gear:'N',steer:0},
 {name:'acceleration',...rolling,steer:0,throttle:1},
 {name:'coast',...rolling,gear:'N',steer:0,clutch:true},
 {name:'small-turn',...rolling,steer:.03},
 {name:'moderate-turn',...rolling,steer:.15},
 {name:'maximum-lock',...rolling,steer:.52},
 {name:'reversal',...rolling,reversal:true,steer:.25},
 {name:'turn-brake',...rolling,steer:.2,brake:true,clutch:true},
 {name:'turn-power',...rolling,steer:.2,throttle:.7},
 {name:'sideslip',...rolling,beta:.65,yaw:.5,spin:1.5,steer:-.2,throttle:.6},
];
