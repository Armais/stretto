import * as THREE from 'three';
import type { Cue } from '../game/race';
import { bendMaterial } from './curve';
import type { Road } from './road';

// Líneas de cambio pintadas en el asfalto (P1): azules para subir, rojas para bajar.
// Llegan al morro del coche justo en el tiempo fuerte.

// Tono de pintura reflectante más que de neón; lo justo para leerse de lejos con niebla.
const UP = new THREE.Color(0x3d8bff);
const DOWN = new THREE.Color(0xff3b4a);
const DEAD = new THREE.Color(0x2a2b2e);
const GLOW = 1.5;
const VISIBLE_AHEAD = 330;

interface Item {
  cue: Cue;
  /** Se crea al entrar en vista y se suelta al quedar atrás. */
  obj: THREE.Group | null;
  mat: THREE.MeshBasicMaterial | null;
  base: THREE.Color;
}

export class CueLines {
  readonly group = new THREE.Group();
  private readonly items: Item[] = [];
  /** Las anteriores ya quedaron atrás y no vuelven. */
  private first = 0;
  private bar: THREE.BoxGeometry;
  /** Z del morro del coche: la línea llega ahí justo en el tiempo fuerte. */
  private readonly frontZ: number;

  constructor(cues: Cue[], road: Road, halfLength: number) {
    this.frontZ = -halfLength;
    // Con la cámara baja, el fondo de la línea se aplasta mucho: por eso es tan larga.
    this.bar = new THREE.BoxGeometry(road.width, 0.04, 2.4);
    this.add(cues);
  }

  /** Líneas nuevas al final (el modo infinito las va generando). */
  add(cues: Cue[]): void {
    for (const cue of cues) this.items.push({ cue, obj: null, mat: null, base: cue.dir === 1 ? UP : DOWN });
  }

  /** Carretera con otro número de carriles: las líneas a la vista se vuelven a pintar. */
  setRoad(road: Road): void {
    for (let i = this.first; i < this.items.length; i++) this.release(this.items[i]);
    this.bar.dispose();
    this.bar = new THREE.BoxGeometry(road.width, 0.04, 2.4);
  }

  /** `t`: segundos de canción. `speed`: velocidad actual del coche. */
  update(t: number, speed: number): void {
    for (let i = this.first; i < this.items.length; i++) {
      const it = this.items[i];
      const dist = (it.cue.time - t) * speed;
      if (dist > VISIBLE_AHEAD) break;
      if (dist < -25) {
        this.release(it);
        if (i === this.first) this.first++;
        continue;
      }
      const obj = it.obj ?? this.build(it);
      const mat = it.mat!;
      obj.position.z = this.frontZ - dist;
      // La línea ocupa siempre el mismo tiempo de recorrido: a más velocidad, más larga.
      // Con la cámara baja, si no, a 200 km/h se ve como un hilo.
      obj.scale.z = Math.max(1, speed / 38);
      if (it.cue.state === 'pending') {
        mat.color.copy(it.base).multiplyScalar(GLOW);
        mat.opacity = 1;
      } else if (it.cue.state === 'hit') {
        const k = Math.max(0, 1 - (t - it.cue.judgedAt) / 0.4);
        mat.color.copy(it.base).multiplyScalar(GLOW + 5 * k);
        mat.opacity = k;
      } else {
        mat.color.copy(DEAD);
        mat.opacity = 0.5;
      }
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (let i = this.first; i < this.items.length; i++) this.release(this.items[i]);
    this.bar.dispose();
  }

  private build(it: Item): THREE.Group {
    const mat = new THREE.MeshBasicMaterial({ color: it.base.clone().multiplyScalar(GLOW), transparent: true, depthWrite: false });
    // Nace ya doblada con la curva: si no, en un break se vería recta un instante.
    bendMaterial(mat);
    const obj = new THREE.Group();
    const line = new THREE.Mesh(this.bar, mat);
    line.position.y = 0.03;
    obj.add(line);
    this.group.add(obj);
    it.obj = obj;
    it.mat = mat;
    return obj;
  }

  private release(it: Item): void {
    if (!it.obj) return;
    it.obj.removeFromParent();
    it.mat!.dispose();
    it.obj = null;
    it.mat = null;
  }
}
