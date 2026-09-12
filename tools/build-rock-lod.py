import bpy, bmesh
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/environment/boulder_01/boulder_01.gltf'))
for obj in list(bpy.context.scene.objects):
 if obj.type!='MESH':continue
 bpy.context.view_layer.objects.active=obj
 # glTFのUV境界で分離された頂点を結合。UVは面コーナー側に保持する。
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.to_mesh(obj.data);bm.free()
 mod=obj.modifiers.new('Distant rock reduction','DECIMATE');mod.ratio=.035
 bpy.ops.object.modifier_apply(modifier=mod.name)
 obj.data.materials.clear()
 print('LOD triangles',len(obj.data.polygons))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'assets/environment/boulder-lod-v2.glb'),export_format='GLB',export_materials='NONE')
