import { LAYERS, type Layer } from '../config';
import { BLOCK_STARTS, type EndlessTimeline, type Station } from '../game/endless';
import { LEVELS } from '../game/levels';
import type { Mixer } from './mixer';
import { fetchLayer, type MusicPlayer } from './stems';

// Música del modo infinito (P11). Cada bloque de 8 compases es su propio fichero
// (public/music/endless, cortado por tools/sonicpi/stems.py blocks): decodificar la canción
// entera para recortarla paraba la imagen 50-85 ms por pista, y un bloque apenas se nota.
// Solo se guardan en memoria la emisora que suena y la siguiente.

/** Con cuánta antelación se programa una emisora. */
const AHEAD = 3;

/** Por capa, los bloques de la emisora en el orden en que suenan. */
export type StationBuffers = Map<Layer, AudioBuffer[]>;

/** Bloques del estilo `style`, de uno en uno para repartir el trabajo entre fotogramas. */
export async function loadStyle(ctx: AudioContext, style: number): Promise<StationBuffers> {
  const name = `endless/${LEVELS[style].song.stems}`;
  const out: StationBuffers = new Map();
  for (const layer of LAYERS) {
    const blocks: AudioBuffer[] = [];
    for (let k = 0; k < BLOCK_STARTS[style].length; k++) blocks.push(await fetchLayer(ctx, name, `${layer}_${k}`));
    out.set(layer, blocks);
  }
  return out;
}

export class EndlessMusic implements MusicPlayer {
  startTime = 0;
  private readonly ctx: AudioContext;
  private readonly mixer: Mixer;
  private readonly timeline: EndlessTimeline;
  private readonly out: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly gains = new Map<Layer, GainNode>();
  private readonly loading = new Map<number, Promise<void>>();
  private readonly ready = new Map<number, StationBuffers>();
  private sources: { node: AudioScheduledSourceNode; endsAt: number }[] = [];
  private scheduled = -1;
  private stopped = false;

  constructor(mixer: Mixer, timeline: EndlessTimeline, first: StationBuffers | null) {
    this.mixer = mixer;
    this.ctx = mixer.ctx;
    this.timeline = timeline;
    if (first) this.ready.set(0, first);
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
    }
  }

  start(at: number): void {
    this.startTime = at;
    this.pump(0);
  }

  /**
   * Llamar en cada fotograma con el tiempo de carrera: programa las emisoras que están al caer,
   * precarga la siguiente y suelta las que ya no hacen falta.
   */
  pump(t: number): void {
    if (this.stopped) return;
    for (let n = this.scheduled + 1; n < this.timeline.stations.length; n++) {
      const st = this.timeline.stations[n];
      if (st.sweepStart > t + AHEAD) break;
      this.schedule(st);
      this.scheduled = n;
    }
    const cur = this.timeline.stationAt(t).style;
    const next = (cur + 1) % LEVELS.length;
    this.want(next);
    for (const style of this.ready.keys()) if (style !== cur && style !== next) this.ready.delete(style);
    this.sources = this.sources.filter((s) => s.endsAt > this.ctx.currentTime);
  }

  setLayers(active: Set<Layer>, ramp = 0.02): void {
    const now = this.ctx.currentTime;
    for (const [layer, g] of this.gains) g.gain.setTargetAtTime(active.has(layer) ? 1 : 0, now, ramp);
  }

  /** En el infinito no hay subida de tono: la aceleración ya sube un poco el tono. */
  keyChange(): void {}

  stop(fade = 0.05): void {
    this.stopped = true;
    const now = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, now, fade);
    for (const { node } of this.sources) node.stop(now + fade * 6 + 0.1);
    window.setTimeout(() => this.filter.disconnect(), fade * 6000 + 300);
  }

  /** El motor se cala: la cinta se frena y se apaga. */
  stall(): void {
    this.stopped = true;
    const now = this.ctx.currentTime;
    for (const { node } of this.sources) {
      if (node instanceof AudioBufferSourceNode) {
        node.playbackRate.cancelScheduledValues(now);
        node.playbackRate.setValueAtTime(node.playbackRate.value, now);
        node.playbackRate.exponentialRampToValueAtTime(0.25, now + 1.4);
      }
      node.stop(now + 1.6);
    }
    this.filter.frequency.setValueAtTime(20000, now);
    this.filter.frequency.exponentialRampToValueAtTime(300, now + 1.4);
    this.out.gain.setTargetAtTime(0, now + 0.8, 0.25);
    window.setTimeout(() => this.filter.disconnect(), 2500);
  }

  private want(style: number): void {
    if (this.ready.has(style) || this.loading.has(style)) return;
    const p = loadStyle(this.ctx, style)
      .then((bufs) => {
        if (!this.stopped) this.ready.set(style, bufs);
      })
      .catch((err) => console.warn('Emisora sin pistas', style, err))
      .finally(() => this.loading.delete(style));
    this.loading.set(style, p);
  }

  private schedule(st: Station): void {
    const t0 = this.startTime;
    this.sweep(t0 + st.sweepStart, st.start - st.sweepStart);
    const bufs = this.ready.get(st.style);
    if (!bufs) {
      // La emisora no llegó a cargar a tiempo: se juega igual, sin música.
      console.warn('Emisora sin cargar a tiempo', st.n);
      return;
    }
    // Cada bloque suena a su velocidad y empieza justo donde acaba el anterior; los ficheros
    // traen un fundido de 3 ms en los bordes para que el empalme no chasquee.
    for (const [layer, blocks] of bufs) {
      st.blocks.forEach((b, k) => {
        const src = this.ctx.createBufferSource();
        src.buffer = blocks[k];
        src.playbackRate.value = b.rate;
        src.connect(this.gains.get(layer)!);
        src.start(t0 + b.start);
        this.track(src, t0 + b.end);
      });
    }
  }

  /** Barrido de radio entre emisoras: ruido que sube y baja de tono y un silbido de sintonía. */
  private sweep(at: number, dur: number): void {
    const ctx = this.ctx;
    const noise = ctx.createBufferSource();
    noise.buffer = this.mixer.noise;
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.4;
    band.frequency.setValueAtTime(600, at);
    band.frequency.exponentialRampToValueAtTime(4200, at + dur * 0.55);
    band.frequency.exponentialRampToValueAtTime(900, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.32, at + 0.06);
    g.gain.setValueAtTime(0.32, at + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, at + dur);
    noise.connect(band).connect(g).connect(this.out);
    const whistle = ctx.createOscillator();
    whistle.frequency.setValueAtTime(2400, at);
    whistle.frequency.exponentialRampToValueAtTime(700, at + dur * 0.5);
    whistle.frequency.exponentialRampToValueAtTime(1500, at + dur);
    const wg = ctx.createGain();
    wg.gain.setValueAtTime(0, at);
    wg.gain.linearRampToValueAtTime(0.035, at + dur * 0.3);
    wg.gain.linearRampToValueAtTime(0, at + dur);
    whistle.connect(wg).connect(this.out);
    for (const s of [noise, whistle]) {
      s.start(at);
      s.stop(at + dur + 0.02);
      this.track(s, at + dur + 0.02);
    }
  }

  private track(node: AudioScheduledSourceNode, endsAt: number): void {
    this.sources.push({ node, endsAt });
  }
}
