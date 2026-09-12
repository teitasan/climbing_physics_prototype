import * as THREE from 'three';
import {OrbitControls} from 'three/jsm/controls/OrbitControls.js';
import {RGBELoader} from 'three/jsm/loaders/RGBELoader.js';
import {loadAll} from './assets.js';
import {WallProbe} from './scene.js';
import {Character,P} from './character.js';
import {Input} from './input.js';
import {buildShiramine} from './shiramine-world.js';

const el=id=>document.getElementById(id),status=s=>el('status').textContent=s;
const query=new URLSearchParams(location.search);
const debugMode=query.has('debug')||query.has('test');
const requestedWalkSpeed=Number(query.get('walkSpeed'));
if(query.has('walkSpeed')&&Number.isFinite(requestedWalkSpeed))P.walkSpeed=THREE.MathUtils.clamp(requestedWalkSpeed,P.walkSpeedMin,P.walkSpeedMax);
async function start(){
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.domElement.setAttribute('aria-label','白峰の登山ゲーム');document.body.prepend(renderer.domElement);
 let quality=1;const resize=()=>{renderer.setPixelRatio(Math.min(devicePixelRatio,quality,Math.sqrt(1900000/(innerWidth*innerHeight))));renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();};
 const scene=new THREE.Scene();scene.background=new THREE.Color(0xaac3d3);scene.fog=new THREE.FogExp2(0xaac3d3,.00045);
 const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.08,6500);resize();addEventListener('resize',resize);
 scene.add(new THREE.HemisphereLight(0xddeaff,0x69715e,1.6));
 const sun=new THREE.DirectionalLight(0xffecd0,2.7);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-16,right:16,top:16,bottom:-16,near:1,far:110});sun.shadow.bias=-.0003;scene.add(sun,sun.target);
 const [world,assets]=await Promise.all([buildShiramine(scene,status),loadAll(status)]);
 // Sky is optional: a failed HDR must not prevent loading the playable map.
 try{const sky=await new RGBELoader().loadAsync('./assets/environment/sky/sky.hdr');sky.mapping=THREE.EquirectangularReflectionMapping;const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromEquirectangular(sky).texture;scene.environmentIntensity=.3;scene.background=sky;scene.backgroundIntensity=.7;pmrem.dispose();}catch{ /* retain the sky color */ }
 const probe=new WallProbe(world.colliders,world.climbables,[]);probe.ray.firstHitOnly=true;
 assets.model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.material=new THREE.MeshStandardMaterial({color:0xd49150,roughness:.8});}});
 const character=new Character({model:assets.model,skeleton:assets.skeleton,clips:{...assets.builtin,...assets.climbClips},probe,scene});character.ikEnabled=false;
 const input=new Input(renderer.domElement),points=world.route.points,checkpoints=world.route.checkpoints;
 // ローカルの debug/test URL では、姿勢・接地点の確認をコンソールから行えるようにする。
 // 本番 URL では参照を公開しない。
 if(debugMode)window.__shiramineDebug={character,input,world,points,checkpoints};
 let checkpoint=0,finished=false,overview=false,yaw=0,pitch=.19,zoom=7,noticeTime=0,elapsed=0,nearest=0,testing=false;
 const orbit=new OrbitControls(camera,renderer.domElement);orbit.enabled=false;orbit.maxDistance=5000;orbit.minDistance=10;orbit.maxPolarAngle=Math.PI*.48;
 const cumulative=[0];for(let i=1;i<points.length;i++)cumulative.push(cumulative[i-1]+points[i].distanceTo(points[i-1]));
 const message=text=>{el('notice').textContent=text;noticeTime=4;el('notice').style.opacity=1;};
 function respawn(){
  const p=checkpoints[checkpoint].position;character.mode='normal';character.state='idle';character.stateTime=0;character.grounded=true;character.velocity.set(0,0,0);character.obj.position.copy(p);character.mantleCd=1;
  nearest=checkpoints[checkpoint].index;const next=points[Math.min(points.length-1,nearest+3)];yaw=Math.atan2(-(next.x-p.x),-(next.z-p.z));character.facing=yaw;character.obj.rotation.set(0,yaw,0);
  camera.position.copy(p).add(new THREE.Vector3(Math.sin(yaw)*zoom,2.8,Math.cos(yaw)*zoom));input.keys.clear();input.jumpPressed=false;input.dropPressed=false;
 }
 function toggleMap(){overview=!overview;orbit.enabled=overview;fallbackMouse=null;if(overview&&document.pointerLockElement===renderer.domElement)document.exitPointerLock();if(overview){orbit.target.copy(points[Math.floor(points.length*.5)]).add(new THREE.Vector3(0,70,0));camera.position.copy(orbit.target).add(new THREE.Vector3(-600,650,-650));orbit.update();}else respawnCamera();el('map-toggle').textContent=overview?'登山に戻る [M]':'全体を見る [M]';}
 function respawnCamera(){const p=character.position;camera.position.copy(p).add(new THREE.Vector3(Math.sin(yaw)*zoom,2.8,Math.cos(yaw)*zoom));}
 el('map-toggle').onclick=toggleMap;el('respawn').onclick=()=>{respawn();message('チェックポイントから再開');};
 el('quality').onclick=()=>{quality=quality===1?.7:1;renderer.shadowMap.enabled=quality===1;resize();el('quality').textContent=quality===1?'画質：標準':'画質：軽量';};
 const speedPanel=el('speed-debug');
 if(speedPanel&&debugMode){
  speedPanel.hidden=false;
  const slider=el('walk-speed'),value=el('walk-speed-value'),reset=el('walk-speed-reset');
  slider.min=P.walkSpeedMin;slider.max=P.walkSpeedMax;slider.step=.1;
  const applyWalkSpeed=raw=>{P.walkSpeed=THREE.MathUtils.clamp(Number(raw),P.walkSpeedMin,P.walkSpeedMax);slider.value=P.walkSpeed.toFixed(1);value.textContent=P.walkSpeed.toFixed(1)+' m/s';};
  slider.addEventListener('input',()=>applyWalkSpeed(slider.value));
  reset.onclick=()=>applyWalkSpeed(P.walkSpeedDefault);
  applyWalkSpeed(P.walkSpeed);
 }
 // Pointer Lockで画面端を気にせずTPS視点を操作する。非対応環境では
 // キャンバス内のマウス移動量へフォールバックする。
 let fallbackMouse=null,pointerLockRequested=false;
 const applyMouseDelta=(dx,dy)=>{yaw-=dx*.0025;pitch=THREE.MathUtils.clamp(pitch+dy*.0025,-.65,1.15);};
 renderer.domElement.addEventListener('click',async()=>{
  if(overview||document.pointerLockElement===renderer.domElement)return;
  pointerLockRequested=true;
  try{await renderer.domElement.requestPointerLock();}
  catch{pointerLockRequested=false;el('mouse-help').textContent='マウスで視点操作（画面内）';}
 });
 document.addEventListener('pointerlockchange',()=>{
  const locked=document.pointerLockElement===renderer.domElement;
  pointerLockRequested=false;fallbackMouse=null;
  el('mouse-help').textContent=locked?'マウスで視点操作 · Escで解放':'マウスで視点操作（クリックで自由移動）';
  input.keys.clear();input.jumpPressed=false;input.dropPressed=false;
 });
 document.addEventListener('pointerlockerror',()=>{
  if(pointerLockRequested)el('mouse-help').textContent='マウスで視点操作（画面内）';
  pointerLockRequested=false;fallbackMouse=null;
 });
 document.addEventListener('mousemove',e=>{
  if(document.pointerLockElement!==renderer.domElement||overview)return;
  applyMouseDelta(e.movementX,e.movementY);
 });
 renderer.domElement.addEventListener('pointermove',e=>{
  if(overview||document.pointerLockElement===renderer.domElement)return;
  if(fallbackMouse){applyMouseDelta(e.clientX-fallbackMouse.x,e.clientY-fallbackMouse.y);}
  fallbackMouse={x:e.clientX,y:e.clientY};
 });
 renderer.domElement.addEventListener('pointerleave',()=>{fallbackMouse=null;});
 renderer.domElement.addEventListener('wheel',e=>{if(overview)return;e.preventDefault();zoom=THREE.MathUtils.clamp(zoom+e.deltaY*.008,3,15);},{passive:false});
 const map=el('map'),ctx=map.getContext('2d');const box=new THREE.Box3().setFromPoints(points);box.expandByScalar(45);const span=Math.max(box.max.x-box.min.x,box.max.z-box.min.z),xy=p=>[25+(p.x-box.min.x)/span*370,395-(p.z-box.min.z)/span*370];
 function drawMap(){ctx.clearRect(0,0,420,420);ctx.lineWidth=3;ctx.strokeStyle='#617279';ctx.beginPath();points.forEach((p,i)=>{const [x,y]=xy(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();ctx.strokeStyle='#e8bc62';ctx.beginPath();points.slice(0,nearest+1).forEach((p,i)=>{const [x,y]=xy(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();checkpoints.forEach((c,i)=>{const [x,y]=xy(c.position);ctx.fillStyle=i<=checkpoint?'#eac777':'#a2b7bc';ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();ctx.font='20px system-ui';ctx.fillText(i===4?'東峰':String(i+1),x+10,y+5);});const [x,y]=xy(character.position);ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-Math.sin(yaw)*19,y+Math.cos(yaw)*19);ctx.stroke();}
 const target=new THREE.Vector3(),camPos=new THREE.Vector3(),direction=new THREE.Vector3();
 let fpsFrames=0,fpsTime=0,fps=0,lastHud=0;
 function update(dt){
  // debug URL の autowalk は、急斜面のモーションを連続確認するための自動入力。
  if(query.has('autowalk'))input.inject('KeyW',true);
  const inp=input.sample();if(input.consumeToggle('KeyM'))toggleMap();if(input.consumeToggle('KeyR'))respawn();
  if(inp.camLeft)yaw+=dt*1.5;if(inp.camRight)yaw-=dt*1.5;
  if(!overview)character.update(dt,inp,yaw);elapsed+=dt;
  if(!Number.isFinite(character.position.y)||character.position.y < -100 || character.fallDrop>16&&character.grounded){respawn();message('滑落しました。チェックポイントから再開');}
  if(!overview){
   const p=character.position;const searchStart=Math.max(0,nearest-15),searchEnd=Math.min(points.length,nearest+40);let best=Infinity;for(let i=searchStart;i<searchEnd;i++){const d=p.distanceToSquared(points[i]);if(d<best){best=d;nearest=i;}}
   const next=checkpoints[checkpoint+1];if(next&&character.grounded&&p.distanceTo(next.position)<5){checkpoint++;message(checkpoints[checkpoint].name+' に到着');if(checkpoint===4){finished=true;message('白峰・東峰　登頂');}}
   target.copy(p).add(new THREE.Vector3(0,1.4,0));camPos.set(target.x+Math.sin(yaw)*Math.cos(pitch)*zoom,target.y+Math.sin(pitch)*zoom,target.z+Math.cos(yaw)*Math.cos(pitch)*zoom);
   direction.copy(camPos).sub(target);const hit=probe.cast(target,direction.clone().normalize(),direction.length());if(hit)camPos.copy(target).addScaledVector(direction.normalize(),Math.max(.55,hit.distance-.3));camera.position.lerp(camPos,1-Math.exp(-dt*10));camera.lookAt(target);
  }else orbit.update();
  sun.position.copy(character.position).add(new THREE.Vector3(-30,50,-20));sun.target.position.copy(character.position);sun.target.updateMatrixWorld();
  noticeTime-=dt;if(noticeTime<=0)el('notice').style.opacity=0;
  fpsFrames++;fpsTime+=dt;if(fpsTime>.5){fps=fpsFrames/fpsTime;fpsFrames=0;fpsTime=0;}
  if(elapsed-lastHud>.2){lastHud=elapsed;
   el('stage').textContent=finished?'白峰・東峰　登頂':checkpoints[checkpoint].name;
   el('altitude').textContent=Math.round(2380+character.position.y)+' m';el('distance').textContent='残り '+Math.round(Math.max(0,world.route.length-cumulative[nearest]))+' m';el('progress').style.width=(finished?100:nearest/(points.length-1)*100)+'%';
   el('hint').textContent=finished?'登ってきた谷を見渡せます。全体表示でコースを振り返れます。':'次は「'+checkpoints[Math.min(4,checkpoint+1)].name+'」。黄色い道標と地面のラインをたどってください。';
   const dbgForward=debugMode?character.forward(new THREE.Vector3()):null;
   const dbgTerrainPitch=dbgForward?Math.atan2(-(character.groundNormal.x*dbgForward.x+character.groundNormal.z*dbgForward.z),Math.max(.1,character.slopeNormalY)):0;
   el('stats').textContent=Math.round(fps)+' fps · '+Math.round(renderer.info.render.triangles/1000)+'千 三角形 · '+character.state+(debugMode?' · 歩行 '+P.walkSpeed.toFixed(1)+' m/s · 傾斜 '+Math.round(character.slopeAngle*180/Math.PI)+'° · 地形 '+Math.round(dbgTerrainPitch*180/Math.PI)+'° · 体 '+Math.round(character.crawlPitch*180/Math.PI)+'° · 手補正 '+character.crawlContactOffset.toFixed(2)+'m':'');drawMap();
  }
  renderer.render(scene,camera);
 }
 respawn();update(1/60);el('overlay').hidden=true;
 let before=performance.now();renderer.setAnimationLoop(now=>{const dt=Math.min((now-before)/1000,.05);before=now;if(!document.hidden&&!testing)update(dt);});
 document.addEventListener('visibilitychange',()=>{before=performance.now();input.keys.clear();});
 // This diagnostic exercises the actual Character controller and collision mesh.
 // It is available only on an explicit local test URL, not in the player UI.
 if(query.has('test')){
  const button=document.createElement('button');button.textContent='歩行ルートを検証';button.id='run-test';el('controls').append(button);
  button.onclick=async()=>{
   if(testing)return;testing=true;button.disabled=true;checkpoint=0;respawn();const out=el('audit');out.style.display='block';
   const input={x:0,z:-1,climbX:0,climbY:1,sprint:true,sneak:false,jumpPressed:false,dropPressed:false};let at=1,frames=0,stuck=0,crawlFrames=0,maxSlope=0,slopeBins=[0,0,0,0,0,0],prev=character.position.clone(),error=null;
   try{
    while(at<points.length&&frames<60000){
     for(let j=0;j<200&&at<points.length;j++){
      const p=character.position,q=points[at];if(Math.hypot(q.x-p.x,q.z-p.z)<.5){at++;continue;}
      const angle=Math.atan2(-(q.x-p.x),-(q.z-p.z));character.update(1/60,input,angle);frames++;
      if(character.crawlActive)crawlFrames++;const slopeDeg=(character.slopeAngle||0)*180/Math.PI;maxSlope=Math.max(maxSlope,slopeDeg);slopeBins[Math.min(5,Math.floor(slopeDeg/10))]++;
      if(p.distanceToSquared(prev)<.00001)stuck++;else stuck=0;prev.copy(p);
      if(stuck>240||p.y < q.y-12||!Number.isFinite(p.y))throw Error('歩行が停止: waypoint '+at+' / mode '+character.mode+' / '+p.toArray().map(v=>v.toFixed(2)).join(','));
     }
     out.textContent='実キャラ歩行 '+at+' / '+points.length+' 地点\n'+frames+' frames';await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(at<points.length)throw Error('検証時間上限');
   }catch(e){error=e.message;}
   out.textContent=JSON.stringify({pass:!error,error,waypoints:at,total:points.length,frames,crawlFrames,crawlRatio:+(crawlFrames/Math.max(1,frames)).toFixed(3),slopeBinsDeg:slopeBins,maxSlopeDeg:+maxSlope.toFixed(1),position:character.position.toArray(),triangles:renderer.info.render.triangles},null,2);out.dataset.result=error?'fail':'pass';
   checkpoint=0;finished=false;respawn();testing=false;button.disabled=false;
  };
 }
}
start().catch(error=>{console.error(error);status('読み込みに失敗しました：'+error.message+'。ローカルサーバーを確認して再読み込みしてください。');});
