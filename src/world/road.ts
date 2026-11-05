import * as THREE from 'three';
import { WORLD } from '../config';
import { PropInstances, propLoaded, propMaterial } from './props';
import { CAM_H, CAM_Z } from './stage';
import { poolTexture, streakTexture } from './textures';

// Autopista de noche: asfalto mojado y pintura blanca, con el quitamiedos de hormigón y las
// farolas de luz cálida hechos en Blender (piezas "quitamiedos" y "farola", P14).

export const NEAR = 30;
export const FAR = -420;
const LEN = NEAR - FAR;
const DASH_SPACING = 12;
const BARRIER_SPACING = 6;
const LAMP_SPACING = 36;
export const LAMP_COLOR = 0xffb867;
const LAMP_H = 9.3;
/** La luminaria queda 3,1 m hacia la calzada desde el fuste (pieza "farola"). */
const LAMP_REACH = 3.1;
/** Subdivisiones a lo largo de las piezas largas, para que se doblen bien en las curvas. */
const SEGS = Math.ceil(LEN / 5);

export class Road {
  readonly group = new THREE.Group();
  readonly laneCount: number;
  readonly width: number;
  private readonly dashes: THREE.InstancedMesh;
  private readonly barriers: PropInstances | null = null;
  /** Construida con las piezas de Blender ya cargadas (si no, se rehace al cargarlas). */
  readonly complete: boolean;
  private readonly lamps = new THREE.Group();
  private readonly lampMats: { mat: THREE.MeshBasicMaterial; base: THREE.Color }[] = [];
  private readonly groundMat: THREE.MeshStandardMaterial;
  private readonly ground: THREE.Mesh;
  private readonly streaks: THREE.InstancedMesh;
  private readonly lampSpots: { x: number; z: number }[] = [];
  private readonly tmp = new THREE.Matrix4();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpScale = new THREE.Vector3();
  private readonly noRotation = new THREE.Quaternion();

  constructor(laneCount: number) {
    this.laneCount = laneCount;
    this.width = laneCount * WORLD.laneWidth;
    const half = this.width / 2;
    const mid = (NEAR + FAR) / 2;
    const m = new THREE.Matrix4();

    const asphalt = new THREE.Mesh(
      new THREE.BoxGeometry(this.width + 2.4, 0.3, LEN, 1, 1, SEGS),
      // Mojado: oscuro y con algo de brillo para que los faros saquen reflejo.
      new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.42, metalness: 0.1 }),
    );
    asphalt.position.set(0, -0.15, mid);
    this.group.add(asphalt);

    this.groundMat = new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 1 });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, LEN + 400, 8, SEGS), this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(0, -0.3, mid);
    this.group.add(this.ground);

    // Pintura: bordes continuos y discontinuas entre carriles.
    const paint = new THREE.MeshStandardMaterial({ color: 0xd2d2cb, roughness: 0.7, emissive: 0x1c1c1c });
    const edgeGeo = new THREE.BoxGeometry(0.15, 0.02, LEN, 1, 1, SEGS);
    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(edgeGeo, paint);
      edge.position.set(side * (half - 0.25), 0.01, mid);
      this.group.add(edge);
    }
    const per = Math.ceil(LEN / DASH_SPACING) + 1;
    this.dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.02, 3), paint, Math.max(1, (laneCount - 1) * per));
    let n = 0;
    for (let b = 1; b < laneCount; b++) {
      const x = (b - laneCount / 2) * WORLD.laneWidth;
      for (let k = 0; k < per; k++) {
        m.makeTranslation(x, 0.01, NEAR - k * DASH_SPACING);
        this.dashes.setMatrixAt(n++, m);
      }
    }
    this.dashes.count = n;
    this.group.add(this.dashes);

    // Quitamiedos de hormigón (perfil New Jersey) en tramos de 6 m.
    this.complete = propLoaded('quitamiedos') && propLoaded('farola');
    const perBarrier = Math.ceil(LEN / BARRIER_SPACING) + 1;
    if (this.complete) {
      this.barriers = new PropInstances('quitamiedos', perBarrier * 2);
      n = 0;
      for (const side of [-1, 1]) {
        for (let k = 0; k < perBarrier; k++) {
          this.barriers.set(n++, m.makeTranslation(side * (half + 0.55), 0, NEAR - k * BARRIER_SPACING));
        }
      }
      this.group.add(this.barriers.group);
    }

    // Farolas con brazo sobre la calzada, al tresbolillo, y su charco de luz en el asfalto.
    const perLamp = Math.ceil(LEN / LAMP_SPACING) + 1;
    const posts = this.complete ? new PropInstances('farola', perLamp * 2) : null;
    const turn = new THREE.Matrix4().makeRotationY(Math.PI);
    const pools = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(15, 15).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: poolTexture(),
        color: new THREE.Color(LAMP_COLOR).multiplyScalar(0.12),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      perLamp * 2,
    );
    // Reflejo de cada farola en el asfalto mojado. Se recoloca en cada fotograma.
    this.streaks = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.9, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: streakTexture(),
        color: new THREE.Color(LAMP_COLOR).multiplyScalar(0.4),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      perLamp * 2,
    );
    this.streaks.frustumCulled = false;
    n = 0;
    for (const side of [-1, 1]) {
      const poleX = side * (half + 1.4);
      const headX = side * (half + 1.4 - LAMP_REACH);
      for (let k = 0; k < perLamp; k++) {
        const z = NEAR - k * LAMP_SPACING - (side === 1 ? LAMP_SPACING / 2 : 0);
        // La pieza tiene el brazo hacia -X: en el lado izquierdo se gira media vuelta.
        m.makeTranslation(poleX, 0, z);
        if (side === -1) m.multiply(turn);
        posts?.set(n, m);
        pools.setMatrixAt(n, m.makeTranslation(headX * 0.6, 0.02, z));
        this.lampSpots.push({ x: headX, z });
        n++;
      }
    }
    for (const mesh of [pools, this.streaks]) {
      const mat = mesh.material as THREE.MeshBasicMaterial;
      this.lampMats.push({ mat, base: mat.color.clone() });
    }
    // La luminaria es un material compartido con otras piezas: su color original va aparte.
    const head = propMaterial('luz_farola') as THREE.MeshBasicMaterial | undefined;
    if (head) this.lampMats.push({ mat: head, base: head.userData.base as THREE.Color });
    if (posts) this.lamps.add(posts.group);
    this.lamps.add(pools, this.streaks);
    this.group.add(this.lamps);
  }

  /** Farolas (0 = no hay, 1 = normales), color del suelo y su altura (en la montaña el suelo
   *  es el fondo del valle, muy por debajo de la carretera). */
  setLook(lamps: number, ground: number, groundY = -0.3): void {
    this.ground.position.y = groundY;
    this.lamps.visible = lamps > 0;
    for (const { mat, base } of this.lampMats) mat.color.copy(base).multiplyScalar(Math.max(lamps, 0.01));
    this.groundMat.color.setHex(ground);
  }

  laneX(lane: number): number {
    return (lane - (this.laneCount - 1) / 2) * WORLD.laneWidth;
  }

  /** `distance`: metros recorridos. Desplaza lo que se repite para dar sensación de avance. */
  update(distance: number): void {
    this.dashes.position.z = distance % DASH_SPACING;
    if (this.barriers) this.barriers.group.position.z = distance % BARRIER_SPACING;
    const offset = distance % LAMP_SPACING;
    this.lamps.position.z = offset;

    // El reflejo de una luz alta cae en el punto del suelo entre la cámara y la farola donde
    // rebota el rayo, y se alarga más cuanto más lejos está.
    this.lampSpots.forEach((spot, i) => {
      const toLamp = CAM_Z - (spot.z + offset);
      const zr = CAM_Z - (toLamp * CAM_H) / (CAM_H + LAMP_H);
      const length = THREE.MathUtils.clamp(toLamp * 0.16, 1.5, 11);
      this.tmpPos.set(spot.x * 0.92, 0.025, zr - offset);
      this.tmpScale.set(1, 1, toLamp > 0 ? length : 0.001);
      this.streaks.setMatrixAt(i, this.tmp.compose(this.tmpPos, this.noRotation, this.tmpScale));
    });
    this.streaks.instanceMatrix.needsUpdate = true;
  }
}
