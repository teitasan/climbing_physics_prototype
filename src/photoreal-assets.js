import * as THREE from 'three';
import {RGBELoader} from 'three/jsm/loaders/RGBELoader.js';
import {GLTFLoader} from 'three/jsm/loaders/GLTFLoader.js';

export async function loadPhotorealAssets(renderer, status) {
  status('実写スキャンの岩と地表を読み込み中…');
  const loader=new THREE.TextureLoader(),gltf=new GLTFLoader();
  const base='./assets/environment/';
  const optionalTerrain=(async()=>{
    try{
      const response=await fetch(base+'gaea/manifest.json',{cache:'no-store'});
      if(!response.ok)return {manifest:null,scene:null};
      const manifest=await response.json();
      if(manifest.enabled!==true)return {manifest,scene:null};
      const file=manifest.mesh||'terrain.glb';
      const asset=await gltf.loadAsync(base+'gaea/'+file+'?rev=gaea1');
      return {manifest,scene:asset.scene};
    }catch(error){
      console.warn('Blender terrain plugin is unavailable; keeping the DEM fallback.',error);
      return {manifest:null,scene:null};
    }
  })();
  const [diff,normal,rough,grassDiff,cliff,boulder,sky,lod,dem,vistaTerrain,authoredTerrain]=await Promise.all([
    loader.loadAsync(base+'rock_ground_02/diff.jpg'),loader.loadAsync(base+'rock_ground_02/nor_gl.jpg'),loader.loadAsync(base+'rock_ground_02/rough.jpg'),
    loader.loadAsync(base+'aerial_grass_rock/diff.jpg'),
    gltf.loadAsync(base+'alpine-cliffs.glb'),gltf.loadAsync(base+'boulder_01/boulder_01.gltf'),new RGBELoader().loadAsync(base+'sky/sky.hdr'),gltf.loadAsync(base+'boulder-lod-v2.glb'),
    Promise.all([fetch(base+'seceda-dem/metadata.json').then(r=>{if(!r.ok)throw Error('DEM metadata');return r.json();}),fetch(base+'seceda-dem/heights.bin').then(r=>{if(!r.ok)throw Error('DEM heights');return r.arrayBuffer();})]),
    gltf.loadAsync(base+'alpine-vista.glb?rev=3'),
    optionalTerrain,
  ]);
  for(const t of [diff,normal,rough,grassDiff]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
  diff.colorSpace=THREE.SRGBColorSpace;grassDiff.colorSpace=THREE.SRGBColorSpace;
  const ground=new THREE.MeshStandardMaterial({map:diff,normalMap:normal,roughnessMap:rough,roughness:1,normalScale:new THREE.Vector2(.8,.8),color:0xffffff});
  // 斜面の向きに合わせ3方向から投影し、急斜面で模様が伸びるのを防ぐ。
  ground.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 photoWorld; varying vec3 photoNormal;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nphotoWorld=(modelMatrix*vec4(transformed,1.)).xyz;photoNormal=normalize(mat3(modelMatrix)*objectNormal);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 photoWorld;varying vec3 photoNormal;
      vec3 triWeight(){vec3 w=pow(abs(normalize(photoNormal)),vec3(4.));return w/(w.x+w.y+w.z);}
      vec4 triSample(sampler2D tex){vec3 w=triWeight(),p=photoWorld/6.;return texture2D(tex,p.zy)*w.x+texture2D(tex,p.xz)*w.y+texture2D(tex,p.xy)*w.z;}
    `).replace('#include <map_fragment>','diffuseColor *= triSample(map);')
    .replace('#include <roughnessmap_fragment>','float roughnessFactor=roughness*triSample(roughnessMap).g;')
    .replace('#include <normal_fragment_maps>',`vec3 w=triWeight(),p=photoWorld/6.;
      vec3 nx=texture2D(normalMap,p.zy).xyz*2.-1.,ny=texture2D(normalMap,p.xz).xyz*2.-1.,nz=texture2D(normalMap,p.xy).xyz*2.-1.;
      vec3 detail=vec3(0.,nx.y,nx.x)*w.x+vec3(ny.x,0.,ny.y)*w.y+vec3(nz.x,nz.y,0.)*w.z;
      normal=normalize(mat3(viewMatrix)*(normalize(photoNormal)+detail*.65));`);
  };
  ground.customProgramCacheKey=()=> 'photo-ground-triplanar-v1';
  // 展望台専用の地表。緩い低地だけ草地へ寄せることで、同じ岩肌の
  // 反復を避けつつ、急斜面と高所の岩盤は共通のスキャンへ戻す。
  const vistaGround=new THREE.MeshStandardMaterial({map:diff,normalMap:normal,roughnessMap:rough,roughness:1,normalScale:new THREE.Vector2(.35,.35),color:0xffffff});
  vistaGround.onBeforeCompile=shader=>{
    shader.uniforms.grassMap={value:grassDiff};
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 photoWorld; varying vec3 photoNormal;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nphotoWorld=(modelMatrix*vec4(transformed,1.)).xyz;photoNormal=normalize(mat3(modelMatrix)*objectNormal);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      uniform sampler2D grassMap;
      varying vec3 photoWorld;varying vec3 photoNormal;
      vec3 triWeight(){vec3 w=pow(abs(normalize(photoNormal)),vec3(4.));return w/(w.x+w.y+w.z);}
      // 遠景DEMは緩斜面が中心なので、XZ平面の一方向投影にして
      // 三方向投影の境界線が遠景へ出ないようにする。
      vec4 triSample(sampler2D tex){return texture2D(tex,photoWorld.xz/22.);}
      float grassFactor(){float slope=smoothstep(.38,.82,abs(photoNormal.y));float high=1.-smoothstep(36.,112.,photoWorld.y);return slope*high*.88;}
    `).replace('#include <map_fragment>',`float grassAmount=grassFactor();
      diffuseColor *= mix(triSample(map),triSample(grassMap),grassAmount);`)
    .replace('#include <roughnessmap_fragment>','float roughnessFactor=roughness;')
    // DEMの16m級ポリゴンへ高周波の法線を重ねると、遠景で三角形の
    // モアレが出る。色と粗さはPBR、陰影はDEMの平滑法線に任せる。
    .replace('#include <normal_fragment_maps>','normal=normalize(mat3(viewMatrix)*normalize(photoNormal));');
  };
  vistaGround.customProgramCacheKey=()=> 'photo-ground-triplanar-grass-v1';
  sky.mapping=THREE.EquirectangularReflectionMapping;
  const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromEquirectangular(sky);pmrem.dispose();
  let rock;
  boulder.scene.traverse(o=>{if(o.isMesh){rock=o;o.material.roughness=1;for(const v of Object.values(o.material))if(v?.isTexture)v.anisotropy=8;}});
  cliff.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;for(const v of Object.values(o.material))if(v?.isTexture)v.anisotropy=8;}});
  let rockLOD;lod.scene.traverse(o=>{if(o.isMesh)rockLOD=o.geometry;});
  return {ground,vistaGround,cliff:cliff.scene,rock,rockLOD,sky,environment,dem:{...dem[0],heights:new Float32Array(dem[1])},vistaTerrain:vistaTerrain.scene,authoredTerrain:authoredTerrain.scene,terrainManifest:authoredTerrain.manifest};
}

export function groundUV(geometry) {
  const p=geometry.attributes.position,uv=[];
  for(let i=0;i<p.count;i++)uv.push(p.getX(i)/6,p.getZ(i)/6);
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
}
