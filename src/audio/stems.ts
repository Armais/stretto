import { LAYERS, type Layer } from '../config';
import type { Mixer } from './mixer';

// Música grabada con Sonic Pi: seis pistas (una por capa) que arrancan a la vez en el mismo
// instante del reloj de audio. La marcha decide cuáles se oyen.

export interface MusicPlayer {
  /** Tiempo del contexto de audio en que empieza el compás 0. */
  startTime: number;
  start(at: number): void;
  /** Capas que suenan desde el instante `at` del reloj de audio (por defecto, ya). */
  setLayers(active: Set<Layer>, at?: number): void;
  stop(fade?: number): void;
  stall(): void;
  /** Subida de tono del estribillo final (P10), desde el instante `at`. */
  keyChange(at?: number): void;
}

/**
 * Enciende o apaga una capa para que el cambio caiga justo en `at`: la que sale acaba de
 * irse en los 30 ms previos y la que entra ya está arriba en el ataque del tiempo fuerte.
 * Con `quick` sale igual de rápido que entra (fundido corto entre dos versiones de la capa).
 * Si `at` ya ha pasado, el cambio es inmediato y algo más suave, para que no chasquee.
 */
export function switchGain(ctx: BaseAudioContext, p: AudioParam, on: boolean, at: number, quick = false): void {
  const now = ctx.currentTime;
  const late = at < now + 0.005;
  const from = Math.max(now, at - (on || quick ? 0.004 : 0.03));
  p.cancelScheduledValues(from);
  p.setTargetAtTime(on ? 1 : 0, from, late ? 0.02 : on || quick ? 0.003 : 0.008);
}

/** Pistas normales y, si las hay, las del estribillo final 2 semitonos más arriba. */
export interface StemBuffers {
  base: Map<Layer, AudioBuffer>;
  key: Map<Layer, AudioBuffer>;
}

/** Una pista de public/music/<name>/, descargada y decodificada. */
export async function fetchLayer(ctx: AudioContext, name: string, file: string): Promise<AudioBuffer> {
  const res = await fetch(`${import.meta.env.BASE_URL}music/${name}/${file}.ogg`);
  if (!res.ok) throw new Error(`${name}/${file}: ${res.status}`);
  return ctx.decodeAudioData(await res.arrayBuffer());
}

const cache = new Map<string, Promise<StemBuffers>>();
/**
 * Canciones que se guardan decodificadas a la vez. Cada una ocupa unos 340 MB (48 kHz, estéreo,
 * seis pistas de dos minutos), así que solo se queda la última.
 */
const KEEP = 1;

/** Descarga y decodifica las pistas de public/music/<name>/. Se cachea la última canción. */
export function loadStems(ctx: AudioContext, name: string): Promise<StemBuffers> {
  let p = cache.get(name);
  if (!p) {
    const base = Promise.all(LAYERS.map(async (l) => [l, await fetchLayer(ctx, name, l)] as const));
    // Las de la subida de tono son opcionales: si no están, la canción no sube.
    const key = Promise.all(
      LAYERS.filter((l) => l !== 'drums').map(async (l) => [l, await fetchLayer(ctx, name, `key_${l}`).catch(() => null)] as const),
    );
    p = Promise.all([base, key]).then(([b, k]) => {
      const keyMap = new Map<Layer, AudioBuffer>();
      for (const [layer, buf] of k) if (buf) keyMap.set(layer, buf);
      return { base: new Map<Layer, AudioBuffer>(b), key: keyMap };
    });
    // Si falla, que el siguiente intento vuelva a probar.
    p.catch(() => cache.delete(name));
    cache.set(name, p);
    while (cache.size > KEEP) cache.delete(cache.keys().next().value!);
  }
  return p;
}

/** Suelta las canciones guardadas (el modo infinito carga las suyas por trozos). */
export function dropStems(): void {
  cache.clear();
}

export class StemMusic implements MusicPlayer {
  startTime = 0;
  private readonly ctx: AudioContext;
  private readonly buffers: StemBuffers;
  private readonly out: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly gains = new Map<Layer, GainNode>();
  private readonly keyGains = new Map<Layer, GainNode>();
  private sources: AudioBufferSourceNode[] = [];
  private readonly keyAt: number;
  /** Instante de audio desde el que suenan las pistas subidas de tono (Infinity: aún no). */
  private keyFrom = Infinity;
  /** Cambios de capas programados, para rehacer los posteriores a la subida de tono. */
  private plan: { at: number; active: Set<Layer> }[] = [];

  /** `keyAt`: segundos desde el compás 0 hasta el estribillo final. */
  constructor(mixer: Mixer, buffers: StemBuffers, keyAt: number) {
    this.keyAt = keyAt;
    this.ctx = mixer.ctx;
    this.buffers = buffers;
    this.out = this.ctx.createGain();
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 20000;
    this.out.connect(this.filter).connect(mixer.music);
    for (const layer of LAYERS) {
      const g = this.ctx.createGain();
      g.gain.value = 0;
      g.connect(this.out);
      this.gains.set(layer, g);
      if (buffers.key.has(layer)) {
        const k = this.ctx.createGain();
        k.gain.value = 0;
        k.connect(this.out);
        this.keyGains.set(layer, k);
      }
    }
  }

  start(at: number): void {
    this.startTime = at;
    const play = (buffer: AudioBuffer, gain: GainNode, when: number) => {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(gain);
      src.start(when);
      this.sources.push(src);
    };
    for (const [layer, buffer] of this.buffers.base) play(buffer, this.gains.get(layer)!, at);
    // Las pistas subidas suenan en silencio desde el estribillo final, sincronizadas.
    for (const [layer, buffer] of this.buffers.key) play(buffer, this.keyGains.get(layer)!, at + this.keyAt);
  }

  setLayers(active: Set<Layer>, at = this.ctx.currentTime): void {
    // Lo que hubiera programado desde `at` queda anulado (switchGain lo cancela).
    this.plan = this.plan.filter((p) => p.at < at && p.at > this.ctx.currentTime - 10);
    this.plan.push({ at, active });
    this.apply(active, at, false);
  }

  keyChange(at = this.ctx.currentTime): void {
    if (this.keyFrom !== Infinity || this.keyGains.size === 0) return;
    this.keyFrom = at;
    const before = this.plan.filter((p) => p.at <= at);
    const later = this.plan.filter((p) => p.at > at);
    // Fundido corto de cada capa a su versión subida, y se rehace lo programado después.
    this.apply(before.length ? before[before.length - 1].active : new Set(), at, true);
    for (const p of later) this.apply(p.active, p.at, false);
  }

  private apply(active: Set<Layer>, at: number, quick: boolean): void {
    for (const [layer, g] of this.gains) {
      const key = at >= this.keyFrom && this.keyGains.has(layer);
      switchGain(this.ctx, g.gain, active.has(layer) && !key, at, quick);
      const k = this.keyGains.get(layer);
      if (k) switchGain(this.ctx, k.gain, active.has(layer) && key, at, quick);
    }
  }

  stop(fade = 0.05): void {
    const now = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, now, fade);
    for (const s of this.sources) s.stop(now + fade * 6 + 0.1);
    window.setTimeout(() => this.filter.disconnect(), fade * 6000 + 300);
  }

  /** El motor se cala: la cinta se frena y se apaga. */
  stall(): void {
    const now = this.ctx.currentTime;
    for (const s of this.sources) {
      s.playbackRate.setValueAtTime(1, now);
      s.playbackRate.exponentialRampToValueAtTime(0.25, now + 1.4);
      s.stop(now + 1.6);
    }
    this.filter.frequency.setValueAtTime(20000, now);
    this.filter.frequency.exponentialRampToValueAtTime(300, now + 1.4);
    this.out.gain.setTargetAtTime(0, now + 0.8, 0.25);
    window.setTimeout(() => this.filter.disconnect(), 2500);
  }
}
