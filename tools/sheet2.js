const { parse, fk } = require('./bvh.js');
const fs = require('fs');
const SCALE = 0.052;
const BONES = [['Hips','LowerBack'],['LowerBack','Spine'],['Spine','Spine1'],['Spine1','Neck'],['Neck','Neck1'],['Neck1','Head'],
 ['Spine1','LeftShoulder'],['LeftShoulder','LeftArm'],['LeftArm','LeftForeArm'],['LeftForeArm','LeftHand'],
 ['Spine1','RightShoulder'],['RightShoulder','RightArm'],['RightArm','RightForeArm'],['RightForeArm','RightHand'],
 ['Hips','LHipJoint'],['LHipJoint','LeftUpLeg'],['LeftUpLeg','LeftLeg'],['LeftLeg','LeftFoot'],['LeftFoot','LeftToeBase'],
 ['Hips','RHipJoint'],['RHipJoint','RightUpLeg'],['RightUpLeg','RightLeg'],['RightLeg','RightFoot'],['RightFoot','RightToeBase']];
const LEFT = new Set(['LeftShoulder','LeftArm','LeftForeArm','LeftHand','LHipJoint','LeftUpLeg','LeftLeg','LeftFoot','LeftToeBase']);
const segs = JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const outDir = process.argv[3];
const N = 8, CW = 128, CH = 250, PAD = 3;
const cache = {};
const index = [];
for (const s of segs) {
  const file = (process.env.CMU_BVH_DIR || './cmu-bvh/') + s.file + '.bvh';
  const b = cache[file] || (cache[file] = parse(file));
  const frames = []; for (let k=0;k<N;k++) frames.push(Math.round(s.f0 + (s.f1-s.f0)*k/(N-1)));
  const all = frames.map(f => fk(b,f,SCALE).pos);
  const flat = []; for (const p of all) for (const k in p) flat.push(p[k]);
  const minY=Math.min(...flat.map(v=>v[1])), maxY=Math.max(...flat.map(v=>v[1]));
  const cx=(Math.min(...flat.map(v=>v[0]))+Math.max(...flat.map(v=>v[0])))/2;
  const cz=(Math.min(...flat.map(v=>v[2]))+Math.max(...flat.map(v=>v[2])))/2;
  const sc=(CH-34)/Math.max(1.3,maxY-minY);
  let svg='', y0=0;
  for (let view=0; view<2; view++) {
    svg += `<text x="4" y="${y0+12}" font-size="12" fill="#111">${s.label} ${s.file}[${s.f0}-${s.f1}] ${view?'FRONT(X-Y)':'SIDE(Z-Y)'}</text>`;
    frames.forEach((f,k)=>{
      const p=all[k], ox=4+k*(CW+PAD), oy=y0+18;
      const px=j=>ox+CW/2+((view?(p[j][0]-cx):(p[j][2]-cz))*sc)*(view?1:-1);
      const py=j=>oy+(CH-34)-(p[j][1]-minY)*sc;
      const gy=oy+(CH-34)+minY*sc;
      svg+=`<rect x="${ox}" y="${oy}" width="${CW}" height="${CH-28}" fill="#fff" stroke="#ddd"/>`;
      if(gy>oy&&gy<oy+CH-28) svg+=`<line x1="${ox}" y1="${gy.toFixed(1)}" x2="${ox+CW}" y2="${gy.toFixed(1)}" stroke="#8bc" stroke-dasharray="3 3"/>`;
      for(const [a,c] of BONES){ if(!p[a]||!p[c])continue;
        const col=LEFT.has(c)?'#e33':(c==='Head'||c==='Neck'||c==='Neck1'?'#333':'#37c');
        svg+=`<line x1="${px(a).toFixed(1)}" y1="${py(a).toFixed(1)}" x2="${px(c).toFixed(1)}" y2="${py(c).toFixed(1)}" stroke="${col}" stroke-width="2.6" stroke-linecap="round"/>`;}
      for(const j of ['LeftHand','RightHand','LeftFoot','RightFoot'])
        svg+=`<circle cx="${px(j).toFixed(1)}" cy="${py(j).toFixed(1)}" r="3.2" fill="${j.startsWith('Left')?'#e33':'#37c'}"/>`;
      svg+=`<text x="${ox+3}" y="${oy+CH-32}" font-size="9" fill="#aaa">${f}</text>`;
    });
    y0+=CH+4;
  }
  const W=4+N*(CW+PAD)+4;
  const name='seg_'+s.label+'.svg';
  fs.writeFileSync(outDir+'/'+name, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y0+6}" viewBox="0 0 ${W} ${y0+6}"><rect width="100%" height="100%" fill="#f6f7f9"/><g font-family="monospace">${svg}</g></svg>`);
  index.push({name,label:s.label,w:W,h:y0+6});
}
fs.writeFileSync(outDir+'/index.json', JSON.stringify(index,null,1));
// 2区間ずつ並べたHTML
for(let i=0;i<index.length;i+=2){
  const g=index.slice(i,i+2);
  fs.writeFileSync(outDir+`/p${i/2}.html`, `<!doctype html><meta charset=utf-8><title>p${i/2}</title><body style="margin:0;background:#f6f7f9">`+g.map(x=>`<img src="${x.name}" width="${x.w}" height="${x.h}" style="display:block">`).join(''));
}
console.log('wrote', index.length, 'segments,', Math.ceil(index.length/2), 'pages');
