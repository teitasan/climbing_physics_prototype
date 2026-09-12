// CMU BVH から必要区間だけを切り出した軽量 BVH を生成する。
//  - frame 0 は cgspeed 版が付与している T ポーズフレームを必ず残す（リターゲットの src bind pose 用）
//  - 120fps -> 30fps へ間引き
//  - loop:true の区間はポーズ距離が最小になるよう境界を微調整（ループ継ぎ目のポップ低減）
//  - reverse:true で逆再生（「後ろ向きに段差を降りる」→「段差を乗り越える」に転用）
//  - manifest.json に yawOffset / rootDelta / duration を書き出す（ゲーム側で使う）
const fs = require('fs');
const { parse, fk } = require('./bvh.js');

const SCALE = 0.052;           // CMU 単位 -> メートル（Quaternius キャラの腰高 0.917m 基準）
const OUT_FPS = 30;
const BVH_DIR = process.env.CMU_BVH_DIR || './cmu-bvh/';   // 展開した CMU BVH の置き場

// FKで使う代表関節（ポーズ距離の計算用）
const KEY = ['Head','LeftHand','RightHand','LeftFoot','RightFoot','LeftArm','RightArm','LeftLeg','RightLeg'];

function poseVec(b, f) {
  const p = fk(b, f, SCALE).pos, h = p.Hips;
  const v = [];
  for (const k of KEY) v.push(p[k][0]-h[0], p[k][1]-h[1], p[k][2]-h[2]);   // 腰基準の相対座標
  return v;
}
function poseDist(a, b) { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i]-b[i]; s += d*d; } return Math.sqrt(s); }

// 平均前方向（forward = up × right, right は左股関節→右股関節）から -Z を向かせる yaw を求める
function meanYawOffset(b, f0, f1) {
  let sx = 0, sz = 0;
  for (let f = f0; f <= f1; f += 4) {
    const p = fk(b, f, 1).pos;
    const rx = p.RightUpLeg[0]-p.LeftUpLeg[0], rz = p.RightUpLeg[2]-p.LeftUpLeg[2];
    const rl = Math.hypot(rx, rz) || 1;
    const fx = (rz/rl), fz = -(rx/rl);       // forward = up × right = (rz, 0, -rx)
    sx += fx; sz += fz;
  }
  const a = Math.atan2(sx, sz);              // 現在の前方 yaw
  return Math.PI - a;                        // これを足すと yaw = π (= -Z 向き) になる
}

function readHeader(path) {
  const text = fs.readFileSync(path, 'utf8');
  const i = text.indexOf('MOTION');
  return { header: text.slice(0, i), motion: text.slice(i) };
}
function motionLines(path) {
  const { motion } = readHeader(path);
  const lines = motion.split(/\r?\n/);
  // MOTION / Frames: / Frame Time: の3行を飛ばす
  let k = 0, seen = 0;
  while (k < lines.length && seen < 3) { if (lines[k].trim()) seen++; k++; }
  return lines.slice(k).filter(l => l.trim().length);
}

function cut(spec) {
  const src = BVH_DIR + spec.file + '.bvh';
  const b = parse(src);
  const fps = Math.round(1 / b.frameTime);
  const dec = Math.max(1, Math.round(fps / OUT_FPS));
  let f0 = spec.f0, f1 = spec.f1;

  if (spec.loop) {                        // ループ境界の微調整（±0.25s の範囲で探索）
    const R = Math.round(fps * 0.25);
    let best = null;
    for (let a = f0 - R; a <= f0 + R; a += 2) {
      if (a < 1) continue;
      const va = poseVec(b, a);
      for (let c = f1 - R; c <= f1 + R; c += 2) {
        if (c >= b.nFrames || c - a < (f1 - f0) * 0.75) continue;
        const d = poseDist(va, poseVec(b, c));
        if (!best || d < best.d) best = { a, c, d };
      }
    }
    if (best) { f0 = best.a; f1 = best.c; spec._loopErr = best.d; }
  }

  const all = motionLines(src);
  const idx = [];
  for (let f = f0; f <= f1; f += dec) idx.push(f);
  if (spec.reverse) idx.reverse();

  const p0 = fk(b, idx[0], SCALE).pos, p1 = fk(b, idx[idx.length-1], SCALE).pos;
  const meta = {
    name: spec.name,
    src: spec.file + '.bvh',
    srcFrames: [f0, f1],
    reversed: !!spec.reverse,
    loop: !!spec.loop,
    fps: fps / dec,
    frames: idx.length + 1,                                   // +1 = 先頭 T ポーズ
    duration: (idx.length - 1) / (fps / dec),
    scaleToMeters: SCALE,
    yawOffset: meanYawOffset(b, Math.min(f0,f1), Math.max(f0,f1)),
    // 区間中の腰の移動量（メートル, +Y=上）。ゲーム側の移動速度とアニメ速度の整合に使う
    rootDelta: [p1.Hips[0]-p0.Hips[0], p1.Hips[1]-p0.Hips[1], p1.Hips[2]-p0.Hips[2]],
    hipsHeightStart: p0.Hips[1],
    loopPoseError: spec._loopErr !== undefined ? +spec._loopErr.toFixed(4) : null,
  };

  const { header } = readHeader(src);
  const out = [header + 'MOTION\nFrames: ' + (idx.length + 1) +
    '\nFrame Time: ' + (1 / (fps / dec)).toFixed(7) + '\n'];
  out.push(all[0]);                     // frame 0 = T ポーズ
  for (const f of idx) out.push(all[f]);
  fs.writeFileSync(process.argv[2] + '/' + spec.name + '.bvh', out.join('\n') + '\n');
  return meta;
}

const SPECS = [
  { name: 'climb_up',    file: '13_34', f0: 201,  f1: 541,  loop: true  },
  { name: 'climb_down',  file: '13_34', f0: 881,  f1: 1245, loop: true  },
  { name: 'climb_idle',  file: '14_35', f0: 649,  f1: 865,  loop: true  },
  { name: 'wall_grab',   file: '13_34', f0: 96,   f1: 215,  loop: false },
  { name: 'mantle',      file: '81_14', f0: 1150, f1: 1355, loop: false, reverse: true },
  { name: 'hang_idle',   file: '01_14', f0: 1053, f1: 1181, loop: true  },
  { name: 'climb_drop',  file: '01_09', f0: 1540, f1: 1620, loop: false },
];

const metas = SPECS.map(cut);
fs.writeFileSync(process.argv[2] + '/manifest.json', JSON.stringify({
  note: 'CMU Graphics Lab Motion Capture Database (cgspeed Motionbuilder-friendly BVH conversion) からの抜粋',
  clips: metas
}, null, 1));
console.log('name         src        frames  dur   yawOffset(deg)  rootDelta(m)                loopErr');
for (const m of metas) console.log(
  m.name.padEnd(13) + m.src.padEnd(11) + String(m.frames).padStart(5) + '  ' + m.duration.toFixed(2) + 's  ' +
  (m.yawOffset*180/Math.PI).toFixed(1).padStart(8) + '     [' + m.rootDelta.map(v=>v.toFixed(2)).join(', ') + ']   ' + m.loopPoseError);
