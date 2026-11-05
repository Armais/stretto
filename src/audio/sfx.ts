import type { PickupKind } from '../config';
import type { Mixer } from './mixer';

// Efectos de sonido (P13). Los golpes sueltos se grabaron con Sonic Pi (tools/sonicpi/sfx.rb,
// `python stems.py sfx`) y están en public/sfx/<nombre>_<variante>.ogg. El motor sigue
// sintetizado aquí, porque tiene que seguir las revoluciones en tiempo real.

/** Efectos grabados: cuántas variantes hay y cuánto varía su velocidad al tocarlos (0 en
 * los que llevan nota, para que no desafinen). */
const RECORDED = {
  shift_good: { variants: 3, jitter: 0.03 },
  shift_perfect: { variants: 3, jitter: 0 },
  grind: { variants: 2, jitter: 0.04 },
  overrev: { variants: 1, jitter: 0.04 },
  lug: { variants: 1, jitter: 0.04 },
  crash: { variants: 2, jitter: 0.05 },
  nitro: { variants: 1, jitter: 0 },
  repair: { variants: 1, jitter: 0 },
  points: { variants: 1, jitter: 0 },
  multiplier: { variants: 1, jitter: 0 },
} as const;
type SoundName = keyof typeof RECORDED;

interface EngineVoice {
  o1: OscillatorNode;
  o2: OscillatorNode;
  flt: BiquadFilterNode;
  g: GainNode;
  profile: EngineProfile;
}

/** P4: cada vehículo suena distinto. Frecuencias en Hz a ralentí y a corte, y su color. */
export interface EngineProfile {
  low: number;
  high: number;
  wave1: OscillatorType;
  wave2: OscillatorType;
  /** Relación del segundo oscilador con el primero (0.5 = una octava abajo). */
  ratio: number;
  bright: number;
  q: number;
  volume: number;
}

export const ENGINES: Record<string, EngineProfile> = {
  // Tetracilíndrico zumbón.
  compact: { low: 42, high: 150, wave1: 'sawtooth', wave2: 'square', ratio: 0.5, bright: 1100, q: 2, volume: 0.05 },
  // V8 grave con retumbo.
  muscle: { low: 28, high: 95, wave1: 'square', wave2: 'sawtooth', ratio: 0.5, bright: 700, q: 4, volume: 0.07 },
  // Moto aguda.
  bike: { low: 60, high: 230, wave1: 'sawtooth', wave2: 'sawtooth', ratio: 1.01, bright: 1800, q: 3, volume: 0.04 },
  // Muchos cilindros: agudo y rico.
  wedge: { low: 50, high: 190, wave1: 'sawtooth', wave2: 'sawtooth', ratio: 1.5, bright: 1500, q: 1.5, volume: 0.05 },
};

export class Sfx {
  private readonly ctx: AudioContext;
  private readonly out: GainNode;
  private engine: EngineVoice | null = null;
  private readonly buffers = new Map<SoundName, AudioBuffer[]>();
  /** Última variante tocada de cada efecto, para no repetirla dos veces seguidas. */
  private readonly last = new Map<SoundName, number>();

  constructor(mixer: Mixer) {
    this.ctx = mixer.ctx;
    this.out = mixer.sfx;
    void this.load().catch((e) => console.warn('Efectos sin cargar:', e));
  }

  shift(perfect: boolean): void {
    this.play(perfect ? 'shift_perfect' : 'shift_good');
  }

  /** Cambio malo: la marcha rasca y no entra. */
  grind(): void {
    this.play('grind');
  }

  /** Línea pisada sin cambiar: el motor se pasa de vueltas (subir) o se ahoga (bajar), y la
   * marcha entra sola con un crujido. */
  missed(dir: number): void {
    this.play(dir > 0 ? 'overrev' : 'lug');
  }

  crash(): void {
    this.play('crash');
  }

  pickup(kind: PickupKind): void {
    this.play(kind);
  }

  private async load(): Promise<void> {
    const names = Object.keys(RECORDED) as SoundName[];
    await Promise.all(
      names.map(async (name) => {
        const list = await Promise.all(
          Array.from({ length: RECORDED[name].variants }, async (_, v) => {
            const res = await fetch(`${import.meta.env.BASE_URL}sfx/${name}_${v}.ogg`);
            if (!res.ok) throw new Error(`sfx/${name}_${v}: ${res.status}`);
            return this.ctx.decodeAudioData(await res.arrayBuffer());
          }),
        );
        this.buffers.set(name, list);
      }),
    );
  }

  private play(name: SoundName): void {
    const list = this.buffers.get(name);
    if (!list) return;
    let v = Math.floor(Math.random() * list.length);
    if (list.length > 1 && v === this.last.get(name)) v = (v + 1) % list.length;
    this.last.set(name, v);
    const src = this.ctx.createBufferSource();
    src.buffer = list[v];
    const jitter = RECORDED[name].jitter;
    if (jitter) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * jitter;
    src.connect(this.out);
    src.start();
  }

  engineStart(profile: EngineProfile = ENGINES.compact): void {
    if (this.engine) return;
    const ctx = this.ctx;
    const o1 = ctx.createOscillator();
    o1.type = profile.wave1;
    const o2 = ctx.createOscillator();
    o2.type = profile.wave2;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.Q.value = profile.q;
    const g = ctx.createGain();
    g.gain.value = 0;
    o1.connect(flt);
    o2.connect(flt);
    flt.connect(g).connect(this.out);
    o1.start();
    o2.start();
    g.gain.setTargetAtTime(profile.volume, ctx.currentTime, 0.2);
    this.engine = { o1, o2, flt, g, profile };
  }

  /** `rpm` de 0 a 1. */
  engineSet(rpm: number): void {
    const e = this.engine;
    if (!e) return;
    const now = this.ctx.currentTime;
    const p = e.profile;
    const f = p.low + rpm * (p.high - p.low);
    e.o1.frequency.setTargetAtTime(f, now, 0.05);
    e.o2.frequency.setTargetAtTime(f * p.ratio, now, 0.05);
    e.flt.frequency.setTargetAtTime(250 + rpm * p.bright, now, 0.05);
  }

  engineStop(stall: boolean): void {
    const e = this.engine;
    if (!e) return;
    this.engine = null;
    const now = this.ctx.currentTime;
    if (stall) {
      for (const [osc, to] of [
        [e.o1, 14],
        [e.o2, 7],
      ] as const) {
        osc.frequency.cancelScheduledValues(now);
        osc.frequency.setValueAtTime(osc.frequency.value, now);
        osc.frequency.exponentialRampToValueAtTime(to, now + 1.0);
      }
    }
    e.g.gain.setTargetAtTime(0, now + (stall ? 0.6 : 0), 0.15);
    e.o1.stop(now + 2);
    e.o2.stop(now + 2);
  }
}
