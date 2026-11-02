// Original procedural coachwork, SI metres, x forward/y left/z up; no physics.
import * as THREE from '../../tire-road-observatory-prototype/vendor/three.module.js';
export function buildMustang(parent,definition){
 const spec=definition.visual,corners=definition.vertical.corners,body=new THREE.Group();parent.add(body);body.position.z=spec.datumHeight;
 const materials=[],geometries=[];
 const mat=(color,metalness=.3,roughness=.35,extra={})=>{const m=new THREE.MeshStandardMaterial({color,metalness,roughness,...extra});materials.push(m);return m;};
 const paint=mat(spec.color,.55,.3),black=mat(0x151719,.05,.72),chrome=mat(0xc4c9c9,.92,.21),glass=mat(0x172b36,.5,.18),red=mat(0x9e1010,.2,.2,{emissive:0x300000}),lamp=mat(0xe5e3ca,.5,.2,{emissive:0x18160d});
 const add=(g,m,p=[0,0,0])=>{geometries.push(g);const mesh=new THREE.Mesh(g,m);mesh.position.set(...p);body.add(mesh);return mesh;};
 const box=(size,p,m)=>add(new THREE.BoxGeometry(...size),m,p);
 const panel=(points,m)=>{const g=new THREE.BufferGeometry(),a=[];for(let i=1;i<points.length-1;i++)a.push(...points[0],...points[i],...points[i+1]);g.setAttribute('position',new THREE.Float32BufferAttribute(a,3));g.computeVertexNormals();const mesh=add(g,m);mesh.material.side=THREE.DoubleSide;return mesh;};
 const cylinder=(r,h,p,m)=>{const mesh=add(new THREE.CylinderGeometry(r,r,h,24),m,p);mesh.rotation.z=Math.PI/2;return mesh;};
 // Sculpted belt/shoulder loft. Lower side contour cuts actual open arches;
 // axle x positions and nominal hub datum are the physical definition's values.
 const stations=[[-2.72,.82,.10],[-2.42,.89,.17],[-1.62,.905,.23],[-.8,.86,.21],[.2,.86,.22],[1.13,.90,.22],[1.75,.88,.19],[2.04,.81,.11]];
 const lerpStation=x=>{for(let i=1;i<stations.length;i++)if(x<=stations[i][0]){const a=stations[i-1],b=stations[i],t=(x-a[0])/(b[0]-a[0]);return [a[1]+t*(b[1]-a[1]),a[2]+t*(b[2]-a[2])];}return stations.at(-1).slice(1);};
 const bottom=x=>{let z=-.43;for(const [ax] of [corners[0],corners[2]]){const dx=x-ax;if(Math.abs(dx)<.405)z=Math.max(z,-.36+Math.sqrt(.405**2-dx**2));}return z;};
 const n=140;for(let i=0;i<n;i++){
  const x0=spec.rear+(spec.front-spec.rear)*i/n,x1=spec.rear+(spec.front-spec.rear)*(i+1)/n,[w0,z0]=lerpStation(x0),[w1,z1]=lerpStation(x1);
  panel([[x0,-w0,z0],[x1,-w1,z1],[x1,w1,z1],[x0,w0,z0]],paint);
  for(const side of [-1,1])panel([[x0,side*w0,z0],[x0,side*(w0-.025),bottom(x0)],[x1,side*(w1-.025),bottom(x1)],[x1,side*w1,z1]],paint);
 }
 // Long hood, twin sculpting ridges, matte blackout and central nonfunctional scoop.
 panel([[.12,-.68,.24],[1.91,-.7,.20],[1.91,.7,.20],[.12,.68,.24]],paint);
 panel([[.16,-.40,.247],[1.91,-.43,.207],[1.91,.43,.207],[.16,.40,.247]],black);
 for(const side of [-1,1])panel([[.15,side*.50,.25],[1.85,side*.57,.22],[1.85,side*.60,.21],[.15,side*.55,.24]],paint);
 box([.53,.34,.055],[.87,0,.279],black);box([.012,.29,.035],[1.14,0,.274],black);
 // SportsRoof: raked windscreen, short high roof, long descending rear glass.
 const A=[.22,.73,.24],B=[-.30,.60,.605],C=[-.86,.61,.60],D=[-2.23,.77,.20];
 panel([[A[0],-A[1],A[2]],[B[0],-B[1],B[2]],[B[0],B[1],B[2]],[A[0],A[1],A[2]]],glass);
 panel([[B[0],-B[1],B[2]],[C[0],-C[1],C[2]],[C[0],C[1],C[2]],[B[0],B[1],B[2]]],paint);
 panel([[C[0]-.03,-.55,C[2]-.01],[D[0]+.15,-.65,D[2]+.045],[D[0]+.15,.65,D[2]+.045],[C[0]-.03,.55,C[2]-.01]],glass);
 for(const side of [-1,1]){
  panel([[.20,side*.75,.24],[-.30,side*.62,.60],[-.86,side*.63,.595],[-1.65,side*.83,.23]],paint);
  panel([[.06,side*.755,.26],[-.34,side*.64,.56],[-.91,side*.66,.55],[-1.31,side*.805,.255]],glass);
  // Rear sail panel separates side glass from the sloping backlight.
  panel([[-.86,side*.61,.60],[-2.23,side*.77,.20],[-1.65,side*.84,.23]],paint);
  const rod=(a,b,r,m)=>{const dir=new THREE.Vector3().subVectors(new THREE.Vector3(...b),new THREE.Vector3(...a)),mesh=add(new THREE.CylinderGeometry(r,r,dir.length(),8),m,a);mesh.position.addScaledVector(dir,.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());};
  rod([.21,side*.75,.245],[-.3,side*.61,.607],.012,chrome);rod([-.3,side*.61,.607],[-.86,side*.62,.60],.01,chrome);
  rod([-.65,side*.73,.255],[-.65,side*.65,.565],.012,chrome);
  // Rocker stripe, period handle, rear-quarter scoop and arch trim.
  box([1.70,.012,.055],[-.25,side*.867,-.32],black);box([.13,.025,.018],[-.75,side*.875,.18],chrome);
  panel([[-1.1,side*.865,.12],[-1.42,side*.91,.10],[-1.30,side*.90,.04]],black);
  for(const [ax] of [corners[0],corners[2]]){
   const points=Array.from({length:41},(_,i)=>{const t=i*Math.PI/40;const x=ax+.405*Math.cos(t);return new THREE.Vector3(x,side*(lerpStation(x)[0]+.003),-.36+.405*Math.sin(t));});
   add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),40,.009,5,false),chrome);
  }
 }
 // Static front-mounted V8 inspection geometry, not a second mechanical body.
 const enginePaint=mat(0xa85127,.45,.5);box([.64,.43,.30],[.66,0,-.045],enginePaint);
 for(const side of [-1,1]){const bank=box([.66,.20,.12],[.66,side*.20,.10],chrome);bank.rotation.x=side*.45;}
 const cleaner=add(new THREE.CylinderGeometry(.17,.17,.055,24),black,[.66,0,.195]);cleaner.rotation.x=Math.PI/2;
 // 1969 four-headlamp face: two grille lamps, two outer fender lamps.
 box([.045,1.56,.27],[1.955,0,-.015],black);
 for(const y of [-.71,-.39,.39,.71]){cylinder(.104,.055,[1.988,y,.024],chrome);cylinder(.084,.058,[1.997,y,.024],lamp);}
 for(let i=-8;i<=8;i++)box([.015,.012,.10],[1.985,i*.033,.018],chrome);
 box([.09,1.74,.055],[1.99,0,-.19],chrome);box([.10,1.7,.05],[-2.65,0,-.19],chrome);
 box([.03,1.56,.23],[-2.653,0,.005],black);
 // Six separate upright taillight segments, three on each side.
 for(const side of [-1,1])for(let j=0;j<3;j++)box([.037,.073,.155],[-2.674,side*(.40+j*.115),.014],red);
 cylinder(.054,.045,[-2.677,0,.018],chrome);
 box([.24,.45,.015],[-2.5,0,.19],black);
 for(const side of [-1,1]){const exhaust=cylinder(.035,.15,[-2.64,side*.57,-.29],chrome);exhaust.name='exhaust';}
 // Small original text texture; no external assets/fonts or licensed model dependency.
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d');ctx.fillStyle='#151719';ctx.fillRect(0,0,512,96);ctx.fillStyle='#e0ba73';ctx.font='italic bold 64px sans-serif';ctx.fillText('MACH 1',32,72);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const badge=mat(0xffffff,.1,.6,{map:texture});
 for(const side of [-1,1]){const m=box([.52,.006,.098],[-.14,side*.876,-.31],badge);m.name='Mach 1 rocker badge';}
 body.name='1969 Mustang Mach 1 SportsRoof';body.updateWorldMatrix(true,true);const bounds=new THREE.Box3().setFromObject(body),size=bounds.getSize(new THREE.Vector3());
 return {body,paint,materials,geometries,textures:[texture],metadata:{style:'mustang',coachworkBounds:size.toArray(),wheelbase:corners[0][0]-corners[2][0],length:spec.length,features:['quad headlights','SportsRoof','blackout hood and scoop','triple segment taillights','sculpted open wheel arches']}};
}
