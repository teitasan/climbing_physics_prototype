// 壁/梯子上で「ほぼ静止」している最長窓を探す（ClimbIdle / Hang 用）
const { parse, fk } = require('./bvh.js');
const SCALE=0.052;
for (const file of process.argv.slice(2)) {
  const b=parse(file), fps=Math.round(1/b.frameTime), step=4, shz=fps/step;
  const R=[];
  for(let f=1;f<b.nFrames;f+=step){
    const p=fk(b,f,SCALE).pos;
    const rx=p.RightUpLeg[0]-p.LeftUpLeg[0], rz=p.RightUpLeg[2]-p.LeftUpLeg[2];
    R.push({f, hy:p.Hips[1], hx:p.Hips[0], hz:p.Hips[2], yaw:Math.atan2(rz,rx)*180/Math.PI,
            fy:Math.min(p.LeftFoot[1],p.RightFoot[1]), hand:(p.LeftHand[1]+p.RightHand[1])/2,
            wristSpread:Math.abs(p.LeftHand[0]-p.RightHand[0])});
  }
  const g=Math.min(...R.map(r=>r.fy));
  // 移動窓で分散をみる
  const win=Math.round(shz*0.6);
  let best=[];
  for(let i=0;i+win<R.length;i++){
    const s=R.slice(i,i+win);
    const dy=Math.max(...s.map(r=>r.hy))-Math.min(...s.map(r=>r.hy));
    const dxz=Math.max(...s.map(r=>Math.hypot(r.hx-s[0].hx,r.hz-s[0].hz)));
    const dyaw=Math.max(...s.map(r=>r.yaw))-Math.min(...s.map(r=>r.yaw));
    const feetUp=Math.min(...s.map(r=>r.fy))-g;
    if(dy<0.05&&dxz<0.06&&dyaw<14&&feetUp>0.18) best.push({i,f0:s[0].f,f1:s[s.length-1].f,hy:s[0].hy,feetUp,hand:s[0].hand,yaw:s[0].yaw});
  }
  // 連結
  const merged=[];
  for(const b2 of best){ const last=merged[merged.length-1];
    if(last&&b2.f0<=last.f1+8){ last.f1=b2.f1; } else merged.push({...b2}); }
  console.log('\n== '+file.split('/').pop()+'  groundY='+g.toFixed(2));
  for(const m of merged.filter(m=>m.f1-m.f0>=Math.round(fps*0.5)))
    console.log(`   [${m.f0}-${m.f1}] ${((m.f1-m.f0)/fps).toFixed(1)}s hipsY=${m.hy.toFixed(2)} feetUp=${m.feetUp.toFixed(2)} handY=${m.hand.toFixed(2)} yaw=${m.yaw.toFixed(0)}`);
}
