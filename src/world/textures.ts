import * as THREE from 'three';

// Texturas generadas en un canvas al arrancar, sin ficheros.

export const WINDOW_COLS = 16;
export const WINDOW_ROWS = 32;

/** Fachada con ventanas: unas encendidas en cálido o en frío, la mayoría apagadas.
 *  `lit` escala cuántas hay encendidas (al amanecer, menos). */
export function windowTexture(lit = 1): THREE.CanvasTexture {
  const cw = 32;
  const ch = 32;
  const c = document.createElement('canvas');
  c.width = WINDOW_COLS * cw;
  c.height = WINDOW_ROWS * ch;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0c0e12';
  g.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < WINDOW_ROWS; y++) {
    // Cada planta tiene su propia probabilidad: oficinas vacías y plantas enteras encendidas.
    const floorLit = (Math.random() < 0.08 ? 0.55 : Math.random() * 0.12) * lit;
    for (let x = 0; x < WINDOW_COLS; x++) {
      const r = Math.random();
      if (r < floorLit) g.fillStyle = Math.random() < 0.85 ? '#e8b77c' : '#aebdd1';
      else if (r < floorLit + 0.06) g.fillStyle = '#2e2922';
      else g.fillStyle = Math.random() < 0.5 ? '#12161d' : '#171c24';
      g.fillRect(x * cw + 7, y * ch + 9, cw - 14, ch - 16);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Reflejo alargado de una luz sobre asfalto mojado: suave a lo ancho y apagándose hacia
 * los dos extremos. El plano que lo usa se estira hacia la cámara.
 */
export function streakTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const along = Math.pow(Math.sin((Math.PI * (y + 0.5)) / h), 1.4);
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5) / w - 0.5;
      const across = Math.exp(-(dx * dx) / 0.018);
      const a = Math.round(255 * along * across);
      const i = (y * w + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = a;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Mancha redonda que se difumina hacia fuera: luz de farola sobre el asfalto. */
export function poolTexture(): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Carteles de las piezas de Blender (material cartel_*). Lugares inventados; los de servicio
 * van con pictograma y sin texto en ningún idioma. `w`×`h` sigue la proporción de la cara. */
type Sign = {
  kind: 'exit' | 'tunnel' | 'fuel' | 'sos';
  bg: string;
  fg: string;
  w: number;
  h: number;
  arrow?: string;
  lines?: string[];
  tab?: string;
};

const SIGNS: Record<string, Sign> = {
  // Pórtico de autopista: a la izquierda se sigue recto y a la derecha está la salida.
  cartel_salida_1: { kind: 'exit', bg: '#0d6b3c', fg: '#f2f2ec', w: 512, h: 290, arrow: '↑', lines: ['Bellmar', 'Porto Vela'] },
  cartel_salida_2: { kind: 'exit', bg: '#0d6b3c', fg: '#f2f2ec', w: 512, h: 290, arrow: '↗', lines: ['Vela Norte', 'Lunamar'], tab: '14' },
  // Boca del túnel (7,2 × 1,8 m): pictograma y longitud de la pieza (150 m).
  cartel_tunel: { kind: 'tunnel', bg: '#123c8c', fg: '#f2f2ec', w: 1024, h: 256, lines: ['150 m'] },
  // Poste de la gasolinera (3,4 × 4,2 m): surtidor y "24h".
  cartel_gasolinera: { kind: 'fuel', bg: '#f2f2ec', fg: '#123c8c', w: 412, h: 512, lines: ['24h'] },
  // Placa del poste de auxilio (0,5 × 0,3 m).
  cartel_sos: { kind: 'sos', bg: '#f2f2ec', fg: '#c81e1e', w: 256, h: 154 },
};

const SIGN_FONT = '"Arial Narrow", "Roboto Condensed", Arial, sans-serif';

/** Cara de un cartel: fondo, ribete y su contenido. */
export function signTexture(name: string): THREE.CanvasTexture {
  const s = SIGNS[name] ?? { kind: 'exit', bg: '#202020', fg: '#d0d0d0', w: 512, h: 290, lines: [name] };
  const c = document.createElement('canvas');
  c.width = s.w;
  c.height = s.h;
  const g = c.getContext('2d')!;
  const W = s.w;
  const H = s.h;
  g.fillStyle = s.bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = s.fg;
  g.fillStyle = s.fg;
  g.lineWidth = Math.max(4, H * 0.024);
  const m = H * 0.04;
  g.beginPath();
  g.roundRect(m, m, W - 2 * m, H - 2 * m, H * 0.06);
  g.stroke();
  g.textBaseline = 'middle';
  if (s.kind === 'exit') {
    if (s.tab) {
      // Número de salida en una pestaña arriba a la derecha.
      g.fillRect(W - 132, 12, 120, 70);
      g.fillStyle = s.bg;
      g.font = `bold 52px ${SIGN_FONT}`;
      g.textAlign = 'center';
      g.fillText(s.tab, W - 72, 50);
      g.fillStyle = s.fg;
    }
    g.textAlign = 'left';
    g.font = `bold 120px ${SIGN_FONT}`;
    g.fillText(s.arrow ?? '', 40, 160);
    g.font = `bold 62px ${SIGN_FONT}`;
    (s.lines ?? []).forEach((line, i) => g.fillText(line, 140, 118 + i * 82));
  } else if (s.kind === 'tunnel') {
    // Boca de túnel: arco blanco con la calzada en negro, y la longitud a la derecha.
    const cx = H * 0.62;
    const r = H * 0.27;
    const y = H * 0.84;
    g.beginPath();
    g.moveTo(cx - r * 1.35, y);
    g.lineTo(cx - r * 1.35, y - r * 0.9);
    g.arc(cx, y - r * 0.9, r * 1.35, Math.PI, 0);
    g.lineTo(cx + r * 1.35, y);
    g.closePath();
    g.fill();
    g.fillStyle = s.bg;
    g.beginPath();
    g.moveTo(cx - r, y);
    g.lineTo(cx - r, y - r * 0.9);
    g.arc(cx, y - r * 0.9, r, Math.PI, 0);
    g.lineTo(cx + r, y);
    g.closePath();
    g.fill();
    g.fillStyle = s.fg;
    g.textAlign = 'center';
    g.font = `bold ${Math.round(H * 0.5)}px ${SIGN_FONT}`;
    g.fillText(s.lines?.[0] ?? '', (H * 1.3 + W) / 2, H * 0.53);
  } else if (s.kind === 'fuel') {
    // Surtidor: cuerpo con pantalla, manguera y boquerel.
    const u = W / 10;
    g.fillRect(u * 2.6, H * 0.14, u * 3.4, H * 0.48);
    g.fillRect(u * 2.2, H * 0.6, u * 4.2, H * 0.05);
    g.fillStyle = s.bg;
    g.fillRect(u * 3.1, H * 0.2, u * 2.4, H * 0.12);
    g.fillStyle = s.fg;
    g.lineWidth = u * 0.45;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(u * 6.0, H * 0.24);
    g.lineTo(u * 7.1, H * 0.3);
    g.lineTo(u * 7.1, H * 0.52);
    g.quadraticCurveTo(u * 7.1, H * 0.58, u * 7.7, H * 0.55);
    g.lineTo(u * 7.7, H * 0.26);
    g.stroke();
    g.textAlign = 'center';
    g.font = `bold ${Math.round(H * 0.22)}px ${SIGN_FONT}`;
    g.fillText(s.lines?.[0] ?? '', W / 2, H * 0.8);
  } else {
    g.textAlign = 'center';
    g.font = `bold ${Math.round(H * 0.62)}px ${SIGN_FONT}`;
    g.fillText('SOS', W / 2, H * 0.54);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // Las UV de un glTF ya vienen con la V hacia abajo (como las texturas que trae el propio GLB).
  tex.flipY = false;
  return tex;
}
