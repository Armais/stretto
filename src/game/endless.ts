import { GearMapper, LEVELS, type LevelDef } from './levels';
import type { TimedCue } from './race';
import { CueWriter, barDuration, type Section, type ShiftCueDef, type SongDef } from './song';
import type { TrafficSpan } from './trafficChart';

// Modo infinito (P11). Cada emisora es uno de los cinco estilos y suena como cinco bloques de
// 8 compases sacados de las pistas grabadas de su canción: estrofa, estribillo, subida,
// estribillo final y break. Dentro de la emisora cada bloque va un poco más rápido (hasta un
// 6%); luego un barrido de radio y la emisora siguiente. Tras el drum and bass se vuelve a
// empezar, con menos ventana y más tráfico en cada vuelta.

/** Tipos de bloque, en el orden en que suenan. El break final baja las marchas antes del salto. */
const BLOCK_ORDER: Section[] = ['verse', 'chorus', 'build', 'final', 'break'];
export const BLOCK_BARS = 8;
/** Lo más que se acelera una emisora (≈ un semitono, que también sube). */
const MAX_RATE = 1.06;
/** Compases del barrido entre emisoras; el primero hace de entrada y es más largo. */
const SWEEP_BARS = 1;
const FIRST_SWEEP_BARS = 2;
/** Cada vuelta multiplica la ventana y la distancia entre coches, y suma a las parejas. */
export const LAP = { window: 0.9, trafficGap: 0.9, pairs: 0.1 } as const;

export interface Block {
  /** Segundos de carrera en que empieza y acaba. */
  start: number;
  end: number;
  /** Velocidad de reproducción de las pistas. */
  rate: number;
  /** Compás de la canción original en que empieza. */
  songBar: number;
  /** Segundos reales que dura un compás en este bloque. */
  barDur: number;
  sections: [Section, number][];
  /** Las secciones tal como se juegan (las líneas y el tráfico). */
  played: Played[];
}

/** Sección, compases que se juegan y compases que le faltan por delante. */
type Played = [Section, number, number];

export interface Station {
  /** Número de emisora desde el principio de la partida. */
  n: number;
  /** 0 a 4: el nivel del que sale (estilo, carriles, escenario). */
  style: number;
  lap: number;
  level: LevelDef;
  sweepStart: number;
  sweepBarDur: number;
  /** Primer bloque: aquí arranca la música de la emisora. */
  start: number;
  end: number;
  blocks: Block[];
}

/** Compás en que empieza la primera sección de cada tipo de BLOCK_ORDER. */
function blockStarts(song: SongDef): number[] {
  return BLOCK_ORDER.map((type) => {
    let bar = 0;
    for (const [sec, len] of song.sections) {
      if (sec === type && bar + BLOCK_BARS <= song.bars) return bar;
      bar += len;
    }
    throw new Error(`La canción ${song.stems} no tiene ${type}`);
  });
}

/**
 * Tras el barrido solo hay ruido de radio: los primeros compases de cada emisora cuentan como
 * intro para las líneas, así se oye el pulso antes de la primera (como en la intro de los niveles).
 */
const LEAD_IN_BARS = 2;

function leadIn(sections: [Section, number][]): Played[] {
  const out: Played[] = [['intro', LEAD_IN_BARS, 0]];
  let skip = LEAD_IN_BARS;
  for (const [sec, len] of sections) {
    const cut = Math.min(skip, len);
    skip -= cut;
    if (len > cut) out.push([sec, len - cut, cut]);
  }
  return out;
}

/** Tramos de una emisora para escribir su tráfico. */
export function stationSpans(st: Station): TrafficSpan[] {
  return st.blocks.flatMap((b) => {
    let start = b.start;
    return b.played.map(([section, bars]) => {
      const span = { section, start, bars, barDur: b.barDur };
      start += bars * b.barDur;
      return span;
    });
  });
}

/** Secciones de la canción entre `from` y `from + len`, recortadas. */
function sectionsIn(song: SongDef, from: number, len: number): [Section, number][] {
  const out: [Section, number][] = [];
  let bar = 0;
  for (const [sec, l] of song.sections) {
    const a = Math.max(bar, from);
    const b = Math.min(bar + l, from + len);
    if (b > a) out.push([sec, b - a]);
    bar += l;
  }
  return out;
}

/** Compás de inicio de cada bloque, por estilo. tools/sonicpi/stems.py blocks corta con estos. */
export const BLOCK_STARTS = LEVELS.map((l) => blockStarts(l.song));

interface Span {
  firstBar: number;
  bars: number;
  start: number;
  barDur: number;
}

export class EndlessTimeline {
  readonly stations: Station[] = [];
  private readonly writer = new CueWriter();
  private readonly mapper: GearMapper;
  /** Líneas ya escritas cuyo compás aún no tiene tiempo (cae en la emisora siguiente). */
  private pending: ShiftCueDef[] = [];
  /** Tramos con el compás de duración fija (barridos y bloques), para pasar compases a segundos. */
  private readonly spans: Span[] = [];
  private t = 0;
  private bar = 0;

  constructor(gears: number) {
    this.mapper = new GearMapper(gears);
  }

  /** Genera emisoras hasta pasar `until` (segundos) y devuelve las líneas nuevas, en orden. */
  extend(until: number): TimedCue[] {
    while (this.t < until) this.addStation();
    const out: TimedCue[] = [];
    while (this.pending.length && this.pending[0].bar < this.bar) {
      const c = this.pending.shift()!;
      out.push({ time: this.timeOfBar(c.bar), dir: c.dir });
    }
    return out;
  }

  stationAt(t: number): Station {
    for (let i = this.stations.length - 1; i > 0; i--) if (t >= this.stations[i].sweepStart) return this.stations[i];
    return this.stations[0];
  }

  /** Bloque que suena en `t`, o null durante el barrido. */
  blockAt(t: number): Block | null {
    const st = this.stationAt(t);
    if (t < st.start) return null;
    return st.blocks.find((b) => t < b.end) ?? st.blocks[st.blocks.length - 1];
  }

  /** Duración real de un compás en `t`. */
  barDurAt(t: number): number {
    return this.blockAt(t)?.barDur ?? this.stationAt(t).sweepBarDur;
  }

  /** Primer pulso (negra) desde `t`. Los tramos son de compases enteros, así que el pulso cae dentro. */
  nextBeat(t: number): number {
    for (let i = this.spans.length - 1; i >= 0; i--) {
      const s = this.spans[i];
      if (t < s.start) continue;
      const beat = s.barDur / 4;
      return s.start + Math.ceil((t - s.start) / beat - 1e-9) * beat;
    }
    return t;
  }

  /** Sección que suena en `t` ('intro' en el barrido). */
  sectionAt(t: number): Section {
    const b = this.blockAt(t);
    if (!b) return 'intro';
    let at = b.start;
    for (const [sec, len] of b.sections) {
      at += len * b.barDur;
      if (t < at) return sec;
    }
    return b.sections[b.sections.length - 1][0];
  }

  private addStation(): void {
    const n = this.stations.length;
    const style = n % LEVELS.length;
    const level = LEVELS[style];
    const song = level.song;
    const bar0 = barDuration(song);
    const sweepBars = n === 0 ? FIRST_SWEEP_BARS : SWEEP_BARS;
    const sweepStart = this.t;
    this.span(sweepBars, bar0);
    this.writer.section('intro', this.bar - sweepBars, sweepBars, song.draw);
    const start = this.t;
    const blocks: Block[] = BLOCK_STARTS[style].map((songBar, k) => {
      const rate = 1 + ((MAX_RATE - 1) * k) / (BLOCK_ORDER.length - 1);
      const barDur = bar0 / rate;
      const firstBar = this.bar;
      const blockStart = this.span(BLOCK_BARS, barDur);
      const sections = sectionsIn(song, songBar, BLOCK_BARS);
      const played: Played[] = k === 0 ? leadIn(sections) : sections.map(([sec, len]) => [sec, len, 0]);
      let at = firstBar;
      for (const [sec, len, cut] of played) {
        this.writer.section(sec, at, len, song.draw, cut);
        at += len;
      }
      return { start: blockStart, end: this.t, rate, songBar, barDur, sections, played };
    });
    this.stations.push({ n, style, lap: Math.floor(n / LEVELS.length), level, sweepStart, sweepBarDur: bar0, start, end: this.t, blocks });
    for (const c of this.writer.drain()) this.pending.push(...this.mapper.map(c));
  }

  /** Añade un tramo de `bars` compases de `barDur` segundos y devuelve cuándo empieza. */
  private span(bars: number, barDur: number): number {
    const start = this.t;
    this.spans.push({ firstBar: this.bar, bars, start, barDur });
    this.bar += bars;
    this.t += bars * barDur;
    return start;
  }

  private timeOfBar(bar: number): number {
    for (let i = this.spans.length - 1; i >= 0; i--) {
      const s = this.spans[i];
      if (bar >= s.firstBar) return s.start + (bar - s.firstBar) * s.barDur;
    }
    return 0;
  }
}
