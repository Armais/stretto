import type { Difficulty } from '../config';
import { persist, recordsFor, save, type RecordEntry } from './save';
import type { VehicleId } from './vehicles';

// Ranking online (P7) en Firestore: boards/{nivel}-{dificultad}/scores. Las reglas
// (firestore.rules) solo aceptan entradas con el formato correcto y no dejan cambiarlas.
// El SDK se carga la primera vez que hace falta, para no engordar el arranque.

const CONFIG = {
  apiKey: 'AIzaSyCL2mv_eV3xT-htX1t8W4uO_xKmRvg11ac',
  authDomain: 'stretto-a9274.firebaseapp.com',
  projectId: 'stretto-a9274',
  storageBucket: 'stretto-a9274.firebasestorage.app',
  messagingSenderId: '86620402687',
  appId: '1:86620402687:web:9265fcdd7c5af58fdcedca',
};

export const WORLD_TOP = 10;
/** Lo que se espera a Firestore antes de dar el ranking por perdido. */
const TIMEOUT_MS = 8000;
/** Un ranking ya descargado se reutiliza durante este tiempo. */
const CACHE_MS = 60_000;

export interface WorldEntry {
  name: string;
  score: number;
  grade: string;
  vehicle: VehicleId;
  /** La ha subido este navegador. */
  mine: boolean;
}

export interface WorldBoard {
  top: WorldEntry[];
  /** Tu mejor marca local y su puesto mundial, si no sales entre los primeros. */
  me: { rank: number; entry: RecordEntry } | null;
}

/** Una puntuación esperando a subirse (si falla la red, se reintenta en la próxima partida). */
export interface PendingScore {
  board: string;
  name: string;
  score: number;
  grade: string;
  vehicle: VehicleId;
}

type Lite = typeof import('firebase/firestore/lite');
let ready: Promise<{ fs: Lite; db: ReturnType<Lite['getFirestore']> }> | null = null;

function firestore() {
  ready ??= Promise.all([import('firebase/app'), import('firebase/firestore/lite')]).then(([app, fs]) => ({
    fs,
    db: fs.getFirestore(app.initializeApp(CONFIG)),
  }));
  // Si falla la carga (sin red), el siguiente intento vuelve a probar.
  ready.catch(() => (ready = null));
  return ready;
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS))]);
}

const boardId = (level: number, difficulty: Difficulty) => `${level}-${difficulty}`;

/** Identificador anónimo de este navegador, para reconocer tus entradas en el ranking. */
function playerId(): string {
  if (!/^[0-9a-f]{16}$/.test(save.pid)) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    save.pid = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    persist();
  }
  return save.pid;
}

const cache = new Map<string, { at: number; data: WorldBoard }>();

/** Los mejores del mundo en ese nivel y dificultad, y tu puesto si no sales entre ellos. */
export async function worldBoard(level: number, difficulty: Difficulty): Promise<WorldBoard> {
  const id = boardId(level, difficulty);
  const hit = cache.get(id);
  if (hit && performance.now() - hit.at < CACHE_MS) return hit.data;
  const { fs, db } = await withTimeout(firestore());
  const scores = fs.collection(db, 'boards', id, 'scores');
  const snap = await withTimeout(fs.getDocs(fs.query(scores, fs.orderBy('score', 'desc'), fs.limit(WORLD_TOP))));
  const pid = playerId();
  const top = snap.docs.map((d) => {
    const v = d.data();
    return { name: v.name, score: v.score, grade: v.grade, vehicle: v.vehicle, mine: v.pid === pid } as WorldEntry;
  });
  let me: WorldBoard['me'] = null;
  const best = recordsFor(level, difficulty)[0];
  if (best && !top.some((e) => e.mine)) {
    const above = await withTimeout(fs.getCount(fs.query(scores, fs.where('score', '>', best.score))));
    me = { rank: above.data().count + 1, entry: best };
  }
  const data = { top, me };
  cache.set(id, { at: performance.now(), data });
  return data;
}

/** Apunta un récord local para subirlo y lo intenta enseguida. */
export function submitScore(level: number, difficulty: Difficulty, entry: RecordEntry): void {
  save.pending.push({ board: boardId(level, difficulty), name: entry.name, score: Math.round(entry.score), grade: entry.grade, vehicle: entry.vehicle });
  persist();
  void flushScores();
}

let flushing = false;

/** Sube lo que quede pendiente. Lo que Firestore rechaza por formato se descarta. */
export async function flushScores(): Promise<void> {
  if (flushing || !save.pending.length) return;
  flushing = true;
  try {
    const { fs, db } = await withTimeout(firestore());
    while (save.pending.length) {
      const p = save.pending[0];
      try {
        await withTimeout(
          fs.addDoc(fs.collection(db, 'boards', p.board, 'scores'), {
            name: p.name,
            score: p.score,
            grade: p.grade,
            vehicle: p.vehicle,
            pid: playerId(),
            at: fs.serverTimestamp(),
          }),
        );
        cache.delete(p.board);
      } catch (e) {
        if ((e as { code?: string }).code !== 'permission-denied') throw e;
      }
      save.pending.shift();
      persist();
    }
  } catch {
    // Sin red: queda pendiente para la próxima vez.
  } finally {
    flushing = false;
  }
}
