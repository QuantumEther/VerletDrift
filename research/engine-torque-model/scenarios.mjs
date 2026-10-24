const launch=(name,throttle)=>({name,gear:'1',rpm:800,pedal:0,duration:6,events:[{time:0,clutch:true,throttle},{time:1,clutch:false}]});
export const loadedScenarios=[
 {name:'starting-rest',gear:'N',rpm:0,mode:'stopped',duration:5,events:[{time:0,toggle:true,clutch:true}]},
 launch('gentle-launch',.15),launch('ordinary-launch',.35),launch('aggressive-launch',1),
 {name:'upshift',gear:'2',speed:12,pedal:1,duration:5,events:[{time:0,throttle:.35},{time:1,clutch:true,throttle:0},{time:1.3,gear:'3'},{time:1.7,clutch:false,throttle:.35}]},
 {name:'downshift',gear:'3',speed:12,pedal:1,duration:5,events:[{time:0,throttle:.15},{time:1,clutch:true,throttle:0},{time:1.3,gear:'2'},{time:1.7,clutch:false,throttle:.15}]},
 ...['2','3'].map(gear=>({name:`engine-braking-${gear}`,gear,speed:15,pedal:1,duration:6,events:[]})),
 {name:'small-lift',gear:'3',speed:15,pedal:1,duration:4,events:[{time:0,throttle:.2},{time:1,throttle:0}]},
 {name:'clutch-open-moving',gear:'3',speed:15,rpm:4000,pedal:0,duration:6,events:[{time:0,clutch:true}]},
 {name:'brake-stop',gear:'2',speed:8,pedal:1,duration:6,events:[{time:0,brake:true},{time:1,clutch:true}]},
 {name:'loaded-stall-restart',gear:'1',rpm:800,pedal:0,duration:6,events:[{time:0,clutch:true,brake:true},{time:.5,clutch:false},{time:2,clutch:true},{time:2.5,gear:'N'},{time:3,toggle:true}]},
 {name:'back-drive-off',gear:'3',speed:15,mode:'stopped',pedal:1,duration:4,events:[]},
 {name:'neutral-moving',gear:'N',speed:15,rpm:800,pedal:0,duration:8,events:[{time:0,clutch:true},{time:1,throttle:1},{time:2,throttle:0}]},
];
