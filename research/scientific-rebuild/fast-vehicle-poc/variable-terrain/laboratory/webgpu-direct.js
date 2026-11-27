import {NormalBlending,NoBlending} from './vendor/three-r180/three.module.js';

// Direct canvas rendering transforms each fragment before blending. Keep
// mixed HDR scenes on the composition path, including otherwise opaque
// geometry with partial coverage or transmission.
export function directCanvasEligible(scene){
 if(!scene.background?.isTexture||scene.overrideMaterial||scene.backgroundNode)return false;
 function allowed(object){
  if(!object.visible)return true;
  if(object.material&&object.count!==0&&object.geometry?.drawRange.count!==0){
   const materials=Array.isArray(object.material)?object.material:[object.material];
   for(const material of materials){
    if(material.visible&&(material.transparent||material.opacity!==1||material.transmission>0
       ||material.alphaToCoverage||material.isShaderMaterial||material.fragmentNode||material.outputNode||!material.colorWrite
       ||![NormalBlending,NoBlending].includes(material.blending)))return false;
   }
  }
  return object.children.every(allowed);
 }
 return allowed(scene);
}
