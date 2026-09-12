import * as THREE from 'three';
import {GLTFLoader} from 'three/jsm/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/jsm/utils/BufferGeometryUtils.js';
import './scene.js';
import {createShiramineMaterial} from './shiramine-material.js';

const EDGE_EPS=1e-3;
const VERTICAL_EPS=1e-3;
const SEAM_BRIDGE_WIDTH=.12;

// Mesh Terrain exports a vertical skirt around many patch edges. The skirt hides
// a raster/LOD seam visually, but it is not a usable climbing surface. A skirt
// triangle has a pair of vertices at the same XZ position with different Y.
function stripSkirtTriangles(source){
 const position=source.getAttribute('position'),index=source.index?.array;
 if(!position||!index)return null;
 if(!source.boundingBox)source.computeBoundingBox();
 const box=source.boundingBox;
 if(!box)return null;
 const edgeVertex=i=>{
  const x=position.getX(i),z=position.getZ(i);
  return Math.abs(x-box.min.x)<EDGE_EPS||Math.abs(x-box.max.x)<EDGE_EPS||
         Math.abs(z-box.min.z)<EDGE_EPS||Math.abs(z-box.max.z)<EDGE_EPS;
 };
 const kept=[];
 for(let i=0;i<index.length;i+=3){
  const ids=[index[i],index[i+1],index[i+2]];let skirt=false;
  for(let a=0;a<3&&!skirt;a++)for(let b=a+1;b<3;b++){
   const ia=ids[a],ib=ids[b];
   if(!edgeVertex(ia)||!edgeVertex(ib))continue;
   if(Math.abs(position.getX(ia)-position.getX(ib))<EDGE_EPS&&
      Math.abs(position.getZ(ia)-position.getZ(ib))<EDGE_EPS&&
      Math.abs(position.getY(ia)-position.getY(ib))>VERTICAL_EPS){skirt=true;break;}
  }
  if(!skirt)kept.push(...ids);
 }
 if(!kept.length)return null;
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',position.clone());
 geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(kept),1));
 return geometry;
}

function collectEdgeSamples(geometry){
 const position=geometry.getAttribute('position');
 geometry.computeBoundingBox();const box=geometry.boundingBox;
 const result={left:[],right:[],back:[],front:[]};
 for(const [name,axis,side] of [['left','x',0],['right','x',1],['back','z',0],['front','z',1]]){
  const plane=axis==='x'?(side?box.max.x:box.min.x):(side?box.max.z:box.min.z),byKey=new Map();
  for(let i=0;i<position.count;i++){
   const coordinate=axis==='x'?position.getX(i):position.getZ(i);
   if(Math.abs(coordinate-plane)>EDGE_EPS)continue;
   const along=axis==='x'?position.getZ(i):position.getX(i),key=along.toFixed(4),y=position.getY(i);
   const list=byKey.get(key);if(list)list.push(y);else byKey.set(key,[y]);
  }
  result[name]=[...byKey].map(([key,ys])=>({k:Number(key),y:Math.max(...ys)})).sort((a,b)=>a.k-b.k);
 }
 return result;
}

function sampleEdge(samples,k){
 if(!samples.length||k<samples[0].k-EDGE_EPS||k>samples[samples.length-1].k+EDGE_EPS)return null;
 let i=1;while(i<samples.length&&samples[i].k<k)i++;
 if(i===samples.length)return samples[i-1].y;
 const a=samples[i-1],b=samples[i],span=b.k-a.k;
 return span>EDGE_EPS?a.y+(b.y-a.y)*(k-a.k)/span:a.y;
}

function addSeamBridge(positions,indices,a,b,axis){
 const edgeA=axis==='x'?a.edges.right:a.edges.front;
 const edgeB=axis==='x'?b.edges.left:b.edges.back;
 if(!edgeA.length||!edgeB.length)return;
 const lo=Math.max(edgeA[0].k,edgeB[0].k),hi=Math.min(edgeA.at(-1).k,edgeB.at(-1).k);
 if(hi-lo<EDGE_EPS)return;
 const keys=[...new Set([...edgeA,...edgeB].map(v=>v.k.toFixed(4)).filter(k=>Number(k)>=lo-EDGE_EPS&&Number(k)<=hi+EDGE_EPS))]
  .map(Number).sort((x,y)=>x-y);
 if(keys.length<2)return;
 const boundary=axis==='x'?a.x+128:a.z+128;
 for(let i=0;i<keys.length-1;i++){
  const k0=keys[i],k1=keys[i+1],a0=sampleEdge(edgeA,k0),a1=sampleEdge(edgeA,k1),b0=sampleEdge(edgeB,k0),b1=sampleEdge(edgeB,k1);
  if([a0,a1,b0,b1].some(v=>v===null||!Number.isFinite(v)))continue;
  // A narrow collision-only ramp bridges different adaptive edge resolutions.
  // The visual GLB remains untouched, while rays approaching from either patch
  // have a continuous face to hit at the boundary.
  const base=positions.length/3;
  if(axis==='x'){
   positions.push(boundary-SEAM_BRIDGE_WIDTH,a0,k0,boundary+SEAM_BRIDGE_WIDTH,b0,k0,
                  boundary-SEAM_BRIDGE_WIDTH,a1,k1,boundary+SEAM_BRIDGE_WIDTH,b1,k1);
  }else{
   positions.push(k0,a0,boundary-SEAM_BRIDGE_WIDTH,k0,b0,boundary+SEAM_BRIDGE_WIDTH,
                  k1,a1,boundary-SEAM_BRIDGE_WIDTH,k1,b1,boundary+SEAM_BRIDGE_WIDTH);
  }
  indices.push(base,base+1,base+2,base+2,base+1,base+3);
 }
}

function buildSeamBridgeGeometry(patches){
 const positions=[],indices=[];
 for(const patch of patches.values()){
  const xNeighbor=patches.get(`${patch.x+128},${patch.z}`);
  if(xNeighbor)addSeamBridge(positions,indices,patch,xNeighbor,'x');
  const zNeighbor=patches.get(`${patch.x},${patch.z+128}`);
  if(zNeighbor)addSeamBridge(positions,indices,patch,zNeighbor,'z');
 }
 if(!indices.length)return null;
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);return geometry;
}

export async function buildShiramine(scene,status) {
 const base='./assets/environment/meshterrain-shiramine/';
 const response=await fetch(base+'route.json');if(!response.ok)throw Error('登山ルートを読み込めません');
 const route=await response.json(),origin=new THREE.Vector3(...route.points[0]);
 const [asset,material]=await Promise.all([new GLTFLoader().loadAsync(base+'assets/world.glb'),createShiramineMaterial(origin)]);
 asset.scene.updateMatrixWorld(true);
 const buckets=new Map(),climbBuckets=new Map(),patches=new Map(),water=[];
 asset.scene.traverse(m=>{
  if(!m.isMesh)return;
  const g=m.geometry.clone().applyMatrix4(m.matrixWorld);g.translate(-origin.x,-origin.y,-origin.z);
  if(m.userData.meshterrain_kind==='terrain_patch'||m.name.startsWith('TerrainPatch')){
   g.setAttribute('terrainBase',g.getAttribute('color'));g.setAttribute('terrainGain',g.getAttribute('uv'));
   const coverage=g.getAttribute('uv1')||g.getAttribute('uv2');g.setAttribute('terrainCoverage',coverage||new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
   for(const name of Object.keys(g.attributes))if(!['position','normal','terrainBase','terrainGain','terrainCoverage'].includes(name))g.deleteAttribute(name);
   const key=Math.floor((m.position.x+2048)/512)+','+Math.floor((m.position.z+2048)/512);
   if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(g);
   const climbGeometry=stripSkirtTriangles(g);
   if(climbGeometry){
    if(!climbBuckets.has(key))climbBuckets.set(key,[]);climbBuckets.get(key).push(climbGeometry);
   }
   // Geometry has already been rebased by -origin, so keep the patch grid in
   // that same coordinate system for the hidden seam bridges below.
   patches.set(`${m.position.x-origin.x},${m.position.z-origin.z}`,{x:m.position.x-origin.x,z:m.position.z-origin.z,edges:collectEdgeSamples(g)});
  } else {const mesh=new THREE.Mesh(g,m.material.clone());mesh.material.side=THREE.DoubleSide;scene.add(mesh);water.push(mesh);}
 });
 status('地形と同じ形の当たり判定を構築中…');
 const colliders=[];
 for(const group of buckets.values()){
  const g=mergeGeometries(group);g.computeBoundsTree();g.computeBoundingSphere();
  const m=new THREE.Mesh(g,material);m.receiveShadow=true;m.userData.climbable=true;scene.add(m);colliders.push(m);
  group.forEach(g=>g.dispose());
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 // Climbing uses a proxy without patch skirts. The small hidden bridge strips
 // close the remaining T-junctions between differently tessellated neighbors.
 const climbables=[];
 for(const group of climbBuckets.values()){
  const g=mergeGeometries(group);g.computeBoundsTree();g.computeBoundingSphere();
  const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide,visible:false}));m.visible=false;m.userData.climbable=true;m.userData.shiramineClimbProxy=true;scene.add(m);climbables.push(m);
  group.forEach(g=>g.dispose());
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 const bridge=buildSeamBridgeGeometry(patches);
 if(bridge){bridge.computeBoundsTree();bridge.computeBoundingSphere();const m=new THREE.Mesh(bridge,new THREE.MeshBasicMaterial({side:THREE.DoubleSide,visible:false}));m.visible=false;m.userData.climbable=true;m.userData.shiramineSeamBridge=true;scene.add(m);climbables.push(m);}
 route.points=route.points.map(p=>new THREE.Vector3(...p).sub(origin));
 route.checkpoints=route.checkpoints.map(c=>({...c,position:new THREE.Vector3(...c.position).sub(origin)}));
 const markers=new THREE.Group();scene.add(markers);
 const postGeo=new THREE.CylinderGeometry(.07,.09,1.8,6),postMat=new THREE.MeshStandardMaterial({color:0x42464a});
 const flagGeo=new THREE.BoxGeometry(.55,.3,.06),flagMat=new THREE.MeshStandardMaterial({color:0xf2ba4e,emissive:0x5a3808,emissiveIntensity:.25});
 const pick=[];let accum=0;
 for(let i=1;i<route.points.length;i++){accum+=route.points[i].distanceTo(route.points[i-1]);if(accum>=12||i===1){pick.push(route.points[i]);accum=0;}}
 const posts=new THREE.InstancedMesh(postGeo,postMat,pick.length),flags=new THREE.InstancedMesh(flagGeo,flagMat,pick.length),dummy=new THREE.Object3D();
 pick.forEach((p,i)=>{dummy.position.copy(p).add(new THREE.Vector3(0,.9,0));dummy.updateMatrix();posts.setMatrixAt(i,dummy.matrix);dummy.position.add(new THREE.Vector3(.22,.65,0));dummy.updateMatrix();flags.setMatrixAt(i,dummy.matrix);});markers.add(posts,flags);
 const checkpointMarkers=route.checkpoints.map((c,i)=>{
  const group=new THREE.Group();group.position.copy(c.position);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.8,.06,6,32),new THREE.MeshBasicMaterial({color:0xf4cf76,depthTest:false}));ring.rotation.x=Math.PI/2;ring.position.y=.18;group.add(ring);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,3,8),postMat);pole.position.y=1.5;group.add(pole);
  const flag=new THREE.Mesh(new THREE.BoxGeometry(1.1,.6,.05),flagMat);flag.position.set(.5,2.6,0);group.add(flag);markers.add(group);return group;
 });
 const routeLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(route.points.map(p=>p.clone().add(new THREE.Vector3(0,.18,0)))),new THREE.LineBasicMaterial({color:0xe9ba59,transparent:true,opacity:.65}));scene.add(routeLine);
 scene.updateMatrixWorld(true);
 return {route,origin,colliders,climbables,holds:[],water,markers,checkpointMarkers,routeLine};
}
