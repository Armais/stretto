/** Contexto de audio compartido con dos buses (música y efectos) y un búfer de ruido. */
export class Mixer {
  readonly ctx: AudioContext;
  readonly music: GainNode;
  readonly sfx: GainNode;
  readonly noise: AudioBuffer;
  /** En pausa: el audio no se reanuda solo al volver a la pestaña. */
  hold = false;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(this.ctx.destination);

    this.music = this.ctx.createGain();
    this.music.gain.value = 0.8;
    this.music.connect(comp);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(comp);

    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.ctx.suspend();
      else if (!this.hold) void this.ctx.resume();
    });
  }

  setVolumes(music: number, sfx: number): void {
    const now = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(0.8 * music, now, 0.05);
    this.sfx.gain.setTargetAtTime(0.9 * sfx, now, 0.05);
  }

  resume(): void {
    if (!this.hold) void this.ctx.resume();
  }
}
