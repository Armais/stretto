import { LAYERS, type Layer } from '../config';
import { barDuration, type SongDef } from '../game/song';
import type { Mixer } from './mixer';

// Música PROVISIONAL sintetizada en el navegador, solo para probar el bucle de capas.
// La definitiva se graba con Sonic Pi.

const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

// La menor, i–VI–III–VII: Am F C G.
const ROOTS = [45, 41, 48, 43];
const CHORDS = [
  [57, 60, 64],
  [57, 60, 65],
  [55, 60, 64],
  [55, 59, 62],
];
// Melodía en corcheas: 8 por compás, 4 compases. null = silencio.
const MELODY: (number | null)[][] = [
  [76, null, 74, 72, null, 69, null, 72],
  [null, 72, null, 74, 72, null, 69, null],
  [67, null, 72, null, 76, null, 74, 72],
  [74, null, null, 71, null, 67, null, null],
];
// Solo del estribillo final en semicorcheas: 2 compases.
const SOLO: (number | null)[] = [
  81, 79, 76, 79, 81, null, 84, 81, 79, 76, 74, 76, 79, null, 76, 74,
  72, 74, 76, 79, 81, 79, 76, 74, 76, null, 79, 81, 84, null, 88, null,
];

const LAYER_SEND: Partial<Record<Layer, number>> = { melody: 0.35, arp: 0.3, solo: 0.3 };

export class Music {
  /** Tiempo del contexto de audio en que empieza el compás 0. */
  startTime = 0;
  private readonly ctx: AudioContext;
  private readonly noise: AudioBuffer;
  private readonly song: SongDef;
  private readonly out: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly delayIn: GainNode;
  private readonly layerGain = new Map<Layer, GainNode>();
  private readonly stepDur: number;
  private readonly totalSteps: number;
  private nextStep = 0;
  private timer = 0;
  /** Semitonos de la subida de tono (0 o 2). */
  private transpose = 0;

  constructor(mixer: Mixer, song: SongDef) {
    this.ctx = mixer.ctx;
    this.noise = mixer.noise;
    this.song = song;
    this.stepDur = barDuration(song) / 16;
    this.totalSteps = song.bars * 16;

    const ctx = this.ctx;
    this.out = ctx.createGain();
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 20000;
    this.out.connect(this.filter).connect(mixer.music);

    // Eco para melodía, arpegio y solo.
    this.delayIn = ctx.createGain();
    const delay = ctx.createDelay(2);
    delay.delayTime.value = this.stepDur * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.3;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2500;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    this.delayIn.connect(delay);
    delay.connect(damp).connect(feedback).connect(delay);
    delay.connect(wet).connect(this.out);

    for (const layer of LAYERS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.out);
      const send = LAYER_SEND[layer];
      if (send) {
        const s = ctx.createGain();
        s.gain.value = send;
        g.connect(s).connect(this.delayIn);
      }
      this.layerGain.set(layer, g);
    }
  }

  start(at: number): void {
    this.startTime = at;
    this.nextStep = 0;
    this.tick();
    this.timer = window.setInterval(() => this.tick(), 25);
  }

  /** Enciende las capas de la marcha actual y apaga el resto. */
  setLayers(active: Set<Layer>): void {
    const now = this.ctx.currentTime;
    for (const [layer, g] of this.layerGain) g.gain.setTargetAtTime(active.has(layer) ? 1 : 0, now, 0.02);
  }

  /** Se apaga la música. `fade` en segundos. */
  stop(fade = 0.05): void {
    window.clearInterval(this.timer);
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, fade);
    window.setTimeout(() => this.filter.disconnect(), fade * 8000 + 200);
  }

  keyChange(): void {
    this.transpose = 2;
  }

  /** El motor se cala: la música se hunde y se apaga. */
  stall(): void {
    window.clearInterval(this.timer);
    const now = this.ctx.currentTime;
    const f = this.filter.frequency;
    f.cancelScheduledValues(now);
    f.setValueAtTime(f.value, now);
    f.exponentialRampToValueAtTime(120, now + 1.2);
    this.out.gain.setTargetAtTime(0, now + 0.4, 0.3);
    window.setTimeout(() => this.filter.disconnect(), 3000);
  }

  private tick(): void {
    const horizon = this.ctx.currentTime + 0.15;
    while (this.nextStep < this.totalSteps) {
      const time = this.startTime + this.nextStep * this.stepDur;
      if (time >= horizon) break;
      this.scheduleStep(this.nextStep, time);
      this.nextStep++;
    }
  }

  private scheduleStep(step: number, t: number): void {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const root = ROOTS[bar % 4];
    const chord = CHORDS[bar % 4];
    const sd = this.stepDur;

    // Batería: bombo a negras, caja en 2 y 4, charles a contratiempo y redoble cada 8 compases.
    if (s % 4 === 0) this.kick(t);
    if (s === 4 || s === 12 || (bar % 8 === 7 && s >= 13)) this.snare(t);
    if (s % 4 === 2) this.hat(t, 0.13, 0.09);
    else if (s % 2 === 1) this.hat(t, 0.05, 0.03);

    // Bajo: corcheas con salto de octava.
    if (s % 2 === 0) this.tone('bass', 'sawtooth', midiToHz(root + (s % 4 === 2 ? 12 : 0)), t, sd * 1.7, 0.32, 520);

    // Acordes: colchón que dura todo el compás.
    if (s === 0) this.pad(chord, t, sd * 16);

    // Melodía en corcheas.
    if (s % 2 === 0) {
      const note = MELODY[bar % 4][s / 2];
      if (note !== null) this.tone('melody', 'square', midiToHz(note), t, sd * 1.8, 0.16, 2600);
    }

    // Arpegio en semicorcheas sobre las notas del acorde.
    this.pluck(midiToHz(chord[step % 3] + 12), t);

    // Solo, solo en el estribillo final.
    if (bar >= this.song.finalChorusBar) {
      const note = SOLO[(bar % 2) * 16 + s];
      if (note !== null) this.tone('solo', 'sawtooth', midiToHz(note), t, sd * 0.95, 0.12, 3800);
    }
  }

  private envGain(layer: Layer, t: number, attack: number, peak: number, end: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    g.connect(this.layerGain.get(layer)!);
    return g;
  }

  private tone(layer: Layer, type: OscillatorType, freq: number, t: number, dur: number, peak: number, cutoff: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq * Math.pow(2, this.transpose / 12);
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = cutoff;
    osc.connect(flt).connect(this.envGain(layer, t, 0.005, peak, t + dur));
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private pad(chord: number[], t: number, dur: number): void {
    const g = this.envGain('chords', t, 0.25, 0.06, t + dur);
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 1400;
    flt.connect(g);
    for (const note of chord) {
      for (const detune of [-8, 8]) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = midiToHz(note + this.transpose);
        osc.detune.value = detune;
        osc.connect(flt);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      }
    }
  }

  private pluck(freq: number, t: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq * Math.pow(2, this.transpose / 12);
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(3500, t);
    flt.frequency.exponentialRampToValueAtTime(400, t + 0.14);
    osc.connect(flt).connect(this.envGain('arp', t, 0.003, 0.1, t + 0.18));
    osc.start(t);
    osc.stop(t + 0.22);
  }

  private kick(t: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    osc.connect(this.envGain('drums', t, 0.002, 0.9, t + 0.35));
    osc.start(t);
    osc.stop(t + 0.4);
  }

  private snare(t: number): void {
    this.noiseHit(t, 'bandpass', 1800, 0.35, 0.2);
    const body = this.ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.value = 190;
    body.connect(this.envGain('drums', t, 0.002, 0.25, t + 0.1));
    body.start(t);
    body.stop(t + 0.15);
  }

  private hat(t: number, peak: number, dur: number): void {
    this.noiseHit(t, 'highpass', 7500, peak, dur);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, peak: number, dur: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const flt = this.ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = freq;
    src.connect(flt).connect(this.envGain('drums', t, 0.001, peak, t + dur));
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }
}
