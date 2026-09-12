// キャラクター制御。
//
//  Normal   … Idle / Walk / Jog / Sprint / Jump(Start,Loop,Land)
//  Climbing … Grab / ClimbIdle / ClimbUp / ClimbDown / ClimbLeft / ClimbRight / Hang / Mantle / Drop
//
// Climbing 中は XZ 平面移動を止め、壁面ローカル 2D 座標 (u=横, v=縦) でキャラを動かす。
// 手足は「ホールドを掴み替えるスケジューラ + Two Bone IK」で壁に合わせる。
import * as THREE from 'three';
import { WORLD_UP, ClimbSurface } from './scene.js';
import { solveTwoBoneIK, alignEndToSurface } from './ik.js';
import { RIG } from './retargetMap.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qPitch = new THREE.Quaternion();
const AXIS_X = new THREE.Vector3(1, 0, 0);
const FLIP_Y = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

// 向き監視の対象。クリップが「地面基準の前後」を持っている状態だけを見る。
// 空中（jumpLoop / fallLoop / wallJump）は進行方向へ旋回している最中なので対象外。
const LANDING_STATES = ['jumpLand', 'landHard', 'landRoll'];
// 向き監視の対象。cover 系は「壁を背にして横へ動く」= 体の向きと進行方向が
// 90 度ずれているのが正しいので、意図的に外している。
const GROUNDED_STATES = ['walk', 'sprint', 'sneak'];

/* ---------------- パラメータ ---------------- */
export const P = {
  hipHeight: 0.917,        // モデル原点（足元）から腰までの高さ
  standOff: 0.28,          // 壁面から腰までの距離（Mixamo braced hang 実測で最適化）
  // 壁の接線まわりに体を倒す角度（+ で上体が壁から離れ、足が壁へ寄る）。
  // CMU の梯子登りは「手は体の前、足は体の真下」なので、これで手足の両方を面に近づける。
  // 接線まわりの後傾。手と足の壁からの距離差を吸収する量で、モーションに依存する。
  // Mixamo braced hang: 0.08 / CMU 梯子登り: 0.30 が実測の最適値
  climbPitch: 0.08,
  // ぶら下がり（足が壁から外れている）中は後傾しない。腕でぶら下がる姿勢なので真下へ垂れる
  hangPitch: 0.0,
  pitchDamp: 8,
  lateralLean: 0,          // 横移動時の腰ロール（0 = 使わない。素のモーションのみ）
  walkSpeed: 1.4,          // WASD の既定（旧 C 押下時の速度をこちらへ移した）
  jogSpeed: 3.4,           // 現在は未使用（Jog_Fwd_Loop も未配線）
  sprintSpeed: 5.8,        // Shift
  // --- スニーク（C 押下中）---
  // 壁がこの距離内にあれば「壁を背にしたスニーク」に入る
  coverProbeDist: 1.0,     // グラブ判定(grabProbeDist 0.95)より少し長くして cover を優先させる
  coverProbeHeight: 1.0,   // 横向きレイを出す高さ
  // 崖判定。この距離先の地面を見て、これ以上落差があれば踏み出さない
  cliffProbeAhead: 0.55,
  cliffDrop: 0.6,
  turnRate: 12,
  // 空中で進行方向へ向き直る速さ。地上より遅くして「空中で身を翻す」動きに見せる
  airTurnRate: 5,
  // 向きを進行方向へ合わせるかを判断する最低水平速度（真下への落下では回さない）
  facingMinSpeed: 0.35,
  // 壁を蹴るモーションを見せている間は壁向きの yaw を保つ（この後で進行方向へ回り始める）
  wallJumpTurnDelay: 0.45,
  // 向きズレを違反として数えるまでの猶予。旋回中の一瞬のズレは正常なので見逃す
  facingAuditGrace: 0.20,
  gravity: -18,
  jumpSpeed: 6.2,
  wallJumpOut: 4.2,
  wallJumpUp: 4.6,
  climbAnimRate: 2.0,      // CMU の梯子登りは実測 0.23m/s と遅いので再生速度を上げる
  // 壁面移動の全体倍率。再生速度と移動速度の両方に同じ値が掛かるので、
  // いくら上げても足は滑らない（クリップ 1 周の移動距離と歩数の関係が保たれる）
  climbSpeedScale: 2.0,
  climbLateralSpeed: 0.55, // 専用の横移動クリップが無いときのフォールバック
  grabProbeDist: 0.95,
  // 掴んだ地点から *指先* までの高さ[m]。掴む高さの上限判定に使う。
  // 手ボーン(DEF-handL/R)は手首なので、そこを基準にすると指先が 0.11m
  // （手のひら 1 個分）壁の上端を超える。実測した指先までの距離を使う:
  //   anchor y=4.969 のとき 指の最高点 DEF-f_middle02R y=6.107 → 1.138
  grabHandReach: 1.14,
  // マントル中に手を縁へ固定する（Two Bone IK）。
  // 既定は OFF。動きがバタつくという評価だったため、素のクリップ再生を優先する。
  // クリップ差し替え（Pulling Up To A Ledge）で手の追従は 0.61m → 0.16m まで
  // 改善しているので、IK 無しでも成立する。true にすれば復活する。
  mantleHandIK: false,
  // 腰が固定点のこの距離まで上がってきたら重みを 0 まで落として手を離す
  mantleHandRelease: 0.30,
  // 縁を掴んだときの手首の位置は縁のこれだけ下（指が縁へ回り込むぶん）。
  // 実測: 指先 5.96 / 手首 5.82 → 0.14
  mantleHandPinDrop: 0.14,
  mantleCooldown: 0.55,
  releaseCooldown: 1.2,    // F で自分から手を離したときは、落ち切るまで再グラブしない
  // クリップ自身の移動でルートを動かす状態。
  // 前転（1.50m 前進）や重い着地（0.36m）は in-place にすると
  // 「その場で転がる」不自然な絵になるので、移動カーブでキャラを動かす。
  rootMotionClips: { landRoll: 'land_roll', landHard: 'land_soft' },
  // 落下距離による着地の出し分け（m）
  landRollHeight: 3.5,     // これ以上落ちたら前転で受け身（保持 1.85s）
  // これ以上なら重い着地。着地モーションを再生しきる仕様にしたため
  // land_soft(1.97s) + 硬直 = 2.12 秒の操作不能になる。
  // 1.2m だと段差を降りるだけで 2 秒固まるので、本当に高い落下だけに限定する。
  // これ未満は軽い着地(Jump_Land, 0.30s)。普通のジャンプの頂点は約 1.07m。
  landHardHeight: 2.5,
  landCancelTime: 0.40,    // 軽い着地(jumpLand)を入力でキャンセルできるようになるまで
  landCancelFade: 0.35,    // 着地を中断して移動へ移るときのクロスフェード（姿勢差を均す）
  // 大きい着地（前転・重い着地）はモーションを再生しきってから、
  // この時間だけ硬直（操作不能）を入れる。動きの重さを出すための間。
  landRecovery: 0.15,
  // 前転着地のあとに「一息つく」モーション(Wiping Sweat)を挟む。
  // ただの硬直より意味のある間になる。硬直は landRecovery ぶんだけで、
  // その後は入力で抜けられる（止まっていれば最後まで再生される）
  catchBreathAfterRoll: true,
  // 前転 → 汗拭いのクロスフェード。前転の静止した末尾に重ねて棒立ちを消すので長めにする
  catchBreathFade: 0.30,
  // 空中モーションの切り替え。普通のジャンプは Jump_Loop（跳躍の弧）、
  // 本当に落ちているときだけ fall_idle（自由落下のバタつき）にする
  // 判定は基本的に落差で行う（普通のジャンプの頂点は約 1.07m なので 1.5m なら発火しない）。
  // 時間側は「ほとんど落ちていないのに長く浮いている」異常ケース用の保険なので長めにする。
  fallLoopDrop: 1.5,       // 最高到達点からこれだけ下がったら自由落下扱い
  fallLoopTime: 1.0,       // または滞空がこれを超えたら
  transitionFade: 0.12,
  ikEnabledDefault: false, // 既定は素のモーションのみ（K キーで IK を試せる）
  ikWeight: 1.0,
  reachThreshold: { hand: 0.32, foot: 0.28 },
  reachDuration: 0.30,
  holdSearchRadius: { hand: 0.34, foot: 0.26 },
  limbOffsets: {           // 腰アンカーからの手足の理想位置（壁面 uv, m）
    leftHand:  { u: -0.21, v: 0.58 },
    rightHand: { u: 0.21, v: 0.58 },
    leftFoot:  { u: -0.14, v: -0.56 },
    rightFoot: { u: 0.14, v: -0.56 },
  },
  // 進行方向へ手を先行させる量（アンティシペーション）
  leadBias: { hand: { u: 0.16, v: 0.16 }, foot: { u: 0.10, v: 0.08 } },
  lateralBlend: 0.35,      // 横移動時に climb_up を薄く混ぜる量（専用モーションが無いため）
};

/* ---------------- Animator ---------------- */

class Animator {
  constructor(model, clips) {
    this.mixer = new THREE.AnimationMixer(model);
    this.clips = clips;
    this.actions = new Map();
    this.current = null;
    this.currentName = '';
  }

  action(name) {
    if (this.actions.has(name)) return this.actions.get(name);
    const clip = this.clips[name];
    if (!clip) { console.warn('clip がない:', name); return null; }
    const a = this.mixer.clipAction(clip);
    this.actions.set(name, a);
    return a;
  }

  /** クロスフェードで切り替える。once=true なら 1 回再生して最終姿勢を保持 */
  play(name, { fade = 0.22, once = false, timeScale = 1 } = {}) {
    if (this.currentName === name) {
      if (this.current) this.current.timeScale = timeScale;
      return this.current;
    }
    const next = this.action(name);
    if (!next) return this.current;
    next.reset();
    next.timeScale = timeScale;
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.enabled = true;
    next.play();
    if (this.current && this.current !== next) this.current.crossFadeTo(next, fade, false);
    else next.fadeIn(fade);
    this.current = next;
    this.currentName = name;
    return next;
  }

  /** 副レイヤ: name を weight で薄く重ねる（AnimationMixer が重み付きブレンドしてくれる）*/
  blendIn(name, weight, timeScale = 1) {
    if (this.secondName && this.secondName !== name) {
      const old = this.actions.get(this.secondName);
      if (old) old.setEffectiveWeight(0);
    }
    this.secondName = name;
    if (!name) return;
    const a = this.action(name);
    if (!a) return;
    if (!a.isRunning()) { a.reset().play(); }
    a.timeScale = timeScale;
    a.setEffectiveWeight(weight);
  }

  clearBlend() {
    // 主レイヤと同じクリップならクロスフェードに任せる（weight を 0 にするとポップする）
    if (!this.secondName || this.secondName === this.currentName) { this.secondName = null; return; }
    const a = this.actions.get(this.secondName);
    if (a) a.setEffectiveWeight(0);
    this.secondName = null;
  }

  setTimeScale(s) { if (this.current) this.current.timeScale = s; }
  get progress() {
    if (!this.current) return 0;
    const d = this.current.getClip().duration;
    return d > 0 ? (this.current.time % d) / d : 0;
  }
  get finished() {
    if (!this.current) return true;
    return this.current.time >= this.current.getClip().duration - 1e-3;
  }
  update(dt) { this.mixer.update(dt); }
}

/* ---------------- 手足スケジューラ ---------------- */

class Limb {
  constructor(key, offset, bones) {
    this.key = key;
    this.offset = offset;
    this.bones = bones;              // { root, mid, end }
    this.isHand = key.endsWith('Hand');
    this.planted = new THREE.Vector3();
    this.from = new THREE.Vector3();
    this.to = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.normal = new THREE.Vector3(0, 0, 1);
    this.reaching = false;
    this.t = 0;
    this.error = 0;
    this.free = false;     // 接地点が無い（宙ぶらりん）= IK を掛けない
    this.weight = 0;       // この手足の IK 重み（滑らかに出入りさせる）
  }
  snap(p, n) {
    this.planted.copy(p); this.pos.copy(p); this.normal.copy(n);
    this.reaching = false; this.t = 0;
  }
}

/* ---------------- Character ---------------- */

export class Character {
  constructor({ model, skeleton, clips, probe, scene }) {
    this.model = model;
    this.skeleton = skeleton;
    this.probe = probe;

    // キャラのルート（位置・向きを持つ）。model はこの下に入れる
    this.obj = new THREE.Group();
    this.obj.add(model);
    scene.add(this.obj);

    this.anim = new Animator(model, clips);
    this.clips = clips;

    this.mode = 'normal';            // 'normal' | 'climb'
    this.state = 'idle';
    this.velocity = new THREE.Vector3();
    this.grounded = true;
    this.facing = 0;                 // yaw(rad) — 向きの唯一の持ち主（faceTowards / snapFacing 経由で書く）
    this.landingVel = new THREE.Vector3();  // 接地した瞬間の水平速度（着地の向き合わせに使う）
    this.prevPos = new THREE.Vector3();     // 前フレームの位置（向き監視の実変位用）
    this.prevState = 'idle';                // 直前の状態（着地中断のクロスフェード判定に使う）
    // 「前後逆」不具合の自動検出。updateFacingAudit が毎フレーム更新する
    this.facingAudit = { angle: 0, worst: 0, violations: 0, badTime: 0, lastState: '', lastClip: '' };
    this.stateTime = 0;
    this.mantleCd = 0;
    this.fallPeakY = 0;      // 空中にいる間の最高到達点（着地モーションの選択に使う）
    this.lastFallDrop = 0;   // 直前の着地で落ちた高さ
    this.airTime = 0;        // 連続して空中にいる時間

    // Climbing 用
    this.surface = new ClimbSurface();
    this.anchor = new THREE.Vector2();   // 壁面ローカル uv（腰の位置）
    this.atBottom = false;
    this.lateralInput = 0;
    this.verticalInput = 0;
    this.blocked = { u: 0, v: 0 };
    this.mantleData = null;

    // IK（既定は OFF。素のモーション再生と比較するために残してある）
    this.ikEnabled = P.ikEnabledDefault;
    const bone = (n) => skeleton.bones.find((b) => b.name === n.replace(/[.:/[\]]/g, ''));
    this.hipsBone = bone(RIG.hips);
    this.limbs = Object.entries(P.limbOffsets).map(([key, off]) => new Limb(key, off, {
      root: bone(RIG.limbs[key].root),
      mid: bone(RIG.limbs[key].mid),
      end: bone(RIG.limbs[key].end),
    }));
    this.pelvisOffset = new THREE.Vector3();

    this.stats = { ikError: 0, reaches: 0 };
  }

  get position() { return this.obj.position; }

  setState(s) {
    if (this.state === s) return;
    this.prevState = this.state;
    this.state = s;
    this.stateTime = 0;
  }

  /*
   * クリップ自身が体を回すモーションについて。
   *
   * Mixamo の "Jump From Wall" は全長 1.27 秒のうち 0.44 秒以降で
   * 体を -222 度回して壁の外を向く（`clip.userData.netYaw` に実測値が入っている）。
   * 「クリップが回した量を facing へ引き継ぐ」実装を試したが、これは誤りだった:
   * ゲームは `P.wallJumpTurnDelay`(0.45 秒) でこの状態を抜けるので、
   * 実際に再生されるのは回転が始まる前の踏み切り部分だけ（実測 -14 度）。
   * 全長ぶんの -222 度を引き継ぐと、逆にそこで 222 度の飛びを作ってしまう。
   *
   * つまり向きを回すのは facing 側（空中旋回）に任せてよい。
   * もしクリップの回転部分まで再生する設計にするなら、
   * 引き継ぐのは「実際に再生した区間の回転量」でなければならない。
   */

  /* ============ 更新 ============ */

  update(dt, input, cameraYaw) {
    this.stateTime += dt;
    this.mantleCd = Math.max(0, this.mantleCd - dt);
    this.prevPos.copy(this.obj.position);   // 向き監視で「実際に動いた向き」を出すため

    if (this.mode === 'normal') this.updateNormal(dt, input, cameraYaw);
    else this.updateClimb(dt, input);

    this.updateFacingAudit(dt);
    this.anim.update(dt);
    this.obj.updateMatrixWorld(true);

    if (this.mode === 'climb' && this.state === 'mantle') {
      // マントル中だけ手を縁へ押さえる（P.mantleHandIK が true のときのみ）
      if (P.mantleHandIK) this.updateMantleHandIK(dt);
      else this.fadeOutLimbs(dt);
    } else if (this.mode === 'climb' && (this.ikEnabled || (this.ikWeightNow ?? 0) > 0.02)) {
      this.updateLimbIK(dt);
    } else {
      this.fadeOutLimbs(dt);
    }
  }

  /* ============ 向き（yaw）の単一管理 ============ */
  /*
   * すべてのクリップは「キャラのローカル -Z = 前方」で作られている。
   * つまり体の yaw が実際の進行方向とずれていれば、
   * *どのクリップでも* 前後逆に見える。クリップ側の問題ではない。
   *
   * これまで「モーションが前後逆」に見えた不具合は、
   * 追ってみるとすべて yaw が古い値のまま残っていたことが原因だった。
   * 原因は yaw の書き込み口が 2 系統あり、両者を繋ぐルールが無かったこと:
   *
   *   - Normal: 移動入力があるときだけ `facing` を更新する
   *   - Climb : 壁の法線から `facing` を毎フレーム上書きする（壁を向く）
   *
   * どちらも「入力が無い状態」を面倒見ないので、
   * 壁を蹴って手前へ飛び降りる・F で手を離す・崖から落ちる、のように
   * 入力なしで移動する状態へ入ると壁向きの yaw が残り続けた。
   *
   * そこで不変条件をひとつ決め、書き込み口をこの 3 つに限定する。
   *
   *   不変条件: 体の前方は、明示的な上書きが無い限り常に水平移動の向きを向く
   *
   *   faceTowards(x, z, dt, rate)  徐々に向ける（移動入力／空中の進行方向）
   *   snapFacing(x, z)             即座に向ける（壁への取り付き／着地直前の保証）
   *   alignFacingToTravel()        90 度以上ずれていたら進行方向へ合わせる
   *
   * 破れをコードで検出できるようにしたのが updateFacingAudit()。
   */

  faceTowards(x, z, dt, rate = P.turnRate) {
    if (x * x + z * z < 1e-6) return;
    this.facing = dampAngle(this.facing, Math.atan2(x, z), rate, dt);
  }

  snapFacing(x, z) {
    if (x * x + z * z < 1e-6) return;
    this.facing = Math.atan2(x, z);
  }

  /** 体の前方（水平・正規化済み） */
  forward(out) { return out.set(Math.sin(this.facing), 0, Math.cos(this.facing)); }

  /**
   * 進行方向と体の向きが 90 度以上ずれていたら、進行方向へ即座に合わせる。
   * 空中での旋回が間に合わない短い落下でも、
   * 着地モーションが後ろ向きに再生されないことを保証する最後の砦。
   * @returns {boolean} 補正したか
   */
  alignFacingToTravel(vx, vz) {
    if (vx * vx + vz * vz < P.facingMinSpeed * P.facingMinSpeed) return false;
    const fwd = this.forward(_v3);
    if (fwd.x * vx + fwd.z * vz >= 0) return false;
    this.snapFacing(vx, vz);
    return true;
  }

  /** 踏み切り・壁蹴りのモーションを見せている間か（この間はクリップを差し替えない） */
  inTakeoff() {
    return (this.state === 'jumpStart' && this.stateTime < 0.25)
        || (this.state === 'wallJump' && this.stateTime < P.wallJumpTurnDelay);
  }

  /**
   * 空中で進行方向へ回り始めてよいか。
   * 蹴り出しの間は壁向きの yaw を保つが、落下に転じたらそこから回り始める。
   * 待ちきる設計だと、低い位置からの壁ジャンプ（滞空 0.7 秒）で
   * 回りきれずに 50 度ほど斜めのまま着地してしまう。
   */
  canTurnInAir() {
    return !this.inTakeoff() || this.velocity.y < 0;
  }

  /**
   * 上の不変条件が破れていないかを毎フレーム見張る。
   * 「前後逆」を目視ではなく数値で捕まえるための計測器で、
   * HUD と自動シナリオの両方から参照する。
   *
   * 比べるのは「意図した速度」ではなく *実際に動いた変位*。
   * これ 1 本で、原因の異なる 2 種類の「前後逆」を両方捕まえられる:
   *   - yaw の取り残し     … 速度は前、体は後ろ（壁を蹴って手前へ飛び降りたとき）
   *   - root motion の符号 … 体は前、クリップの移動は後ろ（着地の前転）
   * 速度で比べていたぶんには後者が映らず、実際に見逃していた。
   *
   * 数えるのは「地面基準の前後を持つクリップ」が再生されている状態だけ。
   * 空中で進行方向へ向き直っている最中や、地上で急に反転したときの
   * 一瞬のズレは正常なので、0.2 秒以上続いたものだけを違反として数える。
   */
  updateFacingAudit(dt) {
    const a = this.facingAudit;
    a.angle = 0;

    if (this.mode !== 'normal'
        || !(LANDING_STATES.includes(this.state) || GROUNDED_STATES.includes(this.state))) {
      a.badTime = 0;
      return;
    }
    const dx = this.obj.position.x - this.prevPos.x;
    const dz = this.obj.position.z - this.prevPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < P.facingMinSpeed * dt) { a.badTime = 0; return; }

    const fwd = this.forward(_v3);
    const cos = THREE.MathUtils.clamp((fwd.x * dx + fwd.z * dz) / dist, -1, 1);
    a.angle = Math.acos(cos) * 180 / Math.PI;

    if (a.angle <= 90) { a.badTime = 0; return; }
    a.badTime += dt;
    if (a.badTime >= P.facingAuditGrace) {
      a.violations++;
      a.worst = Math.max(a.worst, a.angle);
      a.lastState = this.state;
      a.lastClip = this.anim.currentName;
    }
  }

  /* ============ Normal ============ */

  updateNormal(dt, input, cameraYaw) {
    // カメラ相対の移動入力
    const move = _v.set(input.x, 0, input.z);
    const hasInput = move.lengthSq() > 1e-4;
    if (hasInput) move.normalize().applyAxisAngle(WORLD_UP, cameraYaw);
    const moveDir = hasInput ? move.clone() : new THREE.Vector3();

    // cover 判定は体の向きを決める前に済ませる（向きの入力元になるため）
    this.cover = (input.sneak && this.grounded) ? this.findCover(moveDir) : null;

    // 体の向きを決める。**1 フレームに 1 回だけ**呼ぶこと。
    // 入力向きと cover の法線で 2 回 faceTowards すると綱引きになり、
    // 両者の中間（実測 40 度）で止まって壁を背にしきれない。
    if (this.cover) {
      // 壁を背にする = 壁の外（法線側）を向く。
      // cover クリップは体が逆向きに作られているが、manifest の yawOffset で
      // クリップ側を正規約（+Z 前方）へ揃えてあるので、ここは素直に法線を向ければよい。
      this.faceTowards(this.cover.normal.x, this.cover.normal.z, dt);
    } else if (hasInput) {
      this.faceTowards(move.x, move.z, dt);
    } else if (!this.grounded && this.canTurnInAir()) {
      // 入力が無い空中では進行方向を向く。ここが今まで抜けていた本体で、
      // 壁を蹴って手前へ飛び降りると壁向きの yaw が残り、
      // 着地モーションだけ壁を向いて再生されていた。
      // 壁蹴り・崖からの落下・F での手離しをまとめて面倒見る。
      this.faceTowards(this.velocity.x, this.velocity.z, dt, P.airTurnRate);
    }

    // 着地リカバリ中はクリップの移動がルートを支配するので、入力では動かさない
    const rootClip = P.rootMotionClips[this.state];
    const rootDriven = !!rootClip && !!this.clips[rootClip]?.userData?.rootCurve;

    // C 押下中はスニーク。速度はクリップの root motion から導出する
    const speed = input.sprint ? P.sprintSpeed
                : input.sneak ? this.groundSpeed('sneak_fwd', 'z', P.walkSpeed * 0.7)
                : P.walkSpeed;
    const wish = (hasInput && !rootDriven) ? move.clone().multiplyScalar(speed) : new THREE.Vector3();

    // --- スニーク中だけの特別扱い ---
    // 壁を背にした横移動（cover）と、崖から落ちない挙動（teeter）
    this.coverDir = 0;
    if (this.cover) {
      // 移動は壁に沿った成分だけ。体は壁の外（法線側）を向く = 壁を背にする
      const tan = this.cover.tangent;
      const along = wish.x * tan.x + wish.z * tan.z;
      this.coverDir = Math.abs(along) > 0.02 ? Math.sign(along) : 0;
      if (this.coverDir) {
        // 速度は cover クリップの root motion から取る（足が滑らないように）。
        // facing が法線側なので見た目の右 = +tangent。coverDir>0 が右。
        const name = this.coverDir > 0 ? 'cover_move_right' : 'cover_move_left';
        const cs = this.groundSpeed(name, 'x', speed);
        wish.set(tan.x * this.coverDir * cs, 0, tan.z * this.coverDir * cs);
      } else {
        wish.set(0, 0, 0);          // 壁へ真っ直ぐ押し付けているだけ
      }
    }

    // 崖判定はスニーク中のみ。入力があればその向き、無ければ体の向きで見る
    this.atCliff = false;
    if (input.sneak && this.grounded) {
      const dir = (wish.lengthSq() > 1e-6) ? _v3.copy(wish).normalize() : this.forward(_v3);
      if (this.cliffAhead(dir.x, dir.z)) {
        wish.set(0, 0, 0);          // 踏み出さない
        this.atCliff = true;
      }
    }

    // 接地判定
    const g = this.probe.probeGround(this.obj.position);
    const groundY = g ? g.point.y : -Infinity;
    const wasGrounded = this.grounded;
    this.grounded = g && this.obj.position.y - groundY < 0.06 && this.velocity.y <= 0.01;

    if (this.grounded) {
      this.obj.position.y = groundY;
      this.velocity.y = 0;
      if (input.jumpPressed) {
        this.velocity.y = P.jumpSpeed;
        this.grounded = false;
        this.setState('jumpStart');
      }
    } else {
      this.velocity.y += P.gravity * dt;
    }

    // 水平移動（空中では慣性を残す）
    if (this.grounded) {
      // 接地したフレームでは、まだ空中の水平速度が入っている。
      // この下で入力値へ上書きしてしまうので、着地の向き合わせ用に取っておく
      if (!wasGrounded) this.landingVel.set(this.velocity.x, 0, this.velocity.z);
      this.velocity.x = wish.x; this.velocity.z = wish.z;
    } else {
      this.velocity.x += (wish.x - this.velocity.x) * Math.min(1, dt * 2.5);
      this.velocity.z += (wish.z - this.velocity.z) * Math.min(1, dt * 2.5);
    }

    // 壁でブロック（水平方向に軽い衝突判定）
    const step = _v2.copy(this.velocity).multiplyScalar(dt);
    if (rootDriven) {
      // クリップの移動カーブぶんを足す（キャラの向きへ回してから）
      this.sampleRootMotion(rootClip, dt, _v3).applyQuaternion(this.obj.quaternion);
      step.x += _v3.x; step.z += _v3.z;
    }
    const horiz = _v.set(step.x, 0, step.z);
    if (horiz.lengthSq() > 1e-8) {
      const dir = horiz.clone().normalize();
      const from = this.obj.position.clone().addScaledVector(WORLD_UP, 0.9);
      const hit = this.probe.cast(from, dir, horiz.length() + 0.34);
      if (hit && Math.abs(hit.normal.y) < 0.6) {
        const push = 0.34 - hit.distance + horiz.length();
        if (push > 0) { step.x -= dir.x * push; step.z -= dir.z * push; }
      }
    }
    this.obj.position.add(step);
    if (this.obj.position.y < groundY) { this.obj.position.y = groundY; this.velocity.y = 0; }

    this.obj.quaternion.setFromAxisAngle(WORLD_UP, this.facing);

    // --- 壁を掴む（前進入力中 or 空中のときだけ。真横に立っただけでは掴まない）---
    // スニーク中（接地時）は掴まない。C は「壁を背にして隠れる」操作なので、
    // 壁へ寄ったら cover に入るのが期待される動き。
    // 加えてグラブ判定距離(0.95m)が cover 判定距離(1.0m)と近く、
    // 抑制しないと壁へ寄る途中でグラブが先に発火して cover へ入れない。
    if (this.mantleCd <= 0 && !(input.sneak && this.grounded) && (hasInput || !this.grounded)) {
      const chest = this.obj.position.clone().addScaledVector(WORLD_UP, 1.15);
      const fwd = _v.set(Math.sin(this.facing), 0, Math.cos(this.facing));
      const hit = this.probe.probeClimbableAhead(chest, fwd, P.grabProbeDist);
      if (hit) { this.startClimb(hit); return; }
    }

    // --- 滞空時間と落下距離を記録する（空中／着地モーションの出し分けに使う）---
    if (!this.grounded) {
      this.fallPeakY = Math.max(this.fallPeakY, this.obj.position.y);
      this.airTime += dt;
    } else if (!wasGrounded) {
      this.lastFallDrop = Math.max(0, this.fallPeakY - this.obj.position.y);
      this.fallPeakY = this.obj.position.y;
      this.airTime = 0;
    } else {
      this.fallPeakY = this.obj.position.y;
      this.airTime = 0;
    }
    // 現在どれだけ落ちている途中か
    const dropSoFar = Math.max(0, this.fallPeakY - this.obj.position.y);

    // --- アニメーション ---
    if (!this.grounded) {
      // 上昇中や小さなジャンプは跳躍モーション、実際に落ちてきたら自由落下へ
      const freeFalling = this.velocity.y < 0 &&
        (dropSoFar >= P.fallLoopDrop || this.airTime >= P.fallLoopTime);
      if (this.inTakeoff()) { /* 踏み切り／壁を蹴る動作を見せる */ }
      // いちど自由落下に入ったら着地まで戻さない（接地判定の 1 フレームのゆらぎで
      // fallPeakY がリセットされ、跳躍モーションへ巻き戻るのを防ぐ）
      else if (this.state === 'fallLoop') { /* 維持 */ }
      else this.setState(freeFalling ? 'fallLoop' : 'jumpLoop');
    } else if (!wasGrounded) {
      // 着地クリップを選ぶ前に向きを確定させる。
      // 空中の旋回が間に合わない短い落下でも、後ろ向き着地にはならない
      this.alignFacingToTravel(this.landingVel.x, this.landingVel.z);
      // 落ちた高さで着地を出し分ける
      this.setState(this.lastFallDrop >= P.landRollHeight ? 'landRoll'
                  : this.lastFallDrop >= P.landHardHeight ? 'landHard'
                  : 'jumpLand');
    } else if (this.state === 'catchBreath'
               && this.stateTime < (this.clips.catch_breath ? this.clips.catch_breath.duration : 0)
               && !(hasInput && this.stateTime >= P.landRecovery)) {
      // 前転のあとの一息。硬直は landRecovery ぶんだけで、そのあとは入力で抜ける
    } else if (['jumpLand', 'landHard', 'landRoll'].includes(this.state)
               && this.stateTime < this.landHoldTime(this.state)
               && !(hasInput && this.stateTime >= this.landCancelTime(this.state))) {
      // 着地モーションを見せる（保持時間は「移動が終わる」か「体勢が戻る」まで）。
      // 重い着地は 1.5 秒あるので途中から入力でキャンセルできるが、
      // 前転のように「引き返せない動作」はキャンセル可能になる時刻を後ろへずらす。
    } else if (this.state === 'landRoll' && P.catchBreathAfterRoll && this.clips.catch_breath) {
      // 前転を再生しきったら一息つく
      this.setState('catchBreath');
    } else if (input.sneak) {
      if (this.atCliff) {
        // 崖際: よろめいて止まる。Teeter Transition → Teeter の順で見せる
        const enter = this.clips.teeter_enter;
        if (this.state !== 'teeterEnter' && this.state !== 'teeter') this.setState('teeterEnter');
        else if (this.state === 'teeterEnter'
                 && this.stateTime >= (enter ? enter.duration : 0.8)) this.setState('teeter');
      } else if (this.coverDir !== 0) {
        this.setState(this.coverDir > 0 ? 'coverRight' : 'coverLeft');
      } else if (hasInput && !this.cover) {
        this.setState('sneak');
      } else {
        // cover 中で壁沿いの成分が無い（壁へ押し付けているだけ）ときも静止扱い
        this.setState('sneakIdle');
      }
    } else if (hasInput) {
      this.setState(input.sprint ? 'sprint' : 'walk');
    } else {
      this.setState('idle');
    }

    // Mixamo のクリップがあればそちらを優先し、無ければ Quaternius にフォールバックする
    const pick = (name, fallback) => (this.clips[name] ? name : fallback);
    const A = {
      idle: ['Idle_Loop', {}],
      walk: ['Walk_Loop', { timeScale: 1.0 }],
      sprint: ['Sprint_Loop', { timeScale: 1.0 }],
      // --- スニーク ---
      sneakIdle: [pick('crouch_idle', 'Idle_Loop'), { fade: 0.2 }],
      sneak: [pick('sneak_fwd', 'Walk_Loop'), { fade: 0.2, timeScale: this.groundRate('sneak_fwd') }],
      // cover 系は action 名を *移動方向* で付けている（manifest の comment 参照）
      coverLeft: [pick('cover_move_left', 'sneak_fwd'),
                  { fade: 0.2, timeScale: this.groundRate('cover_move_left') }],
      coverRight: [pick('cover_move_right', 'sneak_fwd'),
                   { fade: 0.2, timeScale: this.groundRate('cover_move_right') }],
      teeterEnter: [pick('teeter_enter', 'Idle_Loop'), { once: true, fade: 0.15 }],
      teeter: [pick('teeter', 'Idle_Loop'), { fade: 0.25 }],
      jumpStart: ['Jump_Start', { once: true, fade: 0.08 }],
      wallJump: [pick('wall_jump', 'Jump_Start'), { once: true, fade: 0.08 }],
      jumpLoop: ['Jump_Loop', { fade: 0.12 }],
      fallLoop: [pick('fall_idle', 'Jump_Loop'), { fade: 0.25 }],
      jumpLand: ['Jump_Land', { once: true, fade: 0.1 }],
      landHard: [pick('land_soft', 'Jump_Land'), { once: true, fade: 0.08 }],
      landRoll: [pick('land_roll', 'Jump_Land'), { once: true, fade: 0.08 }],
      // 前転のあとの一息（Wiping Sweat）
      catchBreath: [pick('catch_breath', 'Idle_Loop'), { once: true, fade: P.catchBreathFade }],
    }[this.state] || ['Idle_Loop', {}];

    // 着地モーションを入力で中断して移動へ移るときは、クロスフェードを長めにする。
    // land_soft は頭と腰の差が 0.08m まで折り畳まれた姿勢が約 1 秒続き（実測）、
    // そこから Jog へ既定 0.22 秒で繋ぐと胴体が 0.55m 跳ね上がって見える。
    // キャンセル可能時刻を起き上がり完了(1.40 秒)まで待たせると操作不能が長すぎるので、
    // 待たせるのではなく繋ぎを伸ばして均す。
    const opts = (LANDING_STATES.includes(this.prevState) && GROUNDED_STATES.concat('idle').includes(this.state))
      ? { ...A[1], fade: P.landCancelFade }
      : A[1];
    this.anim.play(A[0], opts);
  }

  /* ============ Climbing への遷移 ============ */

  startClimb(hit) {
    this.surface.setFromHit(hit);
    this.mode = 'climb';
    this.velocity.set(0, 0, 0);
    this.grounded = false;

    // 腰の高さを保ったまま壁面へスナップ
    this.pitchNow = P.climbPitch;
    const hipWorld = this.obj.position.clone().addScaledVector(WORLD_UP, P.hipHeight);
    this.anchor.copy(this.surface.uvFromWorld(hipWorld));
    this.clampGrabHeight();
    this.applyClimbTransform();
    this.snapLimbs();
    this.lateralInput = 0;
    this.verticalInput = 0;
    this.setState('grab');
    this.anim.play('wall_grab', { once: true, fade: 0.16, timeScale: 1.2 });
  }

  /**
   * anchor(uv) からワールド位置・向きを決める。
   *
   * 姿勢 = 「面に正対する基底」 × 「接線まわりの pitch」。
   * 位置は "腰が anchor + 法線×standOff に来る" ように逆算する
   * （モデル原点は足元なので、回転後の腰オフセットを引く）。
   * これで pitch を入れても腰の位置がずれない。
   */
  climbQuaternion(target = new THREE.Quaternion()) {
    this.surface.lookQuaternion(target);
    const pitch = this.pitchNow ?? P.climbPitch;
    if (pitch) target.multiply(_qPitch.setFromAxisAngle(AXIS_X, pitch));
    // lookQuaternion は「+Z に壁の法線」= モデルローカル -Z が壁を向く向きを返す。
    // このプロジェクトの規約は「モデルローカル +Z = 前方」なので、最後に半回転して
    // 前方を壁へ向ける。見た目は以前とまったく同じ（クリップ側の 180 度と対で直した）。
    target.multiply(FLIP_Y);
    return target;
  }

  /**
   * 着地状態を何秒保持するか。
   * クリップ自身が移動するもの（前転など）は、移動が終わる前に状態を抜けると
   * 「途中で止まって立ち上がる」不自然な絵になるので、カーブの settleTime に合わせる。
   */
  /**
   * 着地モーションを入力でキャンセルできるようになるまでの時間。
   *
   * 固定値（P.landCancelTime = 0.4 秒）だけで判定すると、前転が
   * **逆さで転がっている途中**（実測: 0.42 秒時点で頭が地上 0.32m）で切れて
   * Jog へ飛び、頭を下にした姿勢から強制的に起き上がる絵になる。
   *
   * そこで「クリップ自身がキャラを動かし終わるまで」= rootCurve の settleTime を
   * 下限に加える。クリップが root を駆動している間は引き返せない動作と見なす。
   *   land_roll  settleTime 1.20s → 前転はほぼ中断不可（全長 1.35s）
   *   land_soft  settleTime 0.30s → 0.4 秒でキャンセル可（ただ沈むだけなので中断してよい）
   */
  /**
   * 着地モーションを入力でキャンセルできるようになるまでの時間。
   *
   * 前転・重い着地のような「大きい動き」は **キャンセル不可**（Infinity）にして
   * 最後まで再生する。途中で切ると立ち上がりがクロスフェードに飲まれて
   * 「回転から立ち上がりまでが早すぎる」絵になる。
   * 軽い着地(jumpLand)だけ P.landCancelTime で抜けられる。
   */
  landCancelTime(state) {
    return P.rootMotionClips[state] ? Infinity : P.landCancelTime;
  }

  /**
   * 着地状態を何秒保持するか。
   *
   * 大きい着地は **クリップを再生しきってから** P.landRecovery ぶん硬直させる。
   * 以前は「移動が終わる」「体勢が戻る」で切っていたが、実測すると
   * どちらもクリップ長より 0.35〜0.47 秒早く、立ち上がりが途中で
   * クロスフェードに飲まれて「早すぎる」絵になっていた
   * （land_roll: 保持 1.35 / 全長 1.70、land_soft: 1.50 / 1.97）。
   *
   * クリップ末尾に動かない余韻があるなら `motionEnd` で切り上げる。
   * 実測ではこの 2 本とも motionEnd ≒ 全長（= 最後まで動いている）だった。
   */
  landHoldTime(state) {
    const name = P.rootMotionClips[state];
    const clip = name && this.clips[name];
    if (!clip) return 0.30;                        // Jump_Land など、軽い着地
    const ud = clip.userData || {};

    // 次に「一息つく」モーションが続く場合は、**立ち上がりが終わった時点**で渡す。
    // land_roll は t=1.40 で頭・腰が立位に達し、そこから 1.70 までは静止している（実測）。
    // クリップ末尾まで待つと「回転 → 棒立ち → 汗を拭う」に見えるので、
    // 静止した末尾にクロスフェードを重ねてしまう。硬直も別に置かない（汗拭いがその役）。
    if (this.catchBreathFollows(state)) return ud.recoverTime || clip.duration;

    const end = ud.motionEnd ? Math.min(ud.motionEnd, clip.duration) : clip.duration;
    return end + P.landRecovery;
  }

  /** この着地状態のあとに「一息つく」モーションが続くか */
  catchBreathFollows(state) {
    return state === 'landRoll' && P.catchBreathAfterRoll && !!this.clips.catch_breath;
  }

  /**
   * クリップの移動カーブから「この 1 フレームで進む量」を取り出す（キャラクターローカル）。
   * stateTime をクリップ時刻として使う（着地系は timeScale 1 の LoopOnce なので一致する）。
   */
  sampleRootMotion(clipName, dt, out) {
    out.set(0, 0, 0);
    const curve = this.clips[clipName]?.userData?.rootCurve;
    if (!curve || !curve.times.length) return out;
    const at = (time) => {
      const T = curve.times;
      const t = THREE.MathUtils.clamp(time, T[0], T[T.length - 1]);
      let i = 1;
      while (i < T.length - 1 && T[i] < t) i++;
      const t0 = T[i - 1], t1 = T[i];
      const k = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
      return { x: curve.x[i - 1] + (curve.x[i] - curve.x[i - 1]) * k,
               z: curve.z[i - 1] + (curve.z[i] - curve.z[i - 1]) * k };
    };
    const b = at(this.stateTime);
    const a = at(this.stateTime - dt);
    return out.set(b.x - a.x, 0, b.z - a.z);
  }

  /** 状態に応じた後傾角を滑らかに追う */
  updatePitch(dt) {
    const want = this.state === 'hang' ? P.hangPitch : P.climbPitch;
    this.pitchNow = THREE.MathUtils.damp(this.pitchNow ?? want, want, P.pitchDamp, dt);
  }

  applyClimbTransform(snap = true, dt = 0) {
    const q = this.climbQuaternion(_q2);
    // 回転後の「原点→腰」オフセット（垂直壁 + pitch=0 なら worldUp * hipHeight と一致）
    const hipOffset = _v2.set(0, P.hipHeight, 0).applyQuaternion(q);

    // 足が地面より下へ行かないよう anchor.v をクランプする
    this.surface.worldFromUV(this.anchor.x, this.anchor.y, _v);
    const footY = _v.y + this.surface.normal.y * P.standOff - hipOffset.y;
    const by = this.surface.bitangent.y;
    this.atBottom = false;
    if (footY < 0 && by > 0.1) {
      this.anchor.y += -footY / by;
      this.atBottom = true;
      this.surface.worldFromUV(this.anchor.x, this.anchor.y, _v);
    }
    _v.addScaledVector(this.surface.normal, P.standOff).sub(hipOffset);
    this.obj.position.copy(_v);

    if (snap) this.obj.quaternion.copy(q);
    else this.obj.quaternion.slerp(q, Math.min(1, dt * 10));
    // 壁に張り付いている間は体は壁を向く（= 法線の逆）。
    // 壁から離れた瞬間からは updateNormal の空中旋回が進行方向へ引き戻す
    this.snapFacing(-this.surface.normal.x, -this.surface.normal.z);
  }

  /**
   * 壁から離れて通常状態へ戻す。
   * クリップは再生しない（次フレームの updateNormal が状態に応じて選ぶ）。
   * ここで再生すると 1 フレームだけ別のモーションが挟まる。
   */
  endClimb(velocity, cooldown = P.mantleCooldown) {
    this.mode = 'normal';
    this.velocity.copy(velocity || _v.set(0, 0, 0));
    this.mantleCd = cooldown;
    this.airTime = 0;
    this.fallPeakY = this.obj.position.y;
    this.setState('jumpLoop');
  }

  /* ============ Climbing ============ */

  updateClimb(dt, input) {
    if (this.state === 'mantle') { this.updateMantle(dt); return; }

    // Grab 中は入力を受けない
    if (this.state === 'grab') {
      if (this.anim.finished || this.stateTime > 0.9) this.setState('climbIdle');
    }

    let du = 0, dv = 0;
    if (this.state !== 'grab') {
      du = input.climbX;                     // A/D
      dv = input.climbY;                     // W/S
    }

    // 壁から離れる
    if (input.jumpPressed) {
      const v = this.surface.normal.clone().multiplyScalar(P.wallJumpOut).addScaledVector(WORLD_UP, P.wallJumpUp);
      this.endClimb(v);
      // 専用ステートにしないと、次フレームの updateNormal が
      // jumpStart -> Jump_Start を再生して上書きしてしまう
      this.setState('wallJump');
      return;
    }
    if (input.dropPressed || (this.atBottom && dv < 0)) {
      const v = this.surface.normal.clone().multiplyScalar(1.6).addScaledVector(WORLD_UP, 0.1);
      this.endClimb(v, P.releaseCooldown);
      return;
    }

    // --- 上端でのマントル ---
    if (dv > 0) {
      const hipPoint = this.surface.worldFromUV(this.anchor.x, this.anchor.y, _v).clone();
      const top = this.probe.probeTop(hipPoint, this.surface.normal, 0.6, 1.05);
      if (top && this.probe.hasHeadroom(top.point, 1.9)) { this.startMantle(top); return; }
    }

    // --- 壁面 2D 移動 ---
    const upSpeed = this.climbSpeed(dv > 0 ? 'up' : 'down');
    const stepU = du * this.lateralSpeed(du) * dt;
    const stepV = dv * upSpeed * dt;

    this.blocked.u = 0; this.blocked.v = 0;
    if (stepU !== 0 && this.canMoveTo(this.anchor.x + stepU, this.anchor.y)) this.anchor.x += stepU;
    else if (stepU !== 0) this.blocked.u = Math.sign(stepU);
    if (stepV !== 0 && this.canMoveTo(this.anchor.x, this.anchor.y + stepV)) this.anchor.y += stepV;
    else if (stepV !== 0) this.blocked.v = Math.sign(stepV);

    this.lateralInput = du;
    this.verticalInput = dv;
    this.updatePitch(dt);
    this.applyClimbTransform(false, dt);
    this.followSurface(dt);

    // --- アニメーション選択 ---
    if (this.state !== 'grab') {
      const vertical = Math.abs(dv) > 0.01 && this.blocked.v === 0;
      const lateral = Math.abs(du) > 0.01 && this.blocked.u === 0;
      const footed = this.feetOnWall();
      if (vertical) this.setState(dv > 0 ? 'climbUp' : 'climbDown');
      else if (lateral) {
        // 足が壁から外れているなら braced ではなく free hang のシミーを使う
        if (footed) this.setState(du > 0 ? 'climbRight' : 'climbLeft');
        else this.setState(du > 0 ? 'hangRight' : 'hangLeft');
      } else this.setState(footed ? 'climbIdle' : 'hang');
    }

    switch (this.state) {
      case 'grab': break;
      case 'climbUp': this.anim.play('climb_up', { fade: 0.2, timeScale: this.clipRate('climb_up') }); break;
      case 'climbDown': this.anim.play('climb_down', { fade: 0.2, timeScale: this.clipRate('climb_down') }); break;
      case 'climbIdle': this.anim.play('climb_idle', { fade: 0.25 }); break;
      case 'hang': this.anim.play('hang_idle', { fade: 0.25 }); break;
      // 横移動: 専用クリップ（climb_left / climb_right）があればそれを使う。
      // 無ければ climb_idle に climb_up を薄く混ぜてしのぐ（CMU に横移動素材が無いため）
      case 'climbLeft':
      case 'climbRight': {
        const want = this.state === 'climbLeft' ? 'climb_left' : 'climb_right';
        if (this.clips[want]) this.anim.play(want, { fade: 0.2, timeScale: this.clipRate(want) });
        else this.anim.play('climb_idle', { fade: 0.25, timeScale: 1.0 });
        break;
      }
      // 足が壁から外れている（= 腕だけ）ときの横移動。
      // ここの case が無かったため hangLeft / hangRight では switch を素通りし、
      // hang_idle のまま 0.4m/s で横滑りしていた（Left/Right Shimmy が一度も鳴っていない）
      case 'hangLeft':
      case 'hangRight': {
        const want = this.state === 'hangLeft' ? 'hang_left' : 'hang_right';
        if (this.clips[want]) this.anim.play(want, { fade: 0.2, timeScale: this.clipRate(want) });
        else this.anim.play('hang_idle', { fade: 0.25, timeScale: 1.0 });
        break;
      }
    }
    const lateral = ['climbLeft', 'climbRight', 'hangLeft', 'hangRight'].includes(this.state);
    const hasLateralClip = !!(this.clips.climb_left || this.clips.climb_right);
    if (lateral && !hasLateralClip) {
      this.anim.blendIn('climb_up', P.lateralBlend, 0.9);
    } else if (this.state !== 'climbUp') {
      this.anim.clearBlend();
    }
  }

  /**
   * クリップの root motion から「足が滑らない移動速度」を求める。
   *
   * clip.userData.rootMotion は「そのクリップ 1 周で本来進む距離」なので、
   * 移動速度をこれに合わせておけば手足の接地とアニメがずれない。
   * animRate はクリップ側の指定（Mixamo は 1.0 = 素の速度）。
   * null のクリップ（CMU 由来）は P.climbAnimRate を掛けて速くする。
   */
  /**
   * そのクリップを再生するときの timeScale。
   * animRate はクリップ側の基準速度（Mixamo は 1.0 = 素の速度、CMU 由来は null）。
   * これに全体倍率 climbSpeedScale を掛ける。移動速度も同じ値を使うので同期が崩れない。
   */
  clipRate(name) {
    const clip = this.clips[name];
    const base = (clip && clip.userData && clip.userData.animRate) ?? P.climbAnimRate;
    return base * P.climbSpeedScale;
  }

  /** 地上クリップの再生倍率（manifest の animRate。壁用の climbSpeedScale は掛けない） */
  groundRate(name) {
    const u = this.clips[name] && this.clips[name].userData;
    return (u && u.animRate) || 1;
  }

  /**
   * 地上クリップの root motion から移動速度を導出する。
   * 再生倍率と同じ倍率が掛かるので、倍率を変えても足は滑らない。
   */
  groundSpeed(name, axis, fallback) {
    const clip = this.clips[name];
    const rm = clip && clip.userData && clip.userData.rootMotion;
    if (!clip || !rm || !clip.duration) return fallback;
    const dist = Math.abs(axis === 'x' ? rm.x : rm.z);
    if (dist < 1e-4) return fallback;
    return (dist / clip.duration) * this.groundRate(name);
  }

  /**
   * 進行方向の左右に壁があるか探す（スニーク中の cover 判定）。
   * 見つかったら「壁の外を向く法線」と「壁に沿った接線」を返す。
   *
   * 探す向きを *体の向き* 基準にしてはいけない。cover に入ると体が壁の法線を
   * 向くよう回るので、回りきった時点で横向きレイが壁と平行になり壁を見失う。
   * すると cover が外れて体が入力方向へ戻り、また壁を見つける、を毎フレーム
   * 繰り返す（実測: coverLeft と sneak が 1 フレームごとに交互になった）。
   * 入力（＝進行方向）は体の向きに影響されないので、そちらを基準にする。
   *
   * @param {THREE.Vector3} moveDir 進行方向（水平・正規化済み、無入力なら長さ 0）
   */
  findCover(moveDir) {
    const from = _v2.copy(this.obj.position).addScaledVector(WORLD_UP, P.coverProbeHeight);
    const dirs = [];
    if (moveDir && moveDir.lengthSq() > 1e-6) {
      dirs.push(new THREE.Vector3(-moveDir.z, 0, moveDir.x));   // 進行方向の左
      dirs.push(new THREE.Vector3(moveDir.z, 0, -moveDir.x));   // 進行方向の右
      dirs.push(moveDir.clone());                               // 正面（壁へ寄っていく場合）
    }
    // 無入力でも直前の壁は保持する（壁に張り付いたまま止まれるように）
    if (this.cover) dirs.push(this.cover.normal.clone().negate());
    for (const dir of dirs) {
      const hit = this.probe.cast(from, dir, P.coverProbeDist);
      if (!hit || Math.abs(hit.normal.y) > 0.5) continue;
      const n = hit.normal.clone(); n.y = 0;
      if (n.lengthSq() < 1e-6) continue;
      n.normalize();
      return { normal: n, tangent: new THREE.Vector3(-n.z, 0, n.x) };
    }
    return null;
  }

  /**
   * その向きの少し先に地面が無い（= 崖）か。
   * スニーク中はここで足を止めて Teeter を見せる。
   */
  cliffAhead(dx, dz) {
    _v2.copy(this.obj.position);
    _v2.x += dx * P.cliffProbeAhead;
    _v2.z += dz * P.cliffProbeAhead;
    const g = this.probe.probeGround(_v2, 2.0);
    return !g || (this.obj.position.y - g.point.y) > P.cliffDrop;
  }

  clipSpeed(name, axis, fallback) {
    const clip = this.clips[name];
    const rm = clip && clip.userData && clip.userData.rootMotion;
    if (!clip || !rm || !clip.duration) return fallback * P.climbSpeedScale;
    const dist = Math.abs(axis === 'y' ? rm.y : rm.x);
    if (dist < 1e-4) return fallback * P.climbSpeedScale;
    return (dist / clip.duration) * this.clipRate(name);
  }

  climbSpeed(dir) {
    return this.clipSpeed(dir === 'up' ? 'climb_up' : 'climb_down', 'y', 0.5);
  }

  /** 横移動速度。専用クリップがあればその root motion に合わせる */
  lateralSpeed(dir) {
    const hanging = this.state === 'hangLeft' || this.state === 'hangRight';
    const name = hanging ? (dir > 0 ? 'hang_right' : 'hang_left')
                         : (dir > 0 ? 'climb_right' : 'climb_left');
    return this.clipSpeed(name, 'x', P.climbLateralSpeed);
  }

  /**
   * 移動先に壁が続いているか。腰と手（上）の 2 点で確認する。
   * 足の位置は見ない — 足が壁から外れても手で保持できる（= Hang）ため。
   */
  /**
   * 掴む高さを「手が壁の上端を越えない」ところまで下げる。
   *
   * startClimb は raycast のヒット点（胸の高さ）から anchor を決めるので、
   * 上端付近で掴むと手（anchor の約 1m 上）が壁の上へ突き抜けて空を掴む。
   * 実測: 上端 y=6.00 の壁で anchor y=5.76 → 手 y=6.76（0.76m 宙）、頭も 0.41m 上。
   *
   * 壁面移動側には canMoveTo による上限があるのに、初回グラブだけ素通しだった
   * （canMoveTo の余裕 0.5m では手の届く 1.0m に足りないので、専用の判定にする）。
   *
   * @returns {boolean} 下げたか
   */
  clampGrabHeight() {
    const n = this.surface.normal;
    const ok = (v) => {
      for (const dv of [0, P.grabHandReach]) {
        this.surface.worldFromUV(this.anchor.x, v + dv, _v);
        if (_v.y < 0.05) continue;                     // 地面より下は壁が無くても許す
        if (!this.probe.probeSurface(_v, n, 0.75)) return false;
      }
      return true;
    };
    if (ok(this.anchor.y)) return false;
    for (let i = 1; i <= 40; i++) {                    // 5cm 刻みで最大 2m 下げる
      const v = this.anchor.y - 0.05 * i;
      if (ok(v)) { this.anchor.y = v; return true; }
    }
    return false;
  }

  canMoveTo(u, v) {
    const n = this.surface.normal;
    for (const dv of [0, 0.5]) {
      this.surface.worldFromUV(u, v + dv, _v);
      if (_v.y < 0.05) continue;                       // 地面より下は壁が無くても許す
      if (!this.probe.probeSurface(_v, n, 0.75)) return false;
    }
    return true;
  }

  /**
   * 曲面や斜面に沿って座標系を作り直す。
   *
   * 腰のワールド位置を obj.position から逆算すると、姿勢オフセットの定義が
   * applyClimbTransform とわずかにずれるだけで毎フレーム累積ドリフトする
   * （実際に pitch を入れた際 +2.2 m/s のドリフトを踏んだ）。
   * ここでは anchor から求めた「壁面上の腰投影点」だけを介して付け替える。
   */
  followSurface(dt = 0) {
    const hipPoint = this.surface.worldFromUV(this.anchor.x, this.anchor.y, _v).clone();
    const hit = this.probe.probeSurface(hipPoint, this.surface.normal, 0.7);
    if (!hit) return;

    const normalChanged = hit.normal.dot(this.surface.normal) < 0.999;
    this.surface.origin.copy(hit.point);
    if (normalChanged) this.surface.setNormal(hit.normal);
    this.surface.uvFromWorld(hipPoint, this.anchor);
    if (normalChanged) this.applyClimbTransform(false, dt);
  }

  feetOnWall() {
    const foot = this.surface.worldFromUV(this.anchor.x, this.anchor.y + P.limbOffsets.leftFoot.v, _v);
    return foot.y > 0.05 && !!this.probe.probeSurface(foot, this.surface.normal, 0.8);
  }

  /* ============ Mantle ============ */

  startMantle(top) {
    this.setState('mantle');
    const end = top.point.clone().addScaledVector(this.surface.normal, -0.45);
    end.y = top.point.y;
    // ルート補間の時間はクリップ長（再生速度で割った実時間）に合わせる。
    // ずらすとポーズと移動が食い違って「宙で立ち上がる」ような絵になる。
    const clip = this.clips['mantle'];
    // clipRate() は壁面移動用に climbSpeedScale を掛けるので使わない。
    // マントルは manifest の animRate だけを見る
    const rate = (clip && clip.userData && clip.userData.animRate) || 1;
    this.mantleData = {
      from: this.obj.position.clone(),
      to: end,
      dur: clip ? Math.max(0.6, clip.duration / rate) : 1.1,
      t: 0,
      // クリップ自身の移動カーブ。これでルートを動かすのが要点（下の updateMantle 参照）
      curve: clip && clip.userData ? clip.userData.rootCurve : null,
      // 手の固定点。クリップ側は手が体と一緒に上がってしまうので IK で縁へ留める。
      // 高さは *縁に揃える*。現在の手の位置をそのまま使うと、climb_up の途中で
      // マントルへ入ったときに左右の手が 0.57m もずれた高さで固定されてしまう
      // （片手は掴み替えで上、もう片手は下にある）。
      handPins: this.limbs.filter((l) => l.isHand).map((l) => {
        const pin = l.bones.end.getWorldPosition(new THREE.Vector3());
        pin.y = top.point.y - P.mantleHandPinDrop;
        return { limb: l, pin };
      }),
    };
    this.anim.play('mantle', { once: true, fade: 0.18, timeScale: rate });
  }

  /**
   * マントルのルート進行度。
   *
   * **直線（t そのもの）が正解**。理屈と実測の両方でそうなる。
   *
   * 理屈: in-place 化で抜いたのは「始点→終点の *直線* トレンド」
   *       （`rebuildHipsPositionTrack` の `_v.y -= rootMotion.y * t`）。
   *       抜いたものと同じ形で足し戻さないと、手と胴体の相対関係が崩れる。
   *
   * 実測: 引き上げ中（t<0.6）に手が縁(y=6)から離れる量
   *       直線 0.61m / smoothstep 0.69m / クリップの移動カーブ 1.30m
   *       直線での手の上昇量 0.81m は、元クリップの手の上昇量 0.81m と一致する。
   *
   * 「クリップ自身のカーブで駆動するのが正しいはず」と考えて一度そう実装したが、
   * 抜いたのが直線なのだから足し戻すのも直線であり、これは誤りだった（実測で 1.30m と最悪）。
   *
   * 縦と水平を分ける必要も無い（同じ直線なので）。引数は将来クリップごとに
   * 進行度を変えたくなったときのために残してある。
   */
  mantleProgress(curve, t) {
    return { v: t, h: t };
  }

  /**
   * マントル中、手を縁に固定する。
   *
   * `Braced Hang To Crouch` は手を固定した懸垂ではなく **手を持ち替えながら登る**
   * モーションで、元クリップの時点で引き上げ中に手が 0.81m 上がる
   * （腰は 2.04m 上がる）。ルートの進行度を正しく直しても
   * 「手が縁から離れて腰の高さまでずれていく」絵は残る。素材の性質。
   *
   * そこで掴んでいた点に手を IK で留め、腰がそこまで上がってきたら離す。
   * 通常のクライミングは素のモーションのままにしておきたいので
   * （固定モーションのほうが自然という評価だったため）、
   * IK を掛けるのはこのマントル中だけに限定する。
   */
  updateMantleHandIK(dt) {
    const d = this.mantleData;
    if (!d || !d.handPins) return;

    const hipY = this.hipsBone.getWorldPosition(_v3).y;
    let err = 0;
    for (const { limb, pin } of d.handPins) {
      // 腰が固定点へ近づくほど重みを落とす（引き上げ完了 = 手を離す）
      const want = THREE.MathUtils.clamp((pin.y - hipY) / P.mantleHandRelease, 0, 1);
      limb.weight = THREE.MathUtils.damp(limb.weight, want, 10, dt);
      if (limb.weight < 0.02) continue;
      const side = limb.key.startsWith('left') ? -1 : 1;
      const pole = _v.copy(this.surface.tangent).multiplyScalar(side * 1.0)
        .addScaledVector(this.surface.bitangent, -0.9).normalize().clone();
      err += solveTwoBoneIK(limb.bones.root, limb.bones.mid, limb.bones.end,
                            pin, pole, limb.weight);
      limb.pos.copy(pin);
    }
    this.ikWeightNow = Math.max(...d.handPins.map((h) => h.limb.weight));
    this.stats.ikError = err / Math.max(1, d.handPins.length);
  }

  updateMantle(dt) {
    const d = this.mantleData;
    d.t = Math.min(1, d.t + dt / d.dur);
    // 位置はクリップの移動カーブで動かす。縦と水平で進行度が違うので別々に掛ける
    const p = this.mantleProgress(d.curve, d.t);
    _v.copy(d.to).sub(d.from);
    this.obj.position.copy(d.from);
    this.obj.position.x += _v.x * p.h;
    this.obj.position.z += _v.z * p.h;
    this.obj.position.y += _v.y * p.v;
    // 「縁を越える持ち上げ」を sin で足していたが、クリップ自身が縁の上まで
    // 行って沈む動き（進行度 1.06 → 1.00）を持っているので不要になった
    if (d.t >= 1) {
      this.mode = 'normal';
      this.grounded = true;
      this.velocity.set(0, 0, 0);
      this.mantleCd = P.mantleCooldown;
      this.setState('idle');
    }
  }

  /* ============ 手足 IK ============ */

  /** 進行方向へ手足を先行させた理想接地位置 */
  limbIdeal(limb, target) {
    const b = limb.isHand ? P.leadBias.hand : P.leadBias.foot;
    const du = Math.sign(this.lateralInput || 0) * b.u;
    const dv = Math.sign(this.verticalInput || 0) * b.v;
    return this.surface.worldFromUV(
      this.anchor.x + limb.offset.u + du,
      this.anchor.y + limb.offset.v + dv, target);
  }

  snapLimbs() {
    for (const limb of this.limbs) {
      const ideal = this.limbIdeal(limb, _v).clone();
      const hold = this.probe.findHold(ideal, this.surface.normal,
        limb.isHand ? P.holdSearchRadius.hand : P.holdSearchRadius.foot);
      limb.free = !hold;
      limb.weight = hold ? 1 : 0;
      limb.snap(hold ? hold.point : ideal, hold ? hold.normal : this.surface.normal);
    }
  }

  updateLimbIK(dt) {
    const n = this.surface.normal;
    const taken = new Set();
    for (const limb of this.limbs) if (limb.hold) taken.add(limb.hold);

    // 1) 掴み替えの判定（同時に動かすのは 1 本まで = 3 点支持を保つ）
    let reachingCount = 0;
    for (const limb of this.limbs) if (limb.reaching) reachingCount++;

    let worst = null;
    for (const limb of this.limbs) {
      const ideal = this.limbIdeal(limb, _v).clone();
      limb.ideal = ideal;
      if (limb.free) {
        // 接地点が現れたら掴み直す。無ければアニメーションに任せる
        const r = limb.isHand ? P.holdSearchRadius.hand : P.holdSearchRadius.foot;
        const hold = this.probe.findHold(ideal, n, r, taken);
        if (hold && reachingCount === 0) {
          limb.free = false;
          limb.snap(hold.point, hold.normal);
          limb.hold = hold.hold;
        }
        continue;
      }
      limb.error = limb.planted.distanceTo(ideal);
      const th = limb.isHand ? P.reachThreshold.hand : P.reachThreshold.foot;
      if (!limb.reaching && limb.error > th && (!worst || limb.error > worst.error)) worst = limb;
    }
    if (worst && reachingCount === 0) {
      const r = worst.isHand ? P.holdSearchRadius.hand : P.holdSearchRadius.foot;
      const hold = this.probe.findHold(worst.ideal, n, r, taken);
      if (hold) {
        worst.from.copy(worst.planted);
        worst.to.copy(hold.point);
        worst.hold = hold.hold;
        worst.normal.copy(hold.normal);
        worst.reaching = true;
        worst.t = 0;
        this.stats.reaches++;
      } else {
        // 掴めるものが無い = 宙ぶらりん。IK を外してアニメーションに戻す
        worst.free = true;
        worst.hold = null;
      }
    }

    // 2) 手足の現在位置（掴み替え中は弧を描く）
    for (const limb of this.limbs) {
      if (limb.free) { limb.bones.end.getWorldPosition(limb.pos); continue; }
      if (limb.reaching) {
        limb.t += dt / P.reachDuration;
        if (limb.t >= 1) { limb.planted.copy(limb.to); limb.pos.copy(limb.to); limb.reaching = false; }
        else {
          limb.pos.lerpVectors(limb.from, limb.to, smoothstep(limb.t));
          limb.pos.addScaledVector(n, Math.sin(Math.PI * limb.t) * 0.11);
        }
      } else {
        limb.pos.copy(limb.planted);
      }
    }

    // 3) Pelvis 補正: 手足の平均が届く位置へ腰を少しだけ寄せる
    this.applyPelvisOffset(dt);

    // 3.5) 横移動用の体幹ロール（専用モーションが無いぶんをコードで足す）
    this.applyLateralLean(dt);

    // 4) Two Bone IK
    const w = this.ikEnabled ? P.ikWeight : 0;
    this.ikWeightNow = THREE.MathUtils.damp(this.ikWeightNow ?? 0, w, 8, dt);
    let err = 0, nSolved = 0;
    for (const limb of this.limbs) {
      limb.weight = THREE.MathUtils.damp(limb.weight, limb.free ? 0 : 1, 7, dt);
      if (limb.weight < 0.02) continue;
      const side = limb.key.startsWith('left') ? -1 : 1;
      const pole = limb.isHand
        ? _v.copy(this.surface.tangent).multiplyScalar(side * 1.0)
            .addScaledVector(this.surface.bitangent, -0.9).normalize().clone()
        : _v.copy(this.surface.tangent).multiplyScalar(side * 1.0)
            .addScaledVector(n, 0.5).normalize().clone();
      const w2 = this.ikWeightNow * limb.weight;
      err += solveTwoBoneIK(limb.bones.root, limb.bones.mid, limb.bones.end, limb.pos, pole, w2);
      alignEndToSurface(limb.bones.end, limb.normal, w2 * 0.45);
      nSolved++;
    }
    this.stats.ikError = nSolved ? err / nSolved : 0;
  }

  /** 横移動時に、進行方向へ体を少し倒す（腰のロール）*/
  applyLateralLean(dt) {
    if (!P.lateralLean) { this.leanNow = 0; return; }
    const want = THREE.MathUtils.clamp(-(this.lateralInput || 0), -1, 1) * P.lateralLean;
    this.leanNow = THREE.MathUtils.damp(this.leanNow ?? 0, want, 6, dt);
    if (Math.abs(this.leanNow) < 1e-4) return;
    // 壁の法線まわりに回すと「面に沿って傾く」動きになる
    const p = this.hipsBone.parent;
    p.updateWorldMatrix(true, false);
    const qParent = p.getWorldQuaternion(new THREE.Quaternion());
    const qWorld = this.hipsBone.getWorldQuaternion(new THREE.Quaternion());
    const qLean = new THREE.Quaternion().setFromAxisAngle(this.surface.normal, this.leanNow);
    qWorld.premultiply(qLean);
    this.hipsBone.quaternion.copy(qParent.invert()).multiply(qWorld);
    this.hipsBone.updateMatrixWorld(true);
  }

  applyPelvisOffset(dt) {
    if (!this.ikEnabled) { this.pelvisOffset.multiplyScalar(0.8); return; }
    // 手足の目標と現在の末端位置の差の平均を、控えめに腰へ効かせる
    _v2.set(0, 0, 0);
    let n = 0;
    for (const limb of this.limbs) {
      if (limb.free) continue;
      limb.bones.end.getWorldPosition(_v);
      _v2.add(limb.pos).sub(_v);
      n++;
    }
    if (!n) { this.pelvisOffset.multiplyScalar(0.85); return; }
    _v2.multiplyScalar(0.18 / n);
    _v2.clampLength(0, 0.11);
    this.pelvisOffset.lerp(_v2, Math.min(1, dt * 8));
    // hips のローカル位置へ加える（親 root の回転を打ち消して足す）
    const p = this.hipsBone.parent;
    p.updateWorldMatrix(true, false);
    _q.copy(p.getWorldQuaternion(new THREE.Quaternion())).invert();
    _v.copy(this.pelvisOffset).applyQuaternion(_q);
    this.hipsBone.position.add(_v);
    this.hipsBone.updateMatrixWorld(true);
  }

  fadeOutLimbs(dt) {
    this.ikWeightNow = THREE.MathUtils.damp(this.ikWeightNow ?? 0, 0, 10, dt);
    this.pelvisOffset.multiplyScalar(Math.max(0, 1 - dt * 6));
  }

  debugInfo() {
    return {
      mode: this.mode,
      state: this.state,
      clip: this.anim.currentName,
      pos: this.obj.position,
      anchor: this.anchor,
      atBottom: this.atBottom,
      ik: (this.ikWeightNow ?? 0).toFixed(2),
      ikError: this.stats.ikError.toFixed(3),
      reaches: this.stats.reaches,
      fallDrop: this.lastFallDrop,
      airTime: this.airTime,
      facingErr: this.facingAudit.angle,
      facingViolations: this.facingAudit.violations,
      casts: this.probe.stats.casts,
    };
  }
}

/* ---------------- helpers ---------------- */

function smoothstep(t) { t = THREE.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t); }

function dampAngle(cur, target, rate, dt) {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * Math.min(1, rate * dt);
}
