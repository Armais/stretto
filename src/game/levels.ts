import { PROTO_SONG, songFromSections, type ShiftCueDef, type SongDef } from './song';

// P3: los cinco niveles. Mientras no estén las canciones de Sonic Pi, cada nivel usa la
// canción provisional a su BPM.

export type Scenery = 'city' | 'coast' | 'desert' | 'tunnels' | 'dawn';

export interface LevelDef {
  id: number;
  lanes: number;
  scenery: Scenery;
  /** Color de acento del nivel (interfaz y detalles). */
  accent: number;
  /** Multiplica la distancia entre grupos de tráfico: más alto, menos tráfico. */
  trafficGap: number;
  /** Multiplica la probabilidad de parejas de coches. */
  trafficPairs: number;
  song: SongDef;
}

/** Id del modo infinito en menús, récords y guardado (los niveles van del 1 al 5). */
export const ENDLESS_ID = 0;
/** Acento del modo infinito en los menús: un blanco cálido, porque mezcla los cinco. */
export const ENDLESS_ACCENT = 0xe9e2d0;

// Las secciones de cada canción tienen que coincidir con las de tools/sonicpi/songs/nivelN.rb.
const NIVEL2 = songFromSections(115, [['intro', 4], ['verse', 12], ['pre', 2], ['chorus', 8], ['break', 8], ['build', 4], ['chorus', 8], ['bridge', 4], ['final', 8]], 'nivel2');
const NIVEL34: Parameters<typeof songFromSections>[1] = [['intro', 4], ['verse', 16], ['pre', 4], ['chorus', 8], ['break', 8], ['build', 4], ['chorus', 8], ['bridge', 4], ['final', 8]];
const NIVEL5 = songFromSections(172, [['intro', 8], ['verse', 16], ['pre', 4], ['chorus', 16], ['break', 12], ['build', 6], ['chorus', 8], ['bridge', 4], ['final', 8], ['outro', 4]], 'nivel5');

export const LEVELS: LevelDef[] = [
  // El nivel 1 hace de tutorial: menos tráfico.
  { id: 1, lanes: 3, scenery: 'city', accent: 0xffb867, trafficGap: 1.4, trafficPairs: 0.4, song: { ...PROTO_SONG, bpm: 100, stems: 'nivel1' } },
  { id: 2, lanes: 3, scenery: 'coast', accent: 0x46d6c8, trafficGap: 1.1, trafficPairs: 0.8, song: NIVEL2 },
  { id: 3, lanes: 4, scenery: 'desert', accent: 0xff8a3d, trafficGap: 1.0, trafficPairs: 1, song: songFromSections(124, NIVEL34, 'nivel3') },
  { id: 4, lanes: 4, scenery: 'tunnels', accent: 0x8f9bff, trafficGap: 0.95, trafficPairs: 1.1, song: songFromSections(132, NIVEL34, 'nivel4') },
  { id: 5, lanes: 5, scenery: 'dawn', accent: 0xff6f8e, trafficGap: 0.9, trafficPairs: 1.2, song: NIVEL5 },
];

/**
 * Líneas para un coche de `gears` marchas. Las canciones se escriben para 5: aquí se
 * reparten las mismas subidas y bajadas en 4 o 6 marchas. Si hay que saltar dos marchas,
 * la primera línea va un compás antes cuando hay hueco.
 */
export function chartFor(song: SongDef, gears: number): ShiftCueDef[] {
  if (gears === 5) return song.cues;
  const m = new GearMapper(gears);
  return song.cues.flatMap((c) => m.map(c));
}

/** El reparto de chartFor línea a línea, recordando la marcha (lo usa el modo infinito). */
export class GearMapper {
  private readonly gears: number;
  private g5 = 1;
  private g = 1;
  /** Compás de la última línea escrita: van siempre en orden y sin repetir compás. */
  private last = -1;

  constructor(gears: number) {
    this.gears = gears;
  }

  /** Una línea de 5 marchas convertida en las que tocan (ninguna, una o dos). */
  map(c: ShiftCueDef): ShiftCueDef[] {
    if (this.gears === 5) return [c];
    const out: ShiftCueDef[] = [];
    this.g5 += c.dir;
    const target = Math.round(1 + ((this.g5 - 1) * (this.gears - 1)) / 4);
    while (this.g !== target) {
      const dir: 1 | -1 = target > this.g ? 1 : -1;
      const steps = Math.abs(target - this.g);
      if (steps > 1 && this.last < c.bar - 1) {
        out.push({ bar: c.bar - 1, dir });
        this.last = c.bar - 1;
        this.g += dir;
        continue;
      }
      if (this.last === c.bar) break;
      out.push({ bar: c.bar, dir });
      this.last = c.bar;
      this.g += dir;
    }
    return out;
  }
}
