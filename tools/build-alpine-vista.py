"""Add the public DEM lookout to the connected Alpine Blender scene.

The elevation data is public terrain data and the foreground rocks are existing
Poly Haven assets.  This script only adds a named collection and keeps every
existing scene and object intact.
"""
import bpy
import json
import math
import struct
from pathlib import Path
from mathutils import Vector

ROOT = Path('/Users/apple/climbing-proto')
ASSETS = ROOT / 'assets' / 'environment'
DEM = ASSETS / 'seceda-dem'
SCENE_NAME = 'Alpine — scan environment'
COLLECTION_NAME = '03 — DEM vista assembly'

scene = bpy.data.scenes.get(SCENE_NAME)
if scene is None:
    raise RuntimeError(f'Missing Blender scene: {SCENE_NAME}')
bpy.context.window.scene = scene

collection = bpy.data.collections.get(COLLECTION_NAME)
if collection is None:
    collection = bpy.data.collections.new(COLLECTION_NAME)
    scene.collection.children.link(collection)
elif collection.name not in {c.name for c in scene.collection.children}:
    scene.collection.children.link(collection)

meta = json.loads((DEM / 'metadata.json').read_text())
raw = (DEM / 'heights.bin').read_bytes()
heights = struct.unpack('<' + 'f' * (len(raw) // 4), raw)
# 近景の斜面にDEMの三角形が見えないよう、輸送用だけは原解像度。
# 96K頂点 / 192K三角形で、岩のインスタンスより軽い。
stride = 1
nx = (meta['nx'] - 1) // stride
nz = (meta['nz'] - 1) // stride
scale = 0.32
camera_elevation = meta.get('cameraElevation', 2518)

def smoothstep(edge0, edge1, value):
    if edge0 == edge1:
        return 1.0 if value >= edge1 else 0.0
    t = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)

def dem_y(game_x, game_z, height):
    near = smoothstep(20.0, 130.0, math.hypot(game_x, game_z))
    return -18.0 * (1.0 - near) + ((height - camera_elevation) * scale + 5.0) * near

# Reuse the same coordinates as src/vista.js.  Three.js uses Y-up with Z as
# depth; Blender's equivalent is (game_x, -game_z, game_y).
verts = []
uvs = []
colors = []
for j in range(nz + 1):
    iz = j * stride
    for i in range(nx + 1):
        ix = i * stride
        h = heights[iz * meta['nx'] + ix]
        game_x = (ix - 160) * meta['step'] * scale
        game_z = -(iz - 15) * meta['step'] * scale
        game_y = dem_y(game_x, game_z, h)
        verts.append((-16.0 + game_x, 17.0 - game_z, game_y))
        uvs.append((game_x / 6.0, game_z / 6.0))
        slope_hint = smoothstep(2150.0, 2750.0, h)
        colors.append((0.30 + 0.22 * slope_hint, 0.34 + 0.20 * slope_hint, 0.24 + 0.18 * slope_hint, 1.0))

faces = []
for j in range(nz):
    for i in range(nx):
        a = j * (nx + 1) + i
        b = a + 1
        c = a + nx + 1
        d = c + 1
        faces.extend(((a, b, c), (b, d, c)))

mesh = bpy.data.meshes.get('Seceda DEM vista terrain')
if mesh is None:
    mesh = bpy.data.meshes.new('Seceda DEM vista terrain')
else:
    mesh.clear_geometry()
mesh.from_pydata(verts, [], faces)
mesh.update()
for polygon in mesh.polygons:
    polygon.use_smooth = True
uv_layer = mesh.uv_layers.get('World UV') or mesh.uv_layers.new(name='World UV')
for loop in mesh.loops:
    uv_layer.data[loop.index].uv = uvs[loop.vertex_index]
color_layer = mesh.color_attributes.get('Land cover hint') or mesh.color_attributes.new(
    name='Land cover hint', type='BYTE_COLOR', domain='CORNER')
for loop in mesh.loops:
    color_layer.data[loop.index].color = colors[loop.vertex_index]

terrain = bpy.data.objects.get('Seceda DEM — vista terrain')
if terrain is None:
    terrain = bpy.data.objects.new('Seceda DEM — vista terrain', mesh)
    collection.objects.link(terrain)
else:
    terrain.data = mesh
    if collection not in terrain.users_collection:
        collection.objects.link(terrain)

mat = bpy.data.materials.get('Rock Ground 02 — PBR')
if mat is not None:
    terrain.data.materials.clear()
    terrain.data.materials.append(mat)

# Add three low-cost copies of the existing Boulder 01 mesh at the lookout.
# They remain separate objects so the game exporter can keep or omit them.
rock_source = bpy.data.objects.get('boulder_01')
placements = [
    (-19.2, 20.8, 3.4, 1.25),
    (-12.8, 21.2, 3.4, 1.55),
    (-16.0, 22.8, 3.0, 1.1),
]
if rock_source is not None and rock_source.type == 'MESH':
    for index, (x, blender_y, z, size) in enumerate(placements, start=1):
        name = f'Vista foreground rock {index:02d}'
        rock = bpy.data.objects.get(name)
        if rock is None:
            rock = rock_source.copy()
            rock.data = rock_source.data
            rock.name = name
            collection.objects.link(rock)
        elif collection not in rock.users_collection:
            collection.objects.link(rock)
        rock.location = (x, blender_y, z)
        rock.scale = (size, size, size)
        rock.rotation_euler[2] = -x * 0.17

# A camera marker makes the Blender composition immediately inspectable while
# leaving the game's runtime camera untouched.
camera = bpy.data.objects.get('Vista composition — Blender')
if camera is None:
    data = bpy.data.cameras.new('Vista composition — Blender')
    camera = bpy.data.objects.new('Vista composition — Blender', data)
    collection.objects.link(camera)
camera.location = (-16.0, 17.0, 5.0)
target_game = (-16.0 - math.sin(-.13) * 400.0, 80.0, -17.0 - math.cos(-.13) * 400.0)
target_blender = (target_game[0], -target_game[2], target_game[1])
camera.rotation_euler = (Vector(target_blender) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.lens = 32
camera.data.clip_end = 5000
scene.camera = camera

# Export only this authored vista assembly.  It is intentionally free of the
# HDR and the shared ground images; the game assigns its already-loaded PBR
# material after import, so the export stays small.
bpy.ops.object.select_all(action='DESELECT')
# Export the DEM separately from the foreground rocks.  The browser already
# streams the same CC0 boulder once for the route, so duplicating its embedded
# texture in this GLB would only increase the initial download.
export_mesh = mesh.copy()
# UVs and loop colors are useful in Blender, but make glTF split every DEM
# triangle corner into a new vertex.  The runtime uses triplanar projection, so
# a compact position/normal/index export is the better transport representation.
for layer in list(export_mesh.uv_layers):
    export_mesh.uv_layers.remove(layer)
for layer in list(export_mesh.color_attributes):
    export_mesh.color_attributes.remove(layer)
export_obj = bpy.data.objects.new('Seceda DEM vista terrain — export', export_mesh)
collection.objects.link(export_obj)
export_obj.select_set(True)
bpy.context.view_layer.objects.active = export_obj
# Keep the textured material in the .blend, but omit its three image maps from
# the transport GLB.  Three.js replaces the placeholder with photo.ground.
export_mesh.materials.clear()
bpy.ops.export_scene.gltf(
    filepath=str(ASSETS / 'alpine-vista.glb'),
    export_format='GLB',
    use_selection=True,
    use_active_scene=True,
    # The game assigns the already-loaded Rock Ground 02 / Boulder material;
    # omitting images here keeps this assembly below a few megabytes.
    export_materials='NONE',
)
bpy.data.objects.remove(export_obj, do_unlink=True)
bpy.data.meshes.remove(export_mesh)

# Preserve the earlier authored file and save an explicit v2 snapshot.
bpy.ops.wm.save_as_mainfile(filepath=str(ASSETS / 'alpine-environment-v2.blend'), copy=True)

result = {
    'scene': scene.name,
    'collection': collection.name,
    'terrain_vertices': len(mesh.vertices),
    'terrain_triangles': len(mesh.polygons),
    'foreground_rocks': len([o for o in collection.objects if o.name.startswith('Vista foreground rock')]),
    'export': 'assets/environment/alpine-vista.glb',
    'blend_snapshot': 'assets/environment/alpine-environment-v2.blend',
    'preserved_scenes': len(bpy.data.scenes),
}
