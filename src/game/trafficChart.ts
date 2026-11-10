import { TRAFFIC, WORLD } from '../config';
import type { Section } from './song';

// Tráfico escrito con la música. Los cambios de marcha caen en los tiempos fuertes y los coches
// pasan junto al jugador en los débiles (2 y 4), más en los estribillos y casi ninguno en los
// breaks. Sale siempre igual para la misma canción y dificultad: se puede aprender y las
// puntuaciones se pueden comparar.

export interface TrafficGroup {
  /** Segundos de canción en que el grupo pasa junto al coche. */
  time: number;
  /** Uno o dos carriles; nunca los ocupa todos. */
  lanes: number[];
  /** Metros que se retrasa el segundo coche de una pareja (0 = en paralelo). */
  stagger: number;
}

/** Un tramo de música con el compás fijo. */
export interface TrafficSpan {
  section: Section;
  start: number;
  bars: number;
  barDur: number;
}

export interface TrafficOptions {
  lanes: number;
  /** Más alto, menos grupos. */
  gapScale: number;
  pairChance: number;
  seed: number;
}

/** Tiempos 2 y 4 del compás, en fracción de compás. */
const WEAK_BEATS = [0.25, 0.75];

/** Números al azar repetibles: la misma semilla da siempre el mismo tráfico. */
function randomFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function writeTraffic(spans: TrafficSpan[], o: TrafficOptions): TrafficGroup[] {
  const random = randomFrom(o.seed);
  const out: TrafficGroup[] = [];
  for (const { section, start, bars, barDur } of spans) {
    const perSlot = TRAFFIC.groupsPerBar[section] / (WEAK_BEATS.length * o.gapScale);
    // El acumulador reparte los grupos a intervalos regulares, y el ritmo se puede aprender.
    let acc = 0.5;
    for (let bar = 0; bar < bars; bar++) {
      for (const beat of WEAK_BEATS) {
        acc += perSlot;
        if (acc < 1) continue;
        acc = Math.min(1, acc - 1);
        const free = [...Array(o.lanes).keys()];
        const lanes = [free.splice(Math.floor(random() * free.length), 1)[0]];
        const pair = o.lanes >= 3 && random() < o.pairChance;
        if (pair) lanes.push(free[Math.floor(random() * free.length)]);
        const stagger = pair && random() < TRAFFIC.staggerChance ? TRAFFIC.stagger : 0;
        out.push({ time: start + (bar + beat) * barDur, lanes, stagger });
      }
    }
  }
  return out;
}

/** Paso de la tabla de distancias, en segundos. */
const STEP = 1 / 30;

/**
 * Metros que se acerca el tráfico desde el inicio hasta cada instante, con la marcha que marcan
 * las líneas. Como las marchas siguen a las líneas se aciertes o no, cada coche llega en su
 * tiempo aunque el jugador falle, coja un nitro o choque.
 */
export class Approach {
  private readonly cues: readonly { time: number; targetGear: number }[];
  private readonly gearSpeed: (gear: number) => number;
  private readonly metres = [0];
  private next = 0;
  private gear = 1;
  private speed: number;

  /** `cues` se puede ir alargando: la tabla solo mira las que ya han llegado a su instante. */
  constructor(cues: readonly { time: number; targetGear: number }[], gearSpeed: (gear: number) => number) {
    this.cues = cues;
    this.gearSpeed = gearSpeed;
    this.speed = gearSpeed(1);
  }

  /** Metros recorridos hasta el instante `t` de la canción. */
  at(t: number): number {
    if (t <= 0) return t * (this.gearSpeed(1) - WORLD.trafficSpeed);
    const k = t / STEP;
    const i = Math.floor(k);
    while (this.metres.length <= i + 1) this.advance();
    return this.metres[i] + (this.metres[i + 1] - this.metres[i]) * (k - i);
  }

  private advance(): void {
    const t = (this.metres.length - 1) * STEP;
    while (this.next < this.cues.length && this.cues[this.next].time <= t) this.gear = this.cues[this.next++].targetGear;
    this.speed += (this.gearSpeed(this.gear) - this.speed) * Math.min(1, STEP * WORLD.speedResponse);
    this.metres.push(this.metres[this.metres.length - 1] + (this.speed - WORLD.trafficSpeed) * STEP);
  }
}
