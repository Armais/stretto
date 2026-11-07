// Pantallas táctiles. Los botones de carrera y los menús sin teclas salen si lo último que se ha
// tocado es la pantalla; al cargar, si el aparato no tiene ratón. Se marca con la clase `touch`
// en <html>, que es lo que mira el CSS.

let touch = matchMedia('(pointer: coarse)').matches;

/** true si se está jugando con el dedo. */
export function usingTouch(): boolean {
  return touch;
}

function set(on: boolean): void {
  touch = on;
  document.documentElement.classList.toggle('touch', on);
}

export function watchTouch(): void {
  set(touch);
  window.addEventListener('pointerdown', (e) => set(e.pointerType === 'touch'), true);
  // Teclado o mando (que llega como teclas): fuera los botones de la pantalla.
  window.addEventListener('keydown', () => set(false), true);
}
