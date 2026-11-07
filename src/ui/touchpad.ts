// Botones de carrera para jugar con el dedo: carril a la izquierda, marchas a la derecha (como
// los dos pulgares en un mando) y pausa arriba. Solo se ven en pantallas táctiles (clase
// `touch` en <html>) y mientras se corre. Con el móvil en vertical, todo lo tapa un aviso para
// girarlo.

import { t } from '../i18n';

export type PadAction = 'up' | 'down' | 'left' | 'right';

/** Triángulo hacia la derecha; cada botón lo gira. Dibujado, no con ▶ ◀: iOS los pinta como emoji. */
const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5 L19.5 12 L7 19.5 Z"/></svg>';
/** Un móvil en horizontal con una flecha de giro encima. */
const PHONE =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="24" width="48" height="28" rx="5"/><path d="M20 14 A16 16 0 0 1 46 16"/><path d="M46 8 V16 H38"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';

export class TouchPad {
  private readonly root: HTMLDivElement;
  private readonly rotate: HTMLDivElement;
  private shown = false;

  /** `act` recibe la acción y cuándo se tocó (en la escala de performance.now()). */
  constructor(container: HTMLElement, act: (a: PadAction, at: number) => void, pause: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'touchpad';
    this.root.innerHTML = `
      <div class="tp tp-left" data-a="left">${ARROW}</div>
      <div class="tp tp-right" data-a="right">${ARROW}</div>
      <div class="tp tp-up" data-a="up">${ARROW}</div>
      <div class="tp tp-down" data-a="down">${ARROW}</div>
      <div class="tp tp-pause">${PAUSE}</div>`;
    container.appendChild(this.root);
    this.rotate = document.createElement('div');
    this.rotate.className = 'rotate';
    container.appendChild(this.rotate);
    this.relabel();

    for (const b of this.root.querySelectorAll<HTMLElement>('[data-a]')) {
      b.addEventListener('pointerdown', (e) => {
        // Sin esto el navegador haría zoom con dos toques seguidos.
        e.preventDefault();
        b.classList.add('on');
        act(b.dataset.a as PadAction, e.timeStamp);
      });
      const off = () => b.classList.remove('on');
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('pointerleave', off);
    }
    // Con el clic (al levantar el dedo): si fuera al tocar, el menú de pausa recibiría ese mismo toque.
    this.root.querySelector('.tp-pause')!.addEventListener('click', () => pause());
  }

  /** Vuelve a escribir el aviso tras cambiar de idioma. */
  relabel(): void {
    this.rotate.innerHTML = `${PHONE}<p>${t('rotate')}</p>`;
  }

  setVisible(on: boolean): void {
    if (on === this.shown) return;
    this.shown = on;
    this.root.classList.toggle('on', on);
  }
}
