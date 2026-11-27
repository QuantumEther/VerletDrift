import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,Color,Mesh,MeshPhysicalMaterial,Scene,Texture} from './vendor/three-r180/three.module.js';
import {directCanvasEligible} from './webgpu-direct.js';

test('direct canvas rejects HDR blending and transmission, including material groups',()=>{
 const scene=new Scene(),glass=new MeshPhysicalMaterial({transparent:true,opacity:.3});
 const solid=new MeshPhysicalMaterial(),mesh=new Mesh(new BoxGeometry(),[solid,glass]);
 scene.background=new Texture();scene.add(mesh);
 assert.equal(directCanvasEligible(scene),false);
 glass.visible=false;
 assert.equal(directCanvasEligible(scene),true);
 solid.transmission=.5;
 assert.equal(directCanvasEligible(scene),false);
 mesh.visible=false;
 assert.equal(directCanvasEligible(scene),true);
 scene.background=new Color();
 assert.equal(directCanvasEligible(scene),false);
});
