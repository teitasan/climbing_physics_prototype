// Mixamo (mixamorig) の FBX を読み込んで自キャラ用 AnimationClip にするパイプライン。
//
//   Mixamo FBX ─FBXLoader→ Skeleton + AnimationClip
//                              └─AnimationRetargeting→ Quaternius(Rigify) 用 clip
//
// CMU BVH 版（assets.js）との違い:
//   - スケールが cm 単位（Mixamo は 1 unit = 1 cm）なので root 位置を 0.01 倍する
//   - bind pose は FBX に入っているものがそのまま T ポーズ相当なので加工不要
//   - FBXLoader はボーン名に "mixamorig:Hips" を残す一方、トラック名は
//     PropertyBinding.sanitizeNodeName を通って "mixamorigHips" になる。両者を揃える必要がある
import * as THREE from 'three';
import { FBXLoader } from 'three/jsm/loaders/FBXLoader.js';
import { AnimationRetargeting } from '../vendor/retargeting/retargeting.js';
import { applyClipAtTime } from './assets.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/** mixamorig -> Quaternius(Rigify DEF-*) のボーン対応表 */
export const MIXAMO_TO_QUATERNIUS = {
  'mixamorig:Hips':          'DEF-hips',
  'mixamorig:Spine':         'DEF-spine.001',
  'mixamorig:Spine1':        'DEF-spine.002',
  'mixamorig:Spine2':        'DEF-spine.003',
  'mixamorig:Neck':          'DEF-neck',
  'mixamorig:Head':          'DEF-head',

  'mixamorig:LeftShoulder':  'DEF-shoulder.L',
  'mixamorig:LeftArm':       'DEF-upper_arm.L',
  'mixamorig:LeftForeArm':   'DEF-forearm.L',
  'mixamorig:LeftHand':      'DEF-hand.L',
  'mixamorig:RightShoulder': 'DEF-shoulder.R',
  'mixamorig:RightArm':      'DEF-upper_arm.R',
  'mixamorig:RightForeArm':  'DEF-forearm.R',
  'mixamorig:RightHand':     'DEF-hand.R',

  'mixamorig:LeftUpLeg':     'DEF-thigh.L',
  'mixamorig:LeftLeg':       'DEF-shin.L',
  'mixamorig:LeftFoot':      'DEF-foot.L',
  'mixamorig:LeftToeBase':   'DEF-toe.L',
  'mixamorig:RightUpLeg':    'DEF-thigh.R',
  'mixamorig:RightLeg':      'DEF-shin.R',
  'mixamorig:RightFoot':     'DEF-foot.R',
  'mixamorig:RightToeBase':  'DEF-toe.R',

  // 指（Quaternius 側にもあるので繋いでおく。掴みポーズが乗る）
  'mixamorig:LeftHandThumb1':  'DEF-thumb.01.L',
  'mixamorig:LeftHandThumb2':  'DEF-thumb.02.L',
  'mixamorig:LeftHandThumb3':  'DEF-thumb.03.L',
  'mixamorig:LeftHandIndex1':  'DEF-f_index.01.L',
  'mixamorig:LeftHandIndex2':  'DEF-f_index.02.L',
  'mixamorig:LeftHandIndex3':  'DEF-f_index.03.L',
  'mixamorig:LeftHandMiddle1': 'DEF-f_middle.01.L',
  'mixamorig:LeftHandMiddle2': 'DEF-f_middle.02.L',
  'mixamorig:LeftHandMiddle3': 'DEF-f_middle.03.L',
  'mixamorig:LeftHandRing1':   'DEF-f_ring.01.L',
  'mixamorig:LeftHandRing2':   'DEF-f_ring.02.L',
  'mixamorig:LeftHandRing3':   'DEF-f_ring.03.L',
  'mixamorig:LeftHandPinky1':  'DEF-f_pinky.01.L',
  'mixamorig:LeftHandPinky2':  'DEF-f_pinky.02.L',
  'mixamorig:LeftHandPinky3':  'DEF-f_pinky.03.L',
  'mixamorig:RightHandThumb1':  'DEF-thumb.01.R',
  'mixamorig:RightHandThumb2':  'DEF-thumb.02.R',
  'mixamorig:RightHandThumb3':  'DEF-thumb.03.R',
  'mixamorig:RightHandIndex1':  'DEF-f_index.01.R',
  'mixamorig:RightHandIndex2':  'DEF-f_index.02.R',
  'mixamorig:RightHandIndex3':  'DEF-f_index.03.R',
  'mixamorig:RightHandMiddle1': 'DEF-f_middle.01.R',
  'mixamorig:RightHandMiddle2': 'DEF-f_middle.02.R',
  'mixamorig:RightHandMiddle3': 'DEF-f_middle.03.R',
  'mixamorig:RightHandRing1':   'DEF-f_ring.01.R',
  'mixamorig:RightHandRing2':   'DEF-f_ring.02.R',
  'mixamorig:RightHandRing3':   'DEF-f_ring.03.R',
  'mixamorig:RightHandPinky1':  'DEF-f_pinky.01.R',
  'mixamorig:RightHandPinky2':  'DEF-f_pinky.02.R',
  'mixamorig:RightHandPinky3':  'DEF-f_pinky.03.R',
};

const sanitize = (n) => n.replace(/[.:/[\]]/g, '');

// ソースとターゲットの bind pose の前方の差。
//
// このプロジェクトは「モデルローカル +Z = キャラの前方」で統一している。
// 根拠（実測）: T ポーズのつま先ベクトルが +Z、Quaternius のクリップも +Z。
// Mixamo の bind pose も +Z 前方なので、差は 0。
//
// 以前ここを π にしていた。Mixamo クリップだけ体が -Z 前方になり、
// 壁モード（lookQuaternion が +Z に法線を入れていた）と偶然打ち消し合って
// 壁の上では正しく見えるが、Normal モードで Mixamo クリップを再生した瞬間
// （着地・壁ジャンプ・落下）だけ 180 度反転する、という形で表面化していた。
// 詳細は REPORT.md 7-F。
const BIND_ALIGN_YAW = 0;

/**
 * FBXLoader が返したボーン名とトラック名の表記ゆれを吸収する。
 * ボーン名は "mixamorig:Hips" のまま、トラック名は "mixamorigHips.quaternion" に
 * なることがあるため、両方を sanitize 済みの名前へ寄せる。
 */
/**
 * Mixamo の名前空間を正規化する。
 *
 * 通常は `mixamorig:Hips` で、sanitize すると `mixamorigHips` になる。
 * ところが **X Bot 以外のキャラクターで書き出すと `mixamorig1Hips` のように
 * 名前空間に番号が付く**（実測: CH36_NONPBR で書き出した Wiping Sweat）。
 * これを吸収しないとボーン名が 1 つも一致せず、リターゲット結果が
 * **0 トラック / duration 0** の空クリップになる（読み込み自体は成功するので気付きにくい）。
 */
const normalizeRig = (n) => sanitize(n).replace(/^mixamorig\d+/, 'mixamorig');

function normalizeNames(root, clip) {
  const renamed = new Map();
  root.traverse((o) => {
    const s = normalizeRig(o.name);
    if (s !== o.name) { renamed.set(o.name, s); o.name = s; }
  });
  if (clip) {
    for (const track of clip.tracks) {
      const dot = track.name.lastIndexOf('.');
      const objName = track.name.slice(0, dot);
      const prop = track.name.slice(dot);
      track.name = normalizeRig(objName) + prop;
    }
  }
  return renamed;
}


/**
 * FBX から「アニメーションが実際に駆動しているボーン階層」を取り出して Skeleton を作る。
 *
 * three.js の FBXLoader は Mixamo の FBX（SkinnedMesh が 2 つある形）で
 * 各関節のボーンを二重に作る。その結果 skinnedMesh.skeleton.bones に入るのは
 * 内側の複製で、親が bones 配列の中に居ない＝親子関係が辿れない状態になる
 * （retargeting-threejs の computeProportionRatio が parent.getWorldPosition で落ちる）。
 *
 * AnimationClip のトラックは名前解決で最初に見つかる「外側」のボーンを駆動するので、
 * ルートボーンから深さ優先で辿り、同名は最初の 1 つだけを採用してこちらを使う。
 */
function buildSourceSkeleton(fbxRoot, url) {
  let rootBone = null;
  fbxRoot.traverse((n) => { if (n.isBone && !rootBone && !(n.parent && n.parent.isBone)) rootBone = n; });
  if (!rootBone) throw new Error('FBX にボーンが見つかりません: ' + url);

  const bones = [];
  const seen = new Set();
  (function walk(o) {
    if (o.isBone && !seen.has(o.name)) { seen.add(o.name); bones.push(o); }
    for (const c of o.children) walk(c);
  })(rootBone);

  rootBone.updateMatrixWorld(true);
  // boneInverses は現在（= レストポーズ）のワールド行列から自動計算される
  const skeleton = new THREE.Skeleton(bones);

  // 念のため親子が全部辿れることを確認する（辿れないと retargeting 側で落ちる）
  const set = new Set(bones);
  const broken = bones.slice(1).filter((b) => !b.parent || !set.has(b.parent));
  if (broken.length) {
    console.warn('[mixamo] 親が辿れないボーン', url, broken.map((b) => b.name));
  }
  return skeleton;
}

/** マップの両側を実際のボーン名へ解決する */
function resolveMap(map, srcSkeleton, trgSkeleton) {
  const src = new Set(srcSkeleton.bones.map((b) => b.name));
  const trg = new Set(trgSkeleton.bones.map((b) => b.name));
  const out = {};
  const missing = { src: [], trg: [] };
  for (const [s, t] of Object.entries(map)) {
    const sName = [s, sanitize(s), normalizeRig(s)].find((c) => src.has(c));
    const tName = [t, sanitize(t)].find((c) => trg.has(c));
    if (!sName) { missing.src.push(s); continue; }
    if (!tName) { missing.trg.push(t); continue; }
    out[sName] = tName;
  }
  return { map: out, missing };
}


/**
 * リターゲット済みクリップの「体の向き」を実測し、-Z（three.js の前方 / 壁の内側）へ
 * 揃えるための yaw を返す。
 *
 * Mixamo のクリップは 1 本ごとに元の向きがバラバラで、固定の 180 度補正では合わない
 * （実測: Braced Hang Hop Up は +180 度必要、Hanging Idle Against Wall は 0 度で正しい）。
 * そこで理屈で決めるのをやめ、ターゲットスケルトンに実際に適用して測る。
 *
 * 体の右軸 = 左上腕→右上腕、前方 = up × right = (rz, 0, -rx)。
 */
function detectYawOffset(clip, ctx, samples = 10) {
  const L = ctx.skeleton.bones.find((b) => b.name === ctx.armL);
  const R = ctx.skeleton.bones.find((b) => b.name === ctx.armR);
  if (!L || !R || !clip.duration) return 0;

  let sx = 0, sz = 0;
  const wl = new THREE.Vector3(), wr = new THREE.Vector3();
  for (let i = 0; i < samples; i++) {
    const t = clip.duration * (i + 0.5) / samples;
    applyClipAtTime(ctx.model, clip, t);
    L.getWorldPosition(wl); R.getWorldPosition(wr);
    const rx = wr.x - wl.x, rz = wr.z - wl.z;
    const len = Math.hypot(rx, rz);
    if (len < 1e-5) continue;
    sx += rz / len;
    sz += -rx / len;
  }
  if (ctx.restorePose) ctx.restorePose();          // 次のリターゲットのため T ポーズへ戻す
  if (Math.hypot(sx, sz) < 1e-5) return 0;
  return Math.PI - Math.atan2(sx, sz);             // 前方を -Z にする回転量
}


/**
 * リターゲット済みクリップの「体の向き」を腰ボーンの回転トラックから直接測り、
 * 前方が -Z（three.js / Quaternius の規約）になる yaw を返す。
 *
 * Mixamo のクリップは **1 本ごとに作られた向きが違う**。
 * 全体に一律 180 度を掛けると、一部のクリップだけ前後が逆になる
 * （実測: Walk_Loop は前方 -Z、Hard Landing / Falling To Roll は +Z だった）。
 *
 * 測り方: T ポーズのとき腰ボーンのローカル軸のどれが前方 -Z に相当するかを求め、
 * それを各フレームの腰の回転で回して前方ベクトルを得る。
 * 転がりなど姿勢が崩れるフレームは信用できないので、
 * 体がほぼ直立しているフレーム（腰の上方向がワールド上方向に近い）だけを使う。
 */
function detectClipYaw(clip, ctx) {
  const rotTrack = clip.tracks.find((t) => t.name === ctx.hipsName + '.quaternion');
  if (!rotTrack || !ctx.hipsFwdLocal) return 0;

  const qp = ctx.hipsParentQuat;
  const q = new THREE.Quaternion();
  const fwd = new THREE.Vector3();
  const up = new THREE.Vector3();
  let sx = 0, sz = 0, used = 0;

  const n = rotTrack.times.length;
  const stride = Math.max(1, Math.floor(n / 24));
  for (let i = 0; i < n; i += stride) {
    q.fromArray(rotTrack.values, i * 4).premultiply(qp);      // 腰のワールド回転
    up.copy(ctx.hipsUpLocal).applyQuaternion(q);
    if (up.y < 0.6) continue;                                  // 直立していないフレームは使わない
    fwd.copy(ctx.hipsFwdLocal).applyQuaternion(q);
    const len = Math.hypot(fwd.x, fwd.z);
    if (len < 1e-4) continue;
    sx += fwd.x / len; sz += fwd.z / len; used++;
  }
  if (!used || Math.hypot(sx, sz) < 1e-4) return 0;
  // 実測した前方を、このプロジェクトの規約（モデルローカル +Z）へ向ける回転量
  return -Math.atan2(sx, sz);
}

/**
 * Mixamo の hips 位置トラックを作り直す。
 *
 * retargeting-threejs の retargetPositionTrack は「src/trg どちらもボーン 0 が腰」を
 * 前提にしているが、Quaternius(Rigify) はボーン 0 が腰の親 `root` なので
 * スケール比が 0 になって全キーが潰れる（assets.js と同じ理由）。
 *
 *   world_i = trgHipsBind + Ry(yaw) * ( (srcHips_i * unitScale - srcBind) * (trgBindY / srcBindY) )
 *
 * srcBind は **アニメーションの先頭フレーム**の腰位置。ほとんどのクリップは
 * 先頭が立ち姿勢なのでこれで良いが、`Crouch Idle` のように先頭から既にしゃがんでいる
 * クリップでは「そのしゃがみ高さ = 立ち姿勢の腰の高さ」に正規化され、
 * 膝は曲がったまま腰だけ持ち上がるので **足が地面から浮く**
 * （実測: crouch_idle のつま先 0.42m / sneak_fwd 0.21〜0.26m。接地クリップは 0.01〜0.03m）。
 *
 * ソースのバインドポーズの腰高さを基準にする案（keepHipHeight）を試したが効かなかった。
 * FBXLoader が読み込んだ時点でスケルトンが先頭フレームの姿勢になっており、
 * 「バインドポーズの腰高さ」を取ろうとしても先頭フレームと同じ値しか得られない
 * （実測: 腰 0.957 → 0.937 とほぼ変化なし）。
 *
 * 代わりに `groundOffset: true` を使う。クリップ内で最も低い足の位置を実測し、
 * それが地面 0 に来るよう腰を下げる。原因を問わず「足が浮く」を直せる。
 *
 * inPlace なら始点→終点の一次トレンドを差し引いて in-place ループにし、
 * 抜いた量を clip.userData.rootMotion に残す（移動速度との同期に使う）。
 */
function rebuildHipsPositionTrack(clip, srcClip, srcHipsName, trgHipsName, hipsParent, trgHipsBind, opts) {
  const srcTrack = srcClip.tracks.find((t) => t.name === srcHipsName + '.position');
  const trgTrack = clip.tracks.find((t) => t.name === trgHipsName + '.position');
  if (!srcTrack || !trgTrack) return { rootMotion: new THREE.Vector3(), rootCurve: null };

  const n = srcTrack.times.length;
  const srcBind = new THREE.Vector3().fromArray(srcTrack.values, 0).multiplyScalar(opts.unitScale);
  const ratio = srcBind.y !== 0 ? trgHipsBind.y / srcBind.y : 1;
  const qYaw = new THREE.Quaternion().setFromAxisAngle(UP, opts.yawOffset || 0);

  const world = [];
  for (let i = 0; i < n; i++) {
    world.push(new THREE.Vector3().fromArray(srcTrack.values, i * 3)
      .multiplyScalar(opts.unitScale).sub(srcBind)
      .multiplyScalar(ratio).applyQuaternion(qYaw).add(trgHipsBind));
  }

  const a = world[0], b = world[n - 1];
  const rootMotion = b.clone().sub(a);

  // ルートの移動カーブ（キャラクターローカル、先頭フレーム基準）を保存する。
  // in-place 化で消してしまう「いつどれだけ進むか」の情報で、
  // 前転などクリップ自身が移動するモーションをゲーム側で再現するのに使う。
  const curve = {
    times: Float32Array.from(srcTrack.times),
    x: new Float32Array(n),
    y: new Float32Array(n),
    z: new Float32Array(n),
    duration: srcTrack.times[n - 1] - srcTrack.times[0],
  };
  for (let i = 0; i < n; i++) {
    curve.x[i] = world[i].x - a.x;
    curve.y[i] = world[i].y - a.y;    // 縦も残す（マントルの引き上げカーブに使う）
    curve.z[i] = world[i].z - a.z;
  }

  // 水平移動が 95% 進み終わる時刻。ゲーム側が「この状態をいつまで保持するか」に使う。
  // クリップ全体には移動しない余韻が付いていることが多く、全長で待つと待ちすぎる。
  const totalH = Math.hypot(curve.x[n - 1], curve.z[n - 1]);
  curve.settleTime = curve.times[n - 1];
  if (totalH > 1e-3) {
    for (let i = 0; i < n; i++) {
      if (Math.hypot(curve.x[i], curve.z[i]) >= totalH * 0.95) { curve.settleTime = curve.times[i]; break; }
    }
  }

  const invParent = new THREE.Matrix4().copy(hipsParent.matrixWorld).invert();
  const values = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    _v.copy(world[i]).sub(a);
    // inPlace: true = 3 軸すべて / 'xz' = 水平のみ（縦のアニメーションを保つ）。
    // 着地モーションの縦成分は「沈み込み」という本物のアニメーションなので、
    // 一次トレンドとして引くと体が地面へ潜っていく。
    if (opts.inPlace) {
      _v.x -= rootMotion.x * t;
      _v.z -= rootMotion.z * t;
      if (opts.inPlace !== 'xz') _v.y -= rootMotion.y * t;
    }
    _v.add(trgHipsBind).applyMatrix4(invParent);
    _v.toArray(values, i * 3);
  }
  trgTrack.values = values;
  trgTrack.times = Float32Array.from(srcTrack.times);
  return { rootMotion, rootCurve: curve };
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

/* ============ 着地クリップの接地合わせ ============ */

// Mixamo の着地モーションは "Mid-Air Falling To A Hard Landing" のように
// 先頭に落下部分が入っている（実測: land_roll / land_soft はどちらも t=0 で足が 0.63m 宙）。
// ゲームは接地した瞬間に再生を始めるので、そのまま使うと
// 「着地したのにもう一度落ちて地面に沈む」= 跳ね返ったように見える。
// 足のローカル Y が下がり止まる最初のフレームを実測し、そこまでを捨てる。
const FOOT_BONES = ['DEF-footL', 'DEF-footR', 'DEF-toeL', 'DEF-toeR'];
const HIPS_BONE = 'DEF-hips';

// 急斜面用クリップの姿勢を地面へ載せるための接地点。
// 手首だけだと指先が浮いて見えるので、使える場合は指先も含める。
const CONTACT_HAND_BONES = [
  'DEF-handL', 'DEF-handR',
  'DEF-f_index.03.L', 'DEF-f_index.03.R',
  'DEF-f_middle.03.L', 'DEF-f_middle.03.R',
  'DEF-f_ring.03.L', 'DEF-f_ring.03.R',
  'DEF-f_pinky.03.L', 'DEF-f_pinky.03.R',
];
const CONTACT_FOOT_BONES = ['DEF-footL', 'DEF-footR', 'DEF-toeL', 'DEF-toeR'];

// クリップを 60Hz で走査し、指定ボーンのうち最も低い Y を毎フレーム記録する。
// モデルローカルで測るので、モデルがどこに置かれていても足元 y=0 が地面になる。
function sampleLowestY(clip, ctx, boneNames) {
  const bones = boneNames.map((n) => ctx.skeleton.bones.find((b) => b.name === n)).filter(Boolean);
  if (!bones.length) return null;

  const mixer = new THREE.AnimationMixer(ctx.model);
  const action = mixer.clipAction(clip);
  action.play();
  action.paused = true;

  const times = [];
  const ys = [];
  for (let t = 0; t < clip.duration; t += 1 / 60) {
    action.time = t;
    mixer.update(0);
    ctx.model.updateMatrixWorld(true);
    let y = Infinity;
    for (const b of bones) y = Math.min(y, ctx.model.worldToLocal(b.getWorldPosition(_v)).y);
    times.push(t);
    ys.push(y);
  }

  mixer.stopAllAction();
  mixer.uncacheClip(clip);
  ctx.restorePose();
  return { times, ys };
}

// 手と足を結ぶ「接地点の線」が、クリップ内で何度傾いているかを測る。
//
// Climbing Up A Slope は、モデル自身がすでに前傾した四つん這い姿勢を持つ。
// 体の上軸を斜面法線へそのまま合わせると、手だけが斜面から浮くので、
// 実際の手足の並びを 1 本の傾斜として測り、ゲーム側では
//   体のピッチ = 地面のピッチ - クリップの接地点ピッチ
// として合成する。これなら斜面角が変わっても手足の列が地面へ沿う。
// 返り値はモデルローカル +Z 方向の角度[rad]。
function measureContactPitch(clip, ctx) {
  const hands = CONTACT_HAND_BONES
    .map((n) => ctx.skeleton.bones.find((b) => b.name === n)).filter(Boolean);
  const feet = CONTACT_FOOT_BONES
    .map((n) => ctx.skeleton.bones.find((b) => b.name === n)).filter(Boolean);
  if (!hands.length || !feet.length || !clip.duration) return null;

  const mixer = new THREE.AnimationMixer(ctx.model);
  const action = mixer.clipAction(clip);
  action.play();
  action.paused = true;
  const front = new THREE.Vector3();
  const rear = new THREE.Vector3();
  const p = new THREE.Vector3();
  const samples = [];
  const count = Math.max(12, Math.min(48, Math.ceil(clip.duration * 12)));
  for (let i = 0; i < count; i++) {
    action.time = clip.duration * (i + 0.5) / count;
    mixer.update(0);
    ctx.model.updateMatrixWorld(true);
    front.set(0, 0, 0);
    for (const bone of hands) {
      bone.getWorldPosition(p);
      ctx.model.worldToLocal(p);
      front.add(p);
    }
    rear.set(0, 0, 0);
    for (const bone of feet) {
      bone.getWorldPosition(p);
      ctx.model.worldToLocal(p);
      rear.add(p);
    }
    front.multiplyScalar(1 / hands.length);
    rear.multiplyScalar(1 / feet.length);
    const dz = front.z - rear.z;
    if (Math.abs(dz) < 0.08) continue;
    const angle = Math.atan2(front.y - rear.y, dz);
    if (Number.isFinite(angle)) samples.push(angle);
  }
  mixer.stopAllAction();
  mixer.uncacheClip(clip);
  ctx.restorePose();
  if (!samples.length) return null;

  // 手足の入れ替えで一時的に外れたフレームの影響を減らすため中央値を使う。
  samples.sort((a, b) => a - b);
  const mid = samples[Math.floor(samples.length / 2)];
  return THREE.MathUtils.clamp(mid, -1.2, 1.2);
}

function findGroundContact(clip, ctx) {
  const s = sampleLowestY(clip, ctx, FOOT_BONES);
  if (!s) return null;
  // 「降下が止まる最初のフレーム」を単調性で探すと、先頭で片脚を引き上げるクリップ
  // （land_soft はこれ）で即座に打ち切られる。足はクリップ内の地面より下には行かないので、
  //   地面 = 足 Y の全体最小値
  //   接地 = その最小値に初めて達した時刻
  // として求める。単調性を仮定しないので前転など接地後に足が上がる動きでも壊れない。
  const ground = Math.min(...s.ys);
  for (let i = 0; i < s.ys.length; i++) {
    if (s.ys[i] <= ground + 0.02) return { time: s.times[i], footY: s.ys[i] };
  }
  return { time: 0, footY: ground };
}

// クリップ自身が体を何度回すか（最初の直立フレーム → 最後の直立フレーム）。
//
// Mixamo の "Jump From Wall" は壁を蹴りながら体を -222 度回して壁の外を向く。
// この回転はクリップの中だけの話なので、クリップが終わって次のクリップへ移ると
// 体の向きが元へ戻る = 「一瞬反転して戻る」ように見える。
// ゲーム側で回った量を facing へ引き継ぐために測っておく。
function measureNetYaw(clip, ctx) {
  const rotTrack = clip.tracks.find((t) => t.name === ctx.hipsName + '.quaternion');
  if (!rotTrack || !ctx.hipsFwdLocal) return 0;

  const qp = ctx.hipsParentQuat;
  const q = new THREE.Quaternion();
  const fwd = new THREE.Vector3();
  const up = new THREE.Vector3();

  let first = null, prev = 0, total = 0;
  const n = rotTrack.times.length;
  const stride = Math.max(1, Math.floor(n / 48));
  for (let i = 0; i < n; i += stride) {
    q.fromArray(rotTrack.values, i * 4).premultiply(qp);
    up.copy(ctx.hipsUpLocal).applyQuaternion(q);
    if (up.y < 0.85) continue;                 // 傾いた姿勢は水平投影が不安定なので使わない
    fwd.copy(ctx.hipsFwdLocal).applyQuaternion(q);
    if (Math.hypot(fwd.x, fwd.z) < 1e-4) continue;
    const yaw = Math.atan2(fwd.x, fwd.z);
    if (first === null) { first = yaw; prev = yaw; continue; }
    // 180 度をまたぐので、1 サンプルずつ最短角で足し込む
    let d = yaw - prev;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    total += d;
    prev = yaw;
  }
  return first === null ? 0 : total;
}

// 全身の動きが実質止まる時刻。着地モーションを「再生しきる」ための保持時間に使う。
//
// クリップ長そのままで待つと、末尾に付いている「息を整える」ような
// ほとんど動かない余韻ぶんまで操作不能になる。逆に短く切ると
// 立ち上がりが途中でクロスフェードに飲まれて「早すぎる」絵になる。
// 主要な関節の 1 フレームあたり移動量がしきい値を超えた最後の時刻を返す。
const MOTION_BONES = ['DEF-hips', 'DEF-head', 'DEF-handL', 'DEF-handR', 'DEF-footL', 'DEF-footR'];

function measureMotionEnd(clip, ctx) {
  const bones = MOTION_BONES.map((n) => ctx.skeleton.bones.find((b) => b.name === n)).filter(Boolean);
  if (!bones.length) return clip.duration;

  const mixer = new THREE.AnimationMixer(ctx.model);
  const action = mixer.clipAction(clip);
  action.play();
  action.paused = true;

  const step = 1 / 60;
  const times = [];
  const speeds = [];
  let prev = null;
  for (let t = 0; t < clip.duration; t += step) {
    action.time = t;
    mixer.update(0);
    ctx.model.updateMatrixWorld(true);
    const cur = bones.map((b) => ctx.model.worldToLocal(b.getWorldPosition(new THREE.Vector3())));
    if (prev) {
      let d = 0;
      for (let i = 0; i < cur.length; i++) d += cur[i].distanceTo(prev[i]);
      times.push(t);
      speeds.push(d / bones.length);
    }
    prev = cur;
  }

  mixer.stopAllAction();
  mixer.uncacheClip(clip);
  ctx.restorePose();

  // 1 関節あたり 1 フレーム 1.5mm 未満なら「止まっている」
  const STILL = 0.0015;
  let end = clip.duration;
  for (let i = speeds.length - 1; i >= 0; i--) {
    if (speeds[i] > STILL) { end = times[i]; break; }
  }
  return end;
}

// 「体勢が戻り終わる時刻」。腰の高さが一度沈んでから最終値付近へ復帰した瞬間を返す。
// 着地クリップの保持時間に使う。水平移動量から求める settleTime では
// ほぼその場で沈むだけの land_soft を測れず、しゃがみ途中で idle に切れてしまう。
function measureRecovery(clip, ctx) {
  const s = sampleLowestY(clip, ctx, [HIPS_BONE]);
  if (!s || s.ys.length < 3) return 0;
  const last = s.ys[s.ys.length - 1];
  const dip = Math.min(...s.ys);
  if (last - dip < 0.05) return 0;                 // 沈み込みが無いクリップ
  const dipAt = s.ys.indexOf(dip);
  for (let i = dipAt; i < s.ys.length; i++) {
    if (s.ys[i] >= last - 0.04) return s.times[i];
  }
  return s.times[s.times.length - 1];
}

// 先頭 t 秒を捨てる。t 時点の補間値を新しい先頭キーとして挿し込むので、
// キーの粗いトラックでも切り口がずれない。
function trimClipHead(clip, t) {
  if (!(t > 1e-6)) return;
  for (const track of clip.tracks) {
    const stride = track.getValueSize();
    const times = track.times;
    const head = Float32Array.from(track.createInterpolant().evaluate(t).slice(0, stride));
    let cut = 0;
    while (cut < times.length && times[cut] <= t + 1e-6) cut++;
    const values = new Float32Array(stride + (times.length - cut) * stride);
    values.set(head, 0);
    values.set(track.values.slice(cut * stride), stride);
    const newTimes = new Float32Array(1 + times.length - cut);
    for (let i = cut; i < times.length; i++) newTimes[i - cut + 1] = times[i] - t;
    track.times = newTimes;
    track.values = values;
  }
  clip.resetDuration();
}

// rootCurve（クリップ自身の水平移動量）も同じ位置で切り、先頭を 0 に振り直す。
function trimRootCurve(curve, t0) {
  if (!curve || !(t0 > 1e-6)) return curve;
  const T = curve.times;
  const at = (arr) => {
    let i = 0;
    while (i < T.length - 2 && T[i + 1] < t0) i++;
    const span = T[i + 1] - T[i];
    return arr[i] + (arr[i + 1] - arr[i]) * (span > 0 ? (t0 - T[i]) / span : 0);
  };
  const x0 = at(curve.x);
  const y0 = curve.y ? at(curve.y) : 0;
  const z0 = at(curve.z);
  const keep = [];
  for (let i = 0; i < T.length; i++) if (T[i] > t0 + 1e-6) keep.push(i);
  const n = keep.length + 1;
  const out = { times: new Float32Array(n), x: new Float32Array(n),
                y: new Float32Array(n), z: new Float32Array(n) };
  keep.forEach((src, j) => {
    out.times[j + 1] = T[src] - t0;
    out.x[j + 1] = curve.x[src] - x0;
    out.y[j + 1] = curve.y ? curve.y[src] - y0 : 0;
    out.z[j + 1] = curve.z[src] - z0;
  });
  out.duration = out.times[n - 1];
  const totalH = Math.hypot(out.x[n - 1], out.z[n - 1]);
  out.settleTime = out.times[n - 1];
  if (totalH > 1e-3) {
    for (let i = 0; i < n; i++) {
      if (Math.hypot(out.x[i], out.z[i]) >= totalH * 0.95) { out.settleTime = out.times[i]; break; }
    }
  }
  return out;
}

// 腰の位置トラックをワールド Y 方向へ dy だけずらす（トラックは親ボーン空間なので変換する）
function shiftHipsY(clip, hipsName, dy, hipsParent) {
  const track = clip.tracks.find((t) => t.name === hipsName + '.position');
  if (!track || Math.abs(dy) < 1e-5) return;
  const d = new THREE.Vector3(0, dy, 0)
    .applyQuaternion(hipsParent.getWorldQuaternion(new THREE.Quaternion()).invert());
  for (let i = 0; i < track.values.length; i += 3) {
    track.values[i] += d.x;
    track.values[i + 1] += d.y;
    track.values[i + 2] += d.z;
  }
}

/**
 * Mixamo FBX 1 本を自キャラ用 AnimationClip にする。
 *
 * @param {string} url        .fbx の URL
 * @param {object} ctx        { skeleton, model, hipsName, hipsParent, hipsBind, restorePose }
 * @param {object} opts
 *   name        クリップ名
 *   yawOffset   向き補正[rad]。null なら detectClipYaw で実測する
 *   inPlace     true = 移動を 3 軸とも抜いて in-place 化 / 'xz' = 水平のみ抜き縦は残す / false = 抜かない
 *   groundAlign 先頭の落下部分（足が宙に浮いているフレーム）を捨てて接地から始める
 *   trimHead    先頭を指定秒だけ捨てる（クリップ前置きの動作をゲーム側が担当する場合）
 *   groundOffset  足が浮くぶん腰を下げる（しゃがみ系クリップ用。上の解説を読むこと）
 *   contactPitch  "auto" なら手足の接地点からクリップ固有の前傾角を実測する
 *   unitScale   ソースの単位→m（Mixamo は cm なので 0.01）
 *   animRate    基準再生倍率
 */
export async function loadMixamoClip(url, ctx, opts = {}) {
  // yawOffset は null = クリップごとに実測して自動補正（detectClipYaw）。
  // animRate はそのクリップの基準再生倍率（1.0 = Mixamo が作った素の速度）
  const o = { yawOffset: null, inPlace: true, unitScale: 0.01, animRate: 1.0,
              groundAlign: false, groundOffset: false, contactPitch: false,
              trimHead: 0, ...opts };
  const fbx = await new FBXLoader().loadAsync(url);

  const srcClip = fbx.animations[0];
  if (!srcClip) throw new Error('FBX に AnimationClip がありません: ' + url);

  normalizeNames(fbx, srcClip);
  const srcSkeleton = buildSourceSkeleton(fbx, url);
  const srcRoot = srcSkeleton.bones[0];
  srcRoot.updateMatrixWorld(true);

  const { map, missing } = resolveMap(MIXAMO_TO_QUATERNIUS, srcSkeleton, ctx.skeleton);
  if (missing.src.length || missing.trg.length) {
    console.warn('[mixamo] 未対応ボーン', url, missing);
  }

  // bind pose の前方の差は、スケルトンの親に回転を持たせて
  // srcEmbedWorldTransforms でリターゲットへ含める。
  // ここを間違えると「胴体だけ反転して腕は正しい」という気付きにくい壊れ方をする
  // （腕のボーンは ±X 方向なので 180 度 Y 回転しても方向が変わらず、差が現れない）。
  const alignRoot = new THREE.Group();
  alignRoot.rotation.y = BIND_ALIGN_YAW;
  alignRoot.add(srcRoot);
  alignRoot.updateMatrixWorld(true);

  const retarget = new AnimationRetargeting(srcSkeleton, ctx.skeleton, {
    srcPoseMode: AnimationRetargeting.BindPoseModes.DEFAULT,   // FBX のバインドポーズ = T ポーズ相当
    trgPoseMode: AnimationRetargeting.BindPoseModes.CURRENT,   // 呼び出し側で T ポーズにしてある
    srcEmbedWorldTransforms: true,                             // 上の 180 度をここで吸収する
    boneNameMap: map,
  });

  const clip = retarget.retargetAnimation(srcClip);
  clip.name = o.name || url.split('/').pop().replace(/\.fbx$/i, '');

  // 向きの補正。bind pose の差は srcEmbedWorldTransforms で吸収済みなので、
  // ここでは「そのクリップがどちらを向いて作られているか」を実測して合わせる。
  // manifest で数値指定されていればそれを使う。
  const detected = (opts.yawOffset !== undefined && opts.yawOffset !== null)
    ? opts.yawOffset
    : detectClipYaw(clip, ctx);

  // 回転トラックと位置トラックには *同じ* 補正量を掛ける。
  //
  // 以前ここで位置トラックにだけ bind ぶんの 180 度を足していた。
  // 「位置は自分で組み立てているからソース空間のまま」という理屈だったが、
  // srcEmbedWorldTransforms は *スケルトンのワールド変換ごと* リターゲットへ
  // 含めるので、腰のローカル位置も含めて既に整列済みになっている。
  // 二重に掛けた結果「体は前を向いているのに移動だけ真後ろ」になっていた。
  //
  // 判定はモデルの前方軸を実測して行った（idle ポーズのつま先ベクトルは
  // モデルローカル +Z）。この修正で 3 本の root motion が同時に物理的に正しくなる:
  //   land_roll  -1.12 → +1.12  前転は前へ進む
  //   mantle     -0.81 → +0.81  乗り越えは壁の向こう側（体の前方）へ進む
  //   wall_jump  +1.51 → -1.51  壁蹴りは壁から離れる（体の後方）へ進む
  // 回転トラックと位置トラックには同じ補正量を掛ける。
  //   回転: alignRoot(BIND_ALIGN_YAW) が srcEmbedWorldTransforms で焼き込まれているので
  //         ここで足すのはクリップ個別の補正だけ
  //   位置: 自前で組み立てており alignRoot を通らないので bind ぶんも自分で掛ける
  // 合計が一致していないと「体は前を向いているのに移動は後ろ」になる。
  applyYawToHipsRotation(clip, ctx.hipsName, detected, ctx.hipsParent);
  o.yawOffset = BIND_ALIGN_YAW + detected;
  const { rootMotion, rootCurve } = rebuildHipsPositionTrack(
    clip, srcClip, srcSkeleton.bones.find((b) => /hips$/i.test(b.name))?.name || srcRoot.name,
    ctx.hipsName, ctx.hipsParent, ctx.hipsBind, o);

  // 着地系クリップは先頭の落下部分を捨てて、接地の瞬間から始まるようにする
  let curve = rootCurve;
  let contact = null;
  let recoverTime = 0;
  let motionEnd = 0;

  // 先頭の不要な区間を捨てる（manifest の trimHead[秒]）。
  // Mixamo のクリップは前後に「そこへ至る動作」が付いていることが多く、
  // ゲーム側が別の手段でその動作を担当している場合は邪魔になる。
  // 例: wall_grab は "Jump To A Braced Hang From Standing Idle" で
  //     先頭 0.53 秒がしゃがみ＋跳躍。取り付き位置はゲームが決めるので跳躍は使わない。
  if (o.trimHead > 0) {
    trimClipHead(clip, o.trimHead);
    curve = trimRootCurve(curve, o.trimHead);
    if (curve) {
      rootMotion.x = curve.x[curve.x.length - 1];
      rootMotion.z = curve.z[curve.z.length - 1];
    }
  }

  // しゃがみ系クリップは腰が立ち姿勢の高さへ正規化されて足が浮く。
  // クリップ内で最も低い足が地面 0 に来るよう腰を下げる（トリムはしない）。
  let groundLift = 0;
  if (o.groundOffset) {
    const s2 = sampleLowestY(clip, ctx, FOOT_BONES);
    if (s2) {
      groundLift = Math.min(...s2.ys);
      shiftHipsY(clip, ctx.hipsName, -groundLift, ctx.hipsParent);
    }
  }

  if (o.groundAlign) {
    contact = findGroundContact(clip, ctx);
    if (contact) {
      trimClipHead(clip, contact.time);
      curve = trimRootCurve(curve, contact.time);
      shiftHipsY(clip, ctx.hipsName, -contact.footY, ctx.hipsParent);
      // 捨てた落下ぶんは移動量からも外す（ゲーム側の root motion 再生と二重に足さない）
      if (curve) {
        rootMotion.x = curve.x[curve.x.length - 1];
        rootMotion.z = curve.z[curve.z.length - 1];
      }
      recoverTime = measureRecovery(clip, ctx);
      motionEnd = measureMotionEnd(clip, ctx);
    }
  }

  // Climbing Up A Slope のように、クリップ自身がすでに前傾している動きは
  // 地面法線へそのまま立てると手が浮く。手足の列の傾きを一度だけ測って
  // Character.updateNormalOrientation() で地形のピッチと合成する。
  let measuredContactPitch = null;
  if (o.contactPitch === 'auto' || o.contactPitch === true) {
    measuredContactPitch = measureContactPitch(clip, ctx);
  } else if (Number.isFinite(o.contactPitch)) {
    measuredContactPitch = o.contactPitch;
  }

  clip.userData = {
    rootMotion,
    rootCurve: curve,
    recoverTime,
    // 動きが実質止まる時刻。着地を「再生しきる」保持時間に使う（character.js）
    motionEnd: +motionEnd.toFixed(3),
    // クリップ自身が体を回す量[rad]。終了時に facing へ引き継ぐ（character.js）
    netYaw: measureNetYaw(clip, ctx),
    groundLift: +groundLift.toFixed(3),      // groundOffset で下げた量（診断用）
    contactPitch: measuredContactPitch === null ? null : +measuredContactPitch.toFixed(4),
    // Mixamo のクリップはゲーム用の速度で作られているので既定は素の速度（1.0）。
    // 元が遅いクリップは manifest 側で上げる（移動速度も同じ倍率で上がるので滑らない）
    animRate: o.animRate,
    meta: { src: url, unitScale: o.unitScale,
            groundContact: contact && { time: +contact.time.toFixed(3), footY: +contact.footY.toFixed(3) },
            contactPitch: measuredContactPitch === null ? null : +measuredContactPitch.toFixed(4),
            clipYaw: detected, clipYawDeg: +(detected * 180 / Math.PI).toFixed(1),
            posYaw: o.yawOffset, posYawDeg: +(o.yawOffset * 180 / Math.PI).toFixed(1) },
    source: 'Mixamo',
  };
  return { clip, sourceSkeleton: srcSkeleton, sourceClip: srcClip, boneMap: map, missing };
}
