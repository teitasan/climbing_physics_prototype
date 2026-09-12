import * as THREE from 'three';
// Port the material shipped in Mesh Terrain Lab's Godot export. Its color alpha
// stores a material coefficient, NOT opacity. Do not render COLOR_0 directly.
export async function createShiramineMaterial(origin) {
 const loader=new THREE.TextureLoader(), uniforms={};
 const names={ground_albedo:'rock-ground-albedo',ground_normal:'rock-ground-normal',ground_arm:'rock-ground-arm',cliff_albedo:'cliff-side-albedo',cliff_normal:'cliff-side-normal',cliff_arm:'cliff-side-arm',geology_detail:'geology-detail'};
 await Promise.all(Object.entries(names).map(async([key,file])=>{
  const tex=await loader.loadAsync('./assets/environment/meshterrain-shiramine/textures/'+file+'.png');
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=4;
  if(key.endsWith('albedo'))tex.colorSpace=THREE.SRGBColorSpace;
  uniforms[key]={value:tex};
 }));
 const material=new THREE.MeshStandardMaterial({roughness:.9,side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms,{mapOrigin:{value:origin}});
  const vary='varying vec3 world_position; varying vec3 world_geometric_normal; varying vec3 compiled_base_color; varying vec3 compiled_scan_coefficient; varying vec2 compiled_material_coverage;';
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+vary+'\nuniform vec3 mapOrigin; attribute vec4 terrainBase; attribute vec2 terrainGain; attribute vec2 terrainCoverage;')
   .replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
    world_position=(modelMatrix*vec4(transformed,1.)).xyz+mapOrigin;
    world_geometric_normal=normalize(mat3(modelMatrix)*objectNormal);
    compiled_base_color=terrainBase.rgb;
    compiled_scan_coefficient=vec3(terrainBase.a,terrainGain);
    compiled_material_coverage=terrainCoverage;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+vary+'\n'+Object.keys(names).map(n=>'uniform sampler2D '+n+';').join('\n')+`vec3 axis_sign(vec3 value) {
    return vec3(
        value.x < 0.0 ? -1.0 : 1.0,
        value.y < 0.0 ? -1.0 : 1.0,
        value.z < 0.0 ? -1.0 : 1.0
    );
}

vec3 triplanar_weights(vec3 normal_value) {
    vec3 weights = pow(abs(normal_value), vec3(8.0));
    return weights / max(dot(weights, vec3(1.0)), 0.0001);
}

vec4 sample_cliff(sampler2D source, vec3 position_value, vec3 normal_value) {
    vec3 signs = axis_sign(normal_value);
    vec3 weights = triplanar_weights(normal_value);
    vec2 uv_x = position_value.yz / 64.0 * vec2(signs.x, 1.0);
    vec2 uv_y = position_value.zx / 64.0 * vec2(signs.y, 1.0);
    vec2 uv_z = position_value.xy / 64.0 * vec2(signs.z, 1.0);
    return texture2D(source, uv_x) * weights.x
        + texture2D(source, uv_y) * weights.y
        + texture2D(source, uv_z) * weights.z;
}

vec3 sample_cliff_normal(vec3 position_value, vec3 normal_value) {
    vec3 signs = axis_sign(normal_value);
    vec3 weights = triplanar_weights(normal_value);
    vec2 uv_x = position_value.yz / 64.0 * vec2(signs.x, 1.0);
    vec2 uv_y = position_value.zx / 64.0 * vec2(signs.y, 1.0);
    vec2 uv_z = position_value.xy / 64.0 * vec2(signs.z, 1.0);
    vec3 nx = texture2D(cliff_normal, uv_x).rgb * 2.0 - 1.0;
    vec3 ny = texture2D(cliff_normal, uv_y).rgb * 2.0 - 1.0;
    vec3 nz = texture2D(cliff_normal, uv_z).rgb * 2.0 - 1.0;
    vec3 mapped_x = normalize(vec3(nx.z * signs.x, nx.x * signs.x, nx.y));
    vec3 mapped_y = normalize(vec3(ny.y, ny.z * signs.y, ny.x * signs.y));
    vec3 mapped_z = normalize(vec3(nz.x * signs.z, nz.y, nz.z * signs.z));
    return normalize(mapped_x * weights.x + mapped_y * weights.y + mapped_z * weights.z);
}

`)
   .replace('#include <map_fragment>',`
    vec3 geometric = normalize(world_geometric_normal);
    vec3 scan_position = vec3(
        world_position.x * 0.84 + world_position.y * 0.54,
        world_position.y * 0.84 - world_position.x * 0.54,
        world_position.z
    );
    vec3 scan_normal = normalize(vec3(
        geometric.x * 0.84 + geometric.y * 0.54,
        geometric.y * 0.84 - geometric.x * 0.54,
        geometric.z
    ));
    vec2 ground_uv = vec2(
        world_position.x * 0.829 + world_position.z * 0.559,
        world_position.z * 0.829 - world_position.x * 0.559
    ) / 14.5;

    float slope = 1.0 - abs(geometric.y);
    vec2 focal_offset = vec2(
        (world_position.x - 420.0) / 270.0,
        (world_position.z - 395.0) / 235.0
    );
    float focal_rock = (1.0 - smoothstep(0.32, 1.05, dot(focal_offset, focal_offset)))
        * smoothstep(68.0, 155.0, world_position.y);
    float cliff_likelihood = slope
        + smoothstep(58.0, 205.0, world_position.y) * 0.38
        + focal_rock * 0.28;
    float cliff_domain = smoothstep(0.30, 0.66, cliff_likelihood);

    vec4 ground_color = texture2D(ground_albedo, ground_uv);
    vec4 cliff_color = sample_cliff(cliff_albedo, scan_position, scan_normal);
    vec4 ground_pbr = texture2D(ground_arm, ground_uv);
    vec4 cliff_pbr = sample_cliff(cliff_arm, scan_position, scan_normal);
    // Height is the ARM alpha, not a map of its own, and the ARM tuple has
    // already been fetched just above. See packArm in the exporter source.
    float ground_relief = ground_pbr.a;
    float cliff_relief = cliff_pbr.a;
    vec4 selected_color = mix(ground_color, cliff_color, cliff_domain);
    vec4 selected_pbr = mix(ground_pbr, cliff_pbr, cliff_domain);
    float selected_relief = mix(ground_relief, cliff_relief, cliff_domain);

    float scan_luminance = dot(selected_color.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 cliff_rock_diffuse = mix(selected_color.rgb, vec3(scan_luminance), 0.82);
    cliff_rock_diffuse = cliff_rock_diffuse * vec3(1.38, 1.42, 1.48)
        + vec3(0.014, 0.017, 0.022);
    cliff_rock_diffuse = (cliff_rock_diffuse - vec3(0.14)) * 1.18 + vec3(0.14);
    cliff_rock_diffuse = clamp(cliff_rock_diffuse, vec3(0.0), vec3(0.52));

    float green_excess = max(
        selected_color.g - max(selected_color.r, selected_color.b),
        0.0
    );
    vec3 ground_neutral_scan = vec3(
        selected_color.r + green_excess * 0.14,
        selected_color.g - green_excess * 0.82,
        selected_color.b + green_excess * 0.08
    );
    float ground_luminance = dot(
        ground_neutral_scan,
        vec3(0.2126, 0.7152, 0.0722)
    );
    vec3 ground_rock_diffuse = mix(
        ground_neutral_scan,
        vec3(ground_luminance),
        0.42
    );
    ground_rock_diffuse = ground_rock_diffuse * vec3(0.90, 0.92, 0.96)
        + vec3(0.010, 0.012, 0.016);
    ground_rock_diffuse = (ground_rock_diffuse - vec3(0.16)) * 0.90 + vec3(0.16);
    ground_rock_diffuse = clamp(ground_rock_diffuse, vec3(0.0), vec3(0.52));
    vec3 scan_rock_diffuse = mix(
        ground_rock_diffuse,
        cliff_rock_diffuse,
        cliff_domain
    );

    // createFullTerrainMaterial is affine in scan_rock_diffuse. The exporter
    // evaluates its layer, climate, strata, paint, cavity, and ember terms per
    // vertex and stores the resulting base and RGB gain in COLOR_0/TEXCOORD_0.
    vec4 broad = sample_cliff(geology_detail, world_position * 2.304, geometric);
    float rock_variation = mix(0.94, 1.06, broad.r);
    float turf_variation = mix(0.92, 1.08, broad.b);
    vec3 compiled_albedo = compiled_base_color
        + compiled_scan_coefficient * scan_rock_diffuse;
    compiled_albedo *= mix(1.0, rock_variation, compiled_material_coverage.x);
    compiled_albedo *= mix(
        1.0,
        turf_variation,
        compiled_material_coverage.y * 0.62
    );
    diffuseColor.rgb = clamp(
        compiled_albedo,
        vec3(0.0),
        vec3(1.0)
    );

`)
   .replace('#include <normal_fragment_maps>',`    vec3 ground_tangent_normal = texture2D(ground_normal, ground_uv).rgb * 2.0 - 1.0;
    float ground_sign = geometric.y < 0.0 ? -1.0 : 1.0;
    vec3 mapped_ground = normalize(vec3(
        ground_tangent_normal.x * 0.829 - ground_tangent_normal.y * 0.559,
        ground_tangent_normal.z * ground_sign,
        ground_tangent_normal.x * 0.559 + ground_tangent_normal.y * 0.829
    ));
    vec3 ground_perturbation = mapped_ground - vec3(0.0, ground_sign, 0.0);
    vec3 mapped_cliff_scan = sample_cliff_normal(scan_position, scan_normal);
    vec3 flat_cliff_scan = normalize(axis_sign(scan_normal) * triplanar_weights(scan_normal));
    vec3 cliff_scan_perturbation = mapped_cliff_scan - flat_cliff_scan;
    vec3 cliff_world_perturbation = vec3(
        cliff_scan_perturbation.x * 0.84 - cliff_scan_perturbation.y * 0.54,
        cliff_scan_perturbation.x * 0.54 + cliff_scan_perturbation.y * 0.84,
        cliff_scan_perturbation.z
    );
    vec3 mapped_world_normal = normalize(
        geometric + mix(ground_perturbation, cliff_world_perturbation, cliff_domain) * 0.68
    );
    normal = normalize(mat3(viewMatrix) * mapped_world_normal);
`)
   .replace('#include <roughnessmap_fragment>','float roughnessFactor=clamp(selected_pbr.g,.52,.98);')
   .replace('#include <metalnessmap_fragment>','float metalnessFactor=clamp(selected_pbr.b,0.,.12);');
 };
 material.customProgramCacheKey=()=> 'shiramine-export-material-v1';
 return material;
}
