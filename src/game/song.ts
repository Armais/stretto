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
}

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

/**
 * Líneas de cambio a partir de las secciones de una canción (las mismas que usa su .rb en
 * tools/sonicpi/songs). Reglas para un coche de 5 marchas, empezando en 1.ª:
 * estrofa sube cada 2 compases hasta 4.ª y luego oscila; pre y subida suben cada compás;
 * estribillo arranca en 5.ª con golpes de bajar y subir; el final sube a 5.ª en sus dos
 * primeros compases (va siempre tras un puente); break baja cada 2 compases;
 * puente baja dos y sube una; outro baja cada 2.
 */
export function cuesFromSections(sections: [Section, number][]): ShiftCueDef[] {
  const w = new CueWriter();
  let bar = 0;
  for (const [sec, len] of sections) {
    w.section(sec, bar, len);
    bar += len;
  }
  return w.drain();
}

/**
 * Las reglas de cuesFromSections sección a sección, recordando la marcha entre llamadas.
 * El modo infinito la usa para ir encadenando bloques sin fin.
 */
export class CueWriter {
  private g = 1;
  private lastBar = -1;
  private out: ShiftCueDef[] = [];

  /** Sección `sec` de `len` compases que empieza en el compás `bar`. */
  section(sec: Section, bar: number, len: number): void {
    const end = bar + len;
    const step = (at: number, dir: 1 | -1) => {
      if (this.g + dir < 1 || this.g + dir > 5) return;
      if (this.lastBar >= at) return;
      this.out.push({ bar: at, dir });
      this.lastBar = at;
      this.g += dir;
    };
    const climb = (from: number, to: number, every: number, target: number) => {
      for (let b = from; b < to && this.g < target; b += every) step(b, 1);
    };
    switch (sec) {
      case 'verse':
        climb(bar, end, 2, 4);
        for (let b = bar + 2 * (4 - 1); b + 1 < end; b += 4) {
          step(b, -1);
          step(b + 2, 1);
        }
        break;
      case 'pre':
      case 'build':
        climb(bar, end, 1, 5);
        break;
      case 'chorus':
        climb(bar, bar + 1, 1, 5);
        for (let b = bar + 2; b + 1 < end; b += 4) {
          step(b, -1);
          step(b + 1, 1);
        }
        break;
      case 'final':
        // El estribillo final llega a la marcha más alta en sus dos primeros compases: ese
        // cambio es el que decide la subida de tono (P10). Siempre va tras un puente.
        climb(bar, bar + 2, 1, 5);
        for (let b = bar + 3; b + 1 < end; b += 4) {
          step(b, -1);
          step(b + 1, 1);
        }
        break;
      case 'break':
        for (let b = bar; b < end; b += 2) step(b, -1);
        break;
      case 'bridge':
        step(bar, -1);
        if (bar + 2 < end) step(bar + 2, -1);
        if (bar + 4 < end) step(bar + 4, 1);
        break;
      case 'outro':
        for (let b = bar; b < end; b += 2) step(b, -1);
        break;
      case 'intro':
        break;
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
export function songFromSections(bpm: number, sections: [Section, number][], stems: string): SongDef {
  let bar = 0;
  let finalChorusBar = 0;
  let breakBar = 0;
  for (const [sec, len] of sections) {
    if (sec === 'final' && !finalChorusBar) finalChorusBar = bar;
    if (sec === 'break' && !breakBar) breakBar = bar;
    bar += len;
  }
  return { bpm, bars: bar, finalChorusBar, breakBar, cues: cuesFromSections(sections), stems, sections };
}

/** Varias líneas seguidas en el mismo sentido. */
function cueRun(bars: number[], dir: 1 | -1): ShiftCueDef[] {
  return bars.map((bar) => ({ bar, dir }));
}

export function barDuration(song: SongDef): number {
  return (60 / song.bpm) * 4;
}

/**
 * Canción provisional del prototipo: 100 BPM, 54 compases (2 min 10 s).
 * Las subidas caen en los crescendos y las bajadas en los breaks.
 */
export const PROTO_SONG: SongDef = {
  bpm: 100,
  bars: 54,
  finalChorusBar: 46,
  breakBar: 24,
  sections: [['intro', 2], ['verse', 12], ['pre', 2], ['chorus', 8], ['break', 8], ['build', 4], ['chorus', 4], ['bridge', 6], ['final', 8]],
  // 28 líneas: una cada 2 compases de media, con golpes de bajar y subir en los estribillos.
  cues: [
    ...cueRun([2, 4, 6], 1), // entran bajo, acordes y melodía
    { bar: 8, dir: -1 },
    ...cueRun([10, 12], 1),
    { bar: 14, dir: -1 },
    { bar: 16, dir: 1 }, // primer estribillo
    { bar: 18, dir: -1 },
    { bar: 19, dir: 1 },
    { bar: 22, dir: -1 },
    { bar: 23, dir: 1 },
    ...cueRun([24, 26, 28, 30], -1), // break hasta quedarse en batería sola
    ...cueRun([32, 33, 34, 36], 1), // subida al segundo estribillo
    { bar: 38, dir: -1 },
    { bar: 39, dir: 1 },
    ...cueRun([40, 42], -1),
    ...cueRun([44, 46], 1), // estribillo final con solo
    { bar: 48, dir: -1 },
    { bar: 49, dir: 1 },
  ],
};
