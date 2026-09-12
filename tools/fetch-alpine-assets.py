"""Download verified CC0 Poly Haven files for offline use; preserve source metadata."""
import json, subprocess, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/'assets/environment'
def fetch(url,path,md5=None):
 path.parent.mkdir(parents=True,exist_ok=True)
 if not path.exists(): subprocess.run(['curl','-fLsS','--retry','2','-A','climbing-proto local asset preparation',url,'-o',str(path)],check=True)
 if md5 and hashlib.md5(path.read_bytes()).hexdigest()!=md5: raise ValueError('Checksum mismatch: '+str(path))
def metadata(name):
 p=ROOT/name/'source.json';fetch('https://api.polyhaven.com/files/'+name,p);return json.loads(p.read_text())
for name in ['rock_face_01','boulder_01']:
 d=metadata(name)['gltf']['2k']['gltf'];fetch(d['url'],ROOT/name/(name+'.gltf'),d['md5'])
 for p,f in d['include'].items():fetch(f['url'],ROOT/name/p,f['md5'])
 print(name,'ready',flush=True)
for name in ['rock_ground_02']:
  d=metadata(name)
  for key,source in [('diff','Diffuse'),('nor_gl','nor_gl'),('rough','Rough'),('disp','Displacement')]:
    f=d[source]['2k']['jpg'];fetch(f['url'],ROOT/name/(key+'.jpg'),f['md5'])
  print(name,'ready',flush=True)

# 展望地形用の草地。遠景のテクスチャは1Kで十分なので、初期ロードを増やさない。
grass=ROOT/'aerial_grass_rock'
for key,url,md5 in [
  ('diff.jpg','https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/aerial_grass_rock/aerial_grass_rock_diff_1k.jpg','e920ce36afd0abff000b8366d3d768d3'),
  ('nor_gl.jpg','https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/aerial_grass_rock/aerial_grass_rock_nor_gl_1k.jpg','c8aa4c4f09b113cc7edef89ddeaccad9'),
  ('rough.jpg','https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/aerial_grass_rock/aerial_grass_rock_rough_1k.jpg','f78c5cdc565f990299ae7c5a81f68cf7'),
]:
  fetch(url,grass/key,md5)
print('aerial_grass_rock ready',flush=True)

# 遠景候補。ゲームではBlenderで12K三角形へ軽量化したGLBを使う。
name='mountainside';d=metadata(name)['gltf']['1k']['gltf'];fetch(d['url'],ROOT/name/(name+'.gltf'),d['md5'])
for p,f in d['include'].items():fetch(f['url'],ROOT/name/p,f['md5'])
print(name,'ready',flush=True)
