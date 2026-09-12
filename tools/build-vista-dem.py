import math,json,subprocess,concurrent.futures,struct
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]/'assets/environment/seceda-dem';root.mkdir(exist_ok=True)
lat,lon=46.6005,11.725
zoom=13;n=2**zoom
px=(lon+180)/360*n*256;py=(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n*256
# 8x6 km northeast of the lookout; local meters from Mercator pixels.
meters=math.cos(math.radians(lat))*40075016.686/(n*256)
step=26;nx=321;nz=301
# Camera looks east-northeast. World local x is right, z points toward viewer.
bearing=math.radians(67)
coords=[];tiles=set()
for j in range(nz):
 for i in range(nx):
  u=(i-160)*step;d=(j-15)*step
  east=u*math.cos(bearing)+d*math.sin(bearing);north=-u*math.sin(bearing)+d*math.cos(bearing)
  x=int(px+east/meters);y=int(py-north/meters);coords.append((x,y));tiles.add((x//256,y//256))
def get(t):
 x,y=t;p=root/f'{zoom}-{x}-{y}.png'
 if not p.exists():subprocess.run(['curl','-fLsS','--retry','2',f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{zoom}/{x}/{y}.png','-o',str(p)],check=True)
 return t,Image.open(p).convert('RGB')
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:images=dict(pool.map(get,tiles))
values=[]
for x,y in coords:
 r,g,b=images[(x//256,y//256)].getpixel((x%256,y%256));values.append(r*256+g+b/256-32768)
(root/'heights.bin').write_bytes(struct.pack('<'+'f'*len(values),*values))
meta={'nx':nx,'nz':nz,'step':step,'latitude':lat,'longitude':lon,'bearing':67,'cameraElevation':2518,'zoom':zoom,'source':'https://registry.opendata.aws/terrain-tiles/','tiles':len(tiles),'min':min(values),'max':max(values)}
(root/'metadata.json').write_text(json.dumps(meta,indent=2));print(meta)
