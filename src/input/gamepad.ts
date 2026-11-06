// Mando (API Gamepad). Cada botón se traduce a la tecla que ya entiende el juego y se lanza
// como un keydown, así la carrera, los menús y la pausa funcionan igual que con teclado.
// Botones con la distribución estándar (la de Xbox): 0 A, 1 B, 4 LB, 5 RB, 6 LT, 7 RT,
// 9 Start y 12-15 la cruceta (arriba, abajo, izquierda, derecha). Ejes 0 y 1: stick izquierdo.

/** Dónde está el jugador: cambia lo que hacen A, B, Start y los gatillos. */
export type PadContext = 'race' | 'pause' | 'menu';

type Dir = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

const DPAD: Partial<Record<number, Dir>> = { 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight' };
/** En carrera, los de la derecha suben de marcha y los de la izquierda bajan, como los Shift. */
const SHOULDERS: Partial<Record<number, Dir>> = { 5: 'ArrowUp', 7: 'ArrowUp', 4: 'ArrowDown', 6: 'ArrowDown' };
const A = 0;
const B = 1;
const START = 9;

/** El stick cuenta como pulsado al pasar de esto, y como suelto al bajar de lo otro. */
const STICK_ON = 0.6;
const STICK_OFF = 0.35;
/** En los menús, una dirección mantenida se repite: primero espera y luego va cada tanto (ms). */
const REPEAT_DELAY = 380;
const REPEAT_EVERY = 110;
/** Cada cuánto se lee el mando (ms). Más a menudo que un fotograma, para que el cambio caiga a tiempo. */
const POLL_MS = 4;

interface PadState {
  buttons: boolean[];
  stick: Dir | null;
  /** Dirección mantenida (cruceta o stick) y cuándo toca repetirla. */
  held: Dir | null;
  repeatAt: number;
}

let lastDevice: 'keys' | 'pad' = 'keys';

/** true si lo último que se ha tocado es un mando: los menús enseñan sus botones. */
export function usingPad(): boolean {
  return lastDevice === 'pad';
}

const isDown = (b: GamepadButton) => b.pressed || b.value > 0.5;

function readPads(): (Gamepad | null)[] {
  try {
    return navigator.getGamepads();
  } catch {
    // Una página que no deja usar mandos (permisos del iframe) lanza aquí.
    return [];
  }
}

function codeFor(button: number, ctx: PadContext): string | null {
  const dir = DPAD[button];
  if (dir) return dir;
  if (ctx === 'race') {
    if (button === START) return 'Escape';
    return SHOULDERS[button] ?? null;
  }
  if (button === A) return 'Enter';
  if (button === B) return 'Escape';
  if (button === START) return ctx === 'pause' ? 'Escape' : 'Enter';
  return null;
}

function stickDir(gp: Gamepad, prev: Dir | null): Dir | null {
  const x = gp.axes[0] ?? 0;
  const y = gp.axes[1] ?? 0;
  // La dirección que había se mantiene hasta soltar el stick; así no salta al rozar la diagonal.
  if (prev) {
    const v = prev === 'ArrowLeft' ? -x : prev === 'ArrowRight' ? x : prev === 'ArrowUp' ? -y : y;
    if (v > STICK_OFF) return prev;
  }
  if (Math.max(Math.abs(x), Math.abs(y)) < STICK_ON) return null;
  if (Math.abs(x) > Math.abs(y)) return x < 0 ? 'ArrowLeft' : 'ArrowRight';
  return y < 0 ? 'ArrowUp' : 'ArrowDown';
}

export function startGamepad(context: () => PadContext): void {
  if (!('getGamepads' in navigator)) return;
  const pads = new Map<number, PadState>();
  let timer = 0;

  const press = (code: string, repeat = false) => {
    lastDevice = 'pad';
    window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat, bubbles: true, cancelable: true }));
  };

  const poll = () => {
    const now = performance.now();
    const ctx = context();
    for (const gp of readPads()) {
      if (!gp || !gp.connected) continue;
      let st = pads.get(gp.index);
      if (!st) {
        st = { buttons: [], stick: null, held: null, repeatAt: 0 };
        pads.set(gp.index, st);
      }
      let held: Dir | null = null;
      for (let i = 0; i < gp.buttons.length; i++) {
        const down = isDown(gp.buttons[i]);
        if (down) held = DPAD[i] ?? held;
        if (down && !st.buttons[i]) {
          const code = codeFor(i, ctx);
          if (code) press(code);
        }
        st.buttons[i] = down;
      }
      const stick = stickDir(gp, st.stick);
      if (stick && stick !== st.stick) press(stick);
      st.stick = stick;
      held ??= stick;
      if (held !== st.held) {
        st.held = held;
        st.repeatAt = now + REPEAT_DELAY;
      } else if (held && ctx !== 'race' && now >= st.repeatAt) {
        press(held, true);
        st.repeatAt = now + REPEAT_EVERY;
      }
    }
  };

  const run = () => {
    if (!timer) timer = window.setInterval(poll, POLL_MS);
  };
  window.addEventListener('gamepadconnected', run);
  window.addEventListener('gamepaddisconnected', (e) => {
    pads.delete(e.gamepad.index);
    if (!readPads().some(Boolean)) {
      window.clearInterval(timer);
      timer = 0;
    }
  });
  // Un mando que ya estaba conectado al cargar puede no avisar.
  if (readPads().some(Boolean)) run();
  // Al volver al teclado, los menús vuelven a enseñar sus teclas.
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.isTrusted) lastDevice = 'keys';
    },
    true,
  );
}
