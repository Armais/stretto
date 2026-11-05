import * as THREE from 'three';
import { PICKUPS, WORLD, type PickupKind } from '../config';
import type { Road } from './road';
import { poolTexture } from './textures';

const COLORS: Record<PickupKind, number> = {
  points: 0xffc23d,
  repair: 0x3dff7a,
  nitro: 0x3d9dff,
  multiplier: 0xffa02e,
};

function glow(hex: number, k: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(k);
}

/** Texto "×2" pintado en un canvas, para el multiplicador. */
function x2Texture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.font = 'bold 84px "Segoe UI", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('×2', 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildIcon(kind: PickupKind): THREE.Object3D {
  const mat = new THREE.MeshBasicMaterial({ color: glow(COLORS[kind], 2.2) });
  switch (kind) {
    case 'points':
      return new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.09, 12, 32), mat);
    case 'repair': {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.22, 0.22), mat));
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.22), mat));
      return g;
    }
    case 'nitro':
      return new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 6, 16), mat);
    case 'multiplier': {
      // Plano mirando a la cámara (un sprite no se doblaría con las curvas).
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 1.2),
        new THREE.MeshBasicMaterial({ map: x2Texture(), color: glow(COLORS[kind], 2.2), transparent: true, depthWrite: false }),
      );
      plane.userData.noSpin = true;
      return plane;
    }
  }
}

interface Item {
  kind: PickupKind;
  group: THREE.Group;
  icon: THREE.Object3D;
  active: boolean;
  lane: number;
}

const POOL_PER_KIND = 4;

/** Premios que esperan quietos sobre un carril hasta que pasas por encima. */
export class Pickups {
  readonly group = new THREE.Group();
  private road: Road;
  private readonly items: Item[] = [];
  private readonly timers: Record<PickupKind, number> = { points: 0, repair: 0, nitro: 0, multiplier: 0 };
  private clock = 0;

  constructor(road: Road) {
    this.road = road;
    const poolMat = (kind: PickupKind) =>
      new THREE.MeshBasicMaterial({
        map: poolTexture(),
        color: glow(COLORS[kind], 0.35),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
    const poolGeo = new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2);
    for (const kind of Object.keys(COLORS) as PickupKind[]) {
      for (let i = 0; i < POOL_PER_KIND; i++) {
        const group = new THREE.Group();
        const icon = buildIcon(kind);
        icon.position.y = 1.0;
        const pool = new THREE.Mesh(poolGeo, poolMat(kind));
        pool.position.y = 0.03;
        group.add(icon, pool);
        group.visible = false;
        this.group.add(group);
        this.items.push({ kind, group, icon, active: false, lane: 0 });
      }
    }
  }

  reset(road: Road): void {
    this.road = road;
    for (const it of this.items) this.retire(it);
    this.clock = 0;
    for (const kind of Object.keys(this.timers) as PickupKind[]) this.timers[kind] = PICKUPS.every[kind] * (0.5 + Math.random() * 0.5);
  }

  /**
   * Avanza los premios, saca nuevos y devuelve los que el coche recoge en este fotograma.
   * `blocked(lane, z)` dice si un carril está ocupado por tráfico cerca de esa distancia.
   */
  update(
    dt: number,
    playerSpeed: number,
    playerX: number,
    engine: number,
    blocked: (lane: number, z: number) => boolean,
  ): PickupKind[] {
    this.clock += dt;
    for (const kind of Object.keys(this.timers) as PickupKind[]) {
      this.timers[kind] -= dt;
      if (this.timers[kind] > 0) continue;
      this.timers[kind] = PICKUPS.every[kind] * (0.75 + Math.random() * 0.5);
      // La reparación solo sale si hace falta.
      if (kind === 'repair' && engine >= PICKUPS.repairBelow) continue;
      this.spawn(kind, blocked);
    }

    const got: PickupKind[] = [];
    for (const it of this.items) {
      if (!it.active) continue;
      const g = it.group;
      g.position.z += playerSpeed * dt;
      if (!it.icon.userData.noSpin) it.icon.rotation.y += dt * 2.2;
      it.icon.position.y = 1.0 + Math.sin(this.clock * 3 + it.lane) * 0.12;
      if (g.position.z > 12) {
        this.retire(it);
        continue;
      }
      if (Math.abs(g.position.z) < 2.6 && Math.abs(g.position.x - playerX) < 1.5) {
        got.push(it.kind);
        this.retire(it);
      }
    }
    return got;
  }

  private spawn(kind: PickupKind, blocked: (lane: number, z: number) => boolean): void {
    const it = this.items.find((x) => x.kind === kind && !x.active);
    if (!it) return;
    const z = -WORLD.spawnDistance;
    const lanes = [...Array(this.road.laneCount).keys()].filter((l) => !blocked(l, z));
    if (lanes.length === 0) return;
    it.lane = lanes[Math.floor(Math.random() * lanes.length)];
    it.active = true;
    it.group.position.set(this.road.laneX(it.lane), 0, z);
    it.group.visible = true;
  }

  private retire(it: Item): void {
    it.active = false;
    it.group.visible = false;
  }
}
