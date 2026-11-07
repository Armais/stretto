// Números del juego. Lo que viene de DISENO.md lleva su referencia (P2, P5...).
// Lo marcado como provisional es solo para el prototipo y se ajusta al probar.

export type Difficulty = 'easy' | 'normal' | 'hard';
export type Layer = 'drums' | 'bass' | 'chords' | 'melody' | 'arp' | 'solo';
export const LAYERS: Layer[] = ['drums', 'bass', 'chords', 'melody', 'arp', 'solo'];

/** P5: barra de motor. */
export const ENGINE = {
  start: 100,
  max: 100,
  badShift: -15,
  missedLine: -10,
  crash: -25,
  perfect: 3,
} as const;

/** P5: media ventana de cambio en 1.ª marcha (ms) y cuánto se estrecha en cada marcha. */
export const WINDOW_MS: Record<Difficulty, number> = { easy: 180, normal: 120, hard: 80 };
export const WINDOW_NARROW_PER_GEAR = 0.08;
/** Provisional: parte central de la ventana que cuenta como perfecto. */
export const PERFECT_FRACTION = 0.4;

/** P5: puntos y notas finales. */
export const POINTS = { perfect: 300, good: 100 } as const;
export const GRADES: { grade: string; min: number }[] = [
  { grade: 'S', min: 0.95 },
  { grade: 'A', min: 0.85 },
  { grade: 'B', min: 0.7 },
];

/** P2: pistas que mete cada marcha, según las marchas del vehículo. */
export const LAYERS_BY_GEAR: Record<number, Layer[][]> = {
  6: [['drums'], ['bass'], ['chords'], ['melody'], ['arp'], ['solo']],
  5: [['drums'], ['bass'], ['chords'], ['melody'], ['arp', 'solo']],
  4: [['drums', 'bass'], ['chords'], ['melody'], ['arp', 'solo']],
};

export type PickupKind = 'points' | 'repair' | 'nitro' | 'multiplier';

/** P5: premios. Los intervalos de aparición (segundos) son provisionales. */
export const PICKUPS = {
  repair: 25,
  points: 50,
  multiplier: 2,
  /** El nitro dura hasta la siguiente línea, y si la aciertas el cambio vale esto por sus puntos. */
  nitroShift: 2,
  /** Velocidad extra durante el nitro. Provisional. */
  nitroBoost: 1.3,
  /** La reparación solo aparece con el motor por debajo de esto. */
  repairBelow: 85,
  every: { points: 4, repair: 16, nitro: 24, multiplier: 30 } as Record<PickupKind, number>,
};

/** Carriles de cada nivel, del 1 al 5. */
export const LANES_BY_LEVEL = [3, 3, 4, 4, 5];

/** Provisional: mundo, velocidad y tráfico. Unidades del mundo ≈ metros. */
export const WORLD = {
  laneWidth: 3.4,
  speedFirstGear: 45,
  speedTopGear: 95,
  /** 1/s: cómo de rápido alcanza el coche la velocidad de su marcha. */
  speedResponse: 2.5,
  /** Segundos que tarda (casi entero) un cambio de carril. */
  laneChangeTime: 0.14,
  /** Fracción de velocidad que se pierde al chocar. */
  crashSlowdown: 0.5,
  crashInvulnerable: 1.2,
  trafficSpeed: 18,
  spawnDistance: 260,
} as const;

/**
 * Provisional: tráfico. Cada cierto tramo (al azar entre gapMin y gapMax metros de distancia
 * relativa) aparece un grupo: un coche suelto o una pareja que deja libre un solo carril.
 */
export const TRAFFIC = {
  gapMin: 42,
  gapMax: 75,
  /** gap multiplica la distancia entre grupos; pairs es la probabilidad de pareja. */
  byDifficulty: {
    easy: { gap: 1.5, pairs: 0.15 },
    normal: { gap: 1, pairs: 0.35 },
    hard: { gap: 0.75, pairs: 0.5 },
  } as Record<Difficulty, { gap: number; pairs: number }>,
  /** Parte de las parejas que salen escalonadas en vez de en paralelo. */
  staggerChance: 0.35,
  stagger: 11,
};
