# Stretto · Nivel 5 · "Autopista al amanecer" · drum and bass luminoso en si menor
# @bpm 172
# @bars 86
# @final 74
#
# Las secciones son las mismas que src/game/levels.ts usa para generar las líneas de cambio:
# intro 0-7 · estrofa 8-23 · pre 24-27 · estribillo 28-43 · break 44-55 · subida 56-61 ·
# estribillo 62-69 · puente 70-73 · estribillo final 74-81 (aquí entra el solo) · outro 82-85.
#
# Armonía de liquid: novenas a dos compases por acorde, pre con el bajo la-sol-mi-fa# hasta
# fa#7, puente en ii-V-I de re mayor y estribillo final con un acorde por compás (el doble de
# rápido). Bajo sub de onda seno con una reese (sierra desafinada) encima. Melodía y solo van
# en texto, un compás por cadena; a 172 BPM la melodía va casi siempre a negras.

use_bpm 172
use_debug false
use_transpose (get(:transpose) || 0)
# Se lee una vez: get() no es instantáneo y saltar compases con él retrasa los hilos.
from_bar = get(:from_bar) || 0

plan = stretto_plan([[:intro, 8], [:verse, 16], [:pre, 4], [:chorus, 16], [:break, 12],
                     [:build, 6], [:chorus, 8], [:bridge, 4], [:final, 8], [:outro, 4]])

# Cada acorde: [bajo, voces].
harm = {
  bm9: [:b1, [:d4, :fs4, :a4, :cs5]],    gmaj9: [:g1, [:d4, :fs4, :a4, :b4]],
  em9: [:e2, [:d4, :fs4, :g4, :b4]],     fs7sus: [:fs2, [:e4, :fs4, :b4]],
  fs7: [:fs2, [:e4, :as4, :cs5]],        dmaj9: [:d2, [:cs4, :e4, :fs4, :a4]],
  asus: [:a1, [:d4, :e4, :a4]],          a: [:a1, [:cs4, :e4, :a4]],
  bm_a: [:a1, [:d4, :fs4, :b4, :cs5]],   a6: [:a1, [:cs4, :e4, :fs4, :a4]],
  fsm7: [:fs2, [:cs4, :e4, :a4]],        a13: [:a1, [:cs4, :fs4, :g4, :b4]],
  gmaj7s11: [:g1, [:d4, :fs4, :b4, :cs5]],
}

chorus16 = [[:gmaj9], [:gmaj9], [:a6], [:a6], [:fsm7], [:fsm7], [:bm9], [:bm9],
            [:em9], [:em9], [:a13], [:a13], [:dmaj9], [:bm9], [:gmaj9], [:fs7]]
prog = [
  [:bm9], [:bm9], [:gmaj9], [:gmaj9], [:em9], [:em9], [:fs7sus], [:fs7],
  [:bm9], [:bm9], [:gmaj9], [:gmaj9], [:dmaj9], [:dmaj9], [:asus], [:a],
  [:bm9], [:bm9], [:gmaj9], [:gmaj9], [:em9], [:em9], [:fs7sus], [:fs7],
  [:bm_a], [:gmaj9], [:em9], [:fs7sus, :fs7],
  *chorus16,
  [:em9], [:em9], [:gmaj7s11], [:gmaj7s11], [:dmaj9], [:dmaj9], [:a6], [:a6], [:em9], [:em9], [:fs7sus], [:fs7],
  [:em9], [:fsm7], [:gmaj9], [:a6], [:bm9], [:fs7],
  *chorus16[0, 8],
  [:em9], [:a13], [:dmaj9], [:fs7],
  [:gmaj9], [:a6], [:fsm7], [:bm9], [:em9], [:a13], [:fs7sus, :fs7], [:bm9],
  [:gmaj9], [:gmaj9], [:bm9], [:bm9],
]

chord_at = lambda { |bar, beat| e = prog[bar] || prog[-1]; harm[e.length > 1 && beat >= 2 ? e[1] : e[0]] }
root_at = lambda { |bar, beat| note(chord_at.(bar, beat)[0]) }
voices_at = lambda { |bar, beat| chord_at.(bar, beat)[1].map { |n| note(n) } }
parts_of = lambda { |bar| prog[bar].length > 1 ? [[0, 2, voices_at.(bar, 0)], [2, 2, voices_at.(bar, 2)]] : [[0, 4, voices_at.(bar, 0)]] }
has_pc = lambda { |bar, beat, iv| r = root_at.(bar, beat); voices_at.(bar, beat).any? { |n| (n - r - iv) % 12 == 0 } }
fifth_at = lambda { |bar, beat| has_pc.(bar, beat, 6) && !has_pc.(bar, beat, 7) ? 6 : 7 }
hum = lambda { |a| a * rrand(0.88, 1.04) }

chorus_mel = [
  "d6:1.5 b5:0.5 a5:1 b5:1", "fs5:2 d6:1 e6:1",
  "cs6:1.5 a5:0.5 fs5:1 a5:1", "e5:2 a5:1 b5:1",
  "a5:1.5 fs5:0.5 e5:1 cs5:1", "e5:3 r:1",
  "d5:1 fs5:1 b5:1 cs6:1", "d6:3 r:1",
  "b5:1.5 g5:0.5 fs5:1 e5:1", "g5:2 b5:1 d6:1",
  "cs6:1.5 a5:0.5 g5:1 fs5:1", "e5:2 cs5:2",
  "d5:1 fs5:1 a5:1 cs6:1", "d6:2 b5:2", "b5:1 a5:1 fs5:1 d5:1", "as5:2 cs6:1 e6:1",
]

mel = [
  "r:4", "r:4", "r:4", "r:4", "r:4", "r:4", "r:4", "r:4",
  # estrofa
  "fs5:1.5 e5:0.5 d5:1 e5:1", "fs5:2 cs6:1 b5:1", "b5:1.5 a5:0.5 fs5:1 d5:1", "a5:3 r:1",
  "fs5:1.5 e5:0.5 d5:1 cs5:1", "e5:2 a4:2", "d5:2 e5:2", "cs5:3 r:1",
  "fs5:1.5 e5:0.5 d5:1 e5:1", "fs5:1 a5:1 b5:1 cs6:1", "d6:1.5 cs6:0.5 b5:1 a5:1", "fs5:3 r:1",
  "g5:1.5 fs5:0.5 e5:1 b4:1", "d5:2 fs5:2", "e5:2 b4:2", "as4:2 cs5:1 e5:1",
  # pre
  "b4:1 d5:1 fs5:1 a5:1", "b5:1 a5:1 fs5:1 d5:1", "g5:1 b5:1 d6:1 fs6:1", "e6:1 b5:1 as5:1 cs6:1",
  *chorus_mel,
  # break
  "r:2 b5:2", "fs5:4", "r:2 cs6:2", "b5:4", "r:2 e6:2", "cs6:4", "r:2 fs6:2", "e6:4",
  "r:2 g5:2", "fs5:4", "r:2 e5:2", "as5:2 cs6:2",
  # subida: arpegios a corcheas, cada compás un acorde más arriba
  "e5:0.5 g5:0.5 b5:0.5 d6:0.5 e5:0.5 g5:0.5 b5:0.5 d6:0.5",
  "fs5:0.5 a5:0.5 cs6:0.5 e6:0.5 fs5:0.5 a5:0.5 cs6:0.5 e6:0.5",
  "g5:0.5 b5:0.5 d6:0.5 fs6:0.5 g5:0.5 b5:0.5 d6:0.5 fs6:0.5",
  "a5:0.5 cs6:0.5 e6:0.5 fs6:0.5 a5:0.5 cs6:0.5 e6:0.5 fs6:0.5",
  "b5:0.5 d6:0.5 fs6:0.5 a6:0.5 b5:0.5 d6:0.5 fs6:0.5 a6:0.5",
  "as5:0.5 cs6:0.5 e6:0.5 fs6:0.5 as6:0.5 fs6:0.5 e6:0.5 cs6:0.5",
  *chorus_mel[0, 8],
  # puente
  "g5:2 fs5:1 e5:1", "cs6:2 b5:1 a5:1", "a5:1.5 fs5:0.5 e5:1 cs5:1", "as5:1 cs6:1 e6:1 fs6:1",
  # estribillo final: un acorde por compás
  "d6:1.5 b5:0.5 a5:1 b5:1", "cs6:1.5 a5:0.5 fs5:1 e5:1", "a5:1.5 fs5:0.5 e5:1 cs5:1", "d5:1 fs5:1 b5:1 cs6:1",
  "b5:1.5 g5:0.5 fs5:1 e5:1", "cs6:1.5 a5:0.5 g5:1 fs5:1", "e5:1 b5:1 as5:1 cs6:1", "b5:4",
  # outro
  "d6:2 b5:2", "fs5:2 a5:2", "b5:4", "fs5:4",
]

solo = [
  "b5:0.5 d6:0.5 fs6:0.5 a6:0.5 b6:1 a6:0.5 fs6:0.5",
  "e6:0.5 fs6:0.5 a6:0.5 cs7:0.5 e7:1 cs7:0.5 a6:0.5",
  "a6:0.5 fs6:0.5 e6:0.5 cs6:0.5 e6:1 fs6:1",
  "d6:0.5 fs6:0.5 b6:0.5 cs7:0.5 d7:2",
  "b6:0.5 g6:0.5 fs6:0.5 e6:0.5 g6:0.5 b6:0.5 d7:1",
  "cs7:0.5 b6:0.5 a6:0.5 fs6:0.5 g6:0.5 a6:0.5 b6:1",
  "b6:0.5 e6:0.5 fs6:0.5 b6:0.5 as6:0.5 cs7:0.5 e7:0.5 cs7:0.5",
  "d7:0.5 cs7:0.5 b6:3",
]

stretto_click [:dsaw, :sine, :hollow, :prophet, :blade, :pluck, :supersaw, :bnoise],
              [:drum_splash_hard, :drum_splash_soft, :bd_haus, :sn_dolf, :drum_snare_hard, :drum_snare_soft,
               :drum_cymbal_closed, :drum_cymbal_open, :drum_cymbal_pedal,
               :drum_tom_hi_hard, :drum_tom_mid_hard, :drum_tom_lo_hard]

# --- Batería (dos pasos; break a media parte) ---------------------------------
# Bombo, platos y barridos en un hilo; caja, fantasmas y toms con sala en otro.
# Todo a -9 dB: a nivel 1 los golpes saturan la grabación y el grabador recupera el nivel.
in_thread do
  with_fx :level, amp: 0.35 do
    with_fx :compressor, threshold: 0.4, clamp_time: 0.01 do
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        first = bar == 0 || plan[bar - 1] != sec
        sample :drum_splash_hard, amp: 0.4 if (first && [:chorus, :final].include?(sec)) || [36, 78].include?(bar)
        sample :drum_splash_soft, amp: 0.35 if (first && [:verse, :break, :bridge, :outro].include?(sec)) || bar == 16
        # Barridos: 4 compases antes del primer estribillo, 6 en la subida, 1 antes del final.
        rise = {24 => 16, 56 => 24, 7 => 4, 73 => 4}[bar]
        if rise
          nz = synth :bnoise, attack: rise - 0.4, sustain: 0, release: 0.3, cutoff: 55, cutoff_slide: rise - 0.2, amp: 0.16
          control nz, cutoff: 120
        end
        half = sec == :break && bar < 52 || sec == :bridge || (sec == :intro && bar >= 4)
        kicks = if sec == :intro && bar < 4 then [0]
                elsif half then [0]
                elsif sec == :outro then bar < 84 ? [0, 10] : []
                elsif sec == :build && bar == 61 then [0, 2, 4, 6, 8, 10, 12, 14]
                elsif bar % 4 == 3 then [0, 10, 14]
                else [0, 10]
                end
        16.times do |s|
          sample :bd_haus, amp: hum.(sec == :break && bar >= 52 ? 1.2 : 1.5), cutoff: (sec == :break && bar >= 52 ? 80 + (bar - 52) * 8 : 110) if kicks.include?(s)
          big = [:chorus, :final].include?(sec)
          if half || sec == :intro
            sample :drum_cymbal_closed, amp: hum.(s % 4 == 2 ? 0.18 : 0.08), rate: 1.4 if s.even?
          elsif sec == :outro
            sample :drum_cymbal_closed, amp: hum.(0.14 - (bar - 82) * 0.025), rate: 1.4 if s.even?
          else
            sample :drum_cymbal_closed, amp: hum.(s.even? ? 0.22 : 0.1), rate: 1.5
            sample :drum_cymbal_open, amp: hum.(0.2), release: 0.1, rate: 1.2 if s == 14 && (big || bar.odd?)
            sample :drum_cymbal_pedal, amp: hum.(0.12), rate: 1.3 if big && s % 4 == 0
          end
          sleep 0.25
        end
      end
    end
  end
end if stem?(:drums)

in_thread do
  with_fx :level, amp: 0.3 do
    with_fx :reverb, room: 0.5, mix: 0.22 do
      fills = [:snare, :toms, :flam]
      nfill = 0
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        fill = nil
        if section_end?(plan, bar) && [:intro, :verse, :chorus, :break, :bridge, :final].include?(sec) && bar != 7
          fill = fills[nfill % 3]
          nfill += 1
        end
        # Remate tipo "amen" cada 4 compases de estrofa y estribillo.
        mini = [:verse, :chorus].include?(sec) && bar % 4 == 3 && fill.nil?
        half = sec == :break && bar < 52 || sec == :bridge || (sec == :intro && bar >= 4)
        16.times do |s|
          if fill && s >= (fill == :snare ? 12 : 8)
            case fill
            when :snare
              sample :sn_dolf, amp: 0.45 + (s - 12) * 0.15
            when :toms
              t = {8 => :drum_tom_hi_hard, 10 => :drum_tom_hi_hard, 11 => :drum_tom_mid_hard, 12 => :drum_tom_mid_hard,
                   13 => :drum_tom_mid_hard, 14 => :drum_tom_lo_hard, 15 => :drum_tom_lo_hard}[s]
              sample t, amp: 0.5 if t
              sample :sn_dolf, amp: 0.8 if s == 12
            else
              if [8, 10, 12, 13, 14, 15].include?(s)
                sample :sn_dolf, amp: 0.4 + (s - 8) * 0.07
                sample :drum_snare_hard, amp: 0.15 + (s - 8) * 0.03
              end
            end
          elsif mini && s >= 12
            sample :sn_dolf, amp: [0.9, 0.3, 0.5, 0.35][s - 12], rate: (s == 12 ? 1 : 1.1)
          else
            case sec
            when :intro
              sample :sn_dolf, amp: hum.(0.7), rate: 0.95 if half && s == 8
            when :pre, :build
              # Redoble: negras, corcheas y semicorcheas (en la subida, 2 compases de cada).
              k = sec == :pre ? bar - 24 : (bar - 56) / 2
              k = 3 if sec == :build && bar == 61
              hit = [s % 4 == 0, s.even?, true, true][k]
              sample :sn_dolf, amp: 0.3 + k * 0.12 + s * 0.012, rate: 1 + (k == 3 ? s * 0.02 : 0) if hit
            when :outro
              sample :sn_dolf, amp: hum.(0.6 - (bar - 82) * 0.15) if (s == 4 || s == 12) && bar < 84
            else
              if half
                sample :sn_dolf, amp: hum.(0.9), rate: 0.95 if s == 8
                sample :drum_snare_soft, amp: 0.12 if s == 14 && bar.odd?
                sample :drum_tom_lo_hard, amp: hum.(0.3) if sec == :bridge && (s == 3 || s == 11)
              else
                if s == 4 || s == 12
                  sample :sn_dolf, amp: hum.(1.0)
                  sample :drum_snare_hard, amp: hum.(0.3), rate: 1.3
                end
                # Fantasmas: los de siempre más uno que cambia de sitio cada compás.
                sample :sn_dolf, amp: hum.(0.16), rate: 1.4 if s == 7 || s == 15 || s == [9, 11, 13, 2][bar % 4]
              end
            end
          end
          sleep 0.25
        end
      end
    end
  end
end if stem?(:drums)

# --- Bajo (sub de onda seno y reese encima) -----------------------------------
# Patrones en semicorcheas: [paso, nota, duración]. r raíz, o octava, f quinta y a nota de
# paso cromática hacia el compás siguiente. La reese solo suena fuera de intro, break y outro.
in_thread do
  with_fx :level, amp: 0.4 do
    pats = {
      verse: [[0, :r, 6], [6, :r, 2], [10, :r, 4], [14, :o, 2]],
      pre: [[0, :r, 2], [2, :r, 2], [4, :r, 2], [6, :o, 2], [8, :r, 2], [10, :r, 2], [12, :f, 2], [14, :a, 2]],
      chorus: [[0, :r, 3], [3, :o, 1], [6, :r, 2], [8, :f, 2], [10, :r, 3], [13, :o, 1], [14, :a, 2]],
      build: (0..7).map { |e| [e * 2, e.odd? ? :o : :r, 2] },
      bridge: [[0, :r, 6], [6, :f, 2], [8, :r, 6], [14, :a, 2]],
    }
    pats[:final] = pats[:chorus]
    cuts = {verse: 68, pre: 72, chorus: 80, build: 70, bridge: 72, final: 86}
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      calm = [:intro, :break, :outro].include?(sec)
      pat = calm || bar == 81 ? [[0, :r, 16]] : pats[sec]
      pos = 0
      pat.each do |s, kind, len|
        sleep (s - pos) * 0.25
        pos = s
        b = s / 4
        r = root_at.(bar, b)
        nxt = root_at.(bar + 1, 0)
        n = case kind
            when :o then r + 12
            when :f then r + fifth_at.(bar, b)
            when :a then nxt == r ? r + 7 : nxt + (nxt < r ? 1 : -1)
            else r
            end
        d = len * 0.25
        # Sub: la raíz (o la nota de paso), ligado.
        synth :sine, note: ([:o, :f].include?(kind) ? r : n), attack: 0.02, sustain: d * 0.85, release: 0.1, amp: hum.(calm ? 0.5 : 0.65)
        unless calm
          cut = cuts[sec] + (sec == :build ? (bar - 56) * 4 + s * 0.4 : 0)
          synth :dsaw, note: n, attack: 0.01, sustain: d * 0.7, release: 0.12, cutoff: cut, detune: 0.25, amp: hum.(0.45)
        end
      end
      sleep (16 - pos) * 0.25
    end
  end
end if stem?(:bass)

# --- Acordes (colchón cálido; supersierra ancha en el estribillo) -------------
in_thread do
  with_fx :reverb, room: 0.85, mix: 0.45 do
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      parts = parts_of.(bar)
      case sec
      when :chorus, :final
        parts.each do |t, d, v|
          with_synth(:supersaw) { play v, attack: 0.08, sustain: d - 0.3, release: 0.8, cutoff: (sec == :final ? 104 : 98), amp: hum.(0.36) }
          with_synth(:hollow) { play v.map { |n| n - 12 }, attack: 0.2, sustain: d - 0.3, release: 1, amp: 0.4 }
          # Golpe corto en la "y" del 2 (a dos pasos, empuja con la caja).
          (d / 2).times do
            sleep 1.5
            with_synth(:prophet) { play v, release: 0.25, cutoff: 100, amp: hum.(0.2) }
            sleep 0.5
          end
        end
      when :pre, :build
        k = sec == :pre ? (bar - 24) / 4.0 : (bar - 56) / 6.0
        # Colchón debajo de los golpes: sin él, pre y subida sonaban 6 dB por debajo de la estrofa.
        parts.each do |t, d, v|
          with_synth(:hollow) { play v, attack: 0.3, sustain: d - 0.4, release: 0.8, amp: 0.3 + k * 0.15 }
        end
        16.times do |s|
          with_synth(:prophet) { play voices_at.(bar, s / 4), release: 0.3, cutoff: 70 + k * 35 + s * 0.4, amp: hum.(0.6) } if s.even?
          sleep 0.25
        end
      else
        # Intro, estrofa, break, puente y outro: colchón y prophet tenue que se abre en la intro.
        c = case sec
            when :intro then 62 + bar * 3
            when :verse then 78
            when :outro then 80 - (bar - 82) * 5
            else 70
            end
        parts.each do |t, d, v|
          with_synth(:hollow) { play v, attack: (d > 2 ? 0.8 : 0.3), sustain: d - 0.5, release: 1.5, amp: (sec == :outro ? 0.45 - (bar - 82) * 0.08 : (sec == :break ? 0.3 : 0.45)) }
          with_synth(:prophet) { play v, attack: 0.3, sustain: d - 0.5, release: 1, cutoff: c, amp: 0.2 }
          if sec == :verse
            # Golpes de dos pasos en la estrofa.
            [[1.5, 0.5], [1.0, 1.0]].each do |w, rest|
              sleep w
              with_synth(:prophet) { play v, release: 0.2, cutoff: 92, amp: hum.(0.16) }
              sleep rest
            end
          else
            sleep d
          end
        end
      end
    end
  end
end if stem?(:chords)

# --- Melodía ------------------------------------------------------------------
in_thread do
  with_fx :reverb, room: 0.8, mix: 0.35 do
    with_fx :echo, phase: 0.75, decay: 2.5, mix: 0.22 do
      use_synth :blade
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        parse_line(mel[bar]).each do |n, d|
          if n
            play n, attack: 0.03, sustain: d * 0.6, release: [d * 0.45, 0.2].max, cutoff: (sec == :final ? 108 : 100),
                 vibrato_rate: 6, vibrato_depth: (d >= 1.5 ? 0.12 : 0.04), vibrato_delay: 0.4, amp: hum.(0.5)
          end
          sleep d
        end
      end
    end
  end
end if stem?(:melody)

# --- Arpegio (pulsado; a corcheas, salvo en la subida y el final) -------------
in_thread do
  # El ataque del pluck da picos sueltos que saturan la grabación: -3 dB.
  with_fx :level, amp: 0.7 do
    with_fx :echo, phase: 0.75, decay: 2, mix: 0.25 do
      use_synth :pluck
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        if sec == :bridge
          # Tresillos de negra: 6 notas por compás.
          6.times do |t|
            v = voices_at.(bar, (t * 2) / 3)
            up = v + [v[0] + 12]
            play up[[0, 2, 1, 3, 2, 1][t] % up.length], amp: hum.(0.5), coef: 0.3, pan: (t.even? ? -0.35 : 0.35)
            sleep 4.0 / 6
          end
          next
        end
        16.times do |s|
          v = voices_at.(bar, s / 4)
          up = v + [v[0] + 12]
          two = v + v.map { |n| n + 12 }
          e = s / 2
          n, a = case sec
                 when :intro then [s.even? ? up[e % up.length] : nil, 0.2 + bar * 0.04]
                 when :verse then [s.even? ? up[[0, 1, 2, 3, 4, 3, 2, 1][e] % up.length] : nil, 0.45]
                 when :pre then [s.even? || bar == 27 ? two[(bar == 27 ? s : e) % two.length] : nil, 0.35 + s * 0.01]
                 when :break then [s.even? && (bar * 8 + e) % 3 == 0 ? up[((bar * 8 + e) / 3) % up.length] + 12 : nil, 0.4]
                 when :build then [two[s % two.length] + ((bar - 56) / 3) * 12, 0.3 + (bar - 56) * 0.04]
                 when :final then [up[[0, 2, 1, 3, 2, 4, 3, 1][s % 8] % up.length] + 12, 0.42]
                 when :outro then [s % 4 == 0 ? up[(s / 4) % up.length] + 12 : nil, 0.35 - (bar - 82) * 0.07]
                 else [s.even? ? up[[0, 2, 1, 3, 2, 4, 3, 1][e] % up.length] : nil, 0.5]
                 end
          play n, amp: hum.(a), coef: 0.3, pan: (s.even? ? -0.35 : 0.35) if n
          sleep 0.25
        end
      end
    end
  end
end if stem?(:arp)

# --- Solo (solo en el estribillo final) ---------------------------------------
in_thread do
  with_fx :reverb, room: 0.7, mix: 0.3 do
    with_fx :echo, phase: 0.75, decay: 1.5, mix: 0.15 do
      use_synth :supersaw
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        if sec == :final
          parse_line(solo[bar - 74]).each do |n, d|
            play n, attack: 0.01, sustain: d * 0.6, release: [d * 0.4, 0.12].max, cutoff: 104, amp: hum.(0.35) if n
            sleep d
          end
        else
          sleep 4
        end
      end
    end
  end
end if stem?(:solo)
