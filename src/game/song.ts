export interface ShiftCueDef {
  /** Compás en cuyo tiempo fuerte cae la línea (empieza en 0). */
  bar: number;
  dir: 1 | -1;
}

export interface SongDef {
  bpm: number;
  bars: number;
  /** Compás donde empieza el estribillo final (ahí suena el solo). */
  finalChorusBar: number;
  /** Compás donde empieza el break: ahí lee Vela el mensaje de un oyente. */
  breakBar: number;
  /** Líneas de cambio para un vehículo de 5 marchas. Se empieza en 1.ª. */
  cues: ShiftCueDef[];
  /** Carpeta de public/music con las pistas grabadas en Sonic Pi. Sin ella, música sintetizada. */
  stems?: string;
  /** Secciones de la canción (las mismas que su .rb): curvas en los breaks, etc. */
  sections: [Section, number][];
  /** Dibujo de las líneas de esta canción, sección a sección. */
  draw: ChartDraw;
}

/**
 * Cómo se dibujan las líneas de una sección. Los compases cuentan desde su primer compás y las
 * fracciones son tiempos: 2.5 es el tiempo 3 del tercer compás.
 */
export interface SectionDraw {
  /** Sube desde el principio cada `every` compases hasta la marcha `to`, en los `within` primeros. */
  climb?: { every: number; to: number; within?: number };
  /** Golpes a partir de `from`, repetidos cada `cycle` compases (sin `cycle`, una vez). */
  hits?: { from?: number; cycle?: number; at: [number, 1 | -1][] };
}

export type ChartDraw = Partial<Record<Section, SectionDraw>>;

/** Sección en la que cae un compás. */
export function sectionAt(song: SongDef, bar: number): { section: Section; index: number } {
  let acc = 0;
  let index = 0;
  for (const [sec, len] of song.sections) {
    if (bar < acc + len) return { section: sec, index };
    acc += len;
    index++;
  }
  return { section: song.sections[song.sections.length - 1][0], index: song.sections.length - 1 };
}

export type Section = 'intro' | 'verse' | 'pre' | 'chorus' | 'break' | 'build' | 'bridge' | 'final' | 'outro';

/** Líneas de cambio para un coche de 5 marchas, empezando en 1.ª. */
export function cuesFromSections(sections: [Section, number][], draw: ChartDraw): ShiftCueDef[] {
  const w = new CueWriter();
  let bar = 0;
  for (const [sec, len] of sections) {
    w.section(sec, bar, len, draw);
    bar += len;
  }
  return w.drain();
}

/**
 * Escribe las líneas sección a sección, recordando la marcha entre llamadas. El modo infinito
 * la usa para ir encadenando bloques sin fin.
 */
export class CueWriter {
  private g = 1;
  private lastBar = -1;
  private out: ShiftCueDef[] = [];

  /**
   * Sección `sec` de `len` compases que empieza en el compás `bar`. `cut`: compases que le faltan
   * por delante (el modo infinito los quita), para que los golpes sigan cayendo donde la música.
   */
  section(sec: Section, bar: number, len: number, draw: ChartDraw, cut = 0): void {
    const d = draw[sec];
    if (!d) return;
    const end = bar + len;
    const step = (at: number, dir: 1 | -1) => {
      if (this.g + dir < 1 || this.g + dir > 5) return;
      if (this.lastBar >= at) return;
      this.out.push({ bar: at, dir });
      this.lastBar = at;
      this.g += dir;
    };
    if (d.climb) {
      const stop = Math.min(end, bar + (d.climb.within ?? len));
      for (let b = bar; b < stop && this.g < d.climb.to; b += d.climb.every) step(b, 1);
    }
    if (d.hits) {
      const { from = 0, cycle = Infinity, at } = d.hits;
      for (let b = bar - cut + from; b < end; b += cycle) {
        for (const [off, dir] of at) if (b + off >= bar && b + off < end) step(b + off, dir);
      }
    }
  }

  /** Las líneas escritas desde la última llamada. */
  drain(): ShiftCueDef[] {
    const out = this.out;
    this.out = [];
    return out;
  }
}

/** Canción grabada a partir de sus secciones (las mismas que su .rb). */
export function songFromSections(bpm: number, sections: [Section, number][], stems: string, draw: ChartDraw): SongDef {
  let bar = 0;
  let finalChorusBar = 0;
  let breakBar = 0;
  for (const [sec, len] of sections) {
    if (sec === 'final' && !finalChorusBar) finalChorusBar = bar;
    if (sec === 'break' && !breakBar) breakBar = bar;
    bar += len;
  }
  return { bpm, bars: bar, finalChorusBar, breakBar, cues: cuesFromSections(sections, draw), stems, sections, draw };
}

export function barDuration(song: SongDef): number {
  return (60 / song.bpm) * 4;
}

const PROTO_SECTIONS: [Section, number][] = [['intro', 2], ['verse', 12], ['pre', 2], ['chorus', 8], ['break', 8], ['build', 4], ['chorus', 4], ['bridge', 6], ['final', 8]];
// 28 líneas: una cada 2 compases de media, con golpes de bajar y subir en los estribillos.
const PROTO_DRAW: ChartDraw = {
  verse: { climb: { every: 2, to: 4 }, hits: { at: [[6, -1], [8, 1], [10, 1]] } },
  pre: { hits: { at: [[0, -1]] } },
  chorus: { climb: { every: 1, to: 5, within: 2 }, hits: { from: 2, cycle: 4, at: [[0, -1], [1, 1]] } },
  break: { hits: { cycle: 2, at: [[0, -1]] } },
  build: { climb: { every: 1, to: 4 } },
  bridge: { hits: { at: [[0, -1], [2, -1], [4, 1]] } },
  final: { climb: { every: 1, to: 5, within: 2 }, hits: { from: 2, at: [[0, -1], [1, 1]] } },
};

/**
 * Canción provisional del prototipo: 100 BPM, 54 compases (2 min 10 s).
 * Las subidas caen en los crescendos y las bajadas en los breaks.
 */
export const PROTO_SONG: SongDef = {
  bpm: 100,
  bars: 54,
  finalChorusBar: 46,
  breakBar: 24,
  sections: PROTO_SECTIONS,
  cues: cuesFromSections(PROTO_SECTIONS, PROTO_DRAW),
  draw: PROTO_DRAW,
};
