// 依存なしの最小 BVH パーサ + FK。three.js の BVHLoader と同じ軸解釈（Y-up, 度, ZYX順適用）に合わせる。
const fs = require('fs');

function parse(path) {
  const text = fs.readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/);
  let i = 0;
  const nodes = [];              // フラット配列（親index付き）
  function parseJoint(parentIdx) {
    // 現在行: "ROOT name" / "JOINT name" / "End Site"
    let tok = lines[i].trim().split(/\s+/);
    const isEnd = tok[0] === 'End';
    const name = isEnd ? nodes[parentIdx].name + '_EndSite' : tok.slice(1).join('_');
    const node = { name, parent: parentIdx, offset: [0,0,0], channels: [], children: [], isEnd };
    const idx = nodes.length; nodes.push(node);
    if (parentIdx >= 0) nodes[parentIdx].children.push(idx);
    i++;
    if (lines[i].trim() !== '{') throw new Error('expected { at line ' + i);
    i++;
    for (;;) {
      const t = lines[i].trim().split(/\s+/);
      if (t[0] === 'OFFSET') { node.offset = [ +t[1], +t[2], +t[3] ]; i++; }
      else if (t[0] === 'CHANNELS') { node.channels = t.slice(2); i++; }
      else if (t[0] === 'JOINT' || t[0] === 'End') { parseJoint(idx); }
      else if (t[0] === '}') { i++; return idx; }
      else i++;
    }
  }
  while (lines[i].trim() !== 'HIERARCHY') i++;
  i++;
  parseJoint(-1);
  while (!/^MOTION/.test(lines[i].trim())) i++;
  i++;
  const nFrames = parseInt(lines[i].trim().split(/\s+/)[1], 10); i++;
  const frameTime = parseFloat(lines[i].trim().split(/\s+/)[2]); i++;
  const nChan = nodes.reduce((s, n) => s + n.channels.length, 0);
  const data = new Float32Array(nFrames * nChan);
  let f = 0;
  for (; f < nFrames && i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    const v = l.split(/\s+/);
    for (let c = 0; c < nChan; c++) data[f * nChan + c] = +v[c];
    f++;
  }
  return { nodes, nFrames: f, frameTime, nChan, data, headerEnd: null, path };
}

const D2R = Math.PI / 180;
function mulMat(a, b, out) { // 4x4 row-major, out = a*b
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[r*4+k] * b[k*4+c];
    out[r*4+c] = s;
  }
  return out;
}
function rotMat(axis, deg, m) {
  const a = deg * D2R, s = Math.sin(a), c = Math.cos(a);
  m.fill(0); m[15] = 1;
  if (axis === 'X') { m[0]=1; m[5]=c; m[6]=-s; m[9]=s; m[10]=c; }
  else if (axis === 'Y') { m[5]=1; m[0]=c; m[2]=s; m[8]=-s; m[10]=c; }
  else { m[10]=1; m[0]=c; m[1]=-s; m[4]=s; m[5]=c; }
  return m;
}

// フレーム f のワールド座標を返す（{name: [x,y,z]}）
function fk(bvh, f, scale = 1) {
  const { nodes, nChan, data } = bvh;
  const base = f * nChan;
  const out = {};
  const world = new Array(nodes.length);
  let ch = 0;
  const tmp = new Float32Array(16), tmp2 = new Float32Array(16), rm = new Float32Array(16);
  const chanOffsets = [];
  for (const n of nodes) { chanOffsets.push(ch); ch += n.channels.length; }
  for (let k = 0; k < nodes.length; k++) {
    const n = nodes[k];
    const local = new Float32Array([1,0,0,n.offset[0]*scale, 0,1,0,n.offset[1]*scale, 0,0,1,n.offset[2]*scale, 0,0,0,1]);
    let co = chanOffsets[k];
    // 位置チャンネル
    for (let c = 0; c < n.channels.length; c++) {
      const name = n.channels[c], v = data[base + co + c];
      if (name === 'Xposition') local[3] += v * scale;
      else if (name === 'Yposition') local[7] += v * scale;
      else if (name === 'Zposition') local[11] += v * scale;
    }
    // 回転（チャンネル列挙順に右から掛ける = ZYX順記載なら Rz*Ry*Rx）
    let acc = null;
    for (let c = 0; c < n.channels.length; c++) {
      const name = n.channels[c], v = data[base + co + c];
      if (!/rotation$/.test(name)) continue;
      rotMat(name[0], v, rm);
      if (!acc) { acc = new Float32Array(rm); }
      else { const r = new Float32Array(16); mulMat(acc, rm, r); acc = r; }
    }
    if (acc) { mulMat(local, acc, tmp); local.set(tmp); }
    const w = new Float32Array(16);
    if (n.parent < 0) w.set(local); else mulMat(world[n.parent], local, w);
    world[k] = w;
    out[n.name] = [w[3], w[7], w[11]];
  }
  return { pos: out, world, nodes };
}

module.exports = { parse, fk };
