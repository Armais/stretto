import './style.css';
import { AudioClock } from './audio/clock';
import { EndlessMusic, loadStyle } from './audio/endless';
import { Mixer } from './audio/mixer';
import { Music } from './audio/music';
import { StemMusic, dropStems, loadStems, type MusicPlayer, type StemBuffers } from './audio/stems';
import { ENGINES, Sfx } from './audio/sfx';
import { LAYERS, PICKUPS, TRAFFIC, WORLD, type PickupKind } from './config';
import { EndlessTimeline, LAP, type Station } from './game/endless';
import { ENDLESS_ID, LEVELS, type LevelDef } from './game/levels';
import { Race, type Cue, type RaceEvent } from './game/race';
import { addRecord, levelUnlocked, markPassed, qualifies, save, vehicleUnlocked } from './game/save';
import { barDuration, sectionAt } from './game/song';
import { VEHICLES, vehicleById, type Vehicle, type VehicleId } from './game/vehicles';
import { setLang, t, type TextKey } from './i18n';
import { startGamepad } from './input/gamepad';
import { Hud } from './ui/hud';
import { Menus } from './ui/menus';
import { PlayerCar } from './world/car';
import { CueLines } from './world/cues';
import { Pickups } from './world/pickups';
import { Road } from './world/road';
import { SceneryView } from './world/scenery';
import { loadAllProps, loadProps, neonMaterial } from './world/props';
import { bendObject, curve } from './world/curve';
import { Stage } from './world/stage';
import { Traffic } from './world/traffic';

// Director del juego: menús, carrera, pausa y resultados.

setLang(save.lang);
const container = document.getElementById('game')!;
const stage = new Stage(container);
let road = new Road(LEVELS[0].lanes);
let city = new SceneryView(LEVELS[0].scenery, road.width);
stage.setLook(city.look);
road.setLook(city.look.lamps, city.look.ground, city.look.groundY);
const car = new PlayerCar(road);
const traffic = new Traffic(road);
const pickups = new Pickups(road);
stage.scene.add(road.group, city.group, car.group, traffic.group, pickups.group);
const hud = new Hud(container);
const mixer = new Mixer();
mixer.setVolumes(save.musicVolume, save.sfxVolume);
const clock = new AudioClock(mixer.ctx);
const sfx = new Sfx(mixer);

type Phase = 'menu' | 'racing' | 'paused' | 'results';
let phase: Phase = 'menu';
let level: LevelDef = LEVELS[0];
let vehicle: Vehicle = vehicleUnlocked(save.lastVehicle) ? vehicleById(save.lastVehicle) : VEHICLES[0];
car.setup(road, vehicle);
let race: Race | null = null;
let music: MusicPlayer | null = null;
let keyCue: Cue | null = null;
/** Partida del modo infinito en curso (null en los niveles). */
let endless: { timeline: EndlessTimeline; music: EndlessMusic; station: number; swapAt: number } | null = null;
/** Segundos de antelación con que se generan las líneas del infinito. */
const ENDLESS_AHEAD = 25;
/** Tiempo aguantado en el infinito, para resultados y récords. */
let survived = '';
let keyChanged = false;
/** Cuenta los arranques: si llega otro mientras se cargan pistas, el viejo no sigue. */
let startToken = 0;
let lines: CueLines | null = null;
let speed: number = WORLD.speedFirstGear;
let distance = 0;
let invulnerable = 0;
let lastGear = 0;
let lastNitro = false;
let rpm = 0.2;
/** Mensajes ya mostrados en esta carrera (radio y tutorial). */
let shown = new Set<string>();

/** Recuento de lo que pasa en la carrera, para resultados y pruebas. */
const stats = { perfect: 0, good: 0, badShift: 0, missed: 0, crash: 0, pickup: 0 };

const menus = new Menus(container, {
  start: (lvl, veh) => startRace(lvl, veh),
  resume: () => resumeRace(),
  restart: () => startRace(playingId(), vehicle.id),
  quit: () => quitToMenu(),
  settingsChanged: () => {
    mixer.setVolumes(save.musicVolume, save.sfxVolume);
    hud.relabel();
  },
  calibrationClicks: () => calibrationClicks(),
  saveRecord: (name) => {
    if (!race) return;
    addRecord(playingId(), save.difficulty, {
      name,
      score: race.score,
      // En el infinito no hay nota: se guarda el tiempo aguantado.
      grade: endless ? survived : race.grade(),
      vehicle: vehicle.id,
      date: new Date().toISOString().slice(0, 10),
    });
  },
});

const gearSpeed = (gear: number): number =>
  WORLD.speedFirstGear + ((WORLD.speedTopGear - WORLD.speedFirstGear) * (gear - 1)) / (vehicle.gears - 1);

/** Lo que se está jugando: un nivel o el modo infinito. */
const playingId = (): number => (endless ? ENDLESS_ID : level.id);

/** Distancia entre grupos de tráfico y probabilidad de parejas, según nivel y vuelta. */
function trafficFor(lvl: LevelDef, lap: number): [number, number] {
  const diff = TRAFFIC.byDifficulty[save.difficulty];
  return [diff.gap * lvl.trafficGap * Math.pow(LAP.trafficGap, lap), Math.min(0.9, diff.pairs * lvl.trafficPairs + LAP.pairs * lap)];
}

const clockText = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

function songTime(perfMs: number): number {
  return music ? clock.heardAt(perfMs) - music.startTime : 0;
}

/** Carretera y escenario del nivel (si cambian los carriles o el paisaje). */
function buildWorld(lvl: LevelDef): void {
  // Una carretera o un escenario hechos antes de cargar las piezas de Blender se rehacen.
  if (road.laneCount !== lvl.lanes || !road.complete) {
    stage.scene.remove(road.group);
    road = new Road(lvl.lanes);
    stage.scene.add(road.group);
  }
  if (city.kind !== lvl.scenery || city.group.parent === null || road.width !== lastWidth || !city.complete) {
    stage.scene.remove(city.group);
    city = new SceneryView(lvl.scenery, road.width);
    stage.scene.add(city.group);
  }
  lastWidth = road.width;
  // El neón de los carteles lleva el color de acento del nivel.
  neonMaterial.color.set(lvl.accent).multiplyScalar(2.2);
  stage.setLook(city.look);
  road.setLook(city.look.lamps, city.look.ground, city.look.groundY);
}
let lastWidth = road.width;

function startRace(levelId: number, vehicleId: VehicleId): void {
  const token = ++startToken;
  mixer.hold = false;
  mixer.resume();
  music?.stop();
  music = null;
  endless = null;
  lines?.dispose();
  lines = null;
  race = null;
  sfx.engineStop(false);
  const veh = vehicleById(vehicleId);
  if (levelId === ENDLESS_ID) {
    startEndless(veh, token);
    return;
  }
  const lvl = LEVELS.find((l) => l.id === levelId) ?? LEVELS[0];
  hud.setVisible(false);
  menus.loading();
  phase = 'menu';
  const stems = lvl.song.stems
    ? loadStems(mixer.ctx, lvl.song.stems).catch((err) => {
        // Sin pistas (o un navegador que no decodifica Opus): música sintetizada.
        console.warn('Pistas no disponibles, uso la música sintetizada', err);
        return null;
      })
    : Promise.resolve(null);
  Promise.all([stems, loadProps(lvl.scenery).catch((err) => console.warn('Escenario sin cargar', err))]).then(([buffers]) => {
    if (token === startToken) beginRace(lvl, veh, buffers);
  });
}

function startEndless(veh: Vehicle, token: number): void {
  hud.setVisible(false);
  menus.loading();
  phase = 'menu';
  // Las canciones enteras de los niveles ocupan mucho: el infinito carga las suyas por trozos.
  dropStems();
  const timeline = new EndlessTimeline(veh.gears);
  const cues = timeline.extend(ENDLESS_AHEAD);
  // El infinito pasa por los cinco escenarios: se cargan todos de entrada.
  const props = loadAllProps().catch((err) => console.warn('Escenarios sin cargar', err));
  Promise.all([
    loadStyle(mixer.ctx, 0).catch((err) => {
      console.warn('Pistas no disponibles: infinito sin música', err);
      return null;
    }),
    props,
  ])
    .then(([buffers]) => {
      if (token !== startToken) return;
      const m = new EndlessMusic(mixer, timeline, buffers);
      endless = { timeline, music: m, station: 0, swapAt: -1 };
      launch(timeline.stations[0].level, veh, new Race(veh, save.difficulty, cues, Infinity), m, null);
    });
}

function beginRace(lvl: LevelDef, veh: Vehicle, buffers: StemBuffers | null): void {
  const r = Race.forSong(lvl.song, veh, save.difficulty);
  const finalAt = lvl.song.finalChorusBar * barDuration(lvl.song);
  const m = buffers ? new StemMusic(mixer, buffers, finalAt) : new Music(mixer, lvl.song);
  // La línea que lleva a la marcha más alta al empezar el estribillo final decide la subida de tono.
  const kc = r.cues.find((c) => c.time >= finalAt - 0.01 && c.targetGear === veh.gears) ?? null;
  launch(lvl, veh, r, m, kc);
}

/** Arranca la carrera ya preparada: mundo, música, líneas, tráfico y HUD. */
function launch(lvl: LevelDef, veh: Vehicle, r: Race, m: MusicPlayer, kc: Cue | null): void {
  level = lvl;
  vehicle = veh;
  buildWorld(level);
  race = r;
  music = m;
  keyCue = kc;
  keyChanged = false;
  music.start(mixer.ctx.currentTime + 0.6);
  music.setLayers(race.activeLayers());
  lastGear = race.gear;
  lastNitro = false;
  lines = new CueLines(race.cues, road, vehicle.halfLength);
  stage.scene.add(lines.group);
  bendObject(stage.scene);

  traffic.reset(road, ...trafficFor(level, 0));
  pickups.reset(road);
  car.setup(road, vehicle);
  car.reset();
  speed = gearSpeed(1);
  invulnerable = 0;
  for (const k of Object.keys(stats) as (keyof typeof stats)[]) stats[k] = 0;
  shown = new Set();

  sfx.engineStart(ENGINES[vehicle.id]);
  hud.setAccent(level.accent);
  hud.clearMessages();
  hud.setVisible(true);
  menus.hide();
  phase = 'racing';
}

/** Infinito, en cada fotograma: líneas nuevas, música y cambio de emisora. */
function endlessStep(r: Race, songT: number): void {
  if (!endless) return;
  const fresh = endless.timeline.extend(songT + ENDLESS_AHEAD);
  if (fresh.length) lines?.add(r.append(fresh));
  endless.music.pump(songT);
  const st = endless.timeline.stationAt(songT);
  if (st.n !== endless.station) {
    // Fundido a negro del cambio de emisora; el mundo se cambia cuando la pantalla ya está oscura.
    endless.station = st.n;
    endless.swapAt = songT + 0.15;
    hud.tune();
  }
  if (endless.swapAt >= 0 && songT >= endless.swapAt) {
    endless.swapAt = -1;
    switchStation(r, st);
  }
}

/** Carriles, escenario, tráfico y ventana de la emisora nueva. */
function switchStation(r: Race, st: Station): void {
  const lanesBefore = road.laneCount;
  level = st.level;
  buildWorld(level);
  traffic.reset(road, ...trafficFor(level, st.lap));
  pickups.reset(road);
  car.setup(road, vehicle);
  if (road.laneCount !== lanesBefore) car.reset();
  lines?.setRoad(road);
  r.windowScale = Math.pow(LAP.window, st.lap);
  hud.setAccent(level.accent);
  bendObject(stage.scene);
}

function pauseRace(): void {
  phase = 'paused';
  mixer.hold = true;
  void mixer.ctx.suspend();
  // El HUD se esconde durante la pausa: el cuentarrevoluciones taparía las teclas del menú.
  hud.setVisible(false);
  menus.pause();
}

function resumeRace(): void {
  menus.hide();
  hud.setVisible(true);
  mixer.hold = false;
  mixer.resume();
  phase = 'racing';
}

function quitToMenu(): void {
  music?.stop();
  music = null;
  endless = null;
  lines?.dispose();
  lines = null;
  race = null;
  sfx.engineStop(false);
  mixer.hold = false;
  mixer.resume();
  hud.setVisible(false);
  hud.clearMessages();
  phase = 'menu';
  menus.title();
}

function endRace(r: Race, songT: number): void {
  phase = 'results';
  // Las líneas que quedaban se amontonarían sobre el coche parado, y el tráfico lo
  // atravesaría: la carretera se vacía bajo la pantalla de resultados.
  if (lines) lines.group.visible = false;
  traffic.reset(road, 1, 0);
  pickups.reset(road);
  const finished = r.result === 'finished';
  if (finished) {
    music?.stop(0.5);
    sfx.engineStop(false);
  } else {
    music?.stall();
    sfx.engineStop(true);
  }
  hud.setVisible(false);
  hud.clearMessages();
  if (endless) {
    // El infinito solo se acaba calando el motor: no hay nota ni desbloqueos.
    const st = endless.timeline.stationAt(songT);
    survived = clockText(songT);
    menus.results({
      level: ENDLESS_ID,
      vehicle: vehicle.id,
      finished: false,
      score: r.score,
      grade: '',
      stats: { perfect: stats.perfect, good: stats.good, fails: stats.badShift + stats.missed, crashes: stats.crash },
      unlocked: [],
      newRecord: qualifies(ENDLESS_ID, save.difficulty, r.score),
      hasNext: false,
      endless: { time: survived, lap: st.lap + 1, where: t(`level${st.style + 1}` as TextKey) },
    });
    return;
  }
  const unlocked: string[] = [];
  if (finished) {
    const u = markPassed(level.id);
    if (u.level) unlocked.push(`${t('level', { n: u.level })}, ${t(`level${u.level}` as TextKey)}`);
    for (const v of u.vehicles) unlocked.push(t(v));
  }
  menus.results({
    level: level.id,
    vehicle: vehicle.id,
    finished,
    score: r.score,
    grade: r.grade(),
    stats: { perfect: stats.perfect, good: stats.good, fails: stats.badShift + stats.missed, crashes: stats.crash },
    unlocked,
    newRecord: finished && qualifies(level.id, save.difficulty, r.score),
    hasNext: level.id < LEVELS.length && levelUnlocked(level.id + 1),
  });
}

function handleEvent(ev: RaceEvent): void {
  if (ev.type === 'shift') stats[ev.quality]++;
  else stats[ev.type]++;
  switch (ev.type) {
    case 'shift':
      if (ev.cue === keyCue) {
        music?.keyChange();
        keyChanged = true;
      }
      sfx.shift(ev.quality === 'perfect');
      // El cambio que cierra un nitro vale el doble, y se dice.
      hud.judge((ev.quality === 'perfect' ? t('perfect') : t('good')) + (ev.nitro ? ' ×2' : ''), ev.quality);
      stage.kick(ev.quality === 'perfect' ? 0.3 : 0.15);
      break;
    case 'badShift':
      sfx.grind();
      hud.judge(t('badShift'), 'bad');
      stage.kick(0.3);
      break;
    case 'missed':
      sfx.missed(ev.cue.dir);
      hud.judge(ev.cue.dir === 1 ? t('overRev') : t('lugging'), 'bad');
      stage.kick(0.3);
      break;
    case 'crash':
      sfx.crash();
      hud.judge(t('crash'), 'bad');
      stage.kick(1);
      speed *= 1 - WORLD.crashSlowdown;
      invulnerable = WORLD.crashInvulnerable;
      break;
    case 'pickup': {
      sfx.pickup(ev.kind);
      const text =
        ev.kind === 'points'
          ? t('pickPoints', { n: PICKUPS.points * (race?.multiplier ?? 1) })
          : ev.kind === 'nitro'
            ? t('pickNitro')
            : ev.kind === 'repair'
              ? t('pickRepair')
              : t('pickMultiplier');
      hud.judge(text, 'perfect');
      if (ev.kind === 'nitro') stage.kick(0.4);
      break;
    }
  }
}

/** Cuentarrevoluciones: sube hacia la zona roja antes de una línea azul y cae antes de una roja. */
function targetRpm(r: Race, songT: number): number {
  const next = r.nextCue();
  if (!next) return 0.55;
  const from = r.lastCueTime();
  const p = Math.min(1, Math.max(0, (songT - from) / Math.max(0.001, next.time - from)));
  const curve = Math.pow(p, 1.8);
  return next.dir === 1 ? 0.3 + 0.7 * curve : 0.8 - 0.68 * curve;
}

/** Primer pulso de la canción desde `songT`: el nitro arranca ahí para que la mezcla entre a tiempo. */
function nextBeat(songT: number): number {
  if (endless) return endless.timeline.nextBeat(songT);
  const beat = barDuration(level.song) / 4;
  return Math.ceil(songT / beat - 1e-9) * beat;
}

/** Recoge un premio. El nitro arranca en el siguiente pulso y dura al menos un compás. */
function collect(r: Race, kind: PickupKind, songT: number): void {
  const beat = nextBeat(songT);
  r.collect(kind, beat, endless ? endless.timeline.barDurAt(beat) : barDuration(level.song));
}

/** Radio de Vela y, en el nivel 1 mientras no esté pasado, los textos del tutorial. */
function messages(r: Race, songT: number): void {
  const once = (key: string, at: number, show: () => void) => {
    if (songT >= at && !shown.has(key)) {
      shown.add(key);
      show();
    }
  };
  if (endless) {
    // Vela presenta cada emisora; al volver a la primera, avisa de la vuelta nueva.
    const st = endless.timeline.stationAt(songT);
    const text = st.n === 0 ? t('endlessIntro') : st.style === 0 ? t('lapUp', { n: st.lap + 1 }) : t(`station${st.style + 1}` as TextKey);
    once(`station${st.n}`, st.sweepStart + 0.3, () => hud.radio(text));
    return;
  }
  once('radio', 0.8, () => hud.radio(t(`radio${level.id}` as TextKey)));
  // El mensaje de un oyente llega en el break de la canción.
  once('listener', barDuration(level.song) * level.song.breakBar, () => hud.radio(t(`listener${level.id}` as TextKey)));
  if (level.id !== 1 || save.passed.includes(1)) return;
  const firstUp = r.cues.find((c) => c.dir === 1);
  const firstDown = r.cues.find((c) => c.dir === -1);
  if (firstUp) once('tutUp', firstUp.time - 3.5, () => hud.hint(t('tutUp'), 4));
  once('tutLane', 9, () => hud.hint(t('tutLane'), 3.5));
  if (firstDown) once('tutDown', firstDown.time - 3.5, () => hud.hint(t('tutDown'), 4));
  once('tutPickup', 24, () => hud.hint(t('tutPickup'), 4));
}

/** Golpes de metrónomo para calibrar la latencia: 12 a 100 BPM. */
function calibrationClicks(): { times: number[]; heardAt: (perfMs: number) => number } {
  mixer.resume();
  const ctx = mixer.ctx;
  const start = ctx.currentTime + 1;
  const times: number[] = [];
  for (let i = 0; i < 12; i++) {
    const at = start + i * 0.6;
    times.push(at);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = i % 4 === 0 ? 1320 : 880;
    g.gain.setValueAtTime(0.5, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.08);
    osc.connect(g).connect(mixer.sfx);
    osc.start(at);
    osc.stop(at + 0.1);
  }
  return { times, heardAt: (perfMs) => clock.heardAt(perfMs) };
}

window.addEventListener('keydown', (e) => {
  if (menus.active) {
    mixer.resume();
    if (menus.key(e)) e.preventDefault();
    return;
  }
  if (phase !== 'racing' || !race || e.repeat) return;
  const judged = (perf: number) => songTime(perf) - save.latencyMs / 1000;
  switch (e.code) {
    case 'ShiftRight':
    case 'ArrowUp':
    case 'KeyW':
      race.shift(1, judged(e.timeStamp));
      break;
    case 'ShiftLeft':
    case 'ArrowDown':
    case 'KeyS':
      race.shift(-1, judged(e.timeStamp));
      break;
    case 'ArrowLeft':
    case 'KeyA':
      car.steer(-1);
      break;
    case 'ArrowRight':
    case 'KeyD':
      car.steer(1);
      break;
    case 'Escape':
    case 'KeyP':
      pauseRace();
      break;
    case 'KeyR':
      startRace(playingId(), vehicle.id);
      break;
    default:
      return;
  }
  e.preventDefault();
});
window.addEventListener('pointerdown', () => mixer.resume());
// El mando llega como teclas: en carrera los gatillos cambian de marcha y Start pausa.
startGamepad(() => (phase === 'paused' ? 'pause' : phase === 'racing' && !menus.active ? 'race' : 'menu'));

let lastFrame = performance.now();
let bendClock = 0;

function frame(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  clock.sample();
  const songT = songTime(now);

  let targetSpeed = 30;
  let nextDir: 0 | 1 | -1 = 0;
  let nextNear = 0;
  let nitro = 0;

  if (phase === 'paused') {
    stage.render();
    requestAnimationFrame(frame);
    return;
  }

  if (race && (phase === 'racing' || phase === 'results')) {
    if (phase === 'racing') {
      endlessStep(race, songT);
      race.update(songT);
      invulnerable = Math.max(0, invulnerable - dt);
      if (traffic.update(dt, speed, car.x, invulnerable <= 0, vehicle)) race.crash();
      const blocked = (lane: number, z: number) => traffic.snapshot().some((c) => c.lane === lane && Math.abs(c.z - z) < 25);
      for (const kind of pickups.update(dt, speed, car.x, race.engine, blocked)) collect(race, kind, songT);
      for (const ev of race.drainEvents()) handleEvent(ev);
      const nitroOn = race.nitroActive(songT);
      if (race.gear !== lastGear || nitroOn !== lastNitro) {
        // El nitro abre la mezcla: suenan todas las capas desde su pulso hasta su línea.
        music?.setLayers(nitroOn ? new Set(LAYERS) : race.activeLayers());
        lastGear = race.gear;
        lastNitro = nitroOn;
      }
      nitro = race.nitroLeft(songT);
      rpm += (targetRpm(race, songT) + (nitroOn ? 0.1 : 0) - rpm) * Math.min(1, dt * 12);
      sfx.engineSet(rpm);
      messages(race, songT);
      if (race.result !== 'running') endRace(race, songT);
    } else {
      rpm += ((race.result === 'stalled' ? 0 : 0.3) - rpm) * Math.min(1, dt * 3);
    }
    targetSpeed = race.result === 'stalled' ? 0 : gearSpeed(race.gear) * (race.nitroActive(songT) ? PICKUPS.nitroBoost : 1);
    const next = race.nextCue();
    if (next) {
      nextDir = next.dir;
      const bar = endless ? endless.timeline.barDurAt(songT) : barDuration(level.song);
      nextNear = Math.min(1, Math.max(0, 1 - (next.time - songT) / (2 * bar)));
    }
    lines?.update(songT, speed);
  }

  // Curvas en los breaks y en el puente: una vez a la izquierda, la siguiente a la derecha.
  let curveTarget = 0;
  if (race && phase === 'racing' && endless) {
    const section = endless.timeline.sectionAt(songT);
    if (section === 'break' || section === 'bridge') curveTarget = (endless.station % 2 ? 1 : -1) * 0.0008;
  } else if (race && phase === 'racing') {
    const { section, index } = sectionAt(level.song, Math.floor(songT / barDuration(level.song)));
    if (section === 'break' || section === 'bridge') curveTarget = (index % 2 ? 1 : -1) * 0.0008;
  }
  curve.value += (curveTarget - curve.value) * Math.min(1, dt * 0.5);
  bendClock -= dt;
  if (bendClock <= 0) {
    // Los materiales nuevos (líneas, coches que acaban de cargar) se preparan para doblarse.
    bendObject(stage.scene);
    bendClock = 1;
  }

  speed += (targetSpeed - speed) * Math.min(1, dt * WORLD.speedResponse);
  distance += speed * dt;
  road.update(distance);
  city.update(speed * dt);
  car.update(dt, speed * dt);
  const speed01 = Math.max(0, (speed - WORLD.speedFirstGear) / (WORLD.speedTopGear - WORLD.speedFirstGear));
  stage.follow(car.x, speed01, dt);
  hud.update({
    score: race?.score ?? 0,
    engine: race?.engine ?? 100,
    gear: race?.gear ?? 1,
    kmh: Math.round(speed * 2.4),
    rpm,
    nextDir,
    nextNear,
    multiplier: race?.multiplier ?? 1,
    nitro,
  });
  stage.render();
  requestAnimationFrame(frame);
}

function endlessDebug(tl: EndlessTimeline, songT: number) {
  const st = tl.stationAt(songT);
  return { station: st.n, style: st.style, lap: st.lap, sweepStart: st.sweepStart, windowMs: Math.round((race?.window() ?? 0) * 1000), section: tl.sectionAt(songT) };
}

// Solo en desarrollo: estado legible desde fuera para jugar partidas con un bot.
if (import.meta.env.DEV) {
  Object.assign(window, {
    __stretto: {
      start: (lvl: number, veh: VehicleId) => startRace(lvl, veh),
      nitro: () => race && collect(race, 'nitro', songTime(performance.now())),
      curve,
      state: () => ({
        phase,
        level: level.id,
        vehicle: vehicle.id,
        songT: songTime(performance.now()),
        speed,
        gear: race?.gear ?? 1,
        engine: race?.engine ?? 100,
        score: race?.score ?? 0,
        multiplier: race?.multiplier ?? 1,
        nitroFrom: race?.nitroFrom ?? -1,
        result: race?.result ?? 'running',
        grade: race && race.result === 'finished' ? race.grade() : null,
        next: race?.nextCue() ? { time: race.nextCue()!.time, dir: race.nextCue()!.dir } : null,
        cues: race?.cues.length ?? 0,
        lane: car.lane,
        laneCount: road.laneCount,
        traffic: traffic.snapshot(),
        stats: { ...stats },
        keyChanged,
        stems: music instanceof StemMusic,
        endless: endless ? endlessDebug(endless.timeline, songTime(performance.now())) : null,
      }),
    },
  });
}

hud.setVisible(false);
menus.title();
requestAnimationFrame(frame);
// El fondo del título se rehace con las piezas de Blender en cuanto llegan.
void loadProps(level.scenery)
  .then(() => {
    if (phase === 'menu') buildWorld(level);
  })
  .catch((err) => console.warn('Escenario sin cargar', err));
// Las pistas del último nivel jugado se van descargando mientras el jugador está en el menú.
// Solo ese: cada canción decodificada ocupa unos 340 MB.
const preload = LEVELS.find((l) => l.id === save.lastLevel);
if (preload?.song.stems && levelUnlocked(preload.id)) void loadStems(mixer.ctx, preload.song.stems).catch(() => undefined);
