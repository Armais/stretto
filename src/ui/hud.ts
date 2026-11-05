import { t } from '../i18n';

// HUD en HTML/SVG encima del canvas: puntos, barra de motor, cuentarrevoluciones con la
// marcha, aviso de la próxima línea y los textos de acierto o fallo.

const CX = 130;
const CY = 120;
const R = 100;

function polar(v: number, r: number): [number, number] {
  const a = ((210 - 240 * v) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
}

function arc(v0: number, v1: number, r: number): string {
  const [x0, y0] = polar(v0, r);
  const [x1, y1] = polar(v1, r);
  const large = (v1 - v0) * 240 > 180 ? 1 : 0;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

export interface HudState {
  score: number;
  engine: number;
  gear: number;
  kmh: number;
  /** De 0 a 1. */
  rpm: number;
  /** Sentido de la próxima línea, 0 si no hay. */
  nextDir: 0 | 1 | -1;
  /** De 0 (lejos) a 1 (encima). */
  nextNear: number;
  multiplier: number;
  /** Lo que queda de nitro, de 0 a 1 (0 = sin nitro). */
  nitro: number;
}

export type JudgeKind = 'perfect' | 'good' | 'bad';

export class Hud {
  private readonly root: HTMLDivElement;
  private readonly scoreEl: HTMLElement;
  private readonly engineEl: HTMLElement;
  private readonly engineFill: HTMLElement;
  private readonly judgeEl: HTMLElement;
  private readonly needle: SVGLineElement;
  private readonly gearEl: SVGTextElement;
  private readonly speedEl: SVGTextElement;
  private readonly nextEl: SVGTextElement;
  private readonly multEl: HTMLElement;
  private readonly nitroEl: HTMLElement;
  private readonly nitroFill: HTMLElement;
  private readonly radioEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly tuneEl: HTMLElement;
  private radioTimer = 0;
  private hintTimer = 0;
  private last: Partial<HudState> = {};

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-score">0</div>
      <div class="hud-mult">×2</div>
      <div class="hud-engine">
        <div class="hud-engine-label">${t('engine')}</div>
        <div class="hud-engine-track"><div class="hud-engine-fill"></div></div>
        <div class="hud-nitro"><div class="hud-nitro-fill"></div></div>
      </div>
      <div class="hud-tune"></div>
      <div class="hud-judge"></div>
      <div class="hud-hint"></div>
      <div class="hud-radio"><div class="hud-radio-k">NIGHT SHIFT FM · VELA</div><div class="hud-radio-t"></div></div>
      <div class="hud-tach">
        <svg viewBox="0 0 260 200">
          <path class="tach-base" d="${arc(0, 1, R)}"/>
          <path class="tach-low" d="${arc(0, 0.14, R)}"/>
          <path class="tach-red" d="${arc(0.86, 1, R)}"/>
          <text class="tach-next" x="${CX}" y="${CY - 40}"></text>
          <line class="tach-needle" x1="${CX}" y1="${CY}" x2="${CX}" y2="${CY}"/>
          <circle class="tach-hub" cx="${CX}" cy="${CY}" r="6"/>
          <text class="tach-gear" x="${CX}" y="${CY + 62}">1</text>
          <text class="tach-speed" x="${CX}" y="${CY + 84}"></text>
        </svg>
      </div>`;
    container.appendChild(this.root);

    const q = <T extends Element>(sel: string): T => this.root.querySelector(sel) as T;
    this.scoreEl = q('.hud-score');
    this.engineEl = q('.hud-engine');
    this.engineFill = q('.hud-engine-fill');
    this.judgeEl = q('.hud-judge');
    this.needle = q('.tach-needle');
    this.gearEl = q('.tach-gear');
    this.speedEl = q('.tach-speed');
    this.nextEl = q('.tach-next');
    this.multEl = q('.hud-mult');
    this.nitroEl = q('.hud-nitro');
    this.nitroFill = q('.hud-nitro-fill');
    this.radioEl = q('.hud-radio');
    this.hintEl = q('.hud-hint');
    this.tuneEl = q('.hud-tune');
  }

  /** Cambio de emisora en el modo infinito: fundido rápido a negro y vuelta. */
  tune(): void {
    this.tuneEl.classList.remove('go');
    void this.tuneEl.offsetWidth; // reinicia la animación
    this.tuneEl.classList.add('go');
  }

  /** Muestra u oculta el HUD de carrera (en los menús no se ve). */
  setVisible(on: boolean): void {
    this.root.classList.toggle('off', !on);
  }

  /** Color de acento del nivel. */
  setAccent(hex: number): void {
    this.root.style.setProperty('--accent', `#${hex.toString(16).padStart(6, '0')}`);
  }

  /** Vela habla por la radio durante `seconds`. */
  radio(text: string, seconds = 7): void {
    this.radioEl.querySelector('.hud-radio-t')!.textContent = text;
    this.radioEl.classList.add('on');
    window.clearTimeout(this.radioTimer);
    this.radioTimer = window.setTimeout(() => this.radioEl.classList.remove('on'), seconds * 1000);
  }

  /** Texto de ayuda del tutorial. */
  hint(text: string, seconds = 4): void {
    this.hintEl.textContent = text;
    this.hintEl.classList.add('on');
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hintEl.classList.remove('on'), seconds * 1000);
  }

  clearMessages(): void {
    this.radioEl.classList.remove('on');
    this.hintEl.classList.remove('on');
  }

  /** Vuelve a escribir los textos fijos tras cambiar de idioma. */
  relabel(): void {
    this.root.querySelector('.hud-engine-label')!.textContent = t('engine');
  }

  update(s: HudState): void {
    const l = this.last;
    if (l.score !== s.score) this.scoreEl.textContent = s.score.toLocaleString();
    if (l.engine !== s.engine) {
      this.engineFill.style.width = `${s.engine}%`;
      this.engineEl.classList.toggle('low', s.engine <= 30);
    }
    if (l.gear !== s.gear) this.gearEl.textContent = String(s.gear);
    if (l.kmh !== s.kmh) this.speedEl.textContent = `${s.kmh} km/h`;
    const [nx, ny] = polar(s.rpm, R - 16);
    this.needle.setAttribute('x2', nx.toFixed(1));
    this.needle.setAttribute('y2', ny.toFixed(1));
    if (l.nextDir !== s.nextDir) {
      this.nextEl.textContent = s.nextDir === 1 ? '▲' : s.nextDir === -1 ? '▼' : '';
      this.nextEl.setAttribute('class', `tach-next ${s.nextDir === 1 ? 'up' : 'down'}`);
    }
    this.nextEl.style.opacity = (0.15 + 0.85 * s.nextNear).toFixed(2);
    if (l.multiplier !== s.multiplier) this.multEl.classList.toggle('on', s.multiplier > 1);
    this.nitroEl.classList.toggle('on', s.nitro > 0);
    if (s.nitro > 0) this.nitroFill.style.width = `${Math.round(s.nitro * 100)}%`;
    this.last = { ...s };
  }

  judge(text: string, kind: JudgeKind): void {
    const el = this.judgeEl;
    el.textContent = text;
    el.className = `hud-judge ${kind}`;
    void el.offsetWidth; // reinicia la animación
    el.classList.add('pop');
  }

}
