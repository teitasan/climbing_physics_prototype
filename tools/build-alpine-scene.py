"""Connected Blender: create a separate art scene, preserve existing scenes."""
import bpy, json, math
from pathlib import Path
from mathutils import Vector
ROOT=Path('/Users/apple/climbing-proto')
route=json.loads((ROOT/'assets/environment/alpine-route-layout.json').read_text())
scene=bpy.data.scenes.new('Alpine — scan environment');bpy.context.window.scene=scene
scene.unit_settings.system='METRIC'
cliffs=bpy.data.collections.new('01 — Scan cliffs (game export)');scene.collection.children.link(cliffs)
context=bpy.data.collections.new('02 — Terrain and route reference');scene.collection.children.link(context)
with bpy.data.libraries.load(str(ROOT/'assets/environment/first-cliff.blend'),link=False) as (src,dst):
 dst.objects=[n for n in src.objects if n.startswith('Scan cliff')]
source=dst.objects[0]
for i,w in enumerate(route['walls']):
 obj=source.copy();obj.data=source.data.copy();cliffs.objects.link(obj);obj.name=f'Cliff {i+1:02d} — scanned rock'
 for v in obj.data.vertices:
  x,y,z=v.co
  if i==1:x=-x
  v.co=Vector((x+w['x'],y-13-w['z'],w['bottom']+(z-1)*(w['top']-w['bottom'])/4))
 if i==1:
  # Reflection reverses winding. Correct the reflected copy only.
  import bmesh
  bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
 obj['game_wall_index']=i;obj['collision']='Existing game collider; visual only'
# Context terrain follows the game's broad hillside and path shoulders.
segments=[(a,b) for s in route['stages'] for a,b in zip(s['points'],s['points'][1:])]
def smooth(a,b,x):
 t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
def height(x,z):
 noise=math.sin(x*.071)*math.cos(z*.059)*2.8+math.sin(x*.19+z*.11)*1.1+math.sin(x*.47-z*.39)*.35
 base=-.34*(z+2)-.010*x*x+noise*1.6
 nearest=1e9;h=0;width=0
 for a,b in segments:
  dx,dz=b[0]-a[0],b[2]-a[2];t=max(0,min(1,((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz)))
  d=math.hypot(x-a[0]-t*dx,z-a[2]-t*dz)
  if d<nearest:nearest=d;h=a[1]+t*(b[1]-a[1]);width=(a[3]+t*(b[3]-a[3]))/2
 edge=max(0,nearest-width);narrow=width<1.1
 shoulder=h-.09-(min(edge*3,4) if narrow else edge*.25);blend=1-smooth(0,4 if narrow else 10,edge)
 return max(-145,base+(shoulder-base)*blend)
verts=[];faces=[];nx=81;nz=76
for j in range(nz):
 for i in range(nx):
  x=-80+i*2;z=-100+j*2;verts.append((x,-z,height(x,z)))
for j in range(nz-1):
 for i in range(nx-1):
  a=j*nx+i;faces.append((a,a+nx,a+nx+1,a+1))
me=bpy.data.meshes.new('Terrain reference');me.from_pydata(verts,[],faces);me.update()
ob=bpy.data.objects.new('Mountain surface — reference only',me);context.objects.link(ob)
uv=me.uv_layers.new(name='World UV')
for loop in me.loops:
 v=me.vertices[loop.vertex_index].co;uv.data[loop.index].uv=(v.x/6,-v.y/6)
mat=bpy.data.materials.new('Rock Ground 02 — PBR');mat.use_nodes=True
nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
for file,input_name in [('diff.jpg','Base Color'),('rough.jpg','Roughness')]:
 tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(ROOT/'assets/environment/rock_ground_02'/file),check_existing=True)
 if file!='diff.jpg':tex.image.colorspace_settings.name='Non-Color'
 links.new(tex.outputs['Color'],bsdf.inputs[input_name])
tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(ROOT/'assets/environment/rock_ground_02/nor_gl.jpg'),check_existing=True);tex.image.colorspace_settings.name='Non-Color'
normal=nodes.new('ShaderNodeNormalMap');links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bsdf.inputs['Normal']);ob.data.materials.append(mat)
for i,s in enumerate(route['stages']):
 curve=bpy.data.curves.new(s['name'],'CURVE');curve.dimensions='3D';curve.bevel_depth=.035
 poly=curve.splines.new('POLY');poly.points.add(len(s['points'])-1)
 for p,v in zip(poly.points,s['points']):p.co=(v[0],-v[2],v[1]+.1,1)
 o=bpy.data.objects.new('Route '+str(i+1)+' — '+s['name'],curve);context.objects.link(o)
# Shared mesh rocks, with distance-independent low geometry for Blender layout preview.
before=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/environment/boulder_01/boulder_01.gltf'))
rock=next(o for o in set(bpy.data.objects)-before if o.type=='MESH')
placements=[[-4.2,1,-13,3.1],[4.3,1.1,-13.5,3],[-4.8,.3,-9,1.8],[4.4,-.1,3,1.4],[-5,-.3,6,1.6],[13.9,6,-28,2.8],[22.2,6,-28.5,3],[-14.2,14,-49,3.2],[-5.8,14,-49.4,2.8]]
for i,(x,y,z,s) in enumerate(placements):
 o=rock.copy();context.objects.link(o);o.name=f'Hero rock {i+1:02d}';o.location=(x,-z,y);o.scale=(s,s,s);o.rotation_euler.z=-x*.7
# Original imported asset is kept hidden, not destroyed.
rock.hide_render=True;rock.hide_set(True)
world=bpy.data.worlds.new('Alpine outdoor light');scene.world=world;world.use_nodes=True
tex=world.node_tree.nodes.new('ShaderNodeTexEnvironment');tex.image=bpy.data.images.load(str(ROOT/'assets/environment/sky/sky.hdr'),check_existing=True)
world.node_tree.links.new(tex.outputs['Color'],next(n for n in world.node_tree.nodes if n.type=='BACKGROUND').inputs['Color']);next(n for n in world.node_tree.nodes if n.type=='BACKGROUND').inputs['Strength'].default_value=.7
light=bpy.data.lights.new('Afternoon sun','SUN');light.energy=2;light.angle=.08
sun=bpy.data.objects.new('Afternoon sun',light);scene.collection.objects.link(sun);sun.rotation_euler=(.55,-.4,-.6)
cam=bpy.data.cameras.new('Environment overview');camera=bpy.data.objects.new('Environment overview',cam);scene.collection.objects.link(camera);camera.location=(-32,-24,23);camera.rotation_euler=(Vector((2,28,8))-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera;cam.clip_end=3000
for o in bpy.context.selected_objects:o.select_set(False)
for o in cliffs.objects:o.select_set(True)
bpy.context.view_layer.objects.active=next(iter(cliffs.objects))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'assets/environment/alpine-cliffs.glb'),export_format='GLB',use_selection=True,use_active_scene=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/environment/alpine-environment.blend'),copy=True)
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':
  area.spaces.active.region_3d.view_location=(0,28,9);area.spaces.active.region_3d.view_distance=75
  area.spaces.active.shading.type='MATERIAL'
result={'scene':scene.name,'cliffs':len(cliffs.objects),'file':'assets/environment/alpine-environment.blend','export':'assets/environment/alpine-cliffs.glb','preserved_other_scenes':len(bpy.data.scenes)-1}
