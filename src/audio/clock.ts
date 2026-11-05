/**
 * Traduce el reloj de performance.now() (teclado y fotogramas) al tiempo de audio que se
 * está oyendo en ese instante, descontando la latencia de salida. El desfase se suaviza
 * para que la imagen no tiemble.
 */
export class AudioClock {
  private readonly ctx: AudioContext;
  private offset = Number.NaN;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  /** Llamar una vez por fotograma, antes de usar heardAt(). */
  sample(): void {
    const now = performance.now();
    const raw = this.rawHeard(now) - now / 1000;
    if (Number.isNaN(this.offset) || Math.abs(raw - this.offset) > 0.03) this.offset = raw;
    else this.offset += (raw - this.offset) * 0.1;
  }

  /** Tiempo del contexto de audio que suena por los altavoces en el instante `perfMs`. */
  heardAt(perfMs: number): number {
    return perfMs / 1000 + this.offset;
  }

  private rawHeard(now: number): number {
    // En pausa (contexto suspendido) el tiempo de audio está quieto: no se extrapola.
    if (this.ctx.state === 'running' && typeof this.ctx.getOutputTimestamp === 'function') {
      const ts = this.ctx.getOutputTimestamp();
      if (ts.contextTime !== undefined && ts.performanceTime !== undefined && ts.performanceTime > 0) {
        return ts.contextTime + (now - ts.performanceTime) / 1000;
      }
    }
    return this.ctx.currentTime - (this.ctx.outputLatency || this.ctx.baseLatency || 0);
  }
}
