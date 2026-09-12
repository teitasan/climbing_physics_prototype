import bpy, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/environment/rock_face_01/rock_face_01.gltf'))
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
for obj in objects:
 bpy.context.view_layer.objects.active=obj;obj.select_set(True)
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 vertices=obj.data.vertices
 lo=Vector(tuple(min(v.co[i] for v in vertices) for i in range(3)))
 hi=Vector(tuple(max(v.co[i] for v in vertices) for i in range(3)))
 for v in vertices:
  u=(v.co.x-lo.x)/(hi.x-lo.x);h=(v.co.z-lo.z)/(hi.z-lo.z);depth=(v.co.y-lo.y)/(hi.y-lo.y)
  x=(u-.5)*8.2
  # 中央の登攀面と側面の自然な厚みを連続的に結ぶ。
  edge=max(0,min(1,(abs(x)-2.2)/1.5));edge=edge*edge*(3-2*edge)
  v.co=Vector((x,13.015+depth*(.045+edge*1.5),1+h*4.0))
 obj.name='Scan cliff — fitted to first climbing surface'
 for poly in obj.data.polygons:poly.use_smooth=True
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/environment/first-cliff.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'assets/environment/first-cliff.glb'),export_format='GLB')
print('FIRST CLIFF EXPORTED')
