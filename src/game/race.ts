import {
  ENGINE,
  GRADES,
  PICKUPS,
  LAYERS_BY_GEAR,
  PERFECT_FRACTION,
  POINTS,
  WINDOW_MS,
  WINDOW_NARROW_PER_GEAR,
  type Difficulty,
  type Layer,
  type PickupKind,
} from '../config';
import { chartFor } from './levels';
import { barDuration, type SongDef } from './song';
import type { Vehicle } from './vehicles';

export type CueState = 'pending' | 'hit' | 'missed' | 'wrong';

/** Una línea antes de jugarla: cuándo llega y en qué sentido. */
export interface TimedCue {
  time: number;
  dir: 1 | -1;
}

export interface Cue {
  /** Segundos desde el compás 0. */
  time: number;
  dir: 1 | -1;
  /** Marcha en la que queda el coche al pasar la línea, se acierte o no. */
  targetGear: number;
  state: CueState;
  judgedAt: number;
}

export type RaceEvent =
  | { type: 'shift'; quality: 'perfect' | 'good'; cue: Cue }
  | { type: 'badShift'; cue: Cue | null }
  | { type: 'missed'; cue: Cue }
  | { type: 'crash' }
  | { type: 'pickup'; kind: PickupKind };

export type RaceResult = 'running' | 'stalled' | 'finished';

/** Reglas de una carrera: marchas, ventana de cambio, barra de motor y puntos. */
export class Race {
  gear = 1;
  engine: number = ENGINE.start;
  score = 0;
  /** 1 o 2: el multiplicador dura hasta el siguiente fallo. */
  multiplier = 1;
  /** Segundos de canción hasta los que dura el nitro. */
  nitroUntil = -1;
  result: RaceResult = 'running';
  readonly cues: Cue[] = [];
  /** Infinity en el modo infinito: solo se acaba al calar el motor. */
  readonly endTime: number;
  /** Estrecha la ventana además de la dificultad y el vehículo (vueltas del modo infinito). */
  windowScale = 1;
  private readonly vehicle: Vehicle;
  private readonly difficulty: Difficulty;
  private next = 0;
  private events: RaceEvent[] = [];
  /** Puntos de los cambios sin multiplicador ni premios: es lo que cuenta para la nota. */
  private shiftPoints = 0;

  /** `cues`: líneas en orden, con su tiempo en segundos desde el compás 0. */
  constructor(vehicle: Vehicle, difficulty: Difficulty, cues: TimedCue[], endTime: number) {
    this.vehicle = vehicle;
    this.difficulty = difficulty;
    this.endTime = endTime;
    this.append(cues);
  }

  /** Carrera de un nivel: las líneas de su canción para las marchas del vehículo. */
  static forSong(song: SongDef, vehicle: Vehicle, difficulty: Difficulty): Race {
    const bar = barDuration(song);
    const cues = chartFor(song, vehicle.gears).map((c) => ({ time: c.bar * bar, dir: c.dir }));
    return new Race(vehicle, difficulty, cues, song.bars * bar);
  }

  /** Añade líneas al final (el modo infinito las va generando sobre la marcha). */
  append(cues: TimedCue[]): Cue[] {
    let gear = this.cues.length ? this.cues[this.cues.length - 1].targetGear : 1;
    const added = cues.map((c): Cue => {
      gear += c.dir;
      return { time: c.time, dir: c.dir, targetGear: gear, state: 'pending', judgedAt: 0 };
    });
    this.cues.push(...added);
    return added;
  }

  get maxScore(): number {
    return this.cues.length * POINTS.perfect;
  }

  /** Media ventana de cambio, en segundos, para la marcha actual. */
  window(): number {
    const narrow = Math.pow(1 - WINDOW_NARROW_PER_GEAR, this.gear - 1);
    return (WINDOW_MS[this.difficulty] * narrow * this.vehicle.windowScale * this.windowScale) / 1000;
  }

  activeLayers(): Set<Layer> {
    const table = LAYERS_BY_GEAR[this.vehicle.gears];
    const set = new Set<Layer>();
    for (let i = 0; i < this.gear; i++) for (const layer of table[i]) set.add(layer);
    return set;
  }

  nextCue(): Cue | undefined {
    return this.cues[this.next];
  }

  /** Momento de la última línea ya pasada (0 si no hay ninguna). */
  lastCueTime(): number {
    return this.next > 0 ? this.cues[this.next - 1].time : 0;
  }

  shift(dir: 1 | -1, t: number): void {
    if (this.result !== 'running') return;
    const cue = this.cues[this.next];
    if (cue && Math.abs(t - cue.time) <= this.window()) {
      const perfect = Math.abs(t - cue.time) <= this.window() * PERFECT_FRACTION;
      this.next++;
      cue.judgedAt = t;
      if (cue.dir === dir) {
        cue.state = 'hit';
        const base = perfect ? POINTS.perfect : POINTS.good;
        this.shiftPoints += base;
        this.score += base * this.multiplier;
        if (perfect) this.addEngine(ENGINE.perfect);
        this.events.push({ type: 'shift', quality: perfect ? 'perfect' : 'good', cue });
      } else {
        // Sentido equivocado: castiga y el coche cambia solo, como con una línea fallada.
        cue.state = 'wrong';
        this.multiplier = 1;
        this.addEngine(ENGINE.badShift);
        this.events.push({ type: 'badShift', cue });
      }
      this.gear = cue.targetGear;
    } else {
      // Cambio sin línea: rasca y la marcha no cambia, así las líneas siguientes cuadran.
      this.multiplier = 1;
      this.addEngine(ENGINE.badShift);
      this.events.push({ type: 'badShift', cue: null });
    }
  }

  crash(): void {
    if (this.result !== 'running') return;
    this.multiplier = 1;
    this.addEngine(ENGINE.crash);
    this.events.push({ type: 'crash' });
  }

  collect(kind: PickupKind, t: number): void {
    if (this.result !== 'running') return;
    if (kind === 'repair') this.addEngine(PICKUPS.repair);
    else if (kind === 'points') this.score += PICKUPS.points * this.multiplier;
    else if (kind === 'multiplier') this.multiplier = PICKUPS.multiplier;
    else this.nitroUntil = t + PICKUPS.nitroSeconds;
    this.events.push({ type: 'pickup', kind });
  }

  nitroActive(t: number): boolean {
    return t < this.nitroUntil;
  }

  update(t: number): void {
    if (this.result !== 'running') return;
    let cue = this.cues[this.next];
    while (cue && t > cue.time + this.window()) {
      this.next++;
      cue.state = 'missed';
      cue.judgedAt = t;
      this.multiplier = 1;
      this.gear = cue.targetGear;
      this.addEngine(ENGINE.missedLine);
      this.events.push({ type: 'missed', cue });
      cue = this.cues[this.next];
    }
    if (this.result === 'running' && t >= this.endTime) this.result = 'finished';
  }

  drainEvents(): RaceEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  grade(): string {
    const ratio = this.shiftPoints / this.maxScore;
    for (const g of GRADES) if (ratio >= g.min) return g.grade;
    return 'C';
  }

  private addEngine(delta: number): void {
    if (delta < 0) delta *= this.vehicle.damageScale;
    this.engine = Math.max(0, Math.min(ENGINE.max, this.engine + delta));
    if (this.engine <= 0) this.result = 'stalled';
  }
}
