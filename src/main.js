import * as THREE from 'three';
import { loadAll } from './assets.js';
import { buildTestScene, WallProbe, WORLD_UP } from './scene.js';
import { Character, P } from './character.js';
import { Input } from './input.js';

const el = (id) => document.getElementById(id);
const setStatus = (s) => { el('status').textContent = s; };

/* ---------- レンダラ / シーン ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fa6c4);
scene.fog = new THREE.Fog(0x8fa6c4, 30, 90);

scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x4a4436, 1.5));
const sun = new THREE.DirectionalLight(0xfff2dc, 2.4);
sun.position.set(7, 9, 15);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0008;
scene.add(sun);

const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.05, 200);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ---------- 読み込み ---------- */
setStatus('読み込み中…');
const assets = await loadAll(setStatus);
const world = buildTestScene(scene);
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
character.obj.position.set(0, 0, -3.2);

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
let showDebug = false;

/* ---------- 入力 / カメラ ---------- */
const input = new Input(renderer.domElement);
let cameraYaw = 0;
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
let dragging = false, lastX = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; });
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointermove', (e) => {
  if (!dragging) return;
  cameraYaw -= (e.clientX - lastX) * 0.006;
  lastX = e.clientX;
});

/* ---------- ループ ---------- */
const clock = new THREE.Clock();
let frames = 0, fpsTime = 0, fps = 0;

function frame(dt) {
  const inp = input.sample();

  if (input.consumeToggle('KeyK')) character.ikEnabled = !character.ikEnabled;
  if (input.consumeToggle('KeyG')) { showDebug = !showDebug; surfaceHelper.visible = showDebug; }
  if (input.consumeToggle('KeyR')) {
    character.mode = 'normal'; character.state = 'idle';
    character.obj.position.set(0, 0, -3.2); character.velocity.set(0, 0, 0); character.mantleCd = 0;
  }
  if (inp.camLeft) cameraYaw += dt * 1.6;
  if (inp.camRight) cameraYaw -= dt * 1.6;

  character.update(dt, inp, cameraYaw);

  // カメラ: 壁に貼り付いているときは壁の外側から見る
  const p = character.obj.position;
  camTarget.set(p.x, p.y + 1.15, p.z);
  if (character.mode === 'climb') {
    const n = character.surface.normal;
    camPos.copy(camTarget).addScaledVector(n, 4.4).addScaledVector(WORLD_UP, 0.8);
  } else {
    camPos.set(
      camTarget.x + Math.sin(cameraYaw) * 5.0,
      camTarget.y + 2.1,
      camTarget.z + Math.cos(cameraYaw) * 5.0);
  }
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
    `<span class="dim">${fps.toFixed(0)} fps</span>`;
}

/**
 * 通常は requestAnimationFrame で駆動する。
 * ただしタブ / Browser パネルが非表示だと rAF は発火しない（document.hidden === true）ため、
 * 一定時間 rAF が来ていなければ setInterval 側から進める。これで表示状態に関係なく動く。
 */
let lastTick = performance.now();
function tick(dt) {
  lastTick = performance.now();
  frame(Math.min(dt, 1 / 20));
}
renderer.setAnimationLoop(() => tick(clock.getDelta()));

const FALLBACK_HZ = 30;
window.__fallbackTicks = 0;
(function fallbackLoop() {
  setTimeout(fallbackLoop, 1000 / FALLBACK_HZ);
  const now = performance.now();
  if (now - lastTick < 200) return;          // rAF が生きているなら何もしない
  const dt = Math.min((now - lastTick) / 1000, 1 / FALLBACK_HZ);
  clock.getDelta();                          // clock を進めておく（次の rAF で巨大な dt にしない）
  window.__fallbackTicks++;
  tick(dt);
})();

setStatus('');
el('overlay').classList.add('ready');

// --- 自動検証用の外部 API（requestAnimationFrame が止まる環境でも進められる）---
window.__proto = {
  character, probe, world, assets, clips, camera, scene, input, P,
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
