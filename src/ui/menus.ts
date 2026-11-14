import type { Difficulty } from '../config';
import { ENDLESS_ACCENT, ENDLESS_ID, LEVELS } from '../game/levels';
import { worldBoard, type WorldBoard } from '../game/online';
import { levelUnlocked, persist, recordsFor, save, vehicleUnlocked } from '../game/save';
import { VEHICLES, type Vehicle, type VehicleId } from '../game/vehicles';
import { LANG_NAMES, LANGS, currentLang, setLang, t, type TextKey } from '../i18n';
import { usingPad } from '../input/gamepad';
import { usingTouch } from '../input/touch';

// Menús (P8) en HTML encima del canvas. Cada pantalla es una lista de filas: ↑ ↓ cambian de
// fila, ← → cambian el valor de la fila y Enter la activa. También van con ratón.

interface Row {
  html: () => string;
  left?: () => void;
  right?: () => void;
  enter?: () => void;
  disabled?: () => boolean;
  /** Clic en una tarjeta de la fila (data-pick): la elige directamente. */
  pick?: (value: string) => void;
  cls?: string;
}

export interface ResultsData {
  level: number;
  vehicle: VehicleId;
  finished: boolean;
  score: number;
  grade: string;
  stats: { perfect: number; good: number; fails: number; crashes: number };
  unlocked: string[];
  newRecord: boolean;
  hasNext: boolean;
  /** Solo en el modo infinito: tiempo aguantado y hasta dónde llegó. */
  endless?: { time: string; lap: number; where: string };
}

export interface MenuActions {
  start(level: number, vehicle: VehicleId): void;
  resume(): void;
  restart(): void;
  quit(): void;
  /** Volumen o idioma cambiados: hay que aplicarlos. */
  settingsChanged(): void;
  saveRecord(name: string): void;
}

const DIFFS: Difficulty[] = ['easy', 'normal', 'hard'];
const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;
const cycle = <T>(list: T[], cur: T, d: number): T => list[(list.indexOf(cur) + d + list.length) % list.length];
const arrows = (label: string, value: string): string =>
  `<span class="m-label">${label}</span><span class="m-value"><span class="m-arrow" data-dir="-1">‹</span>${value}<span class="m-arrow" data-dir="1">›</span></span>`;
/** Niveles en orden y el modo infinito al final. */
const PLAY_IDS = [...LEVELS.map((l) => l.id), ENDLESS_ID];
const accentOf = (id: number): number => (id === ENDLESS_ID ? ENDLESS_ACCENT : LEVELS.find((l) => l.id === id)!.accent);
const levelRow = (id: number): string =>
  id === ENDLESS_ID ? arrows(t('endless'), t('endlessDesc')) : arrows(t('level', { n: id }), t(`level${id}` as TextKey));
/** Volumen en diez segmentos, como el de una radio de coche. */
const meter = (v: number): string =>
  `<span class="m-meter">${Array.from({ length: 10 }, (_, i) => `<i${i < Math.round(v * 10) ? ' class="on"' : ''}></i>`).join('')}</span><span class="m-num">${Math.round(v * 100)}%</span>`;
/** Flechas a los lados de una tira de tarjetas. */
const strip = (cards: string): string =>
  `<span class="m-arrow" data-dir="-1">‹</span><div class="m-cards">${cards}</div><span class="m-arrow" data-dir="1">›</span>`;
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** Fila de la tabla de récords; las tuyas van marcadas. */
const recordRow = (rank: number, r: { name: string; vehicle: VehicleId; grade: string; score: number }, mine = false): string =>
  `<tr${mine ? ' class="m-me"' : ''}><td>${rank.toLocaleString()}</td><td>${esc(r.name)}${mine ? ` <span class="m-you">${t('you')}</span>` : ''}</td><td>${t(r.vehicle)}</td><td>${esc(r.grade)}</td><td>${r.score.toLocaleString()}</td></tr>`;

/** Ranking mundial de la pantalla de récords: el que se está pidiendo o el que llegó. */
interface WorldState {
  key: string;
  state: 'loading' | 'ok' | 'error';
  data?: WorldBoard;
}

export class Menus {
  active = false;
  private readonly el: HTMLDivElement;
  private readonly actions: MenuActions;
  private rows: Row[] = [];
  private focus = 0;
  private header = '';
  private body: () => string = () => '';
  private back: (() => void) | null = null;
  private extraKey: ((e: KeyboardEvent) => boolean | 'pass') | null = null;
  private level = save.lastLevel;
  private vehicle: VehicleId = save.lastVehicle;
  private recordsLevel = 1;
  private recordsDiff: Difficulty = save.difficulty;
  private world: WorldState = { key: '', state: 'loading' };

  constructor(container: HTMLElement, actions: MenuActions) {
    this.actions = actions;
    this.el = document.createElement('div');
    this.el.className = 'menu hidden';
    container.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.m-back')) {
        this.back?.();
        this.render();
        return;
      }
      const row = target.closest<HTMLElement>('.m-row');
      if (!row) return;
      this.focus = Number(row.dataset.i);
      const r = this.rows[this.focus];
      const dir = target.closest<HTMLElement>('.m-arrow')?.dataset.dir;
      const pick = target.closest<HTMLElement>('[data-pick]')?.dataset.pick;
      if (dir === '-1') r.left?.();
      else if (dir === '1') r.right?.();
      else if (pick !== undefined && r.pick) r.pick(pick);
      else if (!r.pick && !r.disabled?.()) (r.enter ?? r.right)?.();
      this.render();
    });
    this.el.addEventListener('mousemove', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.m-row');
      if (row && Number(row.dataset.i) !== this.focus) {
        this.focus = Number(row.dataset.i);
        this.render();
      }
    });
  }

  hide(): void {
    this.active = false;
    this.el.classList.add('hidden');
  }

  /** Teclado. Devuelve true si la tecla era del menú. */
  key(e: KeyboardEvent): boolean {
    if (!this.active) return false;
    if (this.extraKey) {
      const r = this.extraKey(e);
      if (r === 'pass') return false;
      if (r) {
        this.render();
        return true;
      }
    }
    const row = this.rows[this.focus];
    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.move(-1);
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.move(1);
        break;
      case 'ArrowLeft':
      case 'KeyA':
        row?.left?.();
        break;
      case 'ArrowRight':
      case 'KeyD':
        row?.right?.();
        break;
      case 'Enter':
      case 'Space':
        if (row && !row.disabled?.()) (row.enter ?? row.right)?.();
        break;
      case 'Escape':
        this.back?.();
        break;
      default:
        return false;
    }
    this.render();
    return true;
  }

  // ---------- Pantallas ----------

  title(): void {
    this.open(
      `<h1>STRETTO</h1><div class="m-sub"><span class="m-station">Night Shift FM</span><span>${t('subtitle')}</span></div>`,
      [
        { html: () => t('menuPlay'), enter: () => this.select() },
        { html: () => t('menuOptions'), enter: () => this.options() },
        { html: () => t('menuRecords'), enter: () => this.records() },
      ],
      { back: null, cls: 'title' },
    );
  }

  select(): void {
    this.open(
      `<h2>${t('selectTitle')}</h2>`,
      [
        // Las tarjetas son el propio selector: ← → recorren la tira y un clic elige.
        {
          html: () => strip(this.levelCards()),
          left: () => (this.level = cycle(PLAY_IDS, this.level, -1)),
          right: () => (this.level = cycle(PLAY_IDS, this.level, 1)),
          pick: (v) => (this.level = Number(v)),
          cls: 'strip',
        },
        {
          html: () => strip(this.vehicleCards()),
          left: () => (this.vehicle = cycle(VEHICLES.map((v) => v.id), this.vehicle, -1)),
          right: () => (this.vehicle = cycle(VEHICLES.map((v) => v.id), this.vehicle, 1)),
          pick: (v) => (this.vehicle = v as VehicleId),
          cls: 'strip',
        },
        {
          html: () => `<span class="m-cta">${t('start')}</span>`,
          disabled: () => !levelUnlocked(this.level) || !vehicleUnlocked(this.vehicle),
          enter: () => {
            save.lastLevel = this.level;
            save.lastVehicle = this.vehicle;
            persist();
            this.actions.start(this.level, this.vehicle);
          },
        },
      ],
      { back: () => this.title(), focus: 2, accent: () => accentOf(this.level), cls: 'wide' },
    );
  }

  options(): void {
    this.open(
      `<h2>${t('optionsTitle')}</h2>`,
      [
        {
          html: () => arrows(t('language'), LANG_NAMES[currentLang()]),
          left: () => this.changeLang(-1),
          right: () => this.changeLang(1),
        },
        {
          html: () => arrows(t('musicVolume'), meter(save.musicVolume)),
          left: () => this.changeVolume('musicVolume', -0.1),
          right: () => this.changeVolume('musicVolume', 0.1),
        },
        {
          html: () => arrows(t('sfxVolume'), meter(save.sfxVolume)),
          left: () => this.changeVolume('sfxVolume', -0.1),
          right: () => this.changeVolume('sfxVolume', 0.1),
        },
        {
          html: () => arrows(t('difficulty'), t(save.difficulty)),
          left: () => this.changeDifficulty(-1),
          right: () => this.changeDifficulty(1),
        },
        { html: () => t('back'), enter: () => this.title() },
      ],
      { back: () => this.title() },
    );
  }

  records(): void {
    this.open(
      `<h2>${t('recordsTitle')}</h2>`,
      [
        {
          html: () => levelRow(this.recordsLevel),
          left: () => {
            this.recordsLevel = cycle(PLAY_IDS, this.recordsLevel, -1);
            this.loadWorld();
          },
          right: () => {
            this.recordsLevel = cycle(PLAY_IDS, this.recordsLevel, 1);
            this.loadWorld();
          },
        },
        {
          html: () => arrows(t('difficulty'), t(this.recordsDiff)),
          left: () => {
            this.recordsDiff = cycle(DIFFS, this.recordsDiff, -1);
            this.loadWorld();
          },
          right: () => {
            this.recordsDiff = cycle(DIFFS, this.recordsDiff, 1);
            this.loadWorld();
          },
        },
        { html: () => t('back'), enter: () => this.title() },
      ],
      { back: () => this.title(), body: this.recordsBody, cls: 'records' },
    );
    this.loadWorld();
  }

  /** Pide el ranking mundial del nivel y dificultad que se ven, y repinta al llegar. */
  private loadWorld(): void {
    const key = `${this.recordsLevel}-${this.recordsDiff}`;
    this.world = { key, state: 'loading' };
    worldBoard(this.recordsLevel, this.recordsDiff).then(
      (data) => this.worldArrived(key, { key, state: 'ok', data }),
      () => this.worldArrived(key, { key, state: 'error' }),
    );
  }

  private worldArrived(key: string, w: WorldState): void {
    if (this.world.key !== key) return;
    this.world = w;
    if (this.active && this.body === this.recordsBody) this.render();
  }

  /** Mientras se descargan las pistas de la canción. */
  loading(): void {
    this.open(`<h2>${t('loading')}</h2>`, [], { back: null });
  }

  pause(): void {
    this.open(
      `<h2>${t('paused')}</h2>`,
      [
        { html: () => t('resume'), enter: () => this.actions.resume() },
        { html: () => t('restart'), enter: () => this.actions.restart() },
        { html: () => t('quit'), enter: () => this.actions.quit() },
      ],
      { back: () => this.actions.resume() },
    );
  }

  results(d: ResultsData): void {
    const validName = (n: string) => /^[\p{L}\p{N} _.-]{3,12}$/u.test(n);
    // El nombre se pide solo la primera vez; luego cada récord se guarda con él sin preguntar.
    let naming = d.newRecord && !validName(save.name);
    let saved = false;
    if (d.newRecord && !naming) {
      this.actions.saveRecord(save.name);
      saved = true;
    }
    /** Guarda el nombre escrito en la casilla, si es válido. */
    const commit = (): boolean => {
      if (!naming) return false;
      const name = (this.el.querySelector<HTMLInputElement>('.m-name')?.value ?? '').trim();
      if (!validName(name)) return false;
      save.name = name;
      this.actions.saveRecord(name);
      naming = false;
      saved = true;
      this.extraKey = null;
      return true;
    };
    // Salir con el ratón también guarda lo escrito, aunque no se haya pulsado Enter.
    const rows: Row[] = [
      {
        html: () => t('retry'),
        enter: () => {
          commit();
          this.actions.restart();
        },
      },
    ];
    if (d.hasNext)
      rows.push({
        html: () => t('nextLevel'),
        enter: () => {
          commit();
          this.level = d.level + 1;
          this.select();
        },
      });
    rows.push({
      html: () => t('toMenu'),
      enter: () => {
        commit();
        this.actions.quit();
      },
    });
    const body = () => {
      const s = d.stats;
      const name = naming
        ? `<div class="m-record">${t('newRecord')}<input class="m-name" maxlength="12" value="${save.name}" placeholder="${t('enterName')}"></div>`
        : saved
          ? `<div class="m-record"><span>${t('newRecord')}</span><b>${save.name}</b></div>`
          : '';
      const reach = d.endless
        ? `<div class="m-reach"><div>${t('survived', { time: d.endless.time })}</div><div>${t('reached', { lap: d.endless.lap, where: d.endless.where })}</div></div>`
        : '';
      const tally = (
        [
          [s.perfect, 'perfects'],
          [s.good, 'goods'],
          [s.fails, 'fails'],
          [s.crashes, 'crashes'],
        ] as const
      )
        .map(([n, k]) => `<div><b>${n}</b><span>${t(k)}</span></div>`)
        .join('');
      return `<div class="m-result">
          <div class="m-headline">
            ${d.finished ? `<div class="m-grade">${d.grade}</div>` : ''}
            <div class="m-score"><span>${t('score')}</span><b>${d.score.toLocaleString()}</b></div>
          </div>
          ${reach}
          <div class="m-tally">${tally}</div>
          ${d.unlocked.length ? `<div class="m-unlocks">${d.unlocked.map((u) => `<div>${t('unlocked', { what: u })}</div>`).join('')}</div>` : ''}
          ${name}</div>`;
    };
    this.open(`<h2>${d.finished ? t('finished') : t('stalled')}</h2>`, rows, {
      // También con el «Volver» de la pantalla táctil se guarda lo escrito.
      back: () => {
        commit();
        this.actions.quit();
      },
      body,
      accent: () => accentOf(d.level),
      cls: 'results',
    });
    if (naming) {
      this.extraKey = (e) => {
        // El teclado del móvil (Android) suele mandar el Enter sin `code`.
        if (e.code === 'Enter' || e.key === 'Enter') {
          // Con mando no se puede escribir: sin nombre válido, A hace lo de la opción marcada.
          if (!commit()) return usingPad() ? false : true;
          return true;
        }
        if (e.code === 'Escape') {
          naming = false;
          this.extraKey = null;
          return true;
        }
        // ↑ ↓ siguen moviendo por las opciones; el resto de teclas (WASD incluidas) son para escribir.
        if (e.code === 'ArrowUp' || e.code === 'ArrowDown') return false;
        return 'pass';
      };
      this.render();
      this.el.querySelector<HTMLInputElement>('.m-name')?.focus();
    }
  }

  // ---------- Piezas ----------

  /** El número del nivel es lo que se lee primero, en el color de acento del nivel. */
  private levelCards(): string {
    return `${LEVELS.map((l) => {
      const open = levelUnlocked(l.id);
      const best = recordsFor(l.id, save.difficulty)[0];
      const foot = !open ? t('unlockLevel', { n: l.id - 1 }) : best ? t('best', { score: best.score.toLocaleString(), grade: best.grade }) : t('noBest');
      return `<div class="m-card${l.id === this.level ? ' sel' : ''}${open ? '' : ' locked'}" data-pick="${l.id}" style="--accent:${css(l.accent)}">
        <div class="m-card-n">${l.id}</div>
        <div class="m-card-t">${t(`level${l.id}` as TextKey)}</div>
        <div class="m-card-s"><div>${t('bpm', { n: l.song.bpm })}</div><div>${t('lanes', { n: l.lanes })}</div></div>
        <div class="m-card-f">${foot}</div></div>`;
    }).join('')}${this.endlessCard()}`;
  }

  private endlessCard(): string {
    const best = recordsFor(ENDLESS_ID, save.difficulty)[0];
    const lanes = LEVELS.map((l) => l.lanes);
    const bpms = LEVELS.map((l) => l.song.bpm);
    return `<div class="m-card${this.level === ENDLESS_ID ? ' sel' : ''}" data-pick="${ENDLESS_ID}" style="--accent:${css(ENDLESS_ACCENT)}">
        <div class="m-card-n inf">∞</div>
        <div class="m-card-t">${t('endless')}</div>
        <div class="m-card-s"><div>${t('bpm', { n: `${Math.min(...bpms)}–${Math.max(...bpms)}` })}</div><div>${t('lanes', { n: `${Math.min(...lanes)}–${Math.max(...lanes)}` })}</div></div>
        <div class="m-card-f">${best ? t('best', { score: best.score.toLocaleString(), grade: best.grade }) : t('noBest')}</div></div>`;
  }

  private vehicleCards(): string {
    const traits = (v: Vehicle) =>
      `<dl class="m-traits">
        <dt>${t('statWindow')}</dt><dd>${t(v.traits.window)}</dd>
        <dt>${t('statLane')}</dt><dd>${t(v.traits.lane === 'normal' ? 'normalSpeed' : v.traits.lane)}</dd>
        <dt>${t('statEngine')}</dt><dd>${t(v.traits.engine === 'normal' ? 'normalEngine' : v.traits.engine)}</dd>
      </dl>`;
    return VEHICLES.map((v) => {
      const open = vehicleUnlocked(v.id);
      return `<div class="m-card car${v.id === this.vehicle ? ' sel' : ''}${open ? '' : ' locked'}" data-pick="${v.id}">
        <div class="m-card-t">${t(v.id)}</div>
        <div class="m-card-s">${t('gears', { n: v.gears })}</div>
        ${traits(v)}
        <div class="m-card-f">${open ? '' : t('unlockLevel', { n: v.unlockAfter })}</div></div>`;
    }).join('');
  }

  /** Ranking mundial (P7); sin conexión, los récords de este navegador con un aviso. */
  private recordsBody = (): string => {
    const w = this.world;
    if (w.state === 'loading') return `<div class="m-empty">${t('worldLoading')}</div>`;
    if (w.state === 'error') {
      const list = recordsFor(this.recordsLevel, this.recordsDiff);
      const note = `<div class="m-note">${t('worldOffline')}</div>`;
      if (!list.length) return `${note}<div class="m-empty">${t('noRecords')}</div>`;
      return `${note}<table class="m-table m-world">${list.map((r, i) => recordRow(i + 1, r)).join('')}</table>`;
    }
    const { top, me } = w.data!;
    if (!top.length && !me) return `<div class="m-empty">${t('noRecords')}</div>`;
    const rows = top.map((r, i) => recordRow(i + 1, r, r.mine));
    if (me) {
      if (top.length) rows.push(`<tr class="m-gap"><td></td><td colspan="4">···</td></tr>`);
      // Si la tabla no cabe (un móvil en horizontal), se desplaza y tu fila se queda abajo a la vista.
      rows.push(recordRow(me.rank, me.entry, true).replace('class="m-me"', 'class="m-me m-pin"'));
    }
    return `<div class="m-scroll"><table class="m-table m-world">${rows.join('')}</table></div>`;
  };

  private changeLang(d: number): void {
    const next = cycle(LANGS, currentLang(), d);
    setLang(next);
    save.lang = next;
    persist();
    this.actions.settingsChanged();
  }

  private changeVolume(key: 'musicVolume' | 'sfxVolume', d: number): void {
    save[key] = Math.round(Math.min(1, Math.max(0, save[key] + d)) * 10) / 10;
    persist();
    this.actions.settingsChanged();
  }

  private changeDifficulty(d: number): void {
    save.difficulty = cycle(DIFFS, save.difficulty, d);
    persist();
  }

  private move(d: number): void {
    if (!this.rows.length) return;
    this.focus = (this.focus + d + this.rows.length) % this.rows.length;
  }

  private open(
    header: string,
    rows: Row[],
    opts: { back?: (() => void) | null; body?: () => string; focus?: number; accent?: () => number; cls?: string } = {},
  ): void {
    this.active = true;
    this.header = header;
    this.rows = rows;
    this.focus = opts.focus ?? 0;
    this.body = opts.body ?? (() => '');
    this.back = opts.back ?? null;
    this.extraKey = null;
    this.el.className = `menu ${opts.cls ?? ''}`;
    this.accent = opts.accent ?? (() => 0xffb867);
    this.render();
  }

  private accent: () => number = () => 0xffb867;

  private render(): void {
    if (!this.active) return;
    const input = this.el.querySelector<HTMLInputElement>('.m-name');
    const typed = input?.value;
    const rows = this.rows
      .map(
        (r, i) =>
          `<div class="m-row${r.cls ? ` ${r.cls}` : ''}${i === this.focus ? ' focus' : ''}${r.disabled?.() ? ' disabled' : ''}" data-i="${i}">${r.html()}</div>`,
      )
      .join('');
    this.el.style.setProperty('--accent', css(this.accent()));
    this.el.innerHTML = `<div class="m-panel">${this.header}${this.body()}<div class="m-rows">${rows}</div></div>${this.legend()}`;
    const again = this.el.querySelector<HTMLInputElement>('.m-name');
    if (again && typed !== undefined) {
      again.value = typed;
      again.focus();
    }
  }

  /** Teclas que sirven ahora mismo, siempre en la misma esquina; cambian según la fila. */
  private legend(): string {
    // Con el dedo no hay teclas que enseñar: solo un botón para volver, arriba a la derecha.
    if (usingTouch()) return this.back ? `<div class="m-legend"><span class="m-back">‹ ${t('navBack')}</span></div>` : '';
    const row = this.rows[this.focus];
    const keys: [string[], string][] = [];
    if (this.rows.length > 1) keys.push([['↑', '↓'], t('navMove')]);
    if (row?.left) keys.push([['←', '→'], t('navChange')]);
    // Con mando se enseñan sus botones; las flechas valen para la cruceta.
    const pad = usingPad();
    if (row?.enter && !row.disabled?.()) keys.push([[pad ? 'A' : 'Enter'], t('navPick')]);
    if (this.back) keys.push([[pad ? 'B' : 'Esc'], t('navBack')]);
    const cls = (k: string) => (pad && (k === 'A' || k === 'B') ? ' class="btn"' : k.length === 1 ? ' class="sym"' : '');
    return `<div class="m-legend">${keys
      .map(([caps, label]) => `<span>${caps.map((k) => `<kbd${cls(k)}>${k}</kbd>`).join('')}${label}</span>`)
      .join('')}</div>`;
  }
}
