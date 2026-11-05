import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Scenery } from '../game/levels';
import { signTexture } from './textures';

// Piezas de escenario hechas en Blender (tools/blender/escenarios.py, P14), en
// public/models/escenario_<grupo>.glb. Cada pieza es un nodo con su nombre y el origen en el
// suelo. Al cargar se cambian los materiales con nombre especial:
// - luz_* y neon: sin sombrear, con el color de emisión por su intensidad (para el bloom).
// - cartel_*: el texto del cartel, dibujado en un canvas.
// - es_ventanas: se queda como está; el escenario le pone la textura de ventanas del nivel.

export type PropGroup = 'comun' | 'ciudad' | 'costa' | 'desierto' | 'montana';

const GROUPS: Record<Scenery, PropGroup[]> = {
  city: ['comun', 'ciudad'],
  dawn: ['comun', 'ciudad'],
  coast: ['comun', 'costa'],
  desert: ['comun', 'desierto'],
  tunnels: ['comun', 'montana'],
};

const loader = new GLTFLoader();
const loading = new Map<PropGroup, Promise<void>>();
const templates = new Map<string, THREE.Object3D>();
const materials = new Map<string, THREE.Material>();

/** Neón de los carteles: toma el color de acento del nivel. */
export const neonMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

/** Carga las piezas de un escenario (y las comunes). Se puede llamar varias veces. */
export function loadProps(kind: Scenery): Promise<void> {
  return Promise.all(GROUPS[kind].map(loadGroup)).then(() => undefined);
}

export function loadAllProps(): Promise<void> {
  return Promise.all((Object.keys(GROUPS) as Scenery[]).map(loadProps)).then(() => undefined);
}

function loadGroup(group: PropGroup): Promise<void> {
  let p = loading.get(group);
  if (!p) {
    p = loader.loadAsync(`${import.meta.env.BASE_URL}models/escenario_${group}.glb`).then((gltf) => {
      for (const node of [...gltf.scene.children]) {
        node.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) mesh.material = convert(mesh.material as THREE.Material);
        });
        templates.set(node.name, node);
      }
    });
    p.catch(() => loading.delete(group));
    loading.set(group, p);
  }
  return p;
}

/** Un material por nombre en todas las piezas: así una luz se apaga o cambia en todas a la vez. */
function convert(src: THREE.Material): THREE.Material {
  const done = materials.get(src.name);
  if (done) return done;
  let out: THREE.Material = src;
  const std = src as THREE.MeshStandardMaterial;
  if (src.name === 'neon') {
    out = neonMaterial;
  } else if (src.name.startsWith('luz_')) {
    const color = std.emissive.clone().multiplyScalar(std.emissiveIntensity);
    out = new THREE.MeshBasicMaterial({ color });
    out.userData.base = color.clone();
  } else if (src.name.startsWith('cartel_')) {
    out = new THREE.MeshBasicMaterial({ map: signTexture(src.name), color: 0xb8b8b8 });
  } else {
    // El entorno nocturno es un anillo de farolas muy intensas: a lo lejos, la niebla no
    // apaga del todo su reflejo rasante y los bordes de las piezas brillarían en naranja.
    if (std.isMeshStandardMaterial) std.envMapIntensity = 0.35;
    if (std.transparent) std.depthWrite = false;
  }
  out.name = src.name;
  materials.set(src.name, out);
  return out;
}

/** Material ya convertido de las piezas, por su nombre en Blender. */
export function propMaterial(name: string): THREE.Material | undefined {
  return materials.get(name);
}

export function propLoaded(name: string): boolean {
  return templates.has(name);
}

/** La pieza original (no se añade a la escena: para eso, `propClone`). */
export function prop(name: string): THREE.Object3D {
  const t = templates.get(name);
  if (!t) throw new Error(`Pieza de escenario sin cargar: ${name}`);
  return t;
}

/** Copia de una pieza que comparte geometría y materiales con la original. */
export function propClone(name: string): THREE.Object3D {
  return prop(name).clone();
}

/** Muchas copias de una pieza con un dibujado por material (una InstancedMesh por malla). */
export class PropInstances {
  readonly group = new THREE.Group();
  readonly meshes: THREE.InstancedMesh[] = [];
  private readonly local: THREE.Matrix4[] = [];
  private readonly tmp = new THREE.Matrix4();

  constructor(name: string, capacity: number) {
    const root = prop(name);
    root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, capacity);
      // Con la curva del shader, la caja calculada en recto no sirve para recortar.
      im.frustumCulled = false;
      im.count = 0;
      this.meshes.push(im);
      this.local.push(inv.clone().multiply(mesh.matrixWorld));
      this.group.add(im);
    });
  }

  get count(): number {
    return this.meshes[0]?.count ?? 0;
  }

  /** Pone la copia `i` con esta matriz (y amplía el número de copias si hace falta). */
  set(i: number, matrix: THREE.Matrix4): void {
    this.meshes.forEach((im, k) => {
      im.setMatrixAt(i, this.tmp.multiplyMatrices(matrix, this.local[k]));
      if (im.count <= i) im.count = i + 1;
      im.instanceMatrix.needsUpdate = true;
    });
  }
}
