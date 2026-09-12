// Two Bone IK（解析解）。腕 = upper_arm/forearm/hand、脚 = thigh/shin/foot に使う。
// AnimationMixer が作ったポーズの「上に」乗せる形で、手足の接地点だけを補正する。
import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _toT = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _want = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _m = new THREE.Matrix4();

function worldPos(bone, out) {
  const e = bone.matrixWorld.elements;
  return out.set(e[12], e[13], e[14]);
}

/** ワールド空間での回転 delta をボーンのローカル回転へ適用する */
function applyWorldDelta(bone, deltaWorld, weight) {
  bone.parent.getWorldQuaternion(_qp);
  bone.getWorldQuaternion(_qw);
  // 目標のワールド回転 = delta * current
  _q.copy(deltaWorld).multiply(_qw);
  if (weight < 1) _q.slerp(_qw, 1 - weight);   // weight=0 なら現状維持
  // ローカル = parentWorld^-1 * targetWorld
  bone.quaternion.copy(_qp.invert()).multiply(_q);
  bone.updateMatrixWorld(true);
}

/**
 * 2 ボーン IK を解く。
 * @param {THREE.Bone} rootBone  肩 / 股
 * @param {THREE.Bone} midBone   肘 / 膝
 * @param {THREE.Bone} endBone   手 / 足
 * @param {THREE.Vector3} target ワールド座標の目標
 * @param {THREE.Vector3} pole   中間関節を曲げたい向き（ワールド）
 * @param {number} weight        0..1
 * @returns {number} 目標に届かなかった距離（m）
 */
export function solveTwoBoneIK(rootBone, midBone, endBone, target, pole, weight = 1) {
  if (weight <= 0) return 0;
  rootBone.updateMatrixWorld(true);
  worldPos(rootBone, _a); worldPos(midBone, _b); worldPos(endBone, _c);

  const l1 = _a.distanceTo(_b);
  const l2 = _b.distanceTo(_c);
  if (l1 < 1e-5 || l2 < 1e-5) return 0;

  _toT.copy(target).sub(_a);
  const rawDist = _toT.length();
  const EPS = 1e-4;
  const d = THREE.MathUtils.clamp(rawDist, Math.abs(l1 - l2) + EPS, l1 + l2 - EPS);
  if (rawDist < 1e-5) return 0;
  _toT.multiplyScalar(1 / rawDist);                     // 単位ベクトル

  // 曲げ平面の法線。pole 方向へ中間関節を出す
  _axis.crossVectors(_toT, pole);
  if (_axis.lengthSq() < 1e-8) {
    _axis.crossVectors(_toT, _b.clone().sub(_a));       // 退化時は現在の曲がり方を使う
    if (_axis.lengthSq() < 1e-8) _axis.set(0, 1, 0);
  }
  _axis.normalize();

  // 余弦定理: root での開き角
  const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const alpha = Math.acos(cosA);

  // 中間関節の目標位置
  _dir.copy(_toT).applyAxisAngle(_axis, alpha);
  _want.copy(_a).addScaledVector(_dir, l1);

  // 1) root を回して mid を _want へ
  _q.setFromUnitVectors(_b.clone().sub(_a).normalize(), _want.clone().sub(_a).normalize());
  applyWorldDelta(rootBone, _q, weight);

  // 2) mid を回して end を target へ
  worldPos(midBone, _b); worldPos(endBone, _c);
  _q.setFromUnitVectors(_c.clone().sub(_b).normalize(), _want.copy(target).sub(_b).normalize());
  applyWorldDelta(midBone, _q, weight);

  worldPos(endBone, _c);
  return _c.distanceTo(target);
}

/** end ボーンの向きを面の法線に合わせる（手のひら・足裏を壁へ向ける簡易版） */
export function alignEndToSurface(endBone, normal, weight = 0.6) {
  if (weight <= 0) return;
  endBone.updateMatrixWorld(true);
  // ボーンのローカル +Y をボーン方向とする Blender/Rigify 規約。
  // ここでは「end ボーンの現在の Z 軸」を -normal に寄せる。
  _m.extractRotation(endBone.matrixWorld);
  _dir.set(0, 0, 1).applyMatrix4(_m).normalize();
  _want.copy(normal).negate();
  _q.setFromUnitVectors(_dir, _want);
  applyWorldDelta(endBone, _q, weight);
}
