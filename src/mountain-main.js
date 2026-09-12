import * as THREE from 'three';
import { loadAll } from './assets.js';
import { WallProbe, WORLD_UP } from './scene.js';
import { Character, P } from './character.js';
import { Input } from './input.js';
import { buildMountain } from './mountain-world.js';
import { loadPhotorealAssets } from './photoreal-assets.js';

const el = (id) => document.getElementById(id);
const setStatus = (s) => { el('status').textContent = s; };

/* ---------- レンダラ / シーン ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true });
// 高DPI画面でピクセル数が4倍になるのを防ぐ。実写素材の解像度は維持。
const updateRenderScale=()=>renderer.setPixelRatio(Math.min(devicePixelRatio,1.5,Math.sqrt(2600000/(innerWidth*innerHeight))));
updateRenderScale();
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb3c7cc);
scene.fog = new THREE.Fog(0xb3c7cc, 180, 1800);

scene.add(new THREE.HemisphereLight(0xd8e6ff, 0x62513c, 1.1));
const sun = new THREE.DirectionalLight(0xffedd0, 3.1);
sun.position.set(7, 9, 15);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0008;
scene.add(sun);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 3500);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  updateRenderScale();
  renderer.setSize(innerWidth, innerHeight);
});

/* ---------- 読み込み ---------- */
setStatus('読み込み中…');
const assets = await loadAll(setStatus).catch(error=>{setStatus('読み込みに失敗しました。ページを再読み込みしてください。 '+error.message);throw error;});
const photo=await loadPhotorealAssets(renderer,setStatus).catch(error=>{setStatus('景観素材の読み込みに失敗しました。 '+error.message);throw error;});
scene.background=photo.sky;scene.backgroundIntensity=.7;scene.environment=photo.environment.texture;scene.environmentIntensity=.45;
const world = buildMountain(scene,photo);
// Raycaster は matrixWorld を更新しないので、最初の 1 フレーム前に必ず確定させる
scene.updateMatrixWorld(true);
const probe = new WallProbe(world.colliders, world.climbables, world.holds);

assets.model.traverse((o) => {
  if (o.isMesh) {
    o.castShadow = true;
    o.frustumCulled = false;
    o.material = new THREE.MeshStandardMaterial({ color: 0xd8dde3, roughness: 0.65, metalness: 0.02 });
  }
});

const clips = { ...assets.builtin, ...assets.climbClips };
const character = new Character({ model: assets.model, skeleton: assets.skeleton, clips, probe, scene });
character.obj.position.set(0, 0, 7);

/* ---------- デバッグ表示 ---------- */
const debugGroup = new THREE.Group();
scene.add(debugGroup);
const limbMarkers = character.limbs.map((limb) => {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 12, 8),
    new THREE.MeshBasicMaterial({ color: limb.isHand ? 0x40c8ff : 0xffd23f }));
  m.visible = false;
  debugGroup.add(m);
  return m;
});
const surfaceHelper = new THREE.AxesHelper(0.6);
surfaceHelper.visible = false;
debugGroup.add(surfaceHelper);
let showDebug = false, overview = false, vistaPreview=new URLSearchParams(location.search).has('vista');
const collisionHelpers = world.colliders.map(m => {
  const helper=new THREE.Mesh(m.geometry,new THREE.MeshBasicMaterial({color:m.userData.climbable?0xffba66:0x62dfc0,wireframe:true,transparent:true,opacity:.55,depthTest:false}));
  helper.position.copy(m.position);helper.rotation.copy(m.rotation);helper.visible=false;scene.add(helper);return helper;
});
const routeLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(world.route.stages.flatMap(s=>s.points.map(p=>new THREE.Vector3(p[0],p[1]+.15,p[2])))),new THREE.LineBasicMaterial({color:0xffd577,depthTest:false}));
routeLine.visible=false;scene.add(routeLine);
el('map-toggle').addEventListener('click',()=>{overview=!overview;vistaPreview=false;});
el('vista-toggle').addEventListener('click',()=>{vistaPreview=!vistaPreview;overview=false;});

/* ---------- 入力 / カメラ ---------- */
const input = new Input(renderer.domElement);
let cameraYaw = 0, cameraPitch = Math.atan2(.9, 6.5);
let checkpoint = 0, finished = false, elapsed = 0, noticeUntil = 0;
const stages = world.route.stages;
function respawn() {
  const p = stages[checkpoint].points[0];
  character.mode='normal'; character.state='idle'; character.stateTime=0;
  character.position.set(p[0],p[1],p[2]-(checkpoint===0?2:0)); character.velocity.set(0,0,0);
  character.grounded=true; character.mantleCd=0.6; character.mantleData=null;
  character.airTime=0; character.fallPeakY=p[1]; character.lastFallDrop=0;
  character.snapFacing(0,-1); character.obj.quaternion.setFromAxisAngle(WORLD_UP,Math.PI);
  character.anim.play('Idle_Loop'); input.keys.clear(); input.jumpPressed=false;input.dropPressed=false;
  cameraYaw=0;
  camera.position.set(p[0],p[1]+4,p[2]+7);
  noticeUntil=elapsed+3;
}
respawn();

const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
// Pointer Lockで画面端を気にせずTPS視点を操作する。
renderer.domElement.addEventListener('click', async () => {
  if (overview || vistaPreview || document.pointerLockElement === renderer.domElement) return;
  try { await renderer.domElement.requestPointerLock(); }
  catch { el('mouse-help').textContent = 'マウス捕捉に失敗しました。画面をもう一度クリックしてください。'; }
});
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  el('mouse-help').textContent = locked ? 'マウスで視点操作 · Escで解放' : '画面をクリックしてマウスで視点操作';
  input.keys.clear(); input.jumpPressed=false; input.dropPressed=false;
});
document.addEventListener('pointerlockerror', () => {
  el('mouse-help').textContent = 'マウス捕捉に失敗しました。画面をもう一度クリックしてください。';
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement || overview) return;
  cameraYaw -= e.movementX * .0025;
  cameraPitch = THREE.MathUtils.clamp(cameraPitch + e.movementY * .0025, -.65, 1.15);
});

/* ---------- ループ ---------- */
const clock = new THREE.Clock();
let frames = 0, fpsTime = 0, fps = 0;

function frame(dt) {
  const inp = input.sample();

  if (input.consumeToggle('KeyM')) {overview=!overview;vistaPreview=false;}
  if(input.consumeToggle('KeyV')){vistaPreview=!vistaPreview;overview=false;}
  if ((overview || vistaPreview) && document.pointerLockElement === renderer.domElement) document.exitPointerLock();
  if (input.consumeToggle('KeyK')) character.ikEnabled = !character.ikEnabled;
  if (input.consumeToggle('KeyG')) { showDebug = !showDebug; surfaceHelper.visible = showDebug; }
  if (input.consumeToggle('KeyR')) {
    respawn();
  }
  if (inp.camLeft) cameraYaw += dt * 1.6;
  if (inp.camRight) cameraYaw -= dt * 1.6;

  // SneakはShiftと同時押しでも慎重な速度を優先する。
  if(inp.sneak) inp.sprint=false;
  if(!overview && !vistaPreview) character.update(dt, inp, cameraYaw);
  elapsed += dt;
  if(character.position.y < stages[checkpoint].points[0][1]-9) respawn();
  if(character.mode==='normal' && character.grounded) {
    const next=stages[checkpoint+1]?.points[0];
    if(next && Math.hypot(character.position.x-next[0],character.position.z-next[2])<3 && Math.abs(character.position.y-next[1])<.6) {
      checkpoint++;noticeUntil=elapsed+4;
    }
    if(checkpoint===3 && character.position.distanceTo(new THREE.Vector3(0,22,-63))<2.2) finished=true;
  }
  el('stage').textContent=finished?'登頂 — おつかれさまでした':stages[checkpoint].name;
  el('hint').textContent=finished?'振り返ると、歩いてきた山腹と谷が見えます。':elapsed<noticeUntil?'チェックポイントから再開できます。Rで戻る。':(checkpoint===1?'右は山頂への道。左の寄り道には谷を望む展望台があります。':stages[checkpoint].hint);
  el('altitude').textContent=Math.round(world.route.baseAltitude+character.position.y)+' m';
  el('progress').style.width=(finished?100:Math.min(96,checkpoint*28+Math.max(0,character.position.y-stages[checkpoint].points[0][1])*2))+'%';
  el('hud').style.display=showDebug?'block':'none';


  // 登攀中もマウス視点を維持し、壁との距離は遮蔽判定で調整する。
  const p = character.obj.position;
  camTarget.set(p.x, p.y + 1.4, p.z);
  const cameraDistance = character.mode === 'climb' ? 4.5 : 6.56;
  const horizontalDistance = Math.cos(cameraPitch) * cameraDistance;
  camPos.set(
    camTarget.x + Math.sin(cameraYaw) * horizontalDistance,
    camTarget.y + Math.sin(cameraPitch) * cameraDistance,
    camTarget.z + Math.cos(cameraYaw) * horizontalDistance);
  // 地形を透過しないよう、視点までの線分を短くする。
  const cameraDirection=camPos.clone().sub(camTarget);
  const obstruction=probe.cast(camTarget,cameraDirection.clone().normalize(),cameraDirection.length(),world.cameraTargets);
  if(obstruction) camPos.copy(camTarget).addScaledVector(cameraDirection.normalize(),Math.max(.6,obstruction.distance-.25));
  camera.position.lerp(camPos, Math.min(1, dt * 4.5));
  camera.lookAt(camTarget);
  sun.position.set(p.x + 7, p.y + 9, p.z + 15);
  sun.target.position.copy(p);
  sun.target.updateMatrixWorld();

  // デバッグ表示
  for (let i = 0; i < limbMarkers.length; i++) {
    limbMarkers[i].visible = showDebug && character.mode === 'climb' && character.ikEnabled;
    limbMarkers[i].position.copy(character.limbs[i].pos);
  }
  if (showDebug && character.mode === 'climb') {
    character.surface.worldFromUV(character.anchor.x, character.anchor.y, surfaceHelper.position);
    character.surface.lookQuaternion(surfaceHelper.quaternion);
  }

  for(const helper of collisionHelpers)helper.visible=showDebug;
  routeLine.visible=showDebug||overview;
  // 展望モードは、ゲーム用の道・道標・当たり判定表示を隠して
  // Blender/DEMの景観だけを一枚の構図として見せる。
  for(const object of world.vistaHide)object.visible=!vistaPreview;
  if(overview){camera.position.set(-70,65,64);camera.lookAt(0,-8,-30);}
  el('map-toggle').textContent=overview?'登山に戻る [M]':'山全体を見る [M]';
  if(vistaPreview){
    camera.position.set(-16,6.7,-17);
    // DEMの稜線を地平線の少し上へ置く。低すぎる注視点は展望台の床だけを
    // 大きく映してしまい、谷と主稜線の奥行きが消える。
    camera.lookAt(-16-Math.sin(world.vista.yaw)*1000,world.vista.targetY??70,-17-Math.cos(world.vista.yaw)*1000);
  }
  el('vista-toggle').textContent=vistaPreview?'登山へ戻る [V]':'展望を見る [V]';
  el('journey').style.display=vistaPreview?'none':'';
  el('help').style.display=vistaPreview?'none':'';
  renderer.render(scene, camera);

  frames++; fpsTime += dt;
  if (fpsTime > 0.5) { fps = frames / fpsTime; frames = 0; fpsTime = 0; }
  const d = character.debugInfo();
  el('hud').innerHTML =
    `<b>${d.mode.toUpperCase()}</b> / ${d.state} &nbsp;<span class="dim">clip:</span> ${d.clip}<br>` +
    `pos ${d.pos.x.toFixed(2)}, ${d.pos.y.toFixed(2)}, ${d.pos.z.toFixed(2)}` +
    (d.mode === 'climb' ? ` &nbsp;<span class="dim">uv</span> ${d.anchor.x.toFixed(2)}, ${d.anchor.y.toFixed(2)}${d.atBottom ? ' (bottom)' : ''}` : '') + '<br>' +
    `IK ${character.ikEnabled ? 'ON' : 'OFF'} w=${d.ik} &nbsp; 掴み替え ${d.reaches} &nbsp; raycast ${d.casts} &nbsp; 落下 ${d.fallDrop.toFixed(1)}m 滞空 ${d.airTime.toFixed(2)}s<br>` +
    // 体の向きと進行方向のズレ。90 度を超えると「モーションが前後逆」に見える
    `<span class="${d.facingErr > 90 ? 'ng' : 'dim'}">向きズレ ${d.facingErr.toFixed(0)}°` +
    (d.facingViolations ? ` / 逆再生 ${d.facingViolations} 回` : '') + '</span><br>' +
    `<span class="dim">${fps.toFixed(0)} fps · ${(renderer.info.render.triangles/1000).toFixed(0)}K tris · ${renderer.info.render.calls} draws · DPR ${renderer.getPixelRatio().toFixed(2)}</span>`;
}

// 非表示中は描画とシミュレーションを休止。復帰時に経過時間を捨てる。
renderer.setAnimationLoop(() => {
  if(document.hidden)return;
  frame(Math.min(clock.getDelta(),1/20));
});
document.addEventListener('visibilitychange',()=>{
  clock.getDelta();
  if(document.hidden){input.keys.clear();input.jumpPressed=false;input.dropPressed=false;}
});
// 初期画面と明示的なテスト用stepは、非表示タブでも1回ずつ描画できる。
frame(1/60);

setStatus('');
el('overlay').classList.add('ready');

// --- 自動検証用の外部 API（requestAnimationFrame が止まる環境でも進められる）---
window.__mountainProto = {
  character, probe, world, assets, clips, camera, scene, input, P,
  respawn, get progress(){return {checkpoint,finished,elapsed};},
  step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) frame(dt); },
  press(...codes) { for (const c of codes) input.inject(c, true); },
  release(...codes) { for (const c of codes) input.inject(c, false); },
  releaseAll() { input.keys.clear(); },
  tap(code) { input.inject(code, true); input.inject(code, false); },
  view(x, y, z, tx, ty, tz) { camera.position.set(x, y, z); camera.lookAt(tx, ty, tz); renderer.render(scene, camera); },
  setCameraYaw(y) { cameraYaw = y; },
  hideUI() { el('hud').style.display = 'none'; el('help').style.display = 'none'; },
  showUI() { el('hud').style.display = ''; el('help').style.display = ''; },
  toggleDebug(v) { showDebug = v; surfaceHelper.visible = v; },
};
window.__ready = true;

if(new URLSearchParams(location.search).has('test')) import('../debug/mountain-test.js');
