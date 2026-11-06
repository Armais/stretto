import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WORLD } from '../config';
import type { Vehicle } from '../game/vehicles';
import type { Road } from './road';
import { streakTexture } from './textures';

// Vehículos modelados en Blender (tools/blender/vehiculos.py y assets/blender/*.blend →
// public/models/*.glb). Miran hacia -Z, con el suelo en y = 0. Las ruedas son nodos
// "rueda_*" con el eje en X.

/** Medio largo y medio ancho del coche del tráfico (el compacto). */
export const CAR_HALF_LENGTH = 2.05;
export const CAR_HALF_WIDTH = 0.94;
const WHEEL_RADIUS = 0.33;

/** Intensidad de las luces en el juego: la del .blend (6) satura el bloom. */
const LIGHT_INTENSITY: Record<string, number> = { st_luz_roja: 1.3, st_luz_blanca: 1.6 };

const loader = new GLTFLoader();
const models = new Map<string, Promise<THREE.Group>>();

function loadModel(name: string): Promise<THREE.Group> {
  let p = models.get(name);
  if (!p) {
    p = loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`).then((gltf) => {
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const k = LIGHT_INTENSITY[m.name];
          if (k !== undefined) (m as THREE.MeshStandardMaterial).emissiveIntensity = k;
        }
      });
      return gltf.scene;
    });
    models.set(name, p);
  }
  return p;
}

// Reflejo de cada piloto en el asfalto mojado, estirado hacia la cámara.
const TAIL_STREAK_GEO = new THREE.PlaneGeometry(0.6, 4).rotateX(-Math.PI / 2);
const TAIL_STREAK_MAT = new THREE.MeshBasicMaterial({
  map: streakTexture(),
  color: new THREE.Color(0xff1a2e).multiplyScalar(0.18),
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

function tailStreaks(tails: number[], halfLength: number): THREE.Group {
  const g = new THREE.Group();
  for (const x of tails) {
    const streak = new THREE.Mesh(TAIL_STREAK_GEO, TAIL_STREAK_MAT);
    streak.position.set(x, 0.03, halfLength + 1.6);
    g.add(streak);
  }
  return g;
}

/**
 * Copia de un material con tope de brillo. Nuestros faros dan de frente a la trasera del coche
 * de delante, y uno blanco o plateado pasaba del umbral del bloom (0,82) y se veía como un foco
 * que deslumbraba. Con el tope en 0,6 la carrocería ya no hace bloom; los pilotos van aparte.
 */
function capped(m: THREE.Material): THREE.Material {
  const c = m.clone();
  // Con un define propio el programa no se mezcla con el de los materiales sin tope.
  c.defines = { ...c.defines, STRETTO_CAP: '' };
  c.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      '#include <opaque_fragment>\ngl_FragColor.rgb = min(gl_FragColor.rgb, vec3(0.6));',
    );
  };
  return c;
}

/**
 * Copia del modelo, opcionalmente con otra pintura (todo lo que use un material st_pintura*).
 * Con pintura es un coche del tráfico: todo menos los pilotos lleva tope de brillo.
 */
function instance(model: THREE.Group, paint: number | null): { car: THREE.Group; wheels: THREE.Object3D[] } {
  const car = model.clone(true);
  const wheels: THREE.Object3D[] = [];
  const copies = new Map<THREE.Material, THREE.Material>();
  car.traverse((o) => {
    if (o.name.startsWith('rueda_')) wheels.push(o);
    const mesh = o as THREE.Mesh;
    if (paint === null || !mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const repainted = mats.map((m) => {
      if (m.name.startsWith('st_luz')) return m;
      let c = copies.get(m);
      if (!c) {
        c = capped(m);
        if (m.name.startsWith('st_pintura')) (c as THREE.MeshStandardMaterial).color.setHex(paint);
        copies.set(m, c);
      }
      return c;
    });
    mesh.material = Array.isArray(mesh.material) ? repainted : repainted[0];
  });
  return { car, wheels };
}

/** Hace rodar las ruedas: `dist` son los metros avanzados en este fotograma. */
function spin(wheels: THREE.Object3D[], dist: number): void {
  for (const w of wheels) w.rotation.x -= dist / WHEEL_RADIUS;
}

export class TrafficCarModel {
  readonly group = new THREE.Group();
  private wheels: THREE.Object3D[] = [];

  constructor(paint: number) {
    this.group.add(tailStreaks([-0.7, 0.7], CAR_HALF_LENGTH));
    void loadModel('compacto').then((m) => {
      const { car, wheels } = instance(m, paint);
      this.group.add(car);
      this.wheels = wheels;
    });
  }

  roll(dist: number): void {
    spin(this.wheels, dist);
  }
}

export class PlayerCar {
  readonly group = new THREE.Group();
  lane = 0;
  x = 0;
  private road: Road;
  private laneTime: number = WORLD.laneChangeTime;
  private lean = 1;
  private body: THREE.Group | null = null;
  private wheels: THREE.Object3D[] = [];
  private modelName = '';
  private readonly beam: THREE.SpotLight;

  constructor(road: Road) {
    this.road = road;
    // Faros: un foco que ilumina el asfalto por delante.
    this.beam = new THREE.SpotLight(0xfff1dc, 900, 90, 0.42, 0.55, 1.6);
    this.beam.target.position.set(0, 0, -30);
    this.group.add(this.beam, this.beam.target);
    this.reset();
  }

  /** Carretera nueva y vehículo elegido: cambia el modelo si hace falta. */
  setup(road: Road, vehicle: Vehicle): void {
    this.road = road;
    this.laneTime = vehicle.laneTime;
    this.lean = vehicle.lean;
    this.beam.position.set(0, 0.7, -vehicle.halfLength);
    if (this.modelName === vehicle.model) return;
    this.modelName = vehicle.model;
    if (this.body) this.group.remove(this.body);
    const body = new THREE.Group();
    body.add(tailStreaks(vehicle.tails, vehicle.halfLength));
    this.body = body;
    this.wheels = [];
    this.group.add(body);
    void loadModel(vehicle.model).then((m) => {
      if (this.body !== body) return;
      const { car, wheels } = instance(m, null);
      body.add(car);
      this.wheels = wheels;
    });
  }

  reset(): void {
    this.lane = Math.floor(this.road.laneCount / 2);
    this.x = this.road.laneX(this.lane);
  }

  steer(dir: 1 | -1): void {
    this.lane = Math.max(0, Math.min(this.road.laneCount - 1, this.lane + dir));
  }

  /** `dist`: metros avanzados en este fotograma, para girar las ruedas. */
  update(dt: number, dist: number): void {
    const target = this.road.laneX(this.lane);
    const rate = 3 / this.laneTime;
    this.x += (target - this.x) * (1 - Math.exp(-dt * rate));
    const lean = target - this.x;
    this.group.position.x = this.x;
    const roll = Math.min(0.4, 0.04 * this.lean);
    this.group.rotation.z = THREE.MathUtils.clamp(-lean * 0.025 * this.lean, -roll, roll);
    this.group.rotation.y = THREE.MathUtils.clamp(-lean * 0.03, -0.06, 0.06);
    spin(this.wheels, dist);
  }
}
