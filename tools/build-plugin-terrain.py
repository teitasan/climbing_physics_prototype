"""Build the alpine macro terrain with Blender's Erosion terrain generator.

The add-on owns the regular grid and the hydraulic erosion pass.  The small
amount of Python below only supplies the game-specific silhouette: three
asymmetric ridges, a central valley, and a rising rear skyline.  Existing
objects are kept; the generated mesh is placed in a separate collection and
the browser export contains only this terrain.

Run this file from the connected Blender 5.2 instance after enabling the
official ``Erosion terrain generator`` extension.  The script is intentionally
stand-alone so a later iteration can regenerate the same handoff without
repeating the interactive setup.
"""
from pathlib import Path
import math
import random

import bpy
from mathutils import noise


ROOT = Path('/Users/apple/climbing-proto')
ASSETS = ROOT / 'assets' / 'environment'
OUTPUT = ASSETS / 'gaea' / 'plugin-vista.glb'
SNAPSHOT = ASSETS / 'alpine-plugin-terrain.blend'
SCENE_NAME = 'Alpine — scan environment'
COLLECTION_NAME = '04 — Erosion terrain plugin'

GRID = 513
SEED = 1847


def ensure_collection(scene, name):
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
    if collection.name not in {child.name for child in scene.collection.children}:
        scene.collection.children.link(collection)
    return collection


def move_to_collection(obj, collection):
    for old_collection in list(obj.users_collection):
        old_collection.objects.unlink(obj)
    collection.objects.link(obj)


def configure_extension(props):
    # The add-on uses this grid for both its noise and droplet simulation.
    props.grid_points_x = GRID
    props.grid_points_y = GRID
    props.noise_scale = 0.009
    props.noise_height = 95.0
    props.layer_amount = 6
    props.offset_x = 17.0
    props.offset_y = -31.0
    # These values keep the gullies readable while avoiding a noisy tabletop.
    props.iteration_amount = 30000
    props.maxpath = 42
    props.inertia = 0.32
    props.capacity = 3.2
    props.minslope = 0.018
    props.gravity = 10.0
    props.evaporation = 0.045
    props.radius = 3.0
    props.erosion = 0.07
    props.deposition = 0.20
    props.auto_regenerate_noise = False
    props.auto_regenerate_erosion = False


def shape_alpine_macro(obj):
    """Shape the broad silhouette before the extension runs erosion."""
    span = float(GRID - 1)
    for vert in obj.data.vertices:
        x = vert.co.x / span
        y = vert.co.y / span

        # The camera is on the near edge.  Elevation therefore grows toward
        # the rear, so the horizon reads as a mountain range instead of a wall.
        rear = 0.28 + 0.72 * (y ** 1.55)
        foothill = 8.0 + 14.0 * (1.0 - (2.0 * x - 1.0) ** 2) * (0.55 + y)

        # Three offset ridges form a main peak and two shoulders.  Their
        # centres drift with depth, which prevents the silhouette from looking
        # like repeated vertical slabs.
        ridge_a = math.exp(-((x - (0.23 + 0.045 * y)) / 0.105) ** 2)
        ridge_b = math.exp(-((x - (0.51 - 0.055 * y)) / 0.13) ** 2)
        ridge_c = math.exp(-((x - (0.77 + 0.035 * y)) / 0.115) ** 2)
        ridges = (78.0 * ridge_a + 58.0 * ridge_b + 49.0 * ridge_c) * rear

        # Carve the two long valleys between the ridges.  A shallow central
        # cut keeps the playable foreground from becoming a single mound.
        cut_left = 21.0 * math.exp(-((x - 0.36) / 0.075) ** 2) * (0.35 + 0.65 * y)
        cut_right = 17.0 * math.exp(-((x - 0.64) / 0.085) ** 2) * (0.30 + 0.70 * y)
        central_saddle = 9.0 * math.exp(-((x - 0.51) / 0.12) ** 2) * (1.0 - y)

        # Low-frequency noise breaks the analytic bands.  A very small
        # high-frequency term survives erosion as rock-scale variation.
        broad = noise.noise_vector((x * 2.15 + 4.0, y * 1.6 - 2.0, 0.0)).x
        detail = noise.noise_vector((x * 14.0 - 7.0, y * 14.0 + 3.0, 2.0)).x
        height = foothill + ridges - cut_left - cut_right - central_saddle
        height += (broad * 0.5 + detail * 0.11) * (8.0 + 12.0 * rear)
        vert.co.z = max(2.0, height)


def assign_ground_material(obj):
    material = bpy.data.materials.get('Rock Ground 02 — PBR')
    if material is not None:
        obj.data.materials.clear()
        obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def export_runtime_mesh(obj):
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT),
        export_format='GLB',
        use_selection=True,
        use_active_scene=True,
        # The browser assigns the already-loaded PBR material.  Omitting the
        # image maps keeps this 513² terrain from duplicating a 2K download.
        export_materials='NONE',
    )


scene = bpy.data.scenes.get(SCENE_NAME)
if scene is None:
    raise RuntimeError(f'Missing Blender scene: {SCENE_NAME}')
bpy.context.window.scene = scene
collection = ensure_collection(scene, COLLECTION_NAME)
props = getattr(scene, 'terrain_props', None)
if props is None:
    raise RuntimeError('Enable the Erosion terrain generator extension first')

configure_extension(props)
random.seed(SEED)

# The official operator creates its own regular grid named ``Terrain``.
# Capture the object by identity so a user object with a similar name is not
# accidentally moved or replaced.
before = {obj.as_pointer() for obj in scene.objects}
bpy.ops.noiseterrain.generate()
terrain = bpy.data.objects.get('Terrain')
if terrain is None or terrain.as_pointer() in before:
    raise RuntimeError('The terrain extension did not create a fresh Terrain object')

shape_alpine_macro(terrain)
bpy.context.view_layer.objects.active = terrain
bpy.ops.object.select_all(action='DESELECT')
terrain.select_set(True)
random.seed(SEED)
bpy.ops.erosionterrain.generate()

terrain.name = 'Alpine plugin terrain — alpine erosion'
move_to_collection(terrain, collection)
# Blender's Y axis maps to the negative game Z axis.  This places the near
# edge at game z=100 and the far edge at z=-412, in front of the vista camera.
terrain.location = (-280.0, -100.0, -65.0)
terrain.rotation_euler = (0.0, 0.0, 0.0)
terrain.scale = (1.0, 1.0, 1.0)
assign_ground_material(terrain)

export_runtime_mesh(terrain)
bpy.ops.wm.save_as_mainfile(filepath=str(SNAPSHOT), copy=True)

result = {
    'status': 'ok',
    'scene': scene.name,
    'collection': collection.name,
    'object': terrain.name,
    'vertices': len(terrain.data.vertices),
    'triangles': len(terrain.data.polygons),
    'seed': SEED,
    'erosion_iterations': props.iteration_amount,
    'export': str(OUTPUT),
    'snapshot': str(SNAPSHOT),
}
