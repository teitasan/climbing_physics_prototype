// Resolve the same vendored modules as the browser import map for offline QA.
const root = new URL('../', import.meta.url);
export function resolve(specifier, context, nextResolve) {
  const paths = {three:'vendor/three/three.module.js', 'three-mesh-bvh':'vendor/three-mesh-bvh/index.module.js'};
  if (paths[specifier]) return {url:new URL(paths[specifier],root).href,shortCircuit:true};
  return nextResolve(specifier,context);
}
