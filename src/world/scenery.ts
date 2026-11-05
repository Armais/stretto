import * as THREE from 'three';
import type { Scenery } from '../game/levels';
import { PropInstances, prop, propClone, propLoaded, propMaterial } from './props';
import { NEAR } from './road';
import { WINDOW_COLS, WINDOW_ROWS, poolTexture, streakTexture, windowTexture } from './textures';

// Escenarios de los niveles (P3) con las piezas de Blender (P14, tools/blender/escenarios.py).
// Todos con la dirección realista nocturna: ciudad, costa, desierto, túneles de montaña y
// autopista al amanecer. Lo que pasa junto a la carretera va en tiras que vuelven al fondo al
// quedar detrás de la cámara; lo del horizonte se queda quieto y sin niebla.

/** Aspecto general de cada escenario: cielo, niebla, luz ambiente, farolas y suelo. */
export interface Look {
  skyTop: number;
  skyMid: number;
  haze: number;
  fog: number;
  hemiSky: number;
  hemiGround: number;
  hemi: number;
  /** Intensidad de las farolas de la carretera (0 = no hay). */
  lamps: number;
  ground: number;
  /** Altura del suelo: en la montaña es el fondo del valle. */
  groundY: number;
  exposure: number;
}

export const LOOKS: Record<Scenery, Look> = {
  city: { skyTop: 0x04060b, skyMid: 0x0f1520, haze: 0x2a2830, fog: 0.0062, hemiSky: 0x2c3a55, hemiGround: 0x3a2a18, hemi: 1.1, lamps: 1, ground: 0x0b0c0f, groundY: -0.3, exposure: 1 },
  coast: { skyTop: 0x03060d, skyMid: 0x0c1626, haze: 0x1b2633, fog: 0.0052, hemiSky: 0x2a3d5a, hemiGround: 0x1a2228, hemi: 1.0, lamps: 1, ground: 0x0d0f11, groundY: -0.3, exposure: 1 },
  desert: { skyTop: 0x02030a, skyMid: 0x0a0d1c, haze: 0x1d1a22, fog: 0.0038, hemiSky: 0x2a3150, hemiGround: 0x2a1d14, hemi: 0.9, lamps: 0, ground: 0x1e1712, groundY: -0.3, exposure: 1.05 },
  tunnels: { skyTop: 0x03040a, skyMid: 0x0a0e18, haze: 0x161a20, fog: 0.0068, hemiSky: 0x24304a, hemiGround: 0x1a1a1a, hemi: 0.9, lamps: 0, ground: 0x07080a, groundY: -45, exposure: 1 },
  dawn: { skyTop: 0x22355e, skyMid: 0x6b5a86, haze: 0xc98a6c, fog: 0.0042, hemiSky: 0x8aa0c8, hemiGround: 0x6a4a3a, hemi: 1.7, lamps: 0.45, ground: 0x15151a, groundY: -0.3, exposure: 1.1 },
};

/** Una pieza de cada grupo: si están cargadas, el escenario se puede construir entero. */
const NEEDS: Record<Scenery, string[]> = {
  city: ['portico', 'torre_1'],
  dawn: ['portico', 'torre_1'],
  coast: ['portico', 'palmera_1'],
  desert: ['portico', 'cactus_1'],
  tunnels: ['farola', 'tunel'],
};

const rand = THREE.MathUtils.randFloat;
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
const glow = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k);

/** Distancia máxima del origen de una pieza a cualquiera de sus vértices (sin escalar). */
const radii = new Map<string, number>();
function propRadius(name: string): number {
  let r = radii.get(name);
  if (r === undefined) {
    r = 0;
    const p = new THREE.Vector3();
    prop(name).traverse((o) => {
      const pos = (o as THREE.Mesh).geometry?.getAttribute('position');
      if (pos) for (let i = 0; i < pos.count; i++) r = Math.max(r!, p.fromBufferAttribute(pos, i).length());
    });
    radii.set(name, r);
  }
  return r;
}
const START = NEAR + 20;
/** Largo de la tira: lo que hay entre la cámara y la niebla, con margen. */
const RUN = 520;
const BAJOS = ['bajo_1', 'bajo_2', 'bajo_3', 'bajo_4', 'bajo_5', 'bajo_6'];
const TORRES = ['torre_1', 'torre_2', 'torre_3', 'torre_4', 'torre_5', 'torre_6'];

/** Tamaño en planta (x, z) de una pieza. */
function footprint(name: string): { w: number; d: number } {
  const box = new THREE.Box3().setFromObject(prop(name));
  return { w: box.max.x - box.min.x, d: box.max.z - box.min.z };
}

/**
 * Cosas que pasan de largo y vuelven al fondo al quedar detrás de la cámara. El grupo entero
 * se desplaza; solo se recoloca la pieza que da la vuelta (`wrap` metros más allá).
 */
class Strip {
  readonly group = new THREE.Group();
  private readonly items: { z: number; half: number; place: (z: number) => void }[] = [];
  constructor(readonly wrap: number) {}

  add(z: number, half: number, place: (z: number) => void): void {
    this.items.push({ z, half, place });
    place(z);
  }

  addObject(obj: THREE.Object3D, z: number, half: number): void {
    this.group.add(obj);
    this.add(z, half, (zz) => (obj.position.z = zz));
  }

  update(dz: number): void {
    this.group.position.z += dz;
    const off = this.group.position.z;
    for (const it of this.items) {
      if (it.z + off - it.half > NEAR + 20) {
        it.z -= this.wrap;
        it.place(it.z);
      }
    }
    // En partidas largas, se devuelve el desplazamiento a las piezas para no perder precisión.
    if (off > 5000) {
      this.group.position.z = 0;
      for (const it of this.items) {
        it.z += off;
        it.place(it.z);
      }
    }
  }
}

/** Copias instanciadas de varias piezas dentro de una tira (o quietas, sin tira). */
class Placer {
  private readonly sets = new Map<string, PropInstances>();
  private readonly pos = new THREE.Vector3();
  constructor(
    private readonly parent: THREE.Group,
    private readonly strip: Strip | null,
    private readonly dress: (set: PropInstances) => void = () => undefined,
    private readonly capacity = 96,
  ) {}

  place(name: string, x: number, y: number, z: number, rot = new THREE.Euler(), scale: number | THREE.Vector3 = 1, half = 12): void {
    let set = this.sets.get(name);
    if (!set) {
      set = new PropInstances(name, this.capacity);
      this.dress(set);
      this.sets.set(name, set);
      this.parent.add(set.group);
    }
    if (set.count >= this.capacity) return;
    const target = set;
    const i = set.count;
    const q = new THREE.Quaternion().setFromEuler(rot);
    const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale.clone();
    const m = new THREE.Matrix4();
    const put = (zz: number) => target.set(i, m.compose(this.pos.set(x, y, zz), q, s));
    if (this.strip) this.strip.add(z, half, put);
    else put(z);
  }
}

export class SceneryView {
  readonly group = new THREE.Group();
  readonly kind: Scenery;
  readonly look: Look;
  /** Construido con las piezas de Blender ya cargadas (si no, se rehace al cargarlas). */
  readonly complete: boolean;
  private readonly strips: Strip[] = [];
  private readonly spinners: THREE.Object3D[] = [];
  private beam: THREE.Object3D | null = null;
  private readonly half: number;
  private readonly windows: THREE.MeshStandardMaterial;
  private readonly noFogCache = new Map<THREE.Material, THREE.Material>();

  constructor(kind: Scenery, roadWidth: number) {
    this.kind = kind;
    this.look = LOOKS[kind];
    this.half = roadWidth / 2;
    this.complete = NEEDS[kind].every(propLoaded);
    const tex = windowTexture(kind === 'dawn' ? 0.35 : 1);
    tex.repeat.set(1 / WINDOW_COLS, 1 / WINDOW_ROWS);
    this.windows = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.9 });
    this.group.add(sky(this.look));
    switch (kind) {
      case 'dawn':
        this.group.add(sun());
        break;
      case 'coast':
        this.group.add(sea(this.half), moon(), townLights(), stars(500));
        break;
      case 'desert':
        this.group.add(moon(), stars(1600));
        break;
      case 'tunnels':
        this.group.add(stars(400));
        break;
    }
    if (!this.complete) return;
    switch (kind) {
      case 'city':
        this.urban(1, 2);
        break;
      case 'dawn':
        this.urban(1, 1);
        this.pylons();
        break;
      case 'coast':
        this.coast();
        break;
      case 'desert':
        this.desert();
        break;
      case 'tunnels':
        this.mountain();
        break;
    }
  }

  /** `dz`: metros avanzados en este fotograma. */
  update(dz: number): void {
    for (const s of this.strips) s.update(dz);
    const t = performance.now() / 1000;
    for (const s of this.spinners) s.rotation.z = t * 0.9 + s.id;
    if (this.beam) this.beam.rotation.y = t * 0.7;
    // Luces rojas de aviso (antenas, grúas, aerogeneradores): parpadeo lento.
    const aviso = propMaterial('luz_aviso') as THREE.MeshBasicMaterial | undefined;
    if (aviso?.userData.base) aviso.color.copy(aviso.userData.base).multiplyScalar(t % 1.6 < 0.9 ? 1 : 0.12);
  }

  private strip(wrap = RUN): Strip {
    const s = new Strip(wrap);
    this.strips.push(s);
    this.group.add(s.group);
    return s;
  }

  /** Ventanas con la textura del nivel en vez del material de Blender. */
  private readonly dressWindows = (set: PropInstances): void => {
    for (const im of set.meshes) if ((im.material as THREE.Material).name === 'es_ventanas') im.material = this.windows;
  };

  /** Lo del horizonte: sin niebla (si no, desaparecería) y con las ventanas del nivel. */
  private readonly dressFar = (set: PropInstances): void => {
    this.dressWindows(set);
    for (const im of set.meshes) im.material = this.noFog(im.material as THREE.Material);
  };

  private noFog(mat: THREE.Material): THREE.Material {
    let out = this.noFogCache.get(mat);
    if (!out) {
      out = mat.clone();
      const std = out as THREE.MeshStandardMaterial;
      std.fog = false;
      // Sin niebla, lo lejano quedaría negro contra el cielo del amanecer: se aclara con el color
      // del cielo (de noche ese color es casi negro y no cambia nada). Las ventanas no se tocan.
      if (std.isMeshStandardMaterial && !std.emissiveMap) std.emissive.set(this.look.skyMid).multiplyScalar(0.6);
      this.noFogCache.set(mat, out);
    }
    return out;
  }

  private farClone(name: string): THREE.Object3D {
    const obj = propClone(name);
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.material = this.noFog(mesh.material as THREE.Material);
    });
    return obj;
  }

  // ------------------------------------------------------------ piezas comunes

  /** Pórtico de señales y valla de Night Shift FM, una de cada por vuelta de la tira. */
  private signs(strip: Strip, gantryZ: number, neonZ: number, neonSide: number): void {
    strip.addObject(propClone('portico'), gantryZ, 2);
    const neon = propClone('neon_radio');
    neon.position.x = neonSide * (this.half + 14);
    strip.addObject(neon, neonZ, 2);
  }

  // ------------------------------------------------------------ ciudad y amanecer

  /** Edificios en dos filas a cada lado, horizonte, paso elevado, pantallas y grúas. */
  private urban(density: number, cranes: number): void {
    const half = this.half;
    const strip = this.strip();
    const near = new Placer(strip.group, strip, this.dressWindows);
    const overpassZ = -150;
    const clear = (z: number, d: number) => Math.abs(z - d / 2 - overpassZ) < d / 2 + 22;
    const sizes = new Map([...BAJOS, ...TORRES].map((n) => [n, footprint(n)]));
    let craneLeft = cranes;
    for (const side of [-1, 1]) {
      for (const row of [0, 1]) {
        let z = START;
        while (z > START - RUN + 10) {
          const name = pick(row === 0 ? BAJOS : TORRES);
          const turn = Math.random() < 0.5 ? 0 : Math.PI;
          const { w, d } = sizes.get(name)!;
          const gap = rand(4, 14);
          if (clear(z, d) || z - d < START - RUN) {
            z -= 12;
            continue;
          }
          if (row === 1 && craneLeft > 0 && Math.random() < 0.12) {
            // Hueco con una grúa de obra.
            const crane = propClone('grua');
            crane.position.set(side * (half + 62 + rand(0, 15)), 0, 0);
            crane.rotation.y = (side === 1 ? 0 : Math.PI) + rand(-0.7, 0.7);
            strip.addObject(crane, z - 12, 30);
            craneLeft--;
            z -= 30;
            continue;
          }
          if (Math.random() < density) {
            const x = side * (half + (row === 0 ? 26 : 58) + w / 2 + rand(0, 8));
            near.place(name, x, 0, z - d / 2, new THREE.Euler(0, turn, 0), 1, d / 2);
          }
          z -= d + gap;
        }
      }
    }
    strip.addObject(propClone('paso_elevado'), overpassZ, 8);
    // Pantallas acústicas a los dos lados, antes del paso elevado.
    const walls = new Placer(strip.group, strip);
    for (const side of [-1, 1]) {
      for (let k = 0; k < 16; k++) walls.place('pantalla', side * (half + 1.05), 0, overpassZ + 30 + k * 4, new THREE.Euler(), 1, 2);
    }
    this.signs(strip, -330, -40, 1);
    // Horizonte: torres quietas y sin niebla.
    const far = new Placer(this.group, null, this.dressFar, 24);
    for (let i = 0; i < 70; i++) {
      const name = pick(TORRES);
      const s = rand(1.0, 1.7);
      far.place(name, rand(-750, 750), -1, rand(-620, -820), new THREE.Euler(0, pick([0, Math.PI / 2, Math.PI]), 0), s);
    }
  }

  /** Torres de alta tensión a la derecha, cada 110 m, con los cables de una a la siguiente. */
  private pylons(): void {
    const strip = this.strip(110 * 5);
    const p = new Placer(strip.group, strip);
    for (let k = 0; k < 5; k++) p.place('torre_electrica', this.half + 70, 0, START - 20 - k * 110, new THREE.Euler(), 1, 120);
  }

  // ------------------------------------------------------------ costa

  private coast(): void {
    const half = this.half;
    const strip = this.strip();
    const place = new Placer(strip.group, strip);
    // Acantilado a la izquierda. Con el giro al azar, cualquier eje puede quedar hacia la
    // carretera: se aparta según el radio de la roca ya escalada para que no pise la calzada.
    for (let z = START; z > START - RUN; z -= rand(6, 14)) {
      const s = rand(5, 16);
      const name = pick(['roca_1', 'roca_2', 'roca_3', 'roca_4']);
      const scale = new THREE.Vector3(s * rand(0.8, 1.6), s * rand(0.6, 1.4), s);
      const reach = propRadius(name) * Math.max(scale.x, scale.y, scale.z);
      place.place(name, -(half + 2.5 + reach + rand(0, 14)), s * 0.2, z,
        new THREE.Euler(rand(0, 3), rand(0, 3), rand(0, 3)), scale, s);
    }
    // Lado del mar: paseo con barandilla a tramos y palmeras.
    for (let z = START, on = true; z > START - RUN; ) {
      const len = on ? 120 : 60;
      if (on) for (let k = 0; k < len / 6; k++) place.place('barandilla', half + 2.6, 0, z - k * 6, new THREE.Euler(), 1, 3);
      z -= len;
      on = !on;
    }
    for (let z = START; z > START - RUN; z -= rand(18, 34)) {
      place.place(pick(['palmera_1', 'palmera_2', 'palmera_3']), half + rand(5, 12), 0, z, new THREE.Euler(0, rand(0, 6.28), 0), rand(0.85, 1.15), 6);
    }
    // Barcas fondeadas en la bahía.
    for (let k = 0; k < 7; k++) {
      place.place('barca', half + rand(60, 260), -1.75, START - rand(0, RUN), new THREE.Euler(0, rand(0, 6.28), 0), 1, 6);
    }
    this.signs(strip, -300, -120, 1);
    // Faro en un cabo, al fondo, con el haz girando.
    const lighthouse = this.farClone('faro');
    lighthouse.position.set(330, -6, -760);
    this.group.add(lighthouse);
    this.beam = lightBeam();
    this.beam.position.set(330, -6 + 8 + 24 + 1.5, -760);
    this.group.add(this.beam);
  }

  // ------------------------------------------------------------ desierto

  private desert(): void {
    const half = this.half;
    const strip = this.strip();
    const place = new Placer(strip.group, strip);
    const stationZ = -250;
    for (const side of [-1, 1]) {
      for (let z = START; z > START - RUN; z -= rand(5, 12)) {
        if (side === -1 && Math.abs(z - stationZ) < 30) continue;
        const plant = Math.random() < 0.35 ? pick(['cactus_1', 'cactus_2', 'cactus_3']) : pick(['matorral_1', 'matorral_2']);
        const x = side * (half + rand(3, 70));
        place.place(plant, x, 0, z, new THREE.Euler(0, rand(0, 6.28), 0), rand(0.8, 1.25), 4);
      }
    }
    // Gasolinera a la izquierda (la pieza tiene la calzada hacia +X).
    const station = propClone('gasolinera');
    station.position.x = -(half + 1.5 + 17);
    strip.addObject(station, stationZ, 24);
    // Postes de teléfono a la derecha, cada 40 m con sus cables.
    const poles = this.strip(40 * 13);
    const p = new Placer(poles.group, poles);
    for (let k = 0; k < 13; k++) p.place('poste', half + 6, 0, START - k * 40, new THREE.Euler(), 1, 42);
    // Aerogeneradores lejos a la derecha, con las aspas girando.
    for (let k = 0; k < 5; k++) {
      const z = START - 60 - k * 100 - rand(0, 40);
      const x = half + rand(140, 320);
      const tower = propClone('aerogenerador');
      tower.position.x = x;
      strip.addObject(tower, z, 10);
      const blades = propClone('aerogenerador_aspas');
      blades.position.set(x, 71.4, 0);
      // El buje está 2 m por delante del fuste.
      strip.add(z + 2, 10, (zz) => (blades.position.z = zz));
      strip.group.add(blades);
      this.spinners.push(blades);
    }
    this.signs(strip, -400, -130, 1);
    // Mesetas en el horizonte.
    const far = new Placer(this.group, null, this.dressFar, 12);
    for (let i = 0; i < 11; i++) {
      let x = rand(-950, 950);
      if (Math.abs(x) < 120) x += Math.sign(x || 1) * 160;
      far.place(pick(['meseta_1', 'meseta_2', 'meseta_3']), x, -2, rand(-640, -840), new THREE.Euler(0, rand(-0.4, 0.4), 0), rand(0.7, 1.2));
    }
  }

  // ------------------------------------------------------------ montaña

  /**
   * Plan de 840 m que se repite: dos túneles de 150 m, un viaducto de 120 m entre ellos y, en
   * lo demás, la pared de roca a la izquierda y el talud hacia el valle a la derecha, en tramos
   * de 40 m. El suelo del juego baja al fondo del valle.
   */
  private mountain(): void {
    const half = this.half;
    const WRAP = 840;
    const strip = this.strip(WRAP);
    const place = new Placer(strip.group, strip, undefined, 32);
    const tunnels = [-140, -560];
    const viaduct = -390;
    // Tramos de terreno: desde el viaducto hacia atrás y hacia delante, hasta meterse en los túneles.
    const slots: number[] = [];
    for (let k = 0; k < 3; k++) slots.push(viaduct + 60 + 20 + k * 40);
    slots.push(viaduct - 60 - 20);
    for (let k = 0; k < 7; k++) slots.push(tunnels[1] - 75 - 20 - k * 40 + 10);
    for (const c of slots) {
      const z = c < START - WRAP ? c + WRAP : c;
      place.place(pick(['ladera_1', 'ladera_2', 'ladera_3']), -(half + 1.2), 0, z, new THREE.Euler(), 1, 20);
      place.place(pick(['talud_1', 'talud_2', 'talud_3']), half + 1.2, 0, z, new THREE.Euler(), 1, 20);
    }
    const scaleX = (half * 2) / 13.6;
    for (const z of tunnels) {
      const t = propClone('tunel');
      t.scale.x = scaleX;
      // Charco de luz de los fluorescentes sobre el asfalto.
      const pool = new THREE.Mesh(
        new THREE.PlaneGeometry(half * 2, 150, 1, 30).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: glow(0xffb867, 0.12), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      pool.scale.x = 1 / scaleX;
      pool.position.y = 0.02;
      t.add(pool);
      strip.addObject(t, z, 78);
      place.place('poste_sos', half + 1.7, 0, z + 75 + 7, new THREE.Euler(), 1, 2);
    }
    const v = propClone('viaducto');
    v.scale.x = scaleX;
    strip.addObject(v, viaduct, 60);
    // Cordilleras al fondo.
    const far = new Placer(this.group, null, this.dressFar, 8);
    for (let i = 0; i < 7; i++) {
      far.place(pick(['montana_1', 'montana_2']), -900 + i * 300 + rand(-80, 80), -30, rand(-700, -840), new THREE.Euler(), rand(0.8, 1.3));
    }
  }
}

function sky(look: Look): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(4000, 1400, 1, 24);
  const pos = geo.getAttribute('position');
  const top = new THREE.Color(look.skyTop);
  const mid = new THREE.Color(look.skyMid);
  const bottom = new THREE.Color(look.haze);
  const c = new THREE.Color();
  const colors: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const y01 = (pos.getY(i) + 700) / 1400;
    if (y01 < 0.12) c.copy(bottom).lerp(mid, y01 / 0.12);
    else c.copy(mid).lerp(top, Math.min(1, (y01 - 0.12) / 0.5));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  mesh.position.set(0, 640, -900);
  return mesh;
}

/** Disco con un halo suave detrás. */
function disc(color: number, k: number, r: number, x: number, y: number, haloK: number): THREE.Group {
  const g = new THREE.Group();
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(r * 9, r * 9),
    new THREE.MeshBasicMaterial({ map: poolTexture(), color: glow(color, haloK), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  const body = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshBasicMaterial({ color: glow(color, k), fog: false }));
  body.position.z = 1;
  g.add(halo, body);
  g.position.set(x, y, -860);
  return g;
}

const moon = () => disc(0xdfe6f2, 1.25, 18, 230, 170, 0.18);
const sun = () => disc(0xffc58a, 2.2, 34, -160, 32, 0.5);

function stars(n: number): THREE.Points {
  const pos: number[] = [];
  for (let i = 0; i < n; i++) pos.push(rand(-1800, 1800), rand(90, 1100), -880);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xc8d2ff, size: 1.6, sizeAttenuation: false, fog: false }));
}

/** El mar a la derecha, con el reflejo de la luna. */
function sea(half: number): THREE.Group {
  const g = new THREE.Group();
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 3000, 30, 120).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x06111b, roughness: 0.16, metalness: 0.7 }),
  );
  water.position.set(half + 8 + 1500, -1.6, -600);
  const reflection = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 700).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: streakTexture(), color: glow(0xdfe6f2, 0.35), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  reflection.position.set(150, -1.5, -500);
  g.add(water, reflection);
  return g;
}

/** Luces de un pueblo al otro lado de la bahía. */
function townLights(): THREE.InstancedMesh {
  const N = 260;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), N);
  const m = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    const cluster = Math.floor(i / 40);
    const cx = 220 + cluster * 140;
    mesh.setMatrixAt(i, m.makeTranslation(cx + rand(-60, 60), rand(-1, 18), rand(-700, -820)));
    mesh.setColorAt(i, glow(Math.random() < 0.8 ? 0xffc27a : 0xdfe8ff, rand(0.8, 1.8)));
  }
  return mesh;
}

/** Haz del faro: dos planos cruzados, con la linterna en medio, que se apagan hacia las
 *  puntas (un haz a cada lado, como los faros de dos ópticas) y giran sobre la linterna. */
function lightBeam(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    map: poolTexture(),
    color: glow(0xfff0c8, 0.5),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  for (const r of [0, Math.PI / 2]) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(520, 9), mat);
    plane.rotation.x = r;
    g.add(plane);
  }
  return g;
}
