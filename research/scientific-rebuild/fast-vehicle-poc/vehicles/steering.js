// SI angles and rates. Legacy inputs remain parallel and retain their original slew.
export const legacySteering = Object.freeze({
 maxCenter:.35, ratio:16, rate:.8, returnRate:.8, ackermann:0, wheelLimit:.35,
});

export function wheelSteering(center, config, corners) {
 const angle=Math.max(-config.maxCenter,Math.min(config.maxCenter,center));
 const wheelbase=(corners[0][0]+corners[1][0]-corners[2][0]-corners[3][0])/2;
 const middle=(corners[0][1]+corners[1][1])/2;
 const sine=Math.sin(angle),cosine=Math.cos(angle);
 return corners.slice(0,2).map(([,y])=>{
  const actual=Math.atan2(wheelbase*sine,wheelbase*cosine-config.ackermann*(y-middle)*sine);
  return Math.max(-config.wheelLimit,Math.min(config.wheelLimit,actual));
 });
}

export function steerToward(current, input, h, config) {
 const target=Math.max(-1,Math.min(1,input))*config.maxCenter;
 const rate=target===0?config.returnRate:config.rate;
 const change=target-current;
 return current+Math.sign(change)*Math.min(Math.abs(change),rate*h);
}
