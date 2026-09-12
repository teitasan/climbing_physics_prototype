import fs from 'node:fs';
import * as THREE from 'three';
import {computeBoundsTree, acceleratedRaycast} from 'three-mesh-bvh';
THREE.BufferGeometry.prototype.computeBoundsTree=computeBoundsTree;
THREE.Mesh.prototype.raycast=acceleratedRaycast;
export function loadTerrain(path) {
  const file=fs.readFileSync(path), jsonSize=file.readUInt32LE(12);
  const gltf=JSON.parse(file.toString('utf8',20,20+jsonSize));
  const binary=file.subarray(28+jsonSize);
  function accessor(id) {
    const a=gltf.accessors[id],v=gltf.bufferViews[a.bufferView];
    const C={5126:Float32Array,5125:Uint32Array,5123:Uint16Array}[a.componentType];
    const width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
    const start=(v.byteOffset||0)+(a.byteOffset||0), bytes=binary.subarray(start,start+a.count*width*C.BYTES_PER_ELEMENT);
    return new C(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  }
  const meshes=[];
  for (const node of gltf.nodes) {
    if(node.extras?.meshterrain_kind!=='terrain_patch')continue;
    for(const p of gltf.meshes[node.mesh].primitives){
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(accessor(p.attributes.POSITION),3));g.setIndex(new THREE.BufferAttribute(accessor(p.indices),1));
      g.computeBoundsTree();const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));m.position.fromArray(node.translation||[0,0,0]);m.updateMatrixWorld(); meshes.push(m);
    }
  }
  const ray=new THREE.Raycaster();ray.firstHitOnly=true;
  const bySection=new Map(meshes.map(m=>[`${Math.floor(m.position.x/128)},${Math.floor(m.position.z/128)}`,m]));
  function sample(x,z) {
    const mesh=bySection.get(`${Math.floor(x/128)},${Math.floor(z/128)}`);if(!mesh)return null;
    ray.set(new THREE.Vector3(x,2000,z),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObject(mesh)[0];
    return hit?{height:hit.point.y,normalY:Math.abs(hit.face.normal.y)}:null;
  }
  return {meshes,sample};
}
