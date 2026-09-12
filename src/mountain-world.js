import * as THREE from 'three';
import { mountainRoute as route } from './mountain-data.js';
import { alpineMaterial, alpineHeight } from './alpine-materials.js';
import { groundUV } from './photoreal-assets.js';
import { buildVista } from './vista.js';

export function buildMountain(scene, photo) {
  const colliders=[], climbables=[], holds=[], markers=[], vistaHide=[];
  const stone = alpineMaterial(0xaaa69a);
  const soil = photo.ground;
  const trailMaterial=photo.ground;
  const gold = new THREE.MeshStandardMaterial({color:0xe9b85c,roughness:.8});
  const dark = new THREE.MeshStandardMaterial({color:0x383f40,roughness:1});
  function mesh(geometry, material, collision=false, climb=false) {
    if(material===photo.ground)groundUV(geometry);
    const m=new THREE.Mesh(geometry,material); scene.add(m); vistaHide.push(m); m.receiveShadow=true;
    if(collision) {geometry.computeBoundsTree();colliders.push(m);m.userData.climbable=climb;if(climb)climbables.push(m);}
    return m;
  }
  function triangles(vertices,mat,collision=false,climb=false) {
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();
    return mesh(g,mat,collision,climb);
  }
  const quad=(v,a,b,c,d)=>v.push(...a,...b,...c,...a,...c,...d);
  // 歩行面は保持し、踏み跡の色だけを中央から岩肌へ不規則にぼかす。
  route.stages.forEach((stage,idx)=>{
    const points=stage.points, edges=points.map((p,i)=>{
      const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
      const dx=b[0]-a[0],dz=b[2]-a[2],l=Math.hypot(dx,dz);
      return [[p[0]+dz/l*p[3]/2,p[1],p[2]-dx/l*p[3]/2],[p[0]-dz/l*p[3]/2,p[1],p[2]+dx/l*p[3]/2]];
    });
    // 三角形を細分化して、道幅に沿う色の変化を頂点へ持たせる。
    const detailed=[],tints=[];
    const edgeColor=new THREE.Color(0x9e9c8a),trackColor=new THREE.Color(0xaaa18b);
    for(let i=1;i<edges.length;i++){
      const [a,b]=edges[i-1],[d,c]=edges[i];
      const rows=Math.max(2,Math.ceil(Math.hypot(c[0]-b[0],c[2]-b[2])*2)),cols=12;
      const at=(u,v)=>new THREE.Vector3().lerpVectors(new THREE.Vector3(...a).lerp(new THREE.Vector3(...b),u),new THREE.Vector3(...d).lerp(new THREE.Vector3(...c),u),v);
      const vertex=(u,v)=>{
        const p=at(u,v);detailed.push(p.x,p.y,p.z);
        const edge=Math.abs(u*2-1);
        const wear=(1-THREE.MathUtils.smoothstep(edge,.25,.94))*(.55+.2*Math.sin(p.x*1.3+p.z*2.1));
        const col=edgeColor.clone().lerp(trackColor,wear);tints.push(col.r,col.g,col.b);
      };
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
        const u=col/cols,U=(col+1)/cols,v=row/rows,V=(row+1)/rows;
        const normal=at(U,v).sub(at(u,v)).cross(at(U,V).sub(at(u,v)));
        if(normal.y>0){vertex(u,v);vertex(U,v);vertex(U,V);vertex(u,v);vertex(U,V);vertex(u,V);}
        else{vertex(u,v);vertex(U,V);vertex(U,v);vertex(u,v);vertex(u,V);vertex(U,V);}
      }
    }
    const trail=triangles(detailed,trailMaterial,true);
    trail.geometry.setAttribute('color',new THREE.Float32BufferAttribute(tints,3));
    stage.points.forEach((p,i)=>{
      if(i%2 && i!==points.length-1)return;
      if(i!==0 && i!==points.length-1){
        // 通路の外縁に積み石。掴む面や通路中央へは置かない。
        const e=edges[i][0],q=new THREE.Vector3(e[0]-p[0],0,e[2]-p[2]).normalize();
        for(let k=0;k<3;k++){
          const rock=mesh(photo.rockLOD,photo.rock.material);const size=.38-k*.085;
          rock.scale.set(size,size*.8,size);rock.position.set(e[0]-q.x*.15,p[1]+k*.17,e[2]-q.z*.15);rock.rotation.y=i*.9+k*1.7;
        }
        return;
      }
      const pole=mesh(new THREE.CylinderGeometry(.045,.065,1.1,6),dark);pole.position.set(p[0]+p[3]*.32,p[1]+.55,p[2]);
      const flag=mesh(new THREE.BoxGeometry(.32,.16,.06),gold);flag.position.copy(pole.position).add(new THREE.Vector3(.13,.35,0));markers.push(flag);
    });
  });
  route.walls.forEach((w,wallIndex)=>{
    // 操作検証済みの判定面を保持。中央の表示面は判定面から最大3cm以内。
    const proxyMaterial=new THREE.MeshBasicMaterial({visible:false});
    const body=mesh(new THREE.BoxGeometry(w.width,w.top-w.bottom,1.4),proxyMaterial,true,true);
    body.position.set(w.x,(w.top+w.bottom)/2,w.z-.7);
    const landing=mesh(new THREE.BoxGeometry(w.width,.3,2),soil,true);landing.position.set(w.x,w.top-.15,w.z-1);
    landing.material=proxyMaterial;
    const cap=new THREE.PlaneGeometry(w.width,2);cap.rotateX(-Math.PI/2);cap.translate(w.x,w.top,w.z-1);mesh(cap,soil);
  });
  scene.add(photo.cliff);vistaHide.push(photo.cliff);
  // 山道を支える一続きの山体。各道の直下を基準に谷へ落とす。
  // 道の中心を通る各線分から距離を求め、棚の外側を急斜面にする。
  const vistaPath=[[0,5,-17,4],[-8,5,-17,3],[-16,5,-17,6]];
  const segments=[...route.stages.flatMap(s=>s.points.slice(1).map((b,i)=>[s.points[i],b])),...vistaPath.slice(1).map((b,i)=>[vistaPath[i],b])];
  const overlook=new THREE.PlaneGeometry(19,3);overlook.rotateX(-Math.PI/2);overlook.translate(-8,5,-17);mesh(overlook,soil,true);
  const shelf=new THREE.CircleGeometry(3.3,24);shelf.rotateX(-Math.PI/2);shelf.translate(-16,5,-17);mesh(shelf,soil,true);
  // Blenderの侵食地形を、歩行範囲の山腹にも使う。GLBをそのまま衝突に
  // 使うと513²ポリゴンをBVHへ渡すことになるため、ここでは高さ場として
  // サンプルし、ゲーム用の低密度メッシュへ再構成する。
  function makePluginHeightSampler(source){
    const meshSource=source?.getObjectByProperty('isMesh',true);
    const position=meshSource?.geometry?.attributes?.position;
    if(!meshSource||!position)return null;
    const side=Math.round(Math.sqrt(position.count));
    if(side*side!==position.count)return null;
    source.updateMatrixWorld(true);meshSource.updateMatrixWorld(true);
    const localMin=new THREE.Vector3(Infinity,Infinity,Infinity),localMax=new THREE.Vector3(-Infinity,-Infinity,-Infinity);
    for(let i=0;i<position.count;i++){
      localMin.x=Math.min(localMin.x,position.getX(i));localMax.x=Math.max(localMax.x,position.getX(i));
      localMin.z=Math.min(localMin.z,position.getZ(i));localMax.z=Math.max(localMax.z,position.getZ(i));
    }
    const stepX=(localMax.x-localMin.x)/(side-1),stepZ=(localMax.z-localMin.z)/(side-1);
    if(stepX<=0||stepZ<=0)return null;
    const inverse=new THREE.Matrix4().copy(meshSource.matrixWorld).invert();
    const local=new THREE.Vector3(),world=new THREE.Vector3();
    const sample=(x,z)=>{
      local.set(x,0,z).applyMatrix4(inverse);
      const fx=(local.x-localMin.x)/stepX;
      // Blenderの格子はローカルYが奥へ増え、glTFではローカルZが負へ進む。
      const fy=(localMax.z-local.z)/stepZ;
      if(fx<0||fy<0||fx>side-1||fy>side-1)return null;
      const x0=Math.min(side-2,Math.max(0,Math.floor(fx))),y0=Math.min(side-2,Math.max(0,Math.floor(fy)));
      const tx=fx-x0,ty=fy-y0;
      const h=(ix,iy)=>position.getY(iy*side+ix);
      const localY=THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(h(x0,y0),h(x0+1,y0),tx),
        THREE.MathUtils.lerp(h(x0,y0+1),h(x0+1,y0+1),tx),ty);
      world.set(local.x,localY,local.z).applyMatrix4(meshSource.matrixWorld);
      return world.y;
    };
    return {sample,side};
  }
  const pluginHeight=makePluginHeightSampler(photo.authoredTerrain);
  function terrainHeight(x,z) {
    // まず山腹そのものを定義する。ルートから離れても地形が成立する。
    // プラグインの侵食谷を読み、ゲーム座標へなだらかな標高勾配を戻す。
    // ルート周辺だけは後段で道の高さへブレンドするため、道が浮かない。
    const pluginBase=pluginHeight?.sample(x,z);
    const spine=-.34*(z+2)-.010*x*x;
    const fallbackBase=spine+alpineHeight(x,z)*1.6;
    const base=pluginBase===null||pluginBase===undefined
      ? fallbackBase
      : pluginBase+28+Math.max(0,-z-7)*.5;
    let nearest=Infinity, height=0, width=0;
    for(const [a,b] of segments){
      const dx=b[0]-a[0],dz=b[2]-a[2],t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz),0,1);
      const d=Math.hypot(x-a[0]-t*dx,z-a[2]-t*dz);
      if(d<nearest){nearest=d;height=a[1]+t*(b[1]-a[1]);width=(a[3]+t*(b[3]-a[3]))/2;}
    }
    // 広い山腹は歩道と同じ高さへなじませる。細道だけ足元を急に落とす。
    const edge=Math.max(0,nearest-width);
    const narrow=width<1.1;
    const shoulder=height-.09-(narrow?Math.min(edge*3,4):edge*.25);
    const blend=1-THREE.MathUtils.smoothstep(edge,0,narrow?4:10);
    return Math.max(-145,THREE.MathUtils.lerp(base,shoulder,blend));
  }
  function heightMesh(minX,maxX,minZ,maxZ,step,height,material,collision=false){
    const nx=Math.round((maxX-minX)/step),nz=Math.round((maxZ-minZ)/step),positions=[],indices=[];
    for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
      const x=minX+i*step,z=minZ+j*step;positions.push(x,height(x,z),z);
    }
    for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
      const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;indices.push(a,c,b,b,c,d);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
    return mesh(g,material,collision);
  }
  const earthMesh=heightMesh(-100,100,-100,80,.75,terrainHeight,photo.ground,true);
  // 歩行ルートに沿って小石、崩落した岩、岩盤を配置。通路中央は空ける。
  let seed=71;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const rockGeometry=photo.rock.geometry;
  const rockCells=new Map(),dummy=new THREE.Object3D();let rockCount=0;
  for(let i=0;i<1100&&rockCount<180;i++){
    const x=rand()*125-62,z=rand()*120-85;
    let distance=Infinity;
    for(const [a,b]of segments){const dx=b[0]-a[0],dz=b[2]-a[2],t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz),0,1);distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,z-a[2]-t*dz)-(a[3]+t*(b[3]-a[3]))/2);}
    if(distance<.55)continue;
    const size=.12+Math.pow(rand(),4)*2.5;
    dummy.position.set(x,terrainHeight(x,z)-size*.2,z);dummy.scale.set(size*1.5,size*.8,size);dummy.rotation.set(rand(),rand()*6,rand());dummy.updateMatrix();
    const key=`${Math.floor(x/20)},${Math.floor(z/20)}`;
    if(!rockCells.has(key))rockCells.set(key,[]);
    rockCells.get(key).push(dummy.matrix.clone());rockCount++;
  }
  // 道沿いの小さな崩落石。全ルートから距離を取り、細道を塞がない。
  for(let i=0;i<120;i++){
    const [a,b]=segments[i%segments.length],t=rand(),side=rand()<.5?-1:1;
    const dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz),width=(a[3]+t*(b[3]-a[3]))/2;
    const offset=width+.7+rand()*1.5,x=a[0]+dx*t+dz/len*offset*side,z=a[2]+dz*t-dx/len*offset*side;
    let clearance=Infinity;
    for(const [c,d]of segments){const vx=d[0]-c[0],vz=d[2]-c[2],u=THREE.MathUtils.clamp(((x-c[0])*vx+(z-c[2])*vz)/(vx*vx+vz*vz),0,1);clearance=Math.min(clearance,Math.hypot(x-c[0]-vx*u,z-c[2]-vz*u)-(c[3]+u*(d[3]-c[3]))/2);}
    if(clearance<.55)continue;
    const size=.15+rand()*.28;dummy.position.set(x,terrainHeight(x,z)-size*.1,z);dummy.scale.set(size*1.3,size*.6,size);dummy.rotation.set(0,rand()*6,.2);dummy.updateMatrix();
    const key=`${Math.floor(x/20)},${Math.floor(z/20)}`;if(!rockCells.has(key))rockCells.set(key,[]);rockCells.get(key).push(dummy.matrix.clone());
  }
  for(const [x,y,z,s]of [[-4.2,1.0,-13,3.1],[4.3,1.1,-13.5,3.0],[-4.8,.3,-9,1.8],[4.4,-.1,3,1.4],[-5,-.3,6,1.6],[13.9,6,-28,2.8],[22.2,6,-28.5,3],[-14.2,14,-49,3.2],[-5.8,14,-49.4,2.8]]){
    const rock=new THREE.LOD();
    const near=new THREE.Mesh(rockGeometry,photo.rock.material),far=new THREE.Mesh(photo.rockLOD,photo.rock.material);
    near.castShadow=true;near.receiveShadow=true;far.receiveShadow=true;
    rock.addLevel(near,0);rock.addLevel(far,20,.15);
    rock.position.set(x,y,z);rock.scale.set(s,s,s);rock.rotation.y=x*.7;scene.add(rock);vistaHide.push(rock);
  }
  // 20m区画ごとにカリング。小さな散乱岩は影を投射せず、地形の影を受ける。
  for(const matrices of rockCells.values()){
    const rocks=new THREE.InstancedMesh(photo.rockLOD,photo.rock.material,matrices.length);
    matrices.forEach((matrix,i)=>rocks.setMatrixAt(i,matrix));
    rocks.receiveShadow=true;rocks.castShadow=false;
    rocks.computeBoundingBox();rocks.computeBoundingSphere();scene.add(rocks);vistaHide.push(rocks);
  }
  const vista=buildVista(scene,photo);
  // 同じ侵食地形を展望用と歩行用で二重に描かない。展望モードでは
  // 高解像度GLB、通常モードでは上の低密度な歩行地形を表示する。
  if(vista.group)vistaHide.push(vista.group);
  const valley=mesh(new THREE.PlaneGeometry(6000,6000),new THREE.MeshStandardMaterial({color:0x738980,roughness:1}));valley.rotation.x=-Math.PI/2;valley.position.y=-550;
  // 山頂標識
  const pole=mesh(new THREE.CylinderGeometry(.07,.09,3,8),dark);pole.position.set(0,23.5,-63);
  const flag=mesh(new THREE.BoxGeometry(1.2,.65,.035),gold);flag.position.set(.6,24.4,-63);
  return {colliders,climbables,holds,route,markers,vista,vistaHide,cameraTargets:colliders};
}
