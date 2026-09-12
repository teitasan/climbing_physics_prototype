"""Import a Gaea 2 terrain export into the connected Alpine Blender scene.

The script intentionally handles only the handoff boundary.  Gaea owns the
macro terrain and erosion graph; Blender owns placement of the existing CC0
rock scans and the runtime export.  No existing scene or object is removed.

Expected input: assets/environment/gaea/terrain.glb.
An optional manifest.json can provide ``mesh``, ``location``, ``rotation_deg``
and ``scale`` values for the imported root.
"""
import json
import shutil
from datetime import datetime
from pathlib import Path

import bpy


ROOT = Path('/Users/apple/climbing-proto')
ASSETS = ROOT / 'assets' / 'environment'
GAEA = ASSETS / 'gaea'
SCENE_NAME = 'Alpine — scan environment'
COLLECTION_NAME = '03 — Gaea terrain'
OUTPUT = ASSETS / 'gaea-vista.glb'
SNAPSHOT = ASSETS / 'alpine-environment-gaea.blend'


def get_collection(scene, name):
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
    if collection.name not in {child.name for child in scene.collection.children}:
        scene.collection.children.link(collection)
    return collection


scene = bpy.data.scenes.get(SCENE_NAME)
if scene is None:
    raise RuntimeError(f'Missing Blender scene: {SCENE_NAME}')
bpy.context.window.scene = scene
collection = get_collection(scene, COLLECTION_NAME)

manifest_path = GAEA / 'manifest.json'
manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
mesh_path = GAEA / manifest.get('mesh', 'terrain.glb')

if not mesh_path.exists():
    result = {
        'status': 'waiting',
        'message': f'Place a Gaea GLB at {mesh_path}',
        'collection': COLLECTION_NAME,
    }
else:
    before = {obj.as_pointer() for obj in scene.objects}
    bpy.ops.import_scene.gltf(filepath=str(mesh_path))
    imported = [obj for obj in scene.objects if obj.as_pointer() not in before]
    if not imported:
        raise RuntimeError('The Gaea file imported without creating scene objects')

    root = bpy.data.objects.new('Gaea terrain — macro shape', None)
    collection.objects.link(root)
    location = manifest.get('location', [0.0, 0.0, 0.0])
    rotation = manifest.get('rotation_deg', [0.0, 0.0, 0.0])
    scale = manifest.get('scale', [1.0, 1.0, 1.0])
    root.location = tuple(float(v) for v in location)
    root.rotation_euler = tuple(float(v) * 3.141592653589793 / 180.0 for v in rotation)
    root.scale = tuple(float(v) for v in scale)

    for obj in imported:
        for old_collection in list(obj.users_collection):
            old_collection.objects.unlink(obj)
        collection.objects.link(obj)
        obj.parent = root
        if obj.type == 'MESH':
            obj.name = f'Gaea terrain — {obj.name}'
            obj.cast_shadow = False
            obj.receive_shadow = True
            for polygon in obj.data.polygons:
                polygon.use_smooth = True

    # Save the imported scene as a new snapshot.  The existing Blender file is
    # left intact, and the exported GLB is backed up before replacement.
    if OUTPUT.exists():
        stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
        shutil.copy2(OUTPUT, OUTPUT.with_name(f'{OUTPUT.stem}.previous-{stamp}{OUTPUT.suffix}'))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in imported:
        obj.select_set(True)
    root.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT),
        export_format='GLB',
        use_selection=True,
        use_active_scene=True,
        export_materials='EXPORT',
    )
    bpy.ops.wm.save_as_mainfile(filepath=str(SNAPSHOT), copy=True)
    result = {
        'status': 'ok',
        'collection': COLLECTION_NAME,
        'imported_objects': len(imported),
        'mesh': str(mesh_path),
        'export': str(OUTPUT),
        'snapshot': str(SNAPSHOT),
    }
