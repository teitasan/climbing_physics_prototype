const { parse, fk } = require('./bvh.js');
const SCALE = 0.052;

function smooth(arr, key, halfWin) {
  const out = new Float64Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - halfWin); j <= Math.min(arr.length - 1, i + halfWin); j++) { s += arr[j][key]; n++; }
    out[i] = s / n;
  }
  for (let i = 0; i < arr.length; i++) arr[i][key + 'S'] = out[i];
}

function features(file) {
  const b = parse(file);
  const fps = Math.round(1 / b.frameTime);
  const step = Math.max(1, Math.round(fps / 30)); const shz = fps / step;
  const rows = [];
  for (let i = 1; i < b.nFrames; i += step) {
    const p = fk(b, i, SCALE).pos;
    // 骨盤の右方向（左股関節→右股関節）で体の左右軸を得る
    const rx = p.RightUpLeg[0] - p.LeftUpLeg[0], rz = p.RightUpLeg[2] - p.LeftUpLeg[2];
    const rl = Math.hypot(rx, rz) || 1;
    rows.push({ f: i, t: i / fps,
      hy: p.Hips[1], hx: p.Hips[0], hz: p.Hips[2],
      rgx: rx / rl, rgz: rz / rl,
      lhy: p.LeftHand[1], rhy: p.RightHand[1],
      lfy: p.LeftFoot[1], rfy: p.RightFoot[1], hd: p.Head[1] });
  }
  const groundY = Math.min(...rows.map(r => Math.min(r.lfy, r.rfy)));
  for (const r of rows) {
    r.feetUp = Math.min(r.lfy, r.rfy) - groundY;
    r.hangSpan = ((r.lhy + r.rhy) / 2) - r.hy;
  }
  const HW = Math.round(shz * 0.35);            // ±0.35s 平滑
  smooth(rows, 'hy', HW); smooth(rows, 'hx', HW); smooth(rows, 'hz', HW);
  smooth(rows, 'feetUp', HW); smooth(rows, 'hangSpan', HW);
  const W = Math.round(shz * 0.4);
  for (let k = 0; k < rows.length; k++) {
    const a = rows[Math.max(0, k - W)], c = rows[Math.min(rows.length - 1, k + W)];
    const dt = c.t - a.t || 1;
    rows[k].vy = (c.hyS - a.hyS) / dt;
    const dx = (c.hxS - a.hxS) / dt, dz = (c.hzS - a.hzS) / dt;
    rows[k].vh = Math.hypot(dx, dz);
    rows[k].vlat = dx * rows[k].rgx + dz * rows[k].rgz;   // + = 体の右へ
  }
  return { b, fps, rows, groundY, shz };
}

function runs(rows, pred, minSec, gapSec, shz) {
  const gap = Math.round(shz * gapSec);
  const flags = rows.map(pred);
  // ギャップ埋め
  for (let k = 0; k < flags.length; k++) if (!flags[k]) {
    let e = k; while (e < flags.length && !flags[e]) e++;
    if (k > 0 && e < flags.length && e - k <= gap) for (let j = k; j < e; j++) flags[j] = true;
    k = e - 1;
  }
  const out = []; let s = -1;
  for (let k = 0; k <= flags.length; k++) {
    const ok = k < flags.length && flags[k];
    if (ok && s < 0) s = k;
    if (!ok && s >= 0) {
      const dur = rows[k - 1].t - rows[s].t;
      if (dur >= minSec) out.push({ i0: s, i1: k - 1, f0: rows[s].f, f1: rows[k - 1].f, dur });
      s = -1;
    }
  }
  return out;
}

const LABELS = [
  ['ClimbUp',    r => r.vy >  0.15 && r.feetUpS > 0.12, 0.8],
  ['ClimbDown',  r => r.vy < -0.15 && r.feetUpS > 0.12, 0.8],
  ['ClimbIdle',  r => Math.abs(r.vy) < 0.07 && r.vh < 0.09 && r.feetUpS > 0.30, 1.0],
  ['HangFree',   r => r.feetUpS > 0.5 && r.hangSpanS > 0.55, 0.6],
  ['TravR',      r => r.vlat >  0.14 && Math.abs(r.vy) < 0.15 && r.feetUpS > 0.25, 0.5],
  ['TravL',      r => r.vlat < -0.14 && Math.abs(r.vy) < 0.15 && r.feetUpS > 0.25, 0.5],
];

for (const file of process.argv.slice(2)) {
  const { b, fps, rows, groundY, shz } = features(file);
  console.log('\n===== ' + file.split('/').pop() + '  ' + b.nFrames + 'f @' + fps + 'fps groundY=' + groundY.toFixed(2));
  for (const [label, pred, minSec] of LABELS) {
    const rs = runs(rows, pred, minSec, 0.3, shz);
    if (!rs.length) continue;
    console.log('  ' + label.padEnd(9) + rs.map(r => {
      const m = rows[Math.round((r.i0 + r.i1) / 2)];
      const dy = rows[r.i1].hyS - rows[r.i0].hyS;
      return `[${r.f0}-${r.f1}]${r.dur.toFixed(1)}s y${rows[r.i0].hyS.toFixed(2)}->${rows[r.i1].hyS.toFixed(2)} feet${m.feetUpS.toFixed(2)}`;
    }).join('  '));
  }
}
