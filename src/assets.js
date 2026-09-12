// アセット読み込みと BVH -> AnimationClip -> リターゲット -> 自キャラ のパイプライン。
//
//   CMU BVH ─BVHLoader→ Skeleton + AnimationClip
//                            │
//                            └─AnimationRetargeting(retargeting-threejs)→ 自キャラ用 AnimationClip
//                                                                              │
//                                            後処理: yaw 正規化 / hips position 再構築 / root motion 抽出
//                                                                              └→ AnimationMixer
import * as THREE from 'three';
import { GLTFLoader } from 'three/jsm/loaders/GLTFLoader.js';
import { BVHLoader } from 'three/jsm/loaders/BVHLoader.js';
import { AnimationRetargeting } from '../vendor/retargeting/retargeting.js';
import { CMU_TO_QUATERNIUS } from './retargetMap.js';
import { loadMixamoClip } from './mixamo.js';

// ページの場所に依存しないよう、このモジュール位置からプロジェクトルートを求める
const ROOT = new URL('../', import.meta.url).href;
const CHARACTER_URL = ROOT + 'assets/character/AnimationLibrary_Godot_Standard.gltf';
const MOTION_DIR = ROOT + 'assets/motions/';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

// GLTFLoader は node 名から ".:/[]" を取り除く（PropertyBinding.sanitizeNodeName）ため、
// glTF 上の "DEF-spine.001" はランタイムでは "DEF-spine001" になる。マップの値を実名へ解決する。
function resolveBoneMap(map, skeleton) {
  const have = new Set(skeleton.bones.map((b) => b.name));
  const out = {};
  const missing = [];
  for (const [src, trg] of Object.entries(map)) {
    const cands = [trg, THREE.PropertyBinding.sanitizeNodeName(trg), trg.replace(/[.:/[\]]/g, '')];
    const hit = cands.find((c) => have.has(c));
    if (hit) out[src] = hit; else missing.push(src + ' -> ' + trg);
  }
  if (missing.length) console.warn('[retarget] 未対応ボーン:', missing);
  return out;
}

/** clip を時刻 t でオブジェクト階層へ直接適用する（ミキサーを作らずにバインドポーズを作るため） */
export function applyClipAtTime(root, clip, time) {
  const objs = new Map();
  root.traverse((o) => objs.set(o.name, o));
  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.');
    const obj = objs.get(track.name.slice(0, dot));
    if (!obj) continue;
    const prop = track.name.slice(dot + 1);
    let i = Array.from(track.times).findIndex((t) => t >= time);
    if (i < 0) i = track.times.length - 1;
    const stride = prop === 'quaternion' ? 4 : 3;
    const v = track.values.slice(i * stride, i * stride + stride);
    if (prop === 'quaternion') obj.quaternion.fromArray(v);
    else if (prop === 'position') obj.position.fromArray(v);
    else if (prop === 'scale') obj.scale.fromArray(v);
  }
  root.updateMatrixWorld(true);
}

/**
 * hips の位置トラックを作り直す。
 *
 * retargeting-threejs の retargetPositionTrack は「src/trg どちらもボーン 0 が腰」を前提にしている。
 * Quaternius(Rigify) はボーン 0 が腰の親 `root` なので trgBindPos が原点になり、
 * スケール比が 0 になって全キーが 0 に潰れる。ここだけ自前で計算する。
 *
 *   world_i = trgHipsBind + Ry(yaw) * ( (srcHips_i - srcHipsBind) * (trgHipsBindY / srcHipsBindY) )
 *
 * さらに始点→終点の一次トレンド（= キャラが実際に進んだ距離）を差し引いて in-place ループにし、
 * 抜いた量を clip.userData.rootMotion に残す（移動速度とアニメ速度の同期に使う）。
 */
function rebuildHipsPositionTrack(clip, srcClip, srcHipsName, trgHipsName, hipsParent, trgHipsBind, yaw) {
  const srcTrack = srcClip.tracks.find((t) => t.name === srcHipsName + '.position');
  const trgTrack = clip.tracks.find((t) => t.name === trgHipsName + '.position');
  if (!srcTrack || !trgTrack) return new THREE.Vector3();

  const srcBind = new THREE.Vector3().fromArray(srcTrack.values, 0);   // BVH 先頭 = T ポーズ
  const ratio = srcBind.y !== 0 ? trgHipsBind.y / srcBind.y : 1;
  const qYaw = new THREE.Quaternion().setFromAxisAngle(UP, yaw);

  const n = srcTrack.times.length;
  const world = new Array(n);
  for (let i = 0; i < n; i++) {
    world[i] = new THREE.Vector3().fromArray(srcTrack.values, i * 3)
      .sub(srcBind).multiplyScalar(ratio).applyQuaternion(qYaw).add(trgHipsBind);
  }

  // 動きの本体は index 1.. （0 は T ポーズなので基準にしない）
  const a = world[Math.min(1, n - 1)];
  const b = world[n - 1];
  const rootMotion = b.clone().sub(a);

  const invParent = new THREE.Matrix4().copy(hipsParent.matrixWorld).invert();
  const values = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = n > 2 ? Math.max(0, i - 1) / (n - 2) : 0;
    _v.copy(world[i]).sub(a).addScaledVector(rootMotion, -t).add(trgHipsBind);
    _v.applyMatrix4(invParent);
    _v.toArray(values, i * 3);
  }
  trgTrack.values = values;
  trgTrack.times = Float32Array.from(srcTrack.times);
  return rootMotion;
}

/** 内蔵クリップ用: hips 位置トラックからワールド空間で一次トレンドを差し引く */
function detrendHipsPositionTrack(clip, hipsName, hipsParent) {
  const track = clip.tracks.find((t) => t.name === hipsName + '.position');
  if (!track) return new THREE.Vector3();
  const M = hipsParent.matrixWorld;
  const invM = new THREE.Matrix4().copy(M).invert();
  const n = track.times.length;
  const world = new Array(n);
  for (let i = 0; i < n; i++) world[i] = new THREE.Vector3().fromArray(track.values, i * 3).applyMatrix4(M);
  const rootMotion = world[n - 1].clone().sub(world[0]);
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    _v.copy(world[i]).addScaledVector(rootMotion, -t).applyMatrix4(invM);
    _v.toArray(track.values, i * 3);
  }
  return rootMotion;
}

/**
 * クリップ全体を「ワールドの Y 軸まわり」に yaw 回転させ、キャラの向きを正規化する。
 *
 * hips のクォータニオントラックは *親（root ボーン）空間* のローカル回転なので、
 * ワールドの Ry(θ) をそのまま premultiply してはいけない。
 * Rigify の root ボーンは -90° X 回転しているため、そのまま掛けると軸がずれる
 * （yaw が小さいうちは目立たないが、180° では体が横倒しになる）。
 *   q_world' = Ry * q_world
 *   q_local' = qParent^-1 * Ry * qParent * q_local
 * として親空間へ共役変換してから掛ける。
 */
function applyYawToHipsRotation(clip, hipsName, yaw, hipsParent) {
  if (!yaw) return;
  const track = clip.tracks.find((t) => t.name === hipsName + '.quaternion');
  if (!track) return;
  const qYawWorld = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  const qp = hipsParent.getWorldQuaternion(new THREE.Quaternion());
  const qLocal = qp.clone().invert().multiply(qYawWorld).multiply(qp);
  for (let i = 0; i < track.values.length; i += 4) {
    _q.fromArray(track.values, i).premultiply(qLocal);
    _q.toArray(track.values, i);
  }
}

/** clip の先頭 t 秒を切り落とす */
function trimClipHead(clip, t) {
  for (const track of clip.tracks) {
    const stride = track.getValueSize();
    const times = Array.from(track.times);
    let cut = 0;
    while (cut < times.length - 2 && times[cut] < t - 1e-6) cut++;
    if (cut === 0) continue;
    track.times = Float32Array.from(times.slice(cut).map((x) => x - t));
    track.values = track.values.slice(cut * stride);
  }
  clip.resetDuration();
}

// cgspeed 版の T ポーズフレームは腕が 8 度ほど下がっている（前腕から先）。
// ターゲット(Quaternius)の T ポーズは腕が完全に水平なので、そのままだと 8 度のバイアスが乗る。
// 腕チェーンのローカル回転を BVH の rest（= 完全水平）へ戻して bind pose を揃える。
const ARM_CHAIN = ['LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'];
function levelSourceArms(srcSkeleton) {
  for (const name of ARM_CHAIN) {
    const b = srcSkeleton.bones.find((x) => x.name === name);
    if (b) b.quaternion.identity();
  }
  srcSkeleton.bones[0].updateMatrixWorld(true);
}

async function loadRetargetedBVH(bvhLoader, meta, ctx) {
  const bvh = await new Promise((res, rej) => bvhLoader.load(MOTION_DIR + meta.name + '.bvh', res, undefined, rej));
  const srcRoot = bvh.skeleton.bones[0];
  srcRoot.updateMatrixWorld(true);

  // cgspeed 版 BVH は先頭フレームが T ポーズ。そこへ合わせて src bind pose とする
  applyClipAtTime(srcRoot, bvh.clip, 0);
  levelSourceArms(bvh.skeleton);

  const retarget = new AnimationRetargeting(bvh.skeleton, ctx.skeleton, {
    srcPoseMode: AnimationRetargeting.BindPoseModes.CURRENT, // = BVH 先頭の T ポーズ
    trgPoseMode: AnimationRetargeting.BindPoseModes.CURRENT, // = 呼び出し側で T ポーズにしてある
    boneNameMap: ctx.boneMap,
  });

  const clip = retarget.retargetAnimation(bvh.clip);
  clip.name = meta.name;

  applyYawToHipsRotation(clip, ctx.hipsName, meta.yawOffset, ctx.hipsParent);
  const rootMotion = rebuildHipsPositionTrack(
    clip, bvh.clip, srcRoot.name, ctx.hipsName, ctx.hipsParent, ctx.hipsBind, meta.yawOffset);

  trimClipHead(clip, 1 / meta.fps);      // 先頭の T ポーズフレームを捨てる
  // CMU の梯子登りは実測 0.23m/s と遅いので、再生速度を上げて使う
  clip.userData = { rootMotion, animRate: null, meta, source: 'CMU ' + meta.src };
  return { clip, sourceSkeleton: bvh.skeleton, sourceClip: bvh.clip };
}

/**
 * @param {function} onProgress
 * @param {object} opts  { sections } — 既定は ['clips']（ゲームが使うぶんだけ）。
 *                       ['clips','library'] を渡すと未配線のクリップも全部読む（デバッグ用）
 */
export async function loadAll(onProgress = () => {}, opts = {}) {
  const gltfLoader = new GLTFLoader();
  const bvhLoader = new BVHLoader();

  onProgress('キャラクター (Quaternius / CC0) を読み込み中…');
  const gltf = await new Promise((res, rej) => gltfLoader.load(CHARACTER_URL, res, undefined, rej));

  const model = gltf.scene;
  let skinnedMesh = null;
  model.traverse((o) => { if (o.isSkinnedMesh) skinnedMesh = o; });
  if (!skinnedMesh) throw new Error('SkinnedMesh が見つかりません');

  const skeleton = skinnedMesh.skeleton;
  const boneMap = resolveBoneMap(CMU_TO_QUATERNIUS, skeleton);
  const hipsName = boneMap.Hips;
  const hipsBone = skeleton.bones.find((b) => b.name === hipsName);
  const builtin = {};
  for (const c of gltf.animations) builtin[c.name] = c;

  // ---- リターゲットのため、ターゲットを T ポーズへ固定する ----
  // Quaternius のバインドポーズは A ポーズ寄りなので、同梱の A_TPose クリップ先頭フレームを使う
  if (builtin['A_TPose']) applyClipAtTime(model, builtin['A_TPose'], 0);
  model.updateMatrixWorld(true);

  const sanitize = (n) => n.replace(/[.:/[\]]/g, '');
  const ctx = {
    skeleton, boneMap, hipsName, model,
    hipsParent: hipsBone.parent,
    hipsBind: hipsBone.getWorldPosition(new THREE.Vector3()),
    // 体の向きを測るための上腕ボーン名
    armL: sanitize('DEF-upper_arm.L'),
    armR: sanitize('DEF-upper_arm.R'),
    // 腰ボーンのローカル軸のうち「前方 +Z」「上方向 +Y」に相当するもの。
    // T ポーズの状態で逆算しておき、mixamo.js の detectClipYaw が使う。
    // 注意: 腰の向きは「体の向き」の代理にならない（ブレースハングでは骨盤が傾く）。
    // 向きの正誤判定には使わず、手足のワールド座標で見ること。REPORT.md 7-F。
    hipsParentQuat: hipsBone.parent.getWorldQuaternion(new THREE.Quaternion()),
    hipsFwdLocal: new THREE.Vector3(0, 0, 1)
      .applyQuaternion(hipsBone.getWorldQuaternion(new THREE.Quaternion()).invert()),
    hipsUpLocal: new THREE.Vector3(0, 1, 0)
      .applyQuaternion(hipsBone.getWorldQuaternion(new THREE.Quaternion()).invert()),
    // 向き検出でポーズを動かしたあと T ポーズへ戻すための復元関数
    restorePose: () => {
      if (builtin['A_TPose']) applyClipAtTime(model, builtin['A_TPose'], 0);
      model.updateMatrixWorld(true);
    },
  };

  onProgress('CMU BVH を読み込み・リターゲット中…');
  const manifest = await fetch(MOTION_DIR + 'manifest.json').then((r) => r.json());
  const climbClips = {};
  const debug = { sources: {} };
  for (const meta of manifest.clips) {
    const r = await loadRetargetedBVH(bvhLoader, meta, ctx);
    climbClips[meta.name] = r.clip;
    debug.sources[meta.name] = { skeleton: r.sourceSkeleton, clip: r.sourceClip, meta };
  }

  // ---- Mixamo の FBX があれば該当アクションを差し替える ----
  // assets/motions/mixamo/manifest.json が無ければ何もしない（CMU 版のまま動く）
  const mixamo = await loadMixamoOverrides(ctx, climbClips, opts.sections || ['clips']);

  // ---- 内蔵クリップは in-place 化のみ ----
  for (const [name, clip] of Object.entries(builtin)) {
    if (name === 'A_TPose') continue;
    const rootMotion = detrendHipsPositionTrack(clip, hipsName, ctx.hipsParent);
    clip.userData = { rootMotion, meta: null, source: 'Quaternius UAL' };
  }

  skeleton.pose();
  model.updateMatrixWorld(true);

  return { model, skinnedMesh, skeleton, hipsName, hipsBone, boneMap, builtin, climbClips, manifest, mixamo, debug };
}

/**
 * assets/motions/mixamo/manifest.json を読んで、記載された FBX を
 * リターゲットし climbClips のキーを上書きする。
 * ファイルが無い・読めないものは黙って飛ばす（CMU 版のクリップが残る）。
 */
async function loadMixamoOverrides(ctx, climbClips, sections = ['clips']) {
  const dir = MOTION_DIR + 'mixamo/';
  let manifest = null;
  try {
    const res = await fetch(dir + 'manifest.json');
    if (!res.ok) return { enabled: false, replaced: [], failed: [] };
    manifest = await res.json();
  } catch {
    return { enabled: false, replaced: [], failed: [] };
  }

  const defaults = manifest.defaults || {};
  const replaced = [];
  const failed = [];
  const entries = sections.flatMap((s) => manifest[s] || []);
  for (const entry of entries) {
    if (!entry.file || !entry.action) continue;
    try {
      const r = await loadMixamoClip(
        dir + entry.file.split('/').map(encodeURIComponent).join('/'), ctx, {
        name: entry.action,
        unitScale: entry.unitScale ?? defaults.unitScale ?? 0.01,
        // "auto" を指定したクリップだけ detectClipYaw に実測させる（既定は 0 = 補正なし）
        yawOffset: entry.yawOffset === 'auto' ? null : (entry.yawOffset ?? defaults.yawOffset ?? 0),
        inPlace: entry.inPlace ?? defaults.inPlace ?? true,
        groundAlign: entry.groundAlign ?? defaults.groundAlign ?? false,
        trimHead: entry.trimHead ?? defaults.trimHead ?? 0,
        groundOffset: entry.groundOffset ?? defaults.groundOffset ?? false,
        animRate: entry.animRate ?? defaults.animRate ?? 1.0,
      });
      climbClips[entry.action] = r.clip;
      replaced.push(entry.action);
    } catch (e) {
      failed.push({ action: entry.action, file: entry.file, error: e.message });
    }
  }
  if (replaced.length) console.info('[mixamo] 差し替え:', replaced.join(', '));
  if (failed.length) console.warn('[mixamo] 読めなかったもの:', failed);
  return { enabled: true, replaced, failed };
}
