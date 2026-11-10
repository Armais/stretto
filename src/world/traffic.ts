import * as THREE from 'three';
import { WORLD } from '../config';
import type { Approach, TrafficGroup } from '../game/trafficChart';
import { CAR_HALF_LENGTH, CAR_HALF_WIDTH, TrafficCarModel } from './car';
import type { Road } from './road';

interface TrafficCar {
  model: TrafficCarModel;
  mesh: THREE.Group;
  active: boolean;
  lane: number;
  /** Metros de `Approach` en que pasa junto al jugador. */
  arrival: number;
  /** Segundos desde que lo golpeaste; 0 si va normal. */
  knocked: number;
  vx: number;
  spin: number;
}

// Colores de calle: plata, negro, blanco, azul oscuro, granate y grafito.
const BODY_COLORS = [0xa9adb3, 0x141518, 0xe4e4e2, 0x1f2c45, 0x5a1a1d, 0x3a3e44];
const POOL = 20;
/** Segundos por delante en que se mira si toca sacar un grupo: lo que tarda en 1.ª en cruzar la niebla. */
const LOOK_AHEAD = 12;

/** Tráfico lento que aparece delante y hay que esquivar. Siempre deja un carril libre. */
export class Traffic {
  readonly group = new THREE.Group();
  private road: Road;
  private readonly cars: TrafficCar[] = [];
  private groups: TrafficGroup[] = [];
  private nextGroup = 0;
  private approach: Approach | null = null;

  constructor(road: Road) {
    this.road = road;
    for (let i = 0; i < POOL; i++) {
      const model = new TrafficCarModel(BODY_COLORS[i % BODY_COLORS.length]);
      const mesh = model.group;
      mesh.visible = false;
      this.group.add(mesh);
      this.cars.push({ model, mesh, active: false, lane: 0, arrival: 0, knocked: 0, vx: 0, spin: 0 });
    }
  }

  /** Vacía la carretera y carga los grupos que vienen (ninguno, para dejarla vacía). */
  reset(road: Road, groups: TrafficGroup[] = [], approach: Approach | null = null): void {
    this.road = road;
    this.groups = groups;
    this.nextGroup = 0;
    this.approach = approach;
    for (const c of this.cars) this.retire(c);
  }

  /** Coches que circulan (no los que ya golpeaste): carril y distancia (negativa = delante). */
  snapshot(): { lane: number; z: number }[] {
    return this.cars.filter((c) => c.active && c.knocked === 0).map((c) => ({ lane: c.lane, z: c.mesh.position.z }));
  }

  /** `t`: segundos de canción. Devuelve true si el jugador choca en este fotograma. */
  update(t: number, dt: number, playerSpeed: number, playerX: number, canCrash: boolean, player = { halfLength: CAR_HALF_LENGTH, halfWidth: CAR_HALF_WIDTH }): boolean {
    if (!this.approach) return false;
    const here = this.approach.at(t);
    this.spawnDue(t, here);

    let crashed = false;
    for (const c of this.cars) {
      if (!c.active) continue;
      const m = c.mesh;
      c.model.roll(WORLD.trafficSpeed * dt);
      if (c.knocked > 0) {
        c.knocked += dt;
        m.position.z += (playerSpeed - WORLD.trafficSpeed) * dt;
        m.position.x += c.vx * dt;
        m.rotation.y += c.spin * dt;
        c.vx *= 1 - Math.min(1, dt * 1.5);
        if (c.knocked > 1.6) this.retire(c);
        continue;
      }
      m.position.z = here - c.arrival;
      if (m.position.z > 20) {
        this.retire(c);
        continue;
      }
      const hit =
        Math.abs(m.position.z) < CAR_HALF_LENGTH + player.halfLength - 0.2 &&
        Math.abs(m.position.x - playerX) < CAR_HALF_WIDTH + player.halfWidth - 0.05;
      if (canCrash && !crashed && hit) {
        crashed = true;
        c.knocked = 1e-4;
        c.vx = (m.position.x >= playerX ? 1 : -1) * 14;
        c.spin = (Math.random() < 0.5 ? -1 : 1) * 5;
      }
    }
    return crashed;
  }

  /** Saca los grupos que ya están a la distancia de aparición. */
  private spawnDue(t: number, here: number): void {
    while (this.nextGroup < this.groups.length) {
      const g = this.groups[this.nextGroup];
      if (g.time - t > LOOK_AHEAD) return;
      const arrival = this.approach!.at(g.time);
      if (arrival - here > WORLD.spawnDistance) return;
      g.lanes.forEach((lane, i) => this.place(lane, arrival + (i > 0 ? g.stagger : 0)));
      this.nextGroup++;
    }
  }

  private place(lane: number, arrival: number): void {
    const c = this.cars.find((x) => !x.active);
    if (!c) return;
    c.lane = lane;
    c.arrival = arrival;
    c.active = true;
    c.knocked = 0;
    c.mesh.position.set(this.road.laneX(lane), 0, -WORLD.spawnDistance);
    c.mesh.rotation.set(0, 0, 0);
    c.mesh.visible = true;
  }

  private retire(c: TrafficCar): void {
    c.active = false;
    c.knocked = 0;
    c.mesh.visible = false;
  }
}
