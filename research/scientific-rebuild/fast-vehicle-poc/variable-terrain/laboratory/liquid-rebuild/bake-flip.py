"""Bounded offline Mantaflow FLIP pilot. Run with Blender, never in the browser.
Released sphere impacts a stationary paddle; this does not model rubber retraction.
"""
import bpy, math, json, time, sys, os
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
out=Path(args[0] if args else '/tmp/verlet-flip');out.mkdir(parents=True,exist_ok=True)
resolution=int(args[1]) if len(args)>1 else 48
frames=int(args[2]) if len(args)>2 else 36
speed=float(args[3]) if len(args)>3 else 4
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.frame_start=1;scene.frame_end=frames;scene.render.fps=30;scene.gravity=(0,0,-9.81)
def cube(name,location,dimensions):
 bpy.ops.mesh.primitive_cube_add(size=1,location=location);o=bpy.context.object;o.name=name;o.dimensions=dimensions;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return o
floor=cube('ground',(0,0,-.06),(4,4,.12));m=floor.modifiers.new('collision','FLUID');m.fluid_type='EFFECTOR'
wall=cube('impact paddle',(.28,0,.35),(.06,.50,.70));m=wall.modifiers.new('collision','FLUID');m.fluid_type='EFFECTOR'
bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,radius=.12,location=(-.05,0,.4));flow=bpy.context.object;flow.name='released water volume';bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
f=flow.modifiers.new('initial water','FLUID');f.fluid_type='FLOW';s=f.flow_settings;s.flow_type='LIQUID';s.flow_behavior='GEOMETRY';s.use_initial_velocity=True;s.velocity_coord=(speed,0,0)
domain=cube('FLIP domain',(.30,0,.55),(1.8,1.5,1.3));modifier=domain.modifiers.new('FLIP','FLUID');modifier.fluid_type='DOMAIN';d=modifier.domain_settings;d.domain_type='LIQUID';d.resolution_max=resolution;d.cache_frame_start=1;d.cache_frame_end=frames;d.cache_type='ALL';d.cache_directory=str(out/'cache');d.cache_data_format='UNI';d.cache_mesh_format='BOBJECT';d.use_mesh=True;d.mesh_scale=2;d.flip_ratio=.97;d.particle_randomness=.1;d.surface_tension=.072;d.timesteps_min=2;d.timesteps_max=12;d.cfl_condition=2
# Surface-tension scalar is an uncalibrated Blender control, not claimed SI N/m.
bpy.context.view_layer.objects.active=domain;domain.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'pilot.blend'))
t=time.perf_counter();print('START_FLIP',flush=True);bpy.ops.fluid.bake_all();print('BAKE_SECONDS',time.perf_counter()-t,flush=True)
records=[]
for frame in range(1,frames+1):
 scene.frame_set(frame);dg=bpy.context.evaluated_depsgraph_get();obj=domain.evaluated_get(dg);mesh=obj.to_mesh();mesh.calc_loop_triangles();vertices=[tuple(obj.matrix_world@v.co) for v in mesh.vertices];tris=[tuple(t.vertices) for t in mesh.loop_triangles]
 volume=sum((vertices[a][0]*(vertices[b][1]*vertices[c][2]-vertices[b][2]*vertices[c][1])+vertices[a][1]*(vertices[b][2]*vertices[c][0]-vertices[b][0]*vertices[c][2])+vertices[a][2]*(vertices[b][0]*vertices[c][1]-vertices[b][1]*vertices[c][0]))/6 for a,b,c in tris)
 record={'frame':frame,'time':(frame-1)/30,'vertices':vertices,'triangles':tris,'signedMeshVolume':volume};(out/f'frame-{frame:03}.json').write_text(json.dumps(record,separators=(',',':')));records.append({k:record[k] for k in ['frame','time','signedMeshVolume'] }|{'vertices':len(vertices),'triangles':len(tris)});obj.to_mesh_clear()
metadata={'solver':'Blender '+bpy.app.version_string+' Mantaflow FLIP','resolution':resolution,'speed':speed,'fps':30,'radius':.12,'nominalVolume':4*math.pi*.12**3/3,'surfaceTensionControl':.072,'surfaceTensionCalibration':'unknown; Blender parameter is not claimed SI surface tension','gravity':[0,0,-9.81],'bakeSeconds':time.perf_counter()-t,'records':records}
(out/'metadata.json').write_text(json.dumps(metadata,indent=2));print('DONE_FLIP',json.dumps(metadata),flush=True)
