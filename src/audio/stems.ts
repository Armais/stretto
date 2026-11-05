import { LAYERS, type Layer } from '../config';
import type { Mixer } from './mixer';

// Música grabada con Sonic Pi: seis pistas (una por capa) que arrancan a la vez en el mismo
// instante del reloj de audio. La marcha decide cuáles se oyen.

export interface MusicPlayer {
  /** Tiempo del contexto de audio en que empieza el compás 0. */
  startTime: number;
  start(at: number): void;
  setLayers(active: Set<Layer>): void;
  stop(fade?: number): void;
  stall(): void;
  /** Subida de tono del estribillo final (P10). */
  keyChange(): void;
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
  private keyOn = false;
  private active = new Set<Layer>();

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

  setLayers(active: Set<Layer>, ramp = 0.02): void {
    this.active = active;
    const now = this.ctx.currentTime;
    for (const [layer, g] of this.gains) {
      const toKey = this.keyOn && this.keyGains.has(layer);
      g.gain.setTargetAtTime(active.has(layer) && !toKey ? 1 : 0, now, ramp);
      this.keyGains.get(layer)?.gain.setTargetAtTime(active.has(layer) && toKey ? 1 : 0, now, ramp);
    }
  }

  keyChange(): void {
    if (this.keyOn || this.keyGains.size === 0) return;
    this.keyOn = true;
    this.setLayers(this.active, 0.01);
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
