// Keyboard/buttons apply forces, never engagement states. N represents a
// compliant hand holding the neutral lever location, limited to 120 N.
export function selectorInputForce(g,keys){
 if(keys.has('n'))return Math.max(-120,Math.min(120,-10000*g.q-100*g.velocity));
 return 120*(Number(keys.has('1'))-Number(keys.has('2')));
}
