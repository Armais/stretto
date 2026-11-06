"""Grabador de pistas de Sonic Pi para Stretto.

Adaptado de EliasEliseo/mantle/tools/audio/sonicpi/record.py (arranque del daemon sin
interfaz, OSC a mano y grabación por /start-recording). Allí se cortaban bucles; aquí se
graban las 6 pistas de cada canción por separado y se alinean con un golpe de sincronía.

  python stems.py boot                   arranca el daemon de Sonic Pi y lo mantiene vivo
                                         (sin keep-alive se cierra solo). Puertos en ports.json.
  python stems.py runner                 inyecta runner.rb (escucha /run-code en el puerto de
                                         cues).
  python stems.py rec <salida.wav> <s>   graba lo que suene durante <s> segundos.
  python stems.py level <fichero>        nivel RMS y pico de un audio.
  python stems.py song <cancion> [pistas] graba las pistas de songs/<cancion>.rb y deja los
                                         .ogg en public/music/<cancion>/.
  python stems.py key <cancion>          graba el estribillo final 2 semitonos más arriba
                                         (key_<capa>.ogg, para la subida de tono).
  python stems.py finish <cancion>       vuelve a cortar y encodear lo ya grabado en tmp/.
  python stems.py blocks <cancion> <compases...>
                                         corta de lo ya grabado los bloques de 8 compases del
                                         modo infinito, uno por fichero, en
                                         public/music/endless/<cancion>/<capa>_<n>.ogg. Los
                                         compases de inicio son los de blockStarts() en
                                         src/game/endless.ts, en su orden.
  python stems.py sfx                    graba los efectos de sfx.rb en una toma y deja cada
                                         uno en public/sfx/<nombre>_<variante>.ogg (P13).
  python stems.py finishsfx              vuelve a cortar los efectos de tmp/sfx.wav.
  python stems.py stop                   para todo lo que suene.
  python stems.py shutdown               cierra el daemon.

Cada pista empieza con un golpe agudo; un compás después empieza la música. Aquí se busca
el golpe en cada grabación y se corta justo un compás después, así las 6 pistas quedan
alineadas a la muestra. La ganancia se calcula sobre la mezcla de las 6 y se aplica igual a
todas, para no romper el equilibrio entre capas.
"""

import json
import os
import socket
import struct
import subprocess
import sys
import threading
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
PORTS_JSON = os.path.join(HERE, "ports.json")
TMP_DIR = os.path.join(HERE, "tmp")
SONGS_DIR = os.path.join(HERE, "songs")
OUT_DIR = os.path.join(ROOT, "public", "music")
HARNESS_PORT = 5053
LAYERS = ["drums", "bass", "chords", "melody", "arp", "solo"]
TARGET_PEAK = 0.89  # -1 dBFS en la mezcla de todas las capas
# Mezcla a ciegas: nivel de cada capa (RMS de donde suena) respecto a la batería.
LAYER_LEVEL = {"drums": 1.0, "bass": 0.8, "chords": 0.45, "melody": 0.55, "arp": 0.35, "solo": 0.5}
TAIL_S = 2.0  # cola de reverb que se conserva tras el último compás
OPUS_KBPS = "96k"

SONIC_PI_ROOTS = [
    os.path.expandvars(r"%LOCALAPPDATA%\Programs\SonicPiPortable\PFiles\Sonic Pi"),
    r"C:\Program Files\Sonic Pi",
    r"C:\Program Files (x86)\Sonic Pi",
]


# ---------------------------------------------------------------- OSC a mano

def _pad(b: bytes) -> bytes:
    return b + b"\0" * (4 - len(b) % 4)


def osc_message(addr: str, *args) -> bytes:
    tags = ","
    payload = b""
    for a in args:
        if isinstance(a, int):
            tags += "i"
            payload += struct.pack(">i", a)
        elif isinstance(a, float):
            tags += "f"
            payload += struct.pack(">f", a)
        else:
            tags += "s"
            payload += _pad(str(a).encode("utf-8"))
    return _pad(addr.encode()) + _pad(tags.encode()) + payload


def osc_send(port: int, addr: str, *args) -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.sendto(osc_message(addr, *args), ("127.0.0.1", port))


def osc_addr_of(packet: bytes) -> str:
    return packet.split(b"\0", 1)[0].decode("utf-8", "replace")


# ---------------------------------------------------------------- daemon

def find_sonic_pi() -> str:
    for root in SONIC_PI_ROOTS:
        if os.path.isfile(os.path.join(root, "app", "server", "ruby", "bin", "daemon.rb")):
            return root
    raise SystemExit("No encuentro Sonic Pi instalado (daemon.rb)")


def load_ports() -> dict:
    with open(PORTS_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


def spider(ports: dict, addr: str, *args) -> None:
    osc_send(ports["gui_send_to_spider"], addr, ports["token"], *args)


def cmd_boot() -> None:
    root = find_sonic_pi()
    ruby = os.path.join(root, "app", "server", "native", "ruby", "bin", "ruby.exe")
    daemon = os.path.join(root, "app", "server", "ruby", "bin", "daemon.rb")
    proc = subprocess.Popen([ruby, daemon], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, cwd=root)
    nums = []
    deadline = time.time() + 60.0
    while time.time() < deadline:
        line = proc.stdout.readline()
        if line == "" and proc.poll() is not None:
            raise SystemExit("El daemon murió antes de dar los puertos")
        toks = line.strip().split()
        if len(toks) == 8 and all(t.lstrip("-").isdigit() for t in toks):
            nums = [int(t) for t in toks]
            break
    if len(nums) < 8:
        raise SystemExit("El daemon no dio la línea de puertos en 60 s")
    keys = ["daemon", "gui_listen_to_spider", "gui_send_to_spider", "scsynth", "osc_cues", "tau", "phx", "token"]
    ports = dict(zip(keys, nums))
    ports["pid"] = proc.pid
    with open(PORTS_JSON, "w", encoding="utf-8") as f:
        json.dump(ports, f, indent=2)
    print(f"ports.json: {ports}", flush=True)
    threading.Thread(target=lambda: [None for _ in proc.stdout], daemon=True).start()
    try:
        while proc.poll() is None:
            osc_send(ports["daemon"], "/daemon/keep-alive", ports["token"])
            time.sleep(1.0)
    except KeyboardInterrupt:
        pass
    print(f"daemon terminado (rc={proc.poll()})", flush=True)


def cmd_runner() -> None:
    ports = load_ports()
    with open(os.path.join(HERE, "runner.rb"), "r", encoding="utf-8") as f:
        spider(ports, "/run-code", f.read())
    print("runner inyectado", flush=True)


# ---------------------------------------------------------------- audio

def decode_f32(path: str):
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate,channels", "-of", "csv=p=0", path],
        text=True,
    ).strip()
    sr, ch = (int(v) for v in out.split(",")[:2])
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-"])
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, ch).copy(), sr


def cmd_level(path: str) -> None:
    x, sr = decode_f32(path)
    rms = float(np.sqrt(np.mean(x ** 2))) if x.size else 0.0
    peak = float(np.max(np.abs(x))) if x.size else 0.0
    print(f"{os.path.basename(path)}: {len(x) / sr:.2f} s, RMS {rms:.4f}, pico {peak:.3f}", flush=True)


def record(ports: dict, wav_path: str, seconds: float, code: str | None = None) -> None:
    """Graba `seconds` segundos. Si hay `code`, lo manda por el puerto de cues y
    empieza a contar cuando el runner confirma que ha entrado."""
    if os.path.exists(wav_path):
        os.remove(wav_path)
    spider(ports, "/start-recording")
    time.sleep(0.3)
    if code is not None:
        listen = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        listen.bind(("127.0.0.1", HARNESS_PORT))
        listen.settimeout(30)
        osc_send(ports["osc_cues"], "/run-code", code)
        try:
            while True:
                packet, _ = listen.recvfrom(65536)
                addr = osc_addr_of(packet)
                if addr == "/stretto/started":
                    break
                if addr == "/stretto/error":
                    spider(ports, "/stop-recording")
                    raise SystemExit(f"Sonic Pi no pudo evaluar el código: {packet!r}")
        except socket.timeout:
            spider(ports, "/stop-recording")
            raise SystemExit("El runner no respondió (¿falta 'stems.py runner'?)")
        finally:
            listen.close()
    time.sleep(seconds)
    spider(ports, "/stop-recording")
    time.sleep(0.5)
    spider(ports, "/save-recording", wav_path.replace("\\", "/"))
    for _ in range(40):
        if os.path.exists(wav_path) and os.path.getsize(wav_path) > 44:
            break
        time.sleep(0.25)
    time.sleep(0.5)
    if not os.path.exists(wav_path):
        raise SystemExit(f"Sonic Pi no escribió {wav_path}")


def cmd_rec(path: str, seconds: float) -> None:
    record(load_ports(), os.path.abspath(path), seconds)
    cmd_level(path)


# ---------------------------------------------------------------- canciones

def song_meta(rb: str) -> dict:
    """Lee la cabecera de la canción: líneas '# @bpm 100' y '# @bars 54'."""
    meta = {}
    with open(rb, "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("# @"):
                k, v = line[3:].split(None, 1)
                meta[k] = float(v)
    for k in ("bpm", "bars"):
        if k not in meta:
            raise SystemExit(f"{rb}: falta '# @{k}' en la cabecera")
    return meta


def active_rms(x: np.ndarray, sr: int) -> float:
    """RMS solo de los tramos de 50 ms en los que la capa suena (el solo calla casi siempre)."""
    w = int(0.05 * sr)
    n = len(x) // w
    if n == 0:
        return 0.0
    p = np.mean((x[: n * w] ** 2).reshape(n, w, -1), axis=(1, 2))
    on = p > (0.003 ** 2)
    return float(np.sqrt(np.mean(p[on]))) if on.any() else 0.0


def check_alive(seg: np.ndarray, sr: int, label: str, until: float = 0.85) -> None:
    """Una capa cuyo hilo murió en Sonic Pi se queda muda antes de tiempo: tiene que sonar
    hasta al menos el `until` del total."""
    on = np.flatnonzero(np.max(np.abs(seg), axis=1) > 0.003)
    last = on[-1] / len(seg) if on.size else 0.0
    if last < until:
        raise SystemExit(f"{label}: deja de sonar al {last:.0%} de la canción (¿murió su hilo?)")


def find_click(x: np.ndarray, sr: int) -> int:
    mono = np.max(np.abs(x), axis=1)
    idx = np.flatnonzero(mono > 0.05)
    if idx.size == 0:
        raise SystemExit("No encuentro el golpe de sincronía en la grabación")
    return int(idx[0])


def cmd_song(name: str, only: list[str], key: bool = False) -> None:
    """Graba las pistas de una canción. Con `key`, solo el estribillo final y 2 semitonos
    más arriba (la subida de tono de P10), sin batería."""
    ports = load_ports()
    rb = os.path.join(SONGS_DIR, f"{name}.rb")
    meta = song_meta(rb)
    bar = 60.0 / meta["bpm"] * 4
    from_bar = int(meta["final"]) if key else 0
    transpose = 2 if key else 0
    length = (meta["bars"] - from_bar) * bar
    with open(os.path.join(HERE, "lib.rb"), "r", encoding="utf-8") as f:
        lib = f.read()
    with open(rb, "r", encoding="utf-8") as f:
        score = f.read()
    os.makedirs(TMP_DIR, exist_ok=True)
    layers = only or ([l for l in LAYERS if l != "drums"] if key else LAYERS)
    prefix = "key_" if key else ""
    for layer in layers:
        wav = os.path.join(TMP_DIR, f"{name}_{prefix}{layer}.wav")
        code = f"set :stem, :{layer}\nset :from_bar, {from_bar}\nset :transpose, {transpose}\n{lib}\n{score}\n"
        # El puerto de cues pierde los paquetes de más de ~8 KB: la canción va en un fichero
        # y por OSC solo viaja la orden de leerlo.
        src = os.path.join(TMP_DIR, f"{name}_{prefix}{layer}.rb")
        with open(src, "w", encoding="utf-8") as f:
            f.write(code)
        code = f'eval(File.read("{src.replace(os.sep, "/")}", encoding: "UTF-8"))'
        print(f"== {name}/{layer}: grabando {length + bar + TAIL_S + 1:.1f} s", flush=True)
        spider(ports, "/stop-all-jobs")
        time.sleep(2.5)  # que se apaguen las colas de reverb de la pista anterior
        cmd_runner()
        time.sleep(0.6)
        record(ports, wav, length + bar + TAIL_S + 3.0, code)
        spider(ports, "/stop-all-jobs")
        cmd_level(wav)
    if key:
        finish_key(name, length, bar)
    else:
        finish_song(name, length, bar)


def finish_song(name: str, length: float, bar: float) -> None:
    """Corta cada pista un compás después de su golpe, mide la mezcla y encodea."""
    cut = {}
    sr0 = None
    for layer in LAYERS:
        wav = os.path.join(TMP_DIR, f"{name}_{layer}.wav")
        if not os.path.exists(wav):
            raise SystemExit(f"Falta {wav}")
        x, sr = decode_f32(wav)
        sr0 = sr0 or sr
        click = find_click(x, sr)
        before = float(np.max(np.abs(x[: max(1, click - int(0.01 * sr))])))
        burst = float(np.max(np.abs(x[click: click + int(0.03 * sr)])))
        if before > 0.02 or burst < 0.5:
            raise SystemExit(f"{layer}: el golpe no está claro (antes {before:.3f}, golpe {burst:.2f})")
        start = click + int(round(bar * sr))
        n = int(round((length + TAIL_S) * sr))
        seg = x[start:start + n].copy()
        if len(seg) < n:
            seg = np.vstack([seg, np.zeros((n - len(seg), x.shape[1]), np.float32)])
        # Fundido de 20 ms al principio para que no quede ni rastro del golpe.
        fade = int(0.02 * sr)
        seg[:fade] *= np.linspace(0, 1, fade, dtype=np.float32)[:, None]
        cut[layer] = seg
        on = np.flatnonzero(np.max(np.abs(seg), axis=1) > 0.02)
        print(f"   {layer}: golpe a {click / sr:.3f} s, primer sonido tras el corte a "
              f"{(on[0] / sr * 1000 if on.size else -1):.1f} ms", flush=True)
    for layer, seg in cut.items():
        # El solo calla fuera del estribillo final (y en el outro): umbral más bajo.
        check_alive(seg, sr0, f"{name}/{layer}", 0.5 if layer == "solo" else 0.85)
    ref = active_rms(cut["drums"], sr0)
    gains = {}
    for layer, seg in cut.items():
        r = active_rms(seg, sr0)
        gains[layer] = 1.0
        if r > 0 and ref > 0:
            g = LAYER_LEVEL[layer] * ref / r
            gains[layer] = g
            cut[layer] = seg * g
            print(f"   {layer}: RMS activo {r:.4f} → ×{g:.2f}", flush=True)
    mix = sum(cut.values())
    peak = float(np.max(np.abs(mix)))
    gain = TARGET_PEAK / peak if peak > 0 else 1.0
    gains["_mix"] = gain
    with open(os.path.join(TMP_DIR, f"{name}_gains.json"), "w", encoding="utf-8") as f:
        json.dump(gains, f, indent=2)
    out = os.path.join(OUT_DIR, name)
    os.makedirs(out, exist_ok=True)
    encode(out, "", cut, gain, sr0, name)
    print(f"Mezcla: pico {peak:.3f} → ganancia ×{gain:.2f}", flush=True)


def encode(out: str, prefix: str, cut: dict, gain: float, sr0: int, name: str) -> None:
    os.makedirs(out, exist_ok=True)
    for layer, seg in cut.items():
        y = (seg * gain).astype(np.float32)
        path = os.path.join(out, f"{prefix}{layer}.ogg")
        enc = subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(sr0), "-ac", str(y.shape[1]), "-i", "-",
             "-c:a", "libopus", "-b:a", OPUS_KBPS, path],
            input=y.tobytes(),
        )
        if enc.returncode != 0:
            raise SystemExit(f"ffmpeg falló con {path}")
        rms = float(np.sqrt(np.mean(y ** 2)))
        print(f"OK {name}/{prefix}{layer}: RMS {rms:.4f}, {os.path.getsize(path) / 1024:.0f} KB", flush=True)


BLOCK_BARS = 8
BLOCK_FADE_S = 0.003  # fundido en cada borde: los bloques se empalman sin chasquido


def finish_blocks(name: str, bar: float, starts: list) -> None:
    """Bloques del modo infinito: mismas ganancias y alineación que las pistas del nivel,
    pero cada bloque en su propio fichero. Decodificar trozos de 8 compases en vez de la
    canción entera evita que el juego se pare 50-85 ms al cargar cada pista."""
    with open(os.path.join(TMP_DIR, f"{name}_gains.json"), "r", encoding="utf-8") as f:
        gains = json.load(f)
    out = os.path.join(OUT_DIR, "endless", name)
    os.makedirs(out, exist_ok=True)
    for layer in LAYERS:
        x, sr = decode_f32(os.path.join(TMP_DIR, f"{name}_{layer}.wav"))
        zero = find_click(x, sr) + int(round(bar * sr))
        n = int(round(BLOCK_BARS * bar * sr))
        fade = int(round(BLOCK_FADE_S * sr))
        ramp = np.linspace(0, 1, fade, dtype=np.float32)[:, None]
        for k, start_bar in enumerate(starts):
            a = zero + int(round(start_bar * bar * sr))
            seg = x[a:a + n].copy()
            if len(seg) < n:
                seg = np.vstack([seg, np.zeros((n - len(seg), x.shape[1]), np.float32)])
            seg[:fade] *= ramp
            seg[-fade:] *= ramp[::-1]
            y = (seg * gains.get(layer, 1.0) * gains["_mix"]).astype(np.float32)
            path = os.path.join(out, f"{layer}_{k}.ogg")
            enc = subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(sr), "-ac", str(y.shape[1]), "-i", "-",
                 "-c:a", "libopus", "-b:a", OPUS_KBPS, path],
                input=y.tobytes(),
            )
            if enc.returncode != 0:
                raise SystemExit(f"ffmpeg falló con {path}")
        print(f"OK {name}/{layer}: {len(starts)} bloques", flush=True)


def finish_key(name: str, length: float, bar: float) -> None:
    """Corta las pistas de la subida de tono con las mismas ganancias que las normales."""
    with open(os.path.join(TMP_DIR, f"{name}_gains.json"), "r", encoding="utf-8") as f:
        gains = json.load(f)
    cut = {}
    sr0 = None
    for layer in [l for l in LAYERS if l != "drums"]:
        x, sr = decode_f32(os.path.join(TMP_DIR, f"{name}_key_{layer}.wav"))
        sr0 = sr0 or sr
        start = find_click(x, sr) + int(round(bar * sr))
        n = int(round((length + TAIL_S) * sr))
        seg = x[start:start + n].copy()
        if len(seg) < n:
            seg = np.vstack([seg, np.zeros((n - len(seg), x.shape[1]), np.float32)])
        fade = int(0.02 * sr)
        seg[:fade] *= np.linspace(0, 1, fade, dtype=np.float32)[:, None]
        check_alive(seg, sr0, f"{name}/key_{layer}", 0.5 if layer == "solo" else 0.85)
        cut[layer] = seg * gains.get(layer, 1.0)
    encode(os.path.join(OUT_DIR, name), "key_", cut, gains["_mix"], sr0, name)


# ---------------------------------------------------------------- efectos (P13)

SFX_RB = os.path.join(HERE, "sfx.rb")
SFX_OUT = os.path.join(ROOT, "public", "sfx")
# Pico de cada efecto tras normalizar. El juego los mezcla además con su propia ganancia.
SFX_PEAK = {"shift_good": 0.55, "shift_perfect": 0.6, "grind": 0.6, "overrev": 0.65, "lug": 0.65,
            "crash": 0.89, "nitro": 0.5, "repair": 0.5, "points": 0.45, "multiplier": 0.5}
SFX_LATE_S = 0.11  # desde que abre la ventana (30 ms antes de la casilla) hasta el efecto


def sfx_meta() -> tuple[float, list]:
    """Lee '# @slot 2.5' y '# @sounds nombre:variantes ...' de la cabecera de sfx.rb."""
    slot, order = None, []
    with open(SFX_RB, "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("# @slot"):
                slot = float(line.split()[2])
            elif line.startswith("# @sounds"):
                for tok in line.split()[2:]:
                    name, n = tok.split(":")
                    order.append((name, int(n)))
    if slot is None or not order:
        raise SystemExit("sfx.rb: falta '# @slot' o '# @sounds' en la cabecera")
    return slot, order


def cmd_sfx(skip_rec: bool) -> None:
    slot, order = sfx_meta()
    wav = os.path.join(TMP_DIR, "sfx.wav")
    if not skip_rec:
        ports = load_ports()
        with open(os.path.join(HERE, "lib.rb"), "r", encoding="utf-8") as f:
            lib = f.read()
        with open(SFX_RB, "r", encoding="utf-8") as f:
            score = f.read()
        ruby_order = ", ".join(f'["{n}", {k}]' for n, k in order)
        code = f"sfx_slot = {slot}\nsfx_order = [{ruby_order}]\n{lib}\n{score}\n"
        # El puerto de cues pierde sin avisar los paquetes de más de ~8 KB (7900 bytes llegan,
        # 8300 no): fuera comentarios y líneas en blanco.
        code = "\n".join(l for l in code.splitlines() if l.strip() and not l.lstrip().startswith("#")) + "\n"
        size = len(code.encode("utf-8"))
        if size > 7800:
            raise SystemExit(f"El código de los efectos ocupa {size} bytes: no cabe en un paquete OSC")
        print(f"   código: {size} bytes", flush=True)
        total = sum(k for _, k in order) * slot
        os.makedirs(TMP_DIR, exist_ok=True)
        spider(ports, "/stop-all-jobs")
        time.sleep(1.5)
        cmd_runner()
        time.sleep(0.6)
        print(f"== sfx: grabando {total + 10:.1f} s", flush=True)
        record(ports, wav, total + 10.0, code)
        spider(ports, "/stop-all-jobs")
        cmd_level(wav)
    finish_sfx(slot, order, wav)


def finish_sfx(slot: float, order: list, wav: str) -> None:
    x, sr = decode_f32(wav)
    click = find_click(x, sr)
    zero = click + int(round(4.0 * sr))  # stretto_click espera 4 pulsos a 60 BPM
    os.makedirs(SFX_OUT, exist_ok=True)
    k = 0
    for name, n in order:
        for v in range(n):
            # La ventana abre 30 ms antes de la casilla: el efecto puede adelantarse 1 ms.
            a = zero + int(round((k * slot - 0.03) * sr))
            b = a + int(round(slot * sr))
            k += 1
            win = x[a:b]
            env = np.max(np.abs(win), axis=1)
            peak = float(env.max()) if env.size else 0.0
            if peak < 0.03:
                raise SystemExit(f"{name}_{v}: no suena (pico {peak:.3f})")
            if peak > 0.98:
                raise SystemExit(f"{name}_{v}: satura en la grabación (pico {peak:.3f})")
            on = np.flatnonzero(env > peak * 0.02)
            onset = int(on[0])
            if onset > SFX_LATE_S * sr:
                raise SystemExit(f"{name}_{v}: empieza {onset / sr * 1000:.0f} ms tarde (¿se perdió el golpe?)")
            tail = float(env[-int(0.2 * sr):].max())
            if tail > peak * 0.01:
                raise SystemExit(f"{name}_{v}: sigue sonando al final de la casilla ({tail / peak:.1%} del pico)")
            # Cola: hasta que el sonido cae 50 dB por debajo del pico, con 30 ms de fundido.
            last = int(np.flatnonzero(env > peak * 0.003)[-1])
            start = max(0, onset - int(0.002 * sr))
            end = min(len(win), last + int(0.03 * sr))
            seg = win[start:end].copy()
            fade = min(int(0.03 * sr), len(seg) // 4)
            seg[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)[:, None]
            seg *= SFX_PEAK[name] / peak
            path = os.path.join(SFX_OUT, f"{name}_{v}.ogg")
            enc = subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(sr), "-ac", str(seg.shape[1]), "-i", "-",
                 "-c:a", "libopus", "-b:a", OPUS_KBPS, path],
                input=seg.astype(np.float32).tobytes(),
            )
            if enc.returncode != 0:
                raise SystemExit(f"ffmpeg falló con {path}")
            print(f"OK {name}_{v}: {len(seg) / sr * 1000:.0f} ms, retraso {onset / sr * 1000 - 30:.1f} ms, "
                  f"pico grabado {peak:.3f}, {os.path.getsize(path) / 1024:.1f} KB", flush=True)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) < 2:
        print(__doc__)
        return
    cmd = sys.argv[1]
    if cmd == "boot":
        cmd_boot()
    elif cmd == "runner":
        cmd_runner()
    elif cmd == "rec":
        cmd_rec(sys.argv[2], float(sys.argv[3]))
    elif cmd == "level":
        cmd_level(sys.argv[2])
    elif cmd == "song":
        cmd_song(sys.argv[2], sys.argv[3:])
    elif cmd == "key":
        cmd_song(sys.argv[2], sys.argv[3:], key=True)
    elif cmd == "finishkey":
        meta = song_meta(os.path.join(SONGS_DIR, f"{sys.argv[2]}.rb"))
        bar = 60.0 / meta["bpm"] * 4
        finish_key(sys.argv[2], (meta["bars"] - meta["final"]) * bar, bar)
    elif cmd == "blocks":
        meta = song_meta(os.path.join(SONGS_DIR, f"{sys.argv[2]}.rb"))
        finish_blocks(sys.argv[2], 60.0 / meta["bpm"] * 4, [int(b) for b in sys.argv[3:]])
    elif cmd == "finish":
        meta = song_meta(os.path.join(SONGS_DIR, f"{sys.argv[2]}.rb"))
        bar = 60.0 / meta["bpm"] * 4
        finish_song(sys.argv[2], meta["bars"] * bar, bar)
    elif cmd == "sfx":
        cmd_sfx(skip_rec=False)
    elif cmd == "finishsfx":
        cmd_sfx(skip_rec=True)
    elif cmd == "stop":
        spider(load_ports(), "/stop-all-jobs")
    elif cmd == "shutdown":
        p = load_ports()
        osc_send(p["daemon"], "/daemon/exit", p["token"])
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
