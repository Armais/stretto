import * as THREE from 'three';
import { TRAFFIC, WORLD } from '../config';
import { CAR_HALF_LENGTH, CAR_HALF_WIDTH, TrafficCarModel } from './car';
import type { Road } from './road';

interface TrafficCar {
  model: TrafficCarModel;
  mesh: THREE.Group;
  active: boolean;
  lane: number;
  /** Segundos desde que lo golpeaste; 0 si va normal. */
  knocked: number;
  vx: number;
  spin: number;
}

// Colores de calle: plata, negro, blanco, azul oscuro, granate y grafito.
const BODY_COLORS = [0xa9adb3, 0x141518, 0xe4e4e2, 0x1f2c45, 0x5a1a1d, 0x3a3e44];
const POOL = 16;

/** Tráfico lento que aparece delante y hay que esquivar. Siempre deja un carril libre. */
export class Traffic {
  readonly group = new THREE.Group();
  private road: Road;
  private readonly cars: TrafficCar[] = [];
  private untilSpawn = 0;
  private gapScale = 1;
  private pairChance = TRAFFIC.byDifficulty.normal.pairs;

  constructor(road: Road) {
    this.road = road;
    for (let i = 0; i < POOL; i++) {
      const model = new TrafficCarModel(BODY_COLORS[i % BODY_COLORS.length]);
      const mesh = model.group;
      mesh.visible = false;
      this.group.add(mesh);
      this.cars.push({ model, mesh, active: false, lane: 0, knocked: 0, vx: 0, spin: 0 });
    }
  }

  /**
   * Vacía la carretera y fija la densidad. `density` es la del nivel (1 = normal; el nivel 1,
   * que es el tutorial, va con menos).
   */
  reset(road: Road, gapScale: number, pairChance: number): void {
    this.road = road;
    this.gapScale = gapScale;
    this.pairChance = pairChance;
    for (const c of this.cars) this.retire(c);
    this.untilSpawn = 60;
  }

  /** Coches que circulan (no los que ya golpeaste): carril y distancia (negativa = delante). */
  snapshot(): { lane: number; z: number }[] {
    return this.cars.filter((c) => c.active && c.knocked === 0).map((c) => ({ lane: c.lane, z: c.mesh.position.z }));
  }

  /** Devuelve true si el jugador choca en este fotograma. */
  update(dt: number, playerSpeed: number, playerX: number, canCrash: boolean, player = { halfLength: CAR_HALF_LENGTH, halfWidth: CAR_HALF_WIDTH }): boolean {
    const rel = playerSpeed - WORLD.trafficSpeed;
    this.untilSpawn -= rel * dt;
    if (this.untilSpawn <= 0) {
      this.spawnGroup();
      this.untilSpawn = THREE.MathUtils.randFloat(TRAFFIC.gapMin, TRAFFIC.gapMax) * this.gapScale;
    }

    let crashed = false;
    for (const c of this.cars) {
      if (!c.active) continue;
      const m = c.mesh;
      m.position.z += rel * dt;
      c.model.roll(WORLD.trafficSpeed * dt);
      if (c.knocked > 0) {
        c.knocked += dt;
        m.position.x += c.vx * dt;
        m.rotation.y += c.spin * dt;
        c.vx *= 1 - Math.min(1, dt * 1.5);
        if (c.knocked > 1.6) this.retire(c);
        continue;
      }
      if (m.position.z > 20 || m.position.z < -WORLD.spawnDistance - 60) {
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

  /** Un coche suelto o una pareja (en paralelo o escalonada). */
  private spawnGroup(): void {
    const lanes = [...Array(this.road.laneCount).keys()].sort(() => Math.random() - 0.5);
    const z = -WORLD.spawnDistance;
    if (this.road.laneCount >= 3 && Math.random() < this.pairChance) {
      const step = Math.random() < TRAFFIC.staggerChance ? TRAFFIC.stagger : 0;
      this.place(lanes[0], z);
      this.place(lanes[1], z - step);
    } else {
      this.place(lanes[0], z);
    }
  }

  /** Mete un coche si con él sigue quedando al menos un carril libre en ese tramo. */
  private place(lane: number, z: number): void {
    const c = this.cars.find((x) => !x.active);
    if (!c) return;
    const busy = new Set<number>();
    for (const o of this.cars) {
      if (o.active && o.knocked === 0 && Math.abs(o.mesh.position.z - z) < 30) busy.add(o.lane);
    }
    if (busy.has(lane) || busy.size + 1 >= this.road.laneCount) return;
    c.lane = lane;
    c.active = true;
    c.knocked = 0;
    c.mesh.position.set(this.road.laneX(c.lane), 0, z);
    c.mesh.rotation.set(0, 0, 0);
    c.mesh.visible = true;
  }

  private retire(c: TrafficCar): void {
    c.active = false;
    c.knocked = 0;
    c.mesh.visible = false;
  }
}
