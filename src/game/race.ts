import {
  ENGINE,
  GRADES,
  GRADE_GOOD,
  LINE_GRACE,
  PICKUPS,
  LAYERS_BY_GEAR,
  PERFECT_FRACTION,
  POINTS,
  STREAK,
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
  /** Ya ha bajado la barra una vez: cada línea castiga solo una. */
  charged: boolean;
}

export type RaceEvent =
  /** `raised`: este cambio ha subido un escalón el multiplicador. */
  | { type: 'shift'; quality: 'perfect' | 'good'; cue: Cue; nitro: boolean; raised: boolean }
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
  /** De 1 a STREAK.maxMultiplier: dura hasta el siguiente fallo. */
  multiplier = 1;
  /** Cambios buenos seguidos desde el último fallo. */
  streak = 0;
  /** Pulso de la canción en que arranca el nitro (-1 sin nitro). */
  nitroFrom = -1;
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
  /**
   * Línea en que acaba el nitro: la primera que quede al menos a un compás de su arranque. Así la
   * mezcla se abre en un pulso y se cierra en el tiempo fuerte de esa línea, y ese cambio vale el
   * doble. null si aún no está escrita (modo infinito) o si no quedan líneas: entonces dura hasta
   * el final.
   */
  private nitroCue: Cue | null = null;
  /** Lo antes que puede caer la línea del nitro: su arranque más un compás. */
  private nitroMinEnd = 0;

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
      return { time: c.time, dir: c.dir, targetGear: gear, state: 'pending', judgedAt: 0, charged: false };
    });
    this.cues.push(...added);
    if (this.nitroFrom >= 0 && !this.nitroCue) this.nitroCue = this.firstCueFrom(this.nitroMinEnd);
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
    return this.layersFor(this.gear);
  }

  /** Capas que suenan en la marcha `gear`. */
  layersFor(gear: number): Set<Layer> {
    const table = LAYERS_BY_GEAR[this.vehicle.gears];
    const set = new Set<Layer>();
    for (let i = 0; i < gear; i++) for (const layer of table[i]) set.add(layer);
    return set;
  }

  /** Tiempo de la línea que cierra el nitro en marcha (endTime si dura hasta el final). */
  nitroUntil(): number {
    return this.nitroCue?.time ?? this.endTime;
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
    const win = this.window();
    if (cue && Math.abs(t - cue.time) <= win) {
      const perfect = Math.abs(t - cue.time) <= win * PERFECT_FRACTION;
      this.next++;
      cue.judgedAt = t;
      const nitro = cue === this.nitroCue && t >= this.nitroFrom;
      if (cue === this.nitroCue) this.endNitro();
      if (cue.dir === dir) {
        cue.state = 'hit';
        const base = perfect ? POINTS.perfect : POINTS.good;
        this.shiftPoints += perfect ? POINTS.perfect : GRADE_GOOD;
        this.score += base * this.multiplier * (nitro ? PICKUPS.nitroShift : 1);
        if (perfect) this.addEngine(ENGINE.perfect);
        this.streak++;
        const raised = this.streak % STREAK.every === 0 && this.raiseMultiplier();
        this.events.push({ type: 'shift', quality: perfect ? 'perfect' : 'good', cue, nitro, raised });
      } else {
        // Sentido equivocado: castiga y el coche cambia solo, como con una línea fallada.
        cue.state = 'wrong';
        this.breakStreak();
        this.chargeLine(cue, ENGINE.badShift);
        this.events.push({ type: 'badShift', cue });
      }
      this.gear = cue.targetGear;
      return;
    }
    // Tarde, justo después de una línea ya fallada: esa línea ya cobró al pasar.
    const last = this.cues[this.next - 1];
    if (last?.state === 'missed' && t - last.time <= win + LINE_GRACE) return;
    // Cambio sin línea: rasca y la marcha no cambia, así las líneas siguientes cuadran.
    this.breakStreak();
    if (cue && cue.time - t <= win + LINE_GRACE) this.chargeLine(cue, ENGINE.badShift);
    else this.addEngine(ENGINE.badShift);
    this.events.push({ type: 'badShift', cue: null });
  }

  crash(): void {
    if (this.result !== 'running') return;
    this.breakStreak();
    this.addEngine(ENGINE.crash);
    this.events.push({ type: 'crash' });
  }

  /**
   * `beat`: primer pulso de la canción desde ahora, que es donde arranca el nitro.
   * `bar`: lo que dura un compás en ese momento; el nitro dura al menos eso.
   */
  collect(kind: PickupKind, beat: number, bar: number): void {
    if (this.result !== 'running') return;
    if (kind === 'repair') this.addEngine(PICKUPS.repair);
    else if (kind === 'points') this.score += PICKUPS.points * this.multiplier;
    else if (kind === 'multiplier') this.raiseMultiplier();
    else if (this.nitroFrom < 0) {
      // Con un nitro en marcha (o esperando su pulso), el nuevo no cambia nada.
      this.nitroFrom = beat;
      this.nitroMinEnd = beat + bar;
      this.nitroCue = this.firstCueFrom(this.nitroMinEnd);
    }
    this.events.push({ type: 'pickup', kind });
  }

  nitroActive(t: number): boolean {
    return this.result === 'running' && this.nitroFrom >= 0 && t >= this.nitroFrom;
  }

  /** Lo que queda de nitro: 1 al arrancar y 0 al llegar a su línea (0 sin nitro). */
  nitroLeft(t: number): number {
    if (!this.nitroActive(t)) return 0;
    const end = this.nitroCue?.time ?? this.endTime;
    if (!Number.isFinite(end)) return 1;
    const span = end - this.nitroFrom;
    return span > 0 ? Math.max(0, Math.min(1, (end - t) / span)) : 0;
  }

  update(t: number): void {
    if (this.result !== 'running') return;
    let cue = this.cues[this.next];
    while (cue && t > cue.time + this.window()) {
      this.next++;
      cue.state = 'missed';
      cue.judgedAt = t;
      if (cue === this.nitroCue) this.endNitro();
      this.breakStreak();
      this.gear = cue.targetGear;
      this.chargeLine(cue, ENGINE.missedLine);
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

  /** Primera línea pendiente que llega en `t` o después (con margen para el redondeo). */
  private firstCueFrom(t: number): Cue | null {
    for (let i = this.next; i < this.cues.length; i++) if (this.cues[i].time >= t - 1e-6) return this.cues[i];
    return null;
  }

  /** Sube un escalón si queda sitio; devuelve si ha subido. */
  private raiseMultiplier(): boolean {
    if (this.multiplier >= STREAK.maxMultiplier) return false;
    this.multiplier++;
    return true;
  }

  private breakStreak(): void {
    this.streak = 0;
    this.multiplier = 1;
  }

  private chargeLine(cue: Cue, delta: number): void {
    if (cue.charged) return;
    cue.charged = true;
    this.addEngine(delta);
  }

  private endNitro(): void {
    this.nitroFrom = -1;
    this.nitroCue = null;
  }

  private addEngine(delta: number): void {
    if (delta < 0) delta *= this.vehicle.damageScale;
    this.engine = Math.max(0, Math.min(ENGINE.max, this.engine + delta));
    if (this.engine <= 0) this.result = 'stalled';
  }
}
