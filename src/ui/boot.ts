import type { Mixer } from '../audio/mixer';

// Arranque con el logo del estudio, Astro Arcade: el mismo rótulo de neón por capas que en
// Orbit Rivals (public/logo/estudio.png + estudio.txt). Sale apagado y cada pieza (las dos A,
// el anillo, el planeta, ASTRO y ARCADE) da un destello, se apaga y sube en rampa hasta quedarse
// encendida; ARCADE tartamudea una vez después. Al final se funde y queda el título.
// Como mucho 3 destellos por segundo en todo el rótulo; si el sistema pide menos movimiento,
// ninguno: cada pieza sube sola. Cualquier tecla, botón o toque lo salta.

const FADE_IN = 0.35;
const FADE_OUT = 0.4;
const DURATION = 4.6;
/** El sonido (sfx/logo_neon.ogg) sale con el primer destello, el de la primera A. */
const SFX_AT = 0.5;
const BACKGROUND = '#121626';

interface Flash {
  t0: number;
  t1: number;
  level: number;
}

/** Un destello en [t0, t1), y luego una rampa de `rise` a `full`. */
interface Light {
  flash: Flash;
  rise: number;
  full: number;
  stutter?: Flash;
}

const LIGHTS: Record<string, Light> = {
  a1: { flash: { t0: 0.5, t1: 0.58, level: 1 }, rise: 0.76, full: 1.08 },
  a2: { flash: { t0: 0.98, t1: 1.05, level: 1 }, rise: 1.14, full: 1.44 },
  anillo: { flash: { t0: 1.58, t1: 1.64, level: 1 }, rise: 1.76, full: 2.06 },
  planeta: { flash: { t0: 2.14, t1: 2.18, level: 1 }, rise: 2.22, full: 2.42 },
  astro: { flash: { t0: 2.44, t1: 2.5, level: 1 }, rise: 2.54, full: 2.76 },
  arcade: {
    flash: { t0: 2.7, t1: 2.76, level: 0.7 },
    rise: 2.88,
    full: 3.14,
    stutter: { t0: 3.52, t1: 3.6, level: 0.35 },
  },
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function lightLevel(piece: string, t: number, calm: boolean): number {
  const l = LIGHTS[piece];
  // «apagado» se ve siempre.
  if (!l) return 1;
  if (calm) return clamp01((t - l.flash.t0) / (l.full - l.flash.t0));
  if (t >= l.flash.t0 && t < l.flash.t1) return l.flash.level;
  if (l.stutter && t >= l.stutter.t0 && t < l.stutter.t1) return l.stutter.level;
  return clamp01((t - l.rise) / (l.full - l.rise));
}

/** Un trozo del atlas y su sitio en el lienzo del logo. */
interface Layer {
  piece: string;
  sx: number;
  sy: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
}

interface Logo {
  image: HTMLImageElement;
  width: number;
  height: number;
  layers: Layer[];
}

async function loadLogo(): Promise<Logo> {
  const base = `${import.meta.env.BASE_URL}logo/`;
  const image = new Image();
  image.src = `${base}estudio.png`;
  const [txt] = await Promise.all([fetch(`${base}estudio.txt`).then((r) => r.text()), image.decode()]);
  const logo: Logo = { image, width: 0, height: 0, layers: [] };
  for (const line of txt.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (!parts[0] || parts[0].startsWith('#')) continue;
    const n = parts.slice(1).map(Number);
    if (parts[0] === 'lienzo') {
      [logo.width, logo.height] = n;
      continue;
    }
    if (n.length < 6 || n.some(Number.isNaN)) continue;
    // En el orden del fichero: lo apagado, los resplandores y, encima, los tubos.
    logo.layers.push({ piece: parts[0].split('.')[0], sx: n[0], sy: n[1], w: n[2], h: n[3], dx: n[4], dy: n[5] });
  }
  return logo;
}

async function loadSound(ctx: AudioContext): Promise<AudioBuffer> {
  const res = await fetch(`${import.meta.env.BASE_URL}sfx/logo_neon.ogg`);
  return ctx.decodeAudioData(await res.arrayBuffer());
}

/** Enseña el logo del estudio por encima de todo; se resuelve al acabar o al saltarlo. */
export function playBoot(mixer: Mixer): Promise<void> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = `position:fixed;inset:0;width:100%;height:100%;z-index:10;background:${BACKGROUND};cursor:pointer`;
    document.body.appendChild(canvas);
    const g = canvas.getContext('2d')!;
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let logo: Logo | null = null;
    let sound: AudioBuffer | null = null;
    let voice: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
    let soundTried = false;
    let start = -1;
    let done = false;

    mixer.resume();
    void loadLogo()
      .then((l) => {
        logo = l;
        start = performance.now();
      })
      .catch((e) => {
        console.warn('Logo del estudio sin cargar:', e);
        finish(false);
      });
    void loadSound(mixer.ctx)
      .then((b) => (sound = b))
      .catch((e) => console.warn('Sonido del logo sin cargar:', e));

    const elapsed = () => (start < 0 ? 0 : (performance.now() - start) / 1000);

    function stopSound(fadeMs: number): void {
      if (!voice) return;
      const now = mixer.ctx.currentTime;
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
      voice.src.stop(now + fadeMs / 1000 + 0.02);
      voice = null;
    }

    function finish(skipped: boolean): void {
      if (done) return;
      done = true;
      stopSound(skipped ? 120 : 60);
      window.removeEventListener('keydown', onKey, true);
      canvas.remove();
      resolve();
    }

    // Mientras se ve, las teclas (y el mando, que llega como teclas) no pasan al menú de detrás.
    function onKey(e: KeyboardEvent): void {
      e.stopImmediatePropagation();
      if (e.repeat) return;
      if (elapsed() > 0.3) finish(true);
    }
    window.addEventListener('keydown', onKey, true);
    canvas.addEventListener('pointerdown', () => {
      if (elapsed() > 0.3) finish(true);
    });

    function frame(): void {
      if (done) return;
      const t = elapsed();
      // Con el audio aún bloqueado por el navegador no suena: si se lanzara, se oiría luego en el menú.
      if (!soundTried && sound && logo && t >= SFX_AT && mixer.ctx.state === 'running') {
        soundTried = true;
        const offset = t - SFX_AT;
        if (offset < sound.duration - 0.1) {
          const src = mixer.ctx.createBufferSource();
          src.buffer = sound;
          const gain = mixer.ctx.createGain();
          src.connect(gain).connect(mixer.sfx);
          src.start(0, offset);
          voice = { src, gain };
        }
      }
      if (logo && t >= DURATION) {
        finish(false);
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalAlpha = 1;
      g.fillStyle = BACKGROUND;
      g.fillRect(0, 0, w, h);
      if (logo && logo.width > 0) {
        let a = clamp01(Math.min(t / FADE_IN, (DURATION - t) / FADE_OUT));
        a = a * a * (3 - 2 * a);
        // El lienzo (con el resplandor) cabe en el 80 % del ancho y el 68 % del alto.
        const s = Math.min((w * 0.8) / logo.width, (h * 0.68) / logo.height);
        const ox = w / 2 - (logo.width * s) / 2;
        const oy = h / 2 - (logo.height * s) / 2;
        g.imageSmoothingQuality = 'high';
        for (const c of logo.layers) {
          const k = lightLevel(c.piece, t, calm);
          if (k <= 0) continue;
          g.globalAlpha = a * k;
          g.drawImage(logo.image, c.sx, c.sy, c.w, c.h, ox + c.dx * s, oy + c.dy * s, c.w * s, c.h * s);
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}
