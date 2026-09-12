import * as THREE from 'three';
import {mergeVertices} from 'three/jsm/utils/BufferGeometryUtils.js';

// 展望台の構図。前景→谷→非対称な主稜線→遠い山並み。
// Seceda DEMの主稜線（ローカルのほぼ -Z、わずかに +X 側）へ向けた構図。
export const VISTA={position:[-16,5,-17],yaw:-.13,pitch:-.035,title:'西の肩・展望台'};
export function buildVista(scene,photo){
  const group=new THREE.Group();
  // Blender地形プラグインの書き出しが有効なら、それを展望の大形状にする。未配置時は
  // 既存の公開DEMへ戻るため、ゲーム本体を止めずに地形を差し替えられる。
  const authoredTerrain=photo.authoredTerrain;
  const authored=authoredTerrain||photo.vistaTerrain;
  const debugFlat=new URLSearchParams(location.search).has('flat');
  // Blenderから書き出したDEMはゲーム座標へ焼き付け済み。無い場合だけ
  // 標高バイナリから作るフォールバックを使い、二重表示を避ける。
  if(authored){
    scene.add(group);group.add(authored);
    const flatMaterial=debugFlat?new THREE.MeshStandardMaterial({color:0x718064,roughness:1}):null;
    const keepAuthoredMaterial=Boolean(authoredTerrain)&&photo.terrainManifest?.material!=='shared-ground';
    authored.traverse(o=>{if(o.isMesh){
      if(!authoredTerrain||debugFlat){o.geometry.deleteAttribute('normal');o.geometry=mergeVertices(o.geometry,1e-3);o.geometry.computeVertexNormals();}
      if(flatMaterial)o.material=flatMaterial;
      else if(!keepAuthoredMaterial)o.material=photo.vistaGround||photo.ground;
      o.receiveShadow=true;o.castShadow=false;
    }});
  }else{
    group.position.set(-16,0,-17);group.rotation.y=VISTA.yaw;scene.add(group);
  }
  const addRock=(p)=>{
    const rock=new THREE.Mesh(photo.rockLOD,photo.rock.material);
    rock.position.set(authored?(authoredTerrain?p[0]:p[0]-16):p[0],p[1],authored?(authoredTerrain?p[2]:p[2]-17):p[2]);
    rock.scale.set(p[3],p[3],p[3]);rock.rotation.y=p[0];rock.receiveShadow=true;group.add(rock);
  };
  const foreground=[[-3.2,3.4,-3.8,1.25],[3.2,3.4,-4.2,1.55],[0,3.0,-5.8,1.1]];
  if(authored)foreground.forEach(addRock);
  if(authored)return {group,...VISTA,targetY:authoredTerrain?35:70};
  // Mapzen/Terrain Tilesの標高を使用。写真の背景ではなく視差のある3D地形。
  const dem=photo.dem,scale=.32,stride=2,nx=Math.floor((dem.nx-1)/stride),nz=Math.floor((dem.nz-1)/stride);
  const positions=[],uv=[],indices=[],altitudes=[];
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
    const ix=i*stride,iz=j*stride,h=dem.heights[iz*dem.nx+ix];
    const x=(ix-160)*dem.step*scale,z=-(iz-15)*dem.step*scale;
    const near=THREE.MathUtils.smoothstep(Math.hypot(x,z),20,130);
    positions.push(x,THREE.MathUtils.lerp(-18,(h-dem.cameraElevation)*scale+5,near),z);uv.push(x/32,z/32);altitudes.push(h);
  }
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;
    indices.push(a,b,c,b,d,c);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  const colors=[];
  for(let i=0;i<altitudes.length;i++){
    const slope=g.attributes.normal.getY(i),h=altitudes[i];
    const rock=1-THREE.MathUtils.smoothstep(slope,.65,.88);
    const high=THREE.MathUtils.smoothstep(h,2200,2550);
    const col=new THREE.Color(0x66744c).lerp(new THREE.Color(0xbdb8aa),Math.max(rock,high));
    const snow=THREE.MathUtils.smoothstep(h,2900,3030)*THREE.MathUtils.smoothstep(slope,.55,.9);col.lerp(new THREE.Color(0xe3e6df),snow);
    colors.push(col.r,col.g,col.b);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  group.add(new THREE.Mesh(g,photo.vistaGround||new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,map:photo.ground.map,side:THREE.DoubleSide})));
  // 実写スキャンの前景を置き、山体の距離と展望台の縁を伝える。
  foreground.forEach(addRock);
  return {group,...VISTA};
}
