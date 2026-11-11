# No liquid geometry, collision parameters, cache, or bake is required to fail.
import bpy,sys,platform
print('BLENDER',bpy.app.version_string,'PYTHON',sys.version,'PLATFORM',platform.platform(),flush=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.mesh.primitive_cube_add()
m=bpy.context.object.modifiers.new('domain','FLUID');m.fluid_type='DOMAIN';m.domain_settings.domain_type='LIQUID'
print('UPDATE_DOMAIN',flush=True)
bpy.context.view_layer.update()
print('DOMAIN_READY',flush=True)
