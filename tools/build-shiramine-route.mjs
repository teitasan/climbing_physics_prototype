import fs from 'node:fs';
import {loadTerrain} from './shiramine-mesh.mjs';
const base='assets/environment/meshterrain-shiramine/';
const terrain=loadTerrain(base+'assets/world.glb');
const step=3,minX=80,minZ=-80,nx=211,nz=241;
const samples=Array.from({length:nx*nz},(_,i)=>terrain.sample(minX+i%nx*step,minZ+Math.floor(i/nx)*step));
const coord=i=>[minX+i%nx*step,samples[i]?.height,minZ+Math.floor(i/nx)*step];
const index=(x,z)=>Math.round((z-minZ)/step)*nx+Math.round((x-minX)/step);
const start=index(276,-3),goal=index(659,481),dist=new Float64Array(nx*nz).fill(Infinity),prev=new Int32Array(nx*nz).fill(-1);
const heap=[];function push(id,score){let i=heap.length;heap.push([id,score]);while(i){const p=(i-1)>>1;if(heap[p][1]<=score)break;heap[i]=heap[p];i=p;}heap[i]=[id,score];}
function pop(){const r=heap[0],a=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1][1]<heap[c][1])c++;if(heap[c][1]>=a[1])break;heap[i]=heap[c];i=c;}heap[i]=a;}return r;}
const closed=new Uint8Array(nx*nz),[gx,,gz]=coord(goal);
dist[start]=0;push(start,0);
while(heap.length){const [id]=pop();if(closed[id])continue;closed[id]=1;if(id===goal)break;const [x,y,z]=coord(id),ix=id%nx,iz=Math.floor(id/nx);
 for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
  if(!dx&&!dz||ix+dx<0||ix+dx>=nx||iz+dz<0||iz+dz>=nz)continue;
  const j=id+dz*nx+dx,b=samples[j];if(!b||closed[j]||b.height<20||b.normalY<.64)continue;
  const len=Math.hypot(dx,dz)*step,grade=Math.abs(b.height-y)/len;if(grade>.82)continue;
  let pass=true;
  for(const f of [.25,.5,.75]){const s=terrain.sample(x+dx*step*f,z+dz*step*f);if(!s||s.normalY<.62||Math.abs(s.height-(y+(b.height-y)*f))>.4){pass=false;break;}}
  if(!pass)continue;
  const cost=dist[id]+len*(1+grade*grade*7)+Math.max(0,y-b.height)*1.5;
  if(cost<dist[j]){dist[j]=cost;prev[j]=id;const [X,,Z]=coord(j);push(j,cost+Math.hypot(X-gx,Z-gz));}
 }
}
if(prev[goal]===-1){const reached=Array.from(closed.keys()).filter(i=>closed[i]);console.log('Reached',reached.length,'highest',reached.sort((a,b)=>samples[b].height-samples[a].height).slice(0,5).map(coord));throw Error('No walkable route to summit');}
const ids=[];for(let i=goal;i!==-1;i=prev[i])ids.push(i);ids.reverse();
const points=ids.map(coord);let length=0,ascent=0;const cumulative=[0];
for(let i=1;i<points.length;i++){length+=Math.hypot(...points[i].map((v,k)=>v-points[i-1][k]));ascent+=Math.max(0,points[i][1]-points[i-1][1]);cumulative.push(length);}
const names=['沢の登山口','白峰の肩','岩棚の分岐','上部の尾根','白峰・東峰'];
const checkpoints=names.map((name,i)=>{const at=cumulative.findIndex(v=>v>=length*i/4);return {name,index:at,position:points[at]};});
const result={name:'白峰・東峰ルート',source:'Mesh Terrain Lab / 白峰・登山道',units:'metres',length,ascent,points,checkpoints};
fs.writeFileSync(base+'route.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({length,ascent,points:points.length,checkpoints},null,2));
