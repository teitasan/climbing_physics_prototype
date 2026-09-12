// テストシーン（床 / 垂直な大きな壁 / 壁上部の床 / 斜め壁）と、
// three-mesh-bvh を使った壁プローブ、壁面ローカル 2D 座標系（ClimbSurface）。
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// three-mesh-bvh を Raycaster に組み込む（Raycast 回数が増えても安定させる）
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export const WORLD_UP = new THREE.Vector3(0, 1, 0);

const _m3 = new THREE.Matrix3();
const _v = new THREE.Vector3();

/* ------------------------------------------------------------------ *
 * テストシーン
 * ------------------------------------------------------------------ */

const MAT = {
  ground: new THREE.MeshStandardMaterial({ color: 0x5d6b52, roughness: 0.95 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.9 }),
  top: new THREE.MeshStandardMaterial({ color: 0x6f7a63, roughness: 0.95 }),
  hold: new THREE.MeshStandardMaterial({ color: 0xc86b3c, roughness: 0.7 }),
};

function collider(mesh, opts = {}) {
  mesh.geometry.computeBoundsTree();
  mesh.castShadow = opts.castShadow !== false;
  mesh.receiveShadow = true;
  mesh.userData.climbable = !!opts.climbable;
  mesh.userData.walkable = !!opts.walkable;
  return mesh;
}

/**
 * 壁面 1 枚を作る。ホールド（掴める突起）を格子状に並べ、その中心位置を返す。
 * @param {object} o  { width, height, thickness, center:Vector3, yaw }  yaw=0 で法線が +Z
 */
function makeWall(o) {
  const group = new THREE.Group();
  group.position.copy(o.center);
  group.rotation.y = o.yaw || 0;

  // 壁本体（面が z=0、奥へ thickness ぶん伸びる）。base を上げると下端が宙に浮く
  const base = o.base || 0;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(o.width, o.height - base, o.thickness),
    MAT.wall);
  body.position.set(0, base + (o.height - base) / 2, -o.thickness / 2);
  group.add(collider(body, { climbable: true }));

  // ホールド（見た目 + Raycast の当たり先）
  const holds = [];
  const du = o.holdSpacingU ?? 0.5;
  const dv = o.holdSpacingV ?? 0.42;
  const nu = Math.floor((o.width - 0.6) / du);
  const v0 = base + 0.45;
  const nv = Math.floor((o.height - v0 - 0.05) / dv);
  const holdGeo = new THREE.BoxGeometry(0.16, 0.09, 0.09);
  const holdMesh = new THREE.InstancedMesh(holdGeo, MAT.hold, nu * nv);
  holdMesh.castShadow = true;
  const m = new THREE.Matrix4();
  let i = 0;
  for (let iv = 0; iv < nv; iv++) {
    for (let iu = 0; iu < nu; iu++) {
      // 段ごとに半ピッチずらして自然な配置にする
      const u = -((nu - 1) * du) / 2 + iu * du + (iv % 2 ? du * 0.5 : 0);
      const v = v0 + iv * dv;
      m.makeTranslation(u, v, 0.03);
      holdMesh.setMatrixAt(i++, m);
      holds.push(new THREE.Vector3(u, v, 0.045).applyEuler(group.rotation).add(o.center));
    }
  }
  holdMesh.count = i;
  group.add(holdMesh);

  return { group, holds, spec: o };
}

export function buildTestScene(scene) {
  const colliders = [];
  const climbables = [];
  const holds = [];

  // --- 平らな床 ---
  const ground = new THREE.Mesh(new THREE.BoxGeometry(60, 0.4, 60), MAT.ground);
  ground.position.set(0, -0.2, 0);
  scene.add(collider(ground, { walkable: true, castShadow: false }));
  colliders.push(ground);

  // --- 垂直な大きな壁（正面, 法線 +Z） ---
  const wallH = 6.0;
  const w1 = makeWall({ width: 14, height: wallH, thickness: 1.2, center: new THREE.Vector3(0, 0, -7), yaw: 0 });
  scene.add(w1.group);
  w1.group.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) { colliders.push(o); if (o.userData.climbable) climbables.push(o); } });
  holds.push(...w1.holds);

  // --- 斜め壁（tangent/bitangent 設計の確認用, 法線が斜め） ---
  const w2 = makeWall({ width: 7, height: wallH, thickness: 1.2, center: new THREE.Vector3(9.4, 0, -4.6), yaw: -Math.PI / 5 });
  scene.add(w2.group);
  w2.group.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) { colliders.push(o); if (o.userData.climbable) climbables.push(o); } });
  holds.push(...w2.holds);

  // --- 下端が宙に浮いた壁（Hang / 足が壁から外れる状況の確認用） ---
  // 正面の壁（x = -7..7）の左に連続して並べるので、左へトラバースすると乗り移れる。
  const w3 = makeWall({ width: 4, height: wallH, base: 2.2, thickness: 1.2,
                        center: new THREE.Vector3(-9, 0, -7), yaw: 0 });
  scene.add(w3.group);
  w3.group.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) { colliders.push(o); if (o.userData.climbable) climbables.push(o); } });
  holds.push(...w3.holds);

  // --- 壁上部に立てる床（マントル先） ---
  const topFloor = new THREE.Mesh(new THREE.BoxGeometry(24, 0.4, 12), MAT.top);
  topFloor.position.set(2, wallH - 0.2, -13.2);
  scene.add(collider(topFloor, { walkable: true }));
  colliders.push(topFloor);

  // --- 目印 ---
  const grid = new THREE.GridHelper(60, 60, 0x3f4a3a, 0x374031);
  grid.position.y = 0.005;
  scene.add(grid);

  return { colliders, climbables, holds, wallHeight: wallH };
}

/* ------------------------------------------------------------------ *
 * 壁プローブ: 必要な情報はすべて Raycast で取る
 * ------------------------------------------------------------------ */

export class WallProbe {
  constructor(colliders, climbables, holds) {
    this.colliders = colliders;
    this.climbables = climbables;
    this.holds = holds;
    this.ray = new THREE.Raycaster();
    this.ray.firstHitOnly = true;      // three-mesh-bvh 用
    this.stats = { casts: 0 };
  }

  /** 汎用レイキャスト。ヒット面の法線はワールドへ変換して返す */
  cast(origin, dir, maxDist, targets) {
    this.stats.casts++;
    this.ray.set(origin, dir);
    this.ray.near = 0;
    this.ray.far = maxDist;
    const hits = this.ray.intersectObjects(targets || this.colliders, false);
    if (!hits.length) return null;
    const h = hits[0];
    const normal = h.face
      ? h.face.normal.clone().applyNormalMatrix(_m3.getNormalMatrix(h.object.matrixWorld)).normalize()
      : new THREE.Vector3(0, 1, 0);
    return { point: h.point.clone(), normal, distance: h.distance, object: h.object };
  }

  /** キャラクター前方に登れる壁があるか */
  probeClimbableAhead(origin, forward, maxDist = 0.9) {
    const hit = this.cast(origin, forward, maxDist, this.climbables);
    if (!hit) return null;
    // ほぼ垂直な面のみ対象（|normal.y| が小さい）
    if (Math.abs(hit.normal.y) > 0.5) return null;
    // 法線がこちらを向いているか
    if (hit.normal.dot(forward) > -0.35) return null;
    return hit;
  }

  /** 足元の地面（歩行用） */
  probeGround(position, maxDist = 3.0) {
    _v.copy(position).addScaledVector(WORLD_UP, 0.6);
    return this.cast(_v, new THREE.Vector3(0, -1, 0), maxDist + 0.6, this.colliders);
  }

  /** 壁面上の点 (u,v) に本当に壁があるか調べ、面の点と法線を返す（壁の継続判定） */
  probeSurface(worldPos, normal, out = 0.55) {
    _v.copy(worldPos).addScaledVector(normal, out);
    return this.cast(_v, normal.clone().negate(), out * 2.2, this.climbables);
  }

  /**
   * 上端の有無を調べる。壁の向こう側の少し上から下向きに撃ち、
   * 立てる床があるか（法線が上向き）を確認する。
   */
  probeTop(surfacePoint, normal, aheadDist = 0.55, upDist = 1.35) {
    _v.copy(surfacePoint).addScaledVector(WORLD_UP, upDist).addScaledVector(normal, -aheadDist);
    const hit = this.cast(_v, new THREE.Vector3(0, -1, 0), upDist + 0.6, this.colliders);
    if (!hit || hit.normal.y < 0.7) return null;
    const rise = hit.point.y - surfacePoint.y;
    // 「腰より上」かつ「手の届く範囲」にある床だけを上端とみなす
    if (rise < 0.15 || rise > upDist) return null;
    return hit;
  }

  /** 頭上が空いているか */
  hasHeadroom(position, height = 2.0) {
    const hit = this.cast(position.clone().addScaledVector(WORLD_UP, 0.2), WORLD_UP, height, this.colliders);
    return !hit;
  }

  /**
   * 手足の接地点候補。ideal に最も近いホールドを探し、
   * 見つからなければ壁面へ Raycast した点を返す。
   */
  findHold(ideal, normal, radius = 0.45, taken = null) {
    let best = null, bestD = radius;
    for (const h of this.holds) {
      const d = h.distanceTo(ideal);
      if (d >= bestD) continue;
      if (taken && taken.has(h)) continue;
      best = h; bestD = d;
    }
    if (best) return { point: best.clone(), normal: normal.clone(), hold: best };
    const s = this.probeSurface(ideal, normal);
    if (s) return { point: s.point.clone().addScaledVector(s.normal, 0.04), normal: s.normal, hold: null };
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * 壁面ローカル 2D 座標系
 *   u = 横（tangent） / v = 縦（bitangent）
 *   垂直な壁では bitangent = worldUp だが、オーバーハングや傾斜面でも
 *   そのまま使えるよう tangent/bitangent を法線から作る。
 * ------------------------------------------------------------------ */

export class ClimbSurface {
  constructor() {
    this.origin = new THREE.Vector3();     // uv=(0,0) の壁面上の点
    this.normal = new THREE.Vector3(0, 0, 1);
    this.tangent = new THREE.Vector3(1, 0, 0);
    this.bitangent = new THREE.Vector3(0, 1, 0);
  }

  /** 壁のヒット結果から座標系を作る */
  setFromHit(hit) {
    this.origin.copy(hit.point);
    this.setNormal(hit.normal);
    return this;
  }

  setNormal(n) {
    this.normal.copy(n).normalize();
    // 横方向: wallRight = normalize(cross(worldUp, wallNormal))
    this.tangent.crossVectors(WORLD_UP, this.normal);
    if (this.tangent.lengthSq() < 1e-6) this.tangent.set(1, 0, 0);   // 天井/床のような面の保険
    this.tangent.normalize();
    // 縦方向: 面内で「上」に相当する向き（垂直壁なら worldUp と一致）
    this.bitangent.crossVectors(this.normal, this.tangent).normalize();
    return this;
  }

  worldFromUV(u, v, target = new THREE.Vector3()) {
    return target.copy(this.origin).addScaledVector(this.tangent, u).addScaledVector(this.bitangent, v);
  }

  uvFromWorld(p, target = new THREE.Vector2()) {
    _v.copy(p).sub(this.origin);
    return target.set(_v.dot(this.tangent), _v.dot(this.bitangent));
  }

  /** 面のワールド回転（-normal を前方とする） */
  lookQuaternion(target = new THREE.Quaternion()) {
    const m = new THREE.Matrix4().makeBasis(
      this.tangent,
      this.bitangent,
      this.normal);                       // three.js の前方は -Z なので +Z に法線を入れる
    return target.setFromRotationMatrix(m);
  }
}
