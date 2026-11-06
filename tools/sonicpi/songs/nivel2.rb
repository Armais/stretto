# Stretto · Nivel 2 · "Carretera de costa" · nu-disco / funk en mi menor
# @bpm 115
# @bars 58
# @final 50
#
# Las secciones son las mismas que src/game/levels.ts usa para generar las líneas de cambio:
# intro 0-3 · estrofa 4-15 · pre 16-17 · estribillo 18-25 · break 26-33 · subida 34-37 ·
# estribillo 38-45 · puente 46-49 · estribillo final 50-57 (aquí entra el solo).
#
# Armonía: estrofa sobre el vaivén dórico mi-9 / la13, estribillo disco (do maj9 → re6 → si-7
# → mi-9) que cierra con si7 por la menor armónica, y un puente con el bajo bajando por
# semitonos (sol, fa#, fa) hasta si7. Las semicorcheas pares van un pelo adelantadas y las
# impares retrasadas (swing de funk); melodía y solo van en texto, un compás por cadena.

use_bpm 115
use_debug false
use_transpose (get(:transpose) || 0)
# Se lee una vez: get() no es instantáneo y saltar compases con él retrasa los hilos.
from_bar = get(:from_bar) || 0

plan = stretto_plan([[:intro, 4], [:verse, 12], [:pre, 2], [:chorus, 8], [:break, 8],
                     [:build, 4], [:chorus, 8], [:bridge, 4], [:final, 8]])

# Cada acorde: [bajo, voces]. Los terminados en b son los del puente.
harm = {
  em9: [:e2, [:g3, :b3, :d4, :fs4]],     a13: [:a1, [:g3, :cs4, :fs4]],
  dmaj9: [:d2, [:fs3, :a3, :cs4, :e4]],  bm7: [:b1, [:fs3, :a3, :d4]],
  gmaj9: [:g1, [:fs3, :a3, :b3, :d4]],   fsm7: [:fs2, [:fs3, :a3, :cs4, :e4]],
  b7: [:b1, [:fs3, :a3, :ds4]],          b7sus: [:b1, [:fs3, :a3, :e4]],
  cmaj9: [:c2, [:g3, :b3, :d4, :e4]],    cmaj7: [:c2, [:g3, :b3, :e4]],
  am7: [:a1, [:g3, :c4, :e4]],           am9: [:a1, [:g3, :b3, :c4, :e4]],
  d6: [:d2, [:fs3, :a3, :b3, :d4]],      d9: [:d2, [:fs3, :c4, :e4]],
  d9sus: [:d2, [:g3, :c4, :e4]],         gmaj7: [:g1, [:fs3, :b3, :d4]],
  fsm7b5: [:fs2, [:a3, :c4, :e4]],       bm11: [:b1, [:a3, :d4, :e4]],
  cmaj9s11: [:c2, [:g3, :b3, :e4, :fs4]],
  gmaj7b: [:g2, [:fs3, :b3, :d4]],       fsm7b: [:fs2, [:e3, :a3, :cs4]],
  fmaj7s11: [:f2, [:e3, :a3, :b3]],
}

chorus_prog = [[:cmaj9], [:d6], [:bm7], [:em9], [:am9], [:d9], [:gmaj7, :cmaj7], [:fsm7b5, :b7]]
prog = [
  [:em9], [:a13], [:em9], [:a13],
  [:em9], [:a13], [:dmaj9], [:bm7],
  [:em9], [:a13], [:gmaj9], [:fsm7, :b7],
  [:em9], [:a13], [:cmaj9], [:am7, :b7sus],
  [:cmaj9], [:b7sus, :b7],
  *chorus_prog,
  [:am9], [:am9], [:bm11], [:bm11], [:cmaj9s11], [:cmaj9s11], [:b7sus], [:b7],
  [:am7], [:bm7], [:cmaj7], [:d9sus, :d9],
  *chorus_prog,
  [:gmaj7b], [:fsm7b], [:fmaj7s11], [:b7sus, :b7],
  *chorus_prog[0, 6], [:fsm7b5, :b7], [:em9],
]

chord_at = lambda { |bar, beat| e = prog[bar] || prog[-1]; harm[e.length > 1 && beat >= 2 ? e[1] : e[0]] }
root_at = lambda { |bar, beat| note(chord_at.(bar, beat)[0]) }
voices_at = lambda { |bar, beat| chord_at.(bar, beat)[1].map { |n| note(n) } }
parts_of = lambda { |bar| prog[bar].length > 1 ? [[0, 2, voices_at.(bar, 0)], [2, 2, voices_at.(bar, 2)]] : [[0, 4, voices_at.(bar, 0)]] }
# Quinta y séptima según lo que haya en las voces (si7b5 lleva quinta disminuida; los maj7,
# séptima mayor).
has_pc = lambda { |bar, beat, iv| r = root_at.(bar, beat); voices_at.(bar, beat).any? { |n| (n - r - iv) % 12 == 0 } }
fifth_at = lambda { |bar, beat| has_pc.(bar, beat, 6) && !has_pc.(bar, beat, 7) ? 6 : 7 }
seventh_at = lambda { |bar, beat| has_pc.(bar, beat, 11) ? 11 : 10 }
hum = lambda { |a| a * rrand(0.88, 1.04) }
sw = 0.025
# Momento (en tiempos) de la semicorchea s dentro del compás, con swing.
t16 = lambda { |s| s * 0.25 + (s.odd? ? sw : 0) }
step = lambda { |s| sleep(s.even? ? 0.25 + sw : 0.25 - sw) }

ch = [
  "g5:0.75 e5:0.75 g5:0.5 b5:1 a5:0.5 g5:0.5",
  "fs5:0.75 d5:0.75 fs5:0.5 a5:1 b5:0.5 a5:0.5",
  "fs5:0.5 d5:0.5 b4:0.5 d5:0.5 fs5:1 e5:0.5 d5:0.5",
  "e5:2 r:0.5 b4:0.5 d5:0.5 e5:0.5",
  "g5:0.75 e5:0.75 g5:0.5 c6:1 b5:0.5 a5:0.5",
  "fs5:0.75 c6:0.75 a5:0.5 fs5:1 e5:0.5 d5:0.5",
  "d5:0.5 fs5:0.5 b5:1 c6:0.5 b5:0.5 g5:1",
  "a5:0.5 c6:0.5 a5:0.5 fs5:0.5 ds5:1 fs5:1",
]
verse_a = "r:0.5 b4:0.25 d5:0.25 e5:0.5 d5:0.5 b4:0.5 r:0.5 g4:0.5 a4:0.5"

mel = [
  "r:4", "r:4", "r:4", "r:4",
  # estrofa
  verse_a,
  "b4:0.75 a4:0.25 fs4:0.5 a4:0.5 r:1 cs5:0.5 b4:0.5",
  "a4:0.5 fs4:0.5 a4:0.5 cs5:1 e5:0.5 d5:0.5 a4:0.5",
  "b4:1.5 r:0.5 d5:0.25 e5:0.25 fs5:0.5 e5:0.5 d5:0.5",
  verse_a,
  "b4:0.75 a4:0.25 fs4:0.5 a4:0.5 r:0.5 e5:0.5 cs5:0.5 a4:0.5",
  "b4:0.5 a4:0.5 b4:0.5 d5:1 fs5:1 r:0.5",
  "e5:0.5 cs5:0.5 a4:1 ds5:0.5 fs5:0.5 a5:1",
  "r:0.5 g5:0.25 fs5:0.25 e5:0.5 d5:0.5 b4:0.5 d5:0.5 e5:0.5 g5:0.5",
  "fs5:1.5 e5:0.5 cs5:0.5 b4:0.5 a4:1",
  "g4:0.5 b4:0.5 d5:0.5 e5:1 g5:1 r:0.5",
  "e5:1 c5:0.5 a4:0.5 b4:1 e5:1",
  # pre
  "e5:0.5 e5:0.5 d5:0.5 e5:0.5 g5:0.5 e5:0.5 d5:0.5 b4:0.5",
  "e5:0.5 fs5:0.5 e5:0.5 b4:0.5 ds5:0.5 fs5:0.5 a5:0.5 b5:0.5",
  *ch,
  # break
  "r:2 e5:0.5 g5:0.5 b5:1", "a5:3 r:1", "r:2 fs5:0.5 a5:0.5 e5:1", "d5:3 r:1",
  "r:2 fs5:0.5 g5:0.5 b5:1", "e5:3 r:1", "r:2 e5:0.5 fs5:0.5 a5:1", "ds5:2 fs5:1 a5:1",
  # subida
  "e5:0.5 e5:0.5 g5:0.5 e5:0.5 a5:1 g5:1",
  "fs5:0.5 fs5:0.5 a5:0.5 fs5:0.5 b5:1 a5:1",
  "g5:0.5 g5:0.5 b5:0.5 g5:0.5 c6:1 b5:1",
  "g5:0.5 a5:0.5 c6:0.5 e6:0.5 fs6:0.5 e6:0.5 c6:0.5 a5:0.5",
  *ch,
  # puente: notas largas que bajan con el bajo
  "b5:2 a5:1 fs5:1", "a5:2 e5:1 cs5:1", "e5:2 b4:1 a4:1", "e5:1 fs5:1 ds5:0.5 fs5:0.5 b5:1",
  # estribillo final
  *ch[0, 6], ch[7], "e5:1 b4:1 d5:1 e5:1",
]

solo = [
  "e6:0.5 g6:0.5 b6:1 a6:0.25 g6:0.25 e6:0.5 d6:0.5 b5:0.5",
  "d6:0.25 e6:0.25 fs6:0.5 a6:1 b6:0.5 a6:0.5 fs6:1",
  "fs6:0.75 e6:0.25 d6:0.5 b5:0.5 d6:0.5 e6:0.5 fs6:1",
  "g6:0.5 fs6:0.25 e6:0.25 b5:1 r:0.5 e6:0.25 fs6:0.25 g6:0.5 b6:0.5",
  "c7:1 b6:0.5 a6:0.5 g6:0.5 e6:0.5 g6:0.5 a6:0.5",
  "fs6:0.5 a6:0.5 c7:0.5 e7:0.5 d7:0.5 c7:0.5 a6:0.5 fs6:0.5",
  "e6:0.5 c6:0.5 a5:0.5 c6:0.5 ds6:0.5 fs6:0.5 a6:0.5 b6:0.5",
  "e7:0.5 d7:0.5 b6:0.5 fs6:0.5 e6:2",
]

stretto_click [:fm, :hollow, :tech_saws, :pluck, :pretty_bell, :mod_saw, :bnoise],
              [:drum_splash_soft, :drum_splash_hard, :bd_haus, :perc_snap, :sn_dolf, :drum_snare_hard,
               :drum_snare_soft, :drum_cymbal_open, :drum_cymbal_closed, :drum_cowbell,
               :drum_tom_hi_hard, :drum_tom_mid_hard, :drum_tom_lo_hard]

# --- Batería ----------------------------------------------------------------
# Bombo, platos, cencerro y subidas de ruido en un hilo; palmas, caja y toms con sala en otro.
# Todo a -9 dB: a nivel 1 los golpes saturan la grabación y el grabador recupera el nivel.
in_thread do
  with_fx :level, amp: 0.35 do
    with_fx :compressor, threshold: 0.4, clamp_time: 0.01 do
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        first = bar == 0 || plan[bar - 1] != sec
        sample :drum_splash_hard, amp: 0.45 if (first && [:chorus, :final].include?(sec)) || bar == 54 || bar == 57
        sample :drum_splash_soft, amp: 0.4 if first && [:verse, :break, :bridge].include?(sec)
        if [17, 37, 49].include?(bar)
          nz = synth :bnoise, attack: 3.6, sustain: 0, release: 0.3, cutoff: 60, cutoff_slide: 3.8, amp: 0.18
          control nz, cutoff: 118
        end
        # En el break el bombo se va y vuelve a mitad, filtrado y abriéndose.
        kicks = case sec
                when :intro then bar < 2 ? [0, 8] : [0, 4, 8, 12]
                when :break then bar < 30 ? [] : [0, 4, 8, 12]
                when :build then bar == 37 ? [0, 2, 4, 6, 8, 10, 12, 14] : [0, 4, 8, 12]
                else [0, 4, 8, 12]
                end
        kicks = [0] if bar == 57
        kcut = sec == :break ? 62 + (bar - 30) * 10 : 105
        16.times do |s|
          sample :bd_haus, amp: hum.(1.5), cutoff: kcut if kicks.include?(s)
          unless bar == 57
            open = s % 4 == 2 && ![:intro, :break, :pre].include?(sec)
            if open
              sample :drum_cymbal_open, amp: hum.([:chorus, :final].include?(sec) ? 0.32 : 0.26), release: 0.12, rate: 1.2
            elsif sec != :break || s.even?
              sample :drum_cymbal_closed, amp: hum.([0.12, 0.2, 0.15, 0.25][s % 4] * (sec == :break ? 0.7 : 1)), rate: 1.5
            end
            sample :drum_cowbell, amp: hum.(0.16), rate: 1.1 if sec == :bridge && [0, 3, 6, 10, 12].include?(s)
          end
          step.(s)
        end
      end
    end
  end
end if stem?(:drums)

in_thread do
  with_fx :level, amp: 0.3 do
    with_fx :reverb, room: 0.45, mix: 0.2 do
      fills = [:toms, :snare, :flam]
      nfill = 0
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        fill = nil
        if section_end?(plan, bar) && [:intro, :verse, :chorus, :break, :bridge].include?(sec)
          fill = fills[nfill % 3]
          nfill += 1
        end
        mini = sec == :verse && bar % 4 == 3 && fill.nil?
        16.times do |s|
          if bar == 57
            # el último compás suena solo con el platillo y el bombo
          elsif fill && s >= (fill == :snare ? 12 : 8)
            case fill
            when :snare
              sample :sn_dolf, amp: 0.4 + (s - 12) * 0.15, rate: 1.15
            when :toms
              t = {8 => :drum_tom_hi_hard, 9 => :drum_tom_hi_hard, 10 => :drum_tom_mid_hard, 11 => :drum_tom_mid_hard,
                   12 => :drum_tom_lo_hard, 13 => :drum_tom_lo_hard, 14 => :drum_tom_lo_hard}[s]
              sample t, amp: 0.55 if t
              sample :perc_snap, amp: 0.7 if s == 12
            else
              if [8, 10, 12, 13, 14, 15].include?(s)
                sample :sn_dolf, amp: 0.35 + (s - 8) * 0.07, rate: 1.15
                sample :drum_snare_hard, amp: 0.15 + (s - 8) * 0.03
              end
            end
          elsif mini && s >= 13
            sample :sn_dolf, amp: 0.2 + (s - 13) * 0.1, rate: 1.15
          else
            back = s == 4 || s == 12
            case sec
            when :intro
              sample :perc_snap, amp: hum.(0.5 + bar * 0.06) if back && bar >= 2
            when :pre
              if bar == 16
                sample :perc_snap, amp: hum.(0.7) if back
              else
                sample :sn_dolf, amp: 0.3 + s * 0.04, rate: 1.15 if s >= 8 || s.even?
              end
            when :break
              sample :perc_snap, amp: hum.(0.45) if back
            when :build
              k = bar - 34
              hit = [s % 4 == 0, s.even?, true, s < 15][k]
              sample :sn_dolf, amp: 0.4 + k * 0.1 + s * 0.012, rate: 1.1 + (k == 3 ? s * 0.025 : 0) if hit
            when :bridge
              sample :perc_snap, amp: hum.(0.6) if back
              sample :drum_tom_lo_hard, amp: hum.(0.3) if s == 14
            else
              if back
                sample :perc_snap, amp: hum.(0.7)
                sample :sn_dolf, amp: hum.(0.45), rate: 1.15
                sample :drum_snare_hard, amp: hum.(0.15) if [:chorus, :final].include?(sec)
              end
              sample :drum_snare_soft, amp: 0.12 if bar.odd? && (s == 7 || s == 9)
            end
          end
          step.(s)
        end
      end
    end
  end
end if stem?(:drums)

# --- Bajo (FM sincopado con octavas) -----------------------------------------
# Patrones en semicorcheas: [paso, nota, duración]. r raíz, o octava, f quinta, s séptima,
# g nota apagada (fantasma) y a nota de paso cromática hacia el compás siguiente.
in_thread do
  with_fx :level, amp: 0.4 do
    use_synth :fm
    pats = {
      intro: [[0, :r, 3], [3, :r, 1], [6, :o, 1], [8, :r, 2], [11, :f, 1], [14, :s, 1], [15, :o, 1]],
      verse: [[0, :r, 2], [2, :o, 1], [3, :r, 1], [5, :g, 1], [6, :r, 1], [7, :o, 1], [8, :r, 2], [10, :s, 1],
              [11, :o, 1], [13, :r, 1], [14, :f, 1], [15, :a, 1]],
      pre: [[0, :r, 1], [2, :r, 1], [4, :r, 1], [6, :r, 1], [8, :r, 1], [10, :r, 1], [12, :o, 1], [13, :f, 1],
            [14, :s, 1], [15, :a, 1]],
      chorus: [[0, :r, 1], [2, :o, 1], [4, :r, 1], [6, :o, 1], [8, :r, 1], [10, :o, 1], [12, :r, 1], [13, :r, 1],
               [14, :o, 1], [15, :a, 1]],
      break: [[0, :r, 6], [6, :f, 2], [8, :o, 4], [12, :s, 2], [14, :a, 2]],
      build: (0..15).map { |s| [s, s % 4 == 2 ? :o : :r, 1] },
      bridge: [[0, :r, 3], [3, :o, 1], [6, :r, 2], [8, :r, 3], [11, :o, 1], [14, :a, 2]],
    }
    pats[:final] = pats[:chorus]
    depth = {intro: 1.5, verse: 1.8, pre: 2, chorus: 2.5, break: 1.2, build: 1.6, bridge: 1.8, final: 2.8}
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      pat = bar == 57 ? [[0, :r, 16]] : pats[sec]
      pos = 0
      pat.each do |s, kind, len|
        sleep t16.(s) - t16.(pos)
        pos = s
        b = s / 4
        r = root_at.(bar, b)
        nxt = root_at.(bar + 1, 0)
        n = case kind
            when :o then r + 12
            when :f then r + fifth_at.(bar, b)
            when :s then r + seventh_at.(bar, b)
            when :a then nxt == r ? r + 12 : nxt + (nxt < r ? 1 : -1)
            else r
            end
        d = len * 0.25
        long = len >= 6
        dp = depth[sec] + (sec == :build ? (bar - 34) * 0.3 : 0)
        if kind == :g
          play n, release: 0.05, divisor: 0.5, depth: dp, amp: hum.(0.3)
        else
          play n, attack: (long ? 0.03 : 0.005), sustain: d * (long ? 0.7 : 0.5), release: (long ? d * 0.3 : 0.1),
               divisor: 0.5, depth: dp, amp: hum.(kind == :o ? 0.7 : 0.85) * (sec == :break ? 0.6 : 1)
        end
      end
      sleep 4 - t16.(pos)
    end
  end
end if stem?(:bass)

# --- Acordes (colchón, cuerdas y golpes de funk) -----------------------------
in_thread do
  with_fx :reverb, room: 0.7, mix: 0.4 do
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      parts = parts_of.(bar)
      if bar == 57
        v = voices_at.(bar, 0)
        with_synth(:hollow) { play v + [v.last + 12], attack: 0.2, sustain: 3, release: 3, amp: 0.5 }
        with_synth(:tech_saws) { play v, attack: 0.05, sustain: 2, release: 2, cutoff: 90, amp: 0.25 }
        sleep 4
        next
      end
      # Colchón de fondo en todas las secciones (más suave en la subida, que va a golpes).
      pad_amp = {intro: 0.3, verse: 0.32, pre: 0.3, chorus: 0.55, break: 0.27, build: 0.15, bridge: 0.4, final: 0.6}[sec]
      parts.each do |t, d, v|
        top = [:chorus, :final, :bridge].include?(sec) ? [v.last + 12] : []
        with_synth(:hollow) { play v + top, attack: (sec == :break ? 1 : 0.3), sustain: d - 0.4, release: 1, amp: pad_amp }
      end
      use_synth :tech_saws
      case sec
      when :pre
        parts.each do |t, d, v|
          c0 = 70 + (bar - 16) * 18 + t * 4
          nd = play v, attack: 0.3, sustain: d - 0.3, release: 0.4, cutoff: c0, cutoff_slide: d, amp: 0.22
          control nd, cutoff: c0 + d * 4.5
          sleep d
        end
      when :break
        parts.each do |t, d, v|
          play v, attack: d * 0.4, sustain: d * 0.4, release: d * 0.5, cutoff: 66, amp: 0.14
          sleep d
        end
      when :build
        16.times do |s|
          play voices_at.(bar, s / 4), release: 0.3, cutoff: 70 + ((bar - 34) * 16 + s) * 0.6, amp: hum.(0.55) if s.even?
          step.(s)
        end
      else
        # Golpes cortos: sincopados en intro y estrofa, a contratiempo de corchea (disco) en
        # estribillos y puente, con un empujón en la última semicorchea de los impares.
        hits = case sec
               when :intro, :verse then [2, 6, 11, 14]
               when :bridge then [6, 14]
               else bar.odd? ? [2, 6, 10, 14, 15] : [2, 6, 10, 14]
               end
        cut = {intro: 84, verse: 88, bridge: 92, chorus: 100, final: 104}[sec]
        16.times do |s|
          play voices_at.(bar, s / 4), release: 0.18, cutoff: cut, amp: hum.((s == 15 ? 0.16 : 0.24) * ([:chorus, :final].include?(sec) ? 1.35 : 1)) if hits.include?(s)
          step.(s)
        end
      end
    end
  end
end if stem?(:chords)

# --- Melodía (punteo tipo guitarra; en los estribillos, doblada a la octava) ---
in_thread do
  with_fx :reverb, room: 0.5, mix: 0.25 do
    with_fx :echo, phase: 0.75, decay: 2, mix: 0.18 do
      use_synth :pluck
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        big = [:chorus, :final].include?(sec)
        parse_line(mel[bar]).each do |n, d|
          if n
            play n, amp: hum.(0.5), coef: 0.25, release: [d * 0.8, 0.3].max
            play note(n) + 12, amp: hum.(0.2), coef: 0.3, release: [d * 0.6, 0.25].max if big
          end
          sleep d
        end
      end
    end
  end
end if stem?(:melody)

# --- Arpegio (campanas) -------------------------------------------------------
# Estrofa en 3+3+2 semicorcheas; break a negras en contratiempo con eco largo.
in_thread do
  with_fx :echo, phase: 0.75, decay: 1.5, mix: 0.3 do
    use_synth :pretty_bell
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      16.times do |s|
        v = voices_at.(bar, s / 4)
        up = v.map { |n| n + 12 } + [v[0] + 24]
        two = v.map { |n| n + 12 } + v.map { |n| n + 24 }
        n, a = case sec
               when :intro then [s.even? ? up[(s / 2) % up.length] : nil, 0.2 + bar * 0.04]
               when :verse, :bridge
                 i = [0, 3, 6, 8, 11, 14].index(s)
                 [i ? up[[0, 2, 1, 3, 2, 4][i] % up.length] : nil, 0.3]
               when :pre then [two[s % 8 % two.length], 0.22 + s * 0.01]
               when :break then [s % 4 == 2 ? up[(4 - s / 4) % up.length] + 12 : nil, 0.32]
               when :build then [up[s % 4 % up.length] + ((bar - 34) / 2) * 12, 0.22 + (bar - 34) * 0.04]
               else [up[[0, 2, 1, 3, 2, 4, 3, 1][s % 8] % up.length], sec == :final ? 0.32 : 0.28]
               end
        if bar == 57
          n = two[s % two.length]
          a *= 1 - s / 20.0
        end
        play n, release: 0.2, amp: hum.(a), pan: (s.even? ? -0.35 : 0.35) if n
        step.(s)
      end
    end
  end
end if stem?(:arp)

# --- Solo (sintetizador con wah, solo en el estribillo final) -----------------
in_thread do
  with_fx :reverb, room: 0.6, mix: 0.3 do
    use_synth :mod_saw
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      if sec == :final
        parse_line(solo[bar - 50]).each do |n, d|
          play n, attack: 0.01, sustain: d * 0.6, release: [d * 0.4, 0.12].max, cutoff: 100, mod_range: 0.3,
               mod_phase: 0.25, amp: hum.(0.35) if n
          sleep d
        end
      else
        sleep 4
      end
    end
  end
end if stem?(:solo)
