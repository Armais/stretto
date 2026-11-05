import * as THREE from 'three';

// Curvas de la carretera ("las curvas y los túneles van en los breaks"). Son un efecto
// visual: en el shader de vértices se desplaza cada punto en X según el cuadrado de su
// distancia, así la carretera, el tráfico y las líneas se doblan a lo lejos mientras el coche
// (en z = 0) sigue recto. Colisiones y ritmo no cambian.

/** Curvatura actual, compartida por todos los materiales. Positiva: gira a la derecha. */
export const curve = { value: 0 };

const MAX_DIST = 360;
const patched = new WeakSet<THREE.Material>();

const BEND = /* glsl */ `
vec4 stretto_p = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  stretto_p = batchingMatrix * stretto_p;
#endif
#ifdef USE_INSTANCING
  stretto_p = instanceMatrix * stretto_p;
#endif
vec4 stretto_w = modelMatrix * stretto_p;
float stretto_d = min( max( -stretto_w.z, 0.0 ), ${MAX_DIST.toFixed(1)} );
stretto_w.x += uStrettoCurve * stretto_d * stretto_d;
vec4 mvPosition = viewMatrix * stretto_w;
gl_Position = projectionMatrix * mvPosition;
`;

/** Prepara un material para doblarse con la curva. Se puede llamar varias veces. */
export function bendMaterial(mat: THREE.Material): void {
  if (patched.has(mat)) return;
  patched.add(mat);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    if (!shader.vertexShader.includes('#include <project_vertex>')) return;
    shader.uniforms.uStrettoCurve = curve;
    shader.vertexShader = 'uniform float uStrettoCurve;\n' + shader.vertexShader.replace('#include <project_vertex>', BEND);
  };
  mat.customProgramCacheKey = () => 'stretto-bend';
  mat.needsUpdate = true;
}

/** Dobla todos los materiales de un objeto y sus hijos. */
export function bendObject(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) bendMaterial(mat);
  });
}
