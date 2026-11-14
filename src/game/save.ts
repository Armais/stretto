import type { Difficulty } from '../config';
import type { Lang } from '../i18n';
import { ENDLESS_ID, LEVELS } from './levels';
import type { PendingScore } from './online';
import { VEHICLES, type VehicleId } from './vehicles';

// Partida guardada en el navegador: opciones, progreso y récords locales.

export interface RecordEntry {
  name: string;
  score: number;
  grade: string;
  vehicle: VehicleId;
  date: string;
}

export interface SaveData {
  lang: Lang | null;
  musicVolume: number;
  sfxVolume: number;
  difficulty: Difficulty;
  /** Niveles terminados (sin calar el motor). */
  passed: number[];
  /** Último nivel y coche elegidos. */
  lastLevel: number;
  lastVehicle: VehicleId;
  name: string;
  /** Clave `${nivel}-${dificultad}` → los 5 mejores. */
  records: Record<string, RecordEntry[]>;
  /** Identificador anónimo para reconocer tus entradas en el ranking online. */
  pid: string;
  /** Récords que aún no se han podido subir al ranking online. */
  pending: PendingScore[];
}

const KEY = 'stretto.save.v1';
const TOP = 5;

const DEFAULTS: SaveData = {
  lang: null,
  musicVolume: 0.8,
  sfxVolume: 0.9,
  difficulty: 'normal',
  passed: [],
  lastLevel: 1,
  lastVehicle: 'compact',
  name: '',
  records: {},
  pid: '',
  pending: [],
};

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<SaveData>) };
  } catch {
    // Si el guardado está roto se empieza de cero.
  }
  return { ...DEFAULTS };
}

export const save: SaveData = load();

export function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Sin almacenamiento (modo privado estricto): se juega igual, sin guardar.
  }
}

export function levelUnlocked(id: number): boolean {
  // El modo infinito se puede jugar desde el principio (P11).
  return id === 1 || id === ENDLESS_ID || save.passed.includes(id - 1);
}

export function vehicleUnlocked(id: VehicleId): boolean {
  const v = VEHICLES.find((x) => x.id === id)!;
  return v.unlockAfter === 0 || save.passed.includes(v.unlockAfter);
}

export function recordsFor(level: number, difficulty: Difficulty): RecordEntry[] {
  return save.records[`${level}-${difficulty}`] ?? [];
}

/** ¿Entraría esta puntuación entre los 5 mejores? */
export function qualifies(level: number, difficulty: Difficulty, score: number): boolean {
  const list = recordsFor(level, difficulty);
  return score > 0 && (list.length < TOP || score > list[list.length - 1].score);
}

export function addRecord(level: number, difficulty: Difficulty, entry: RecordEntry): void {
  const list = [...recordsFor(level, difficulty), entry].sort((a, b) => b.score - a.score).slice(0, TOP);
  save.records[`${level}-${difficulty}`] = list;
  persist();
}

/** Marca el nivel como pasado y devuelve lo que se desbloquea por ello. */
export function markPassed(level: number): { level: number | null; vehicles: VehicleId[] } {
  if (save.passed.includes(level)) return { level: null, vehicles: [] };
  save.passed.push(level);
  persist();
  const nextLevel = LEVELS.some((l) => l.id === level + 1) ? level + 1 : null;
  return { level: nextLevel, vehicles: VEHICLES.filter((v) => v.unlockAfter === level).map((v) => v.id) };
}
