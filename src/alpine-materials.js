import * as THREE from 'three';

// ワールド座標で岩の層と粒を付ける。パーツごとのUVの継ぎ目を作らない。
export function alpineMaterial(color, {snow=false, soil=false}={}) {
  const material=new THREE.MeshStandardMaterial({color,roughness:1});
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 alpinePosition;')
      .replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
vec4 alpineWorld=vec4(transformed,1.0);
#ifdef USE_INSTANCING
alpineWorld=instanceMatrix*alpineWorld;
#endif
alpinePosition=(modelMatrix*alpineWorld).xyz;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 alpinePosition;
      float alpineHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float alpineNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(alpineHash(i),alpineHash(i+vec3(1,0,0)),f.x),mix(alpineHash(i+vec3(0,1,0)),alpineHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(alpineHash(i+vec3(0,0,1)),alpineHash(i+vec3(1,0,1)),f.x),mix(alpineHash(i+vec3(0,1,1)),alpineHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }`)
      .replace('#include <color_fragment>',`#include <color_fragment>
        vec3 p=alpinePosition;
        float coarse=alpineNoise(p*.37);
        float fine=alpineNoise(p*18.0);
        float strata=smoothstep(.08,.24,abs(sin(p.y*2.5+p.x*.24+coarse*5.0)));
        diffuseColor.rgb *= ${soil?'(.83+coarse*.22+fine*.17)':'(.62+coarse*.3+fine*.16)*(.94+.06*strata)'};
        ${snow?'float snowLine=smoothstep(95.0,170.0,p.y+coarse*45.0); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.83,.89,.91),snowLine);':''}
      `);
  };
  material.customProgramCacheKey=()=>`alpine-${snow}-${soil}`;
  return material;
}

export function alpineHeight(x,z,seed=0) {
  return Math.sin(x*.071+seed)*Math.cos(z*.059-seed)*2.8
    +Math.sin(x*.19+z*.11+seed)*1.1+Math.sin(x*.47-z*.39)*.35;
}
