# Stretto · Nivel 1 · "Salida del centro" · synth-pop en re menor
# @bpm 100
# @bars 54
# @final 46
#
# Secciones alineadas con las líneas de cambio del nivel (src/game/song.ts):
# intro 0-1 · estrofa 2-13 · pre 14-15 · estribillo 16-23 · break 24-31 · subida 32-35 ·
# estribillo 36-39 · puente 40-45 · estribillo final 46-53 (aquí entra el solo).
#
# Armonía: novenas y séptimas con las voces casi quietas de un acorde a otro, la7 antes de
# cada estribillo, cadencia rota (la7 → sib) al salir de la subida y un puente que sube por
# grados desde mi bemol (préstamo frigio). Melodía y solo van en texto, un compás por cadena.

use_bpm 100
use_debug false
use_transpose (get(:transpose) || 0)
# Se lee una vez: get() no es instantáneo y saltar compases con él retrasa los hilos.
from_bar = get(:from_bar) || 0

plan = stretto_plan([[:intro, 2], [:verse, 12], [:pre, 2], [:chorus, 8], [:break, 8],
                     [:build, 4], [:chorus, 4], [:bridge, 6], [:final, 8]])

# Cada acorde: [bajo, voces del colchón]. Los terminados en b son los del puente, con el
# bajo una octava más arriba para que suba por grados.
harm = {
  dm9: [:d2, [:f3, :a3, :c4, :e4]],      bbm9: [:bb1, [:f3, :a3, :c4, :d4]],
  f9: [:f2, [:f3, :g3, :a3, :c4]],       fa: [:a1, [:f3, :a3, :c4, :e4]],
  csus2: [:c2, [:g3, :c4, :d4]],         csus4: [:c2, [:f3, :g3, :c4]],
  c: [:c2, [:g3, :c4, :e4]],             c6: [:c2, [:g3, :a3, :c4, :e4]],
  gm7: [:g1, [:f3, :bb3, :d4]],          gm9: [:g1, [:f3, :a3, :bb3, :d4]],
  a7sus: [:a1, [:g3, :d4, :e4]],         a7: [:a1, [:g3, :cs4, :e4]],
  bbmaj7: [:bb1, [:f3, :a3, :bb3, :d4]], dm7: [:d2, [:f3, :a3, :c4, :d4]],
  am7: [:a1, [:g3, :a3, :c4, :e4]],      dmadd9: [:d2, [:f3, :a3, :d4, :e4]],
  bbmaj7s11: [:bb1, [:f3, :a3, :d4, :e4]], c9sus: [:c2, [:f3, :bb3, :d4]],
  bb6: [:bb1, [:g3, :bb3, :d4, :f4]],    ebmaj7: [:eb2, [:g3, :bb3, :d4]],
  f6: [:f2, [:f3, :a3, :c4, :d4]],       gm7b: [:g2, [:f3, :bb3, :d4]],
  am7b: [:a2, [:g3, :c4, :e4]],          bbmaj7b: [:bb2, [:f3, :a3, :d4]],
  a7susb: [:a2, [:g3, :d4, :e4]],        a7b: [:a2, [:g3, :cs4, :e4]],
}

# Un acorde por compás, o dos (de dos tiempos cada uno).
prog = [
  [:dm9], [:bbm9],
  [:dm9], [:bbm9], [:f9], [:csus2, :c],
  [:dm9], [:bbm9], [:fa], [:gm7, :c],
  [:dm9], [:bbm9], [:f9], [:csus4, :c],
  [:gm9], [:a7sus, :a7],
  [:bbmaj7], [:c6], [:dm7], [:am7], [:bbmaj7], [:c], [:gm7], [:a7],
  [:dmadd9], [:dmadd9], [:bbmaj7s11], [:bbmaj7s11], [:gm9], [:gm9], [:c9sus], [:a7sus, :a7],
  [:gm7], [:bb6], [:csus4, :c], [:a7],
  [:bbmaj7], [:c6], [:dm7], [:dm7, :c],
  [:ebmaj7], [:f6], [:gm7b], [:am7b], [:bbmaj7b], [:a7susb, :a7b],
  [:bbmaj7], [:c6], [:dm7], [:am7], [:bbmaj7], [:c], [:gm7, :a7], [:dm9],
]

chord_at = lambda { |bar, beat| e = prog[bar] || prog[-1]; harm[e.length > 1 && beat >= 2 ? e[1] : e[0]] }
root_at = lambda { |bar, beat| note(chord_at.(bar, beat)[0]) }
voices_at = lambda { |bar, beat| chord_at.(bar, beat)[1].map { |n| note(n) } }
# Trozos del compás con el mismo acorde: [tiempo de inicio, duración, voces].
parts_of = lambda { |bar| prog[bar].length > 1 ? [[0, 2, voices_at.(bar, 0)], [2, 2, voices_at.(bar, 2)]] : [[0, 4, voices_at.(bar, 0)]] }
hum = lambda { |a| a * rrand(0.88, 1.04) }

# Estribillo: el ritmo 3+3+2 de la cabeza se repite en cada frase.
ch = [
  "d5:0.75 d5:0.75 f5:0.5 a5:1 g5:0.5 f5:0.5",
  "e5:0.75 e5:0.75 g5:0.5 e5:1 c5:1",
  "d5:0.75 d5:0.75 f5:0.5 a5:0.5 c6:0.5 a5:0.5 g5:0.5",
  "a5:1.5 g5:0.5 e5:1 r:1",
  "d5:0.75 d5:0.75 f5:0.5 a5:1 bb5:0.5 a5:0.5",
  "g5:0.75 e5:0.75 g5:0.5 c6:1 bb5:0.5 a5:0.5",
  "g5:1 f5:0.5 d5:0.5 bb4:1 d5:1",
  "cs5:1.5 e5:0.5 a4:2",
]
verse_a = "r:1 a4:0.5 c5:0.5 d5:0.75 c5:0.25 a4:0.5 g4:0.5"

mel = [
  "r:4", "r:4",
  # estrofa: pregunta, respuesta y la tercera frase más aguda
  verse_a,
  "f4:1.5 g4:0.5 a4:1 r:1",
  "r:0.5 c5:0.5 c5:0.5 a4:0.5 c5:0.75 d5:0.25 c5:0.5 a4:0.5",
  "g4:2 e4:1 r:1",
  verse_a,
  "f4:1.5 g4:0.5 a4:0.5 bb4:0.5 a4:0.5 f4:0.5",
  "e4:0.5 f4:0.5 a4:1 c5:1.5 r:0.5",
  "bb4:1 a4:0.5 g4:0.5 e4:1.5 r:0.5",
  "r:0.5 d5:0.5 e5:0.5 f5:0.5 e5:0.75 d5:0.25 c5:0.5 a4:0.5",
  "d5:1.5 c5:0.5 d5:1 f5:1",
  "e5:0.5 c5:0.5 a4:1 c5:0.5 a4:0.5 g4:0.5 f4:0.5",
  "g4:1.5 f4:0.5 g4:2",
  # pre
  "bb4:0.5 a4:0.5 bb4:0.5 d5:0.5 f5:1 e5:0.5 d5:0.5",
  "d5:1 e5:1 cs5:0.5 e5:0.5 a5:1",
  *ch,
  # break: ecos sueltos de la cabeza
  "r:2 a4:1 d5:1", "e5:3 r:1", "r:2 f5:1 e5:1", "d5:3 r:1",
  "r:2 bb4:1 d5:1", "f5:3 r:1", "r:2 g4:1 c5:1", "d5:2 cs5:2",
  # subida: la misma figura cada vez más arriba
  "d5:0.5 d5:0.5 d5:0.5 f5:0.5 g5:1 f5:1",
  "f5:0.5 f5:0.5 f5:0.5 g5:0.5 bb5:1 g5:1",
  "f5:0.5 g5:0.5 f5:0.5 g5:0.5 e5:0.5 g5:0.5 c6:1",
  "e5:0.5 a5:0.5 cs6:0.5 e6:0.5 d6:0.5 cs6:0.5 a5:1",
  ch[0], ch[1], ch[2], "a5:1.5 g5:0.5 e5:1 g5:1",
  # puente: notas largas, contra el estribillo
  "g5:2 f5:1 d5:1",
  "c5:1.5 d5:0.5 f5:2",
  "bb5:2 a5:1 f5:1",
  "e5:1.5 g5:0.5 c6:2",
  "d6:1 c6:0.5 bb5:0.5 a5:1 f5:1",
  "d5:1 e5:1 e5:0.5 g5:0.5 cs6:0.5 e6:0.5",
  # estribillo final: cierra en re
  *ch[0, 6], "g5:1 f5:0.5 d5:0.5 cs5:1 e5:1", "d5:4",
]

solo = [
  "f6:1.5 d6:0.5 a5:0.5 bb5:0.5 c6:0.5 d6:0.5",
  "e6:2 g6:0.5 e6:0.5 c6:0.5 d6:0.5",
  "f6:1.5 e6:0.25 d6:0.25 c6:0.5 a5:0.5 c6:0.5 d6:0.5",
  "e6:2 r:0.5 e6:0.25 g6:0.25 a6:1",
  "bb6:1 a6:0.5 f6:0.5 d6:0.5 f6:0.5 a6:1",
  "g6:1.5 e6:0.5 c6:0.25 d6:0.25 e6:0.25 g6:0.25 c7:1",
  "a6:0.5 g6:0.5 e6:0.5 cs6:0.5 e6:0.5 g6:0.5 bb6:0.5 a6:0.5",
  "d6:0.5 e6:0.5 f6:0.5 a6:0.5 d7:2",
]

stretto_click [:dsaw, :prophet, :blade, :pluck, :supersaw, :hollow, :bnoise],
              [:drum_splash_soft, :drum_splash_hard, :bd_haus, :sn_dolf, :perc_snap, :drum_snare_hard,
               :drum_snare_soft, :drum_cymbal_closed, :drum_cymbal_open, :drum_cymbal_pedal,
               :drum_tom_hi_hard, :drum_tom_mid_hard, :drum_tom_lo_hard, :drum_tom_mid_soft, :drum_tom_lo_soft]

# --- Batería ----------------------------------------------------------------
# Bombo, platos y subidas de ruido en un hilo; caja, palmas y toms con algo de sala en otro.
# Los golpes saturaban la grabación (un 3% de muestras a 1,0): todo a -9 dB, el grabador
# recupera el nivel después.
in_thread do
  with_fx :level, amp: 0.35 do
    with_fx :compressor, threshold: 0.4, clamp_time: 0.01 do
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        first = bar == 0 || plan[bar - 1] != sec
        sample :drum_splash_hard, amp: 0.45 if (first && [:chorus, :final].include?(sec)) || bar == 50 || bar == 53
        sample :drum_splash_soft, amp: 0.4 if first && [:verse, :break, :bridge].include?(sec)
        if [15, 35, 45].include?(bar)
          nz = synth :bnoise, attack: 3.6, sustain: 0, release: 0.3, cutoff: 60, cutoff_slide: 3.8, amp: 0.18
          control nz, cutoff: 118
        end
        kicks = case sec
                when :intro then bar == 0 ? [0, 8] : [0, 4, 8, 12]
                when :verse then bar.even? ? [0, 6, 8] : [0, 6, 8, 11, 14]
                when :pre then bar == 15 ? [0, 4, 8, 10, 12, 14] : [0, 4, 8, 12]
                when :break then [0, 10]
                when :build then bar == 35 ? [0, 2, 4, 6, 8, 10, 12, 14] : [0, 4, 8, 12]
                else bar % 4 == 3 ? [0, 4, 8, 12, 15] : [0, 4, 8, 12]
                end
        kicks = [0] if bar == 53
        16.times do |s|
          sample :bd_haus, amp: hum.(sec == :bridge ? 1.3 : 1.6), cutoff: 110 if kicks.include?(s)
          unless bar == 53
            case sec
            when :intro
              sample :drum_cymbal_closed, amp: hum.(0.12 + bar * 0.08), rate: 1.3 if s.even?
            when :verse
              sample :drum_cymbal_closed, amp: hum.(s % 4 == 2 ? 0.32 : 0.18), rate: 1.3 if s.even?
              sample :drum_cymbal_closed, amp: 0.1, rate: 1.4 if s == 15 && bar.odd?
              sample :drum_cymbal_open, amp: 0.2, release: 0.2, rate: 1.1 if s == 14 && bar % 4 == 1
            when :pre, :build
              lift = sec == :build ? (bar - 32) * 0.05 : (bar - 14) * 0.04
              sample :drum_cymbal_closed, amp: hum.(0.12 + lift + s * 0.006), rate: 1.3
            when :break
              sample :drum_cymbal_closed, amp: hum.(0.14), rate: 1.2 if s % 4 == 2
              sample :drum_cymbal_open, amp: 0.16, release: 0.4 if s == 14 && bar.odd?
            when :bridge
              sample :drum_cymbal_pedal, amp: hum.(0.25) if s % 4 == 0
              sample :drum_cymbal_closed, amp: hum.(0.22), rate: 1.3 if s % 4 == 2
            else
              if s % 4 == 2
                sample :drum_cymbal_open, amp: hum.(0.26), release: 0.15, rate: 1.1
              else
                sample :drum_cymbal_closed, amp: hum.(s.even? ? 0.24 : 0.12), rate: 1.3
              end
            end
          end
          sleep 0.25
        end
      end
    end
  end
end if stem?(:drums)

in_thread do
  # Más bajo que el bombo: en los estribillos coinciden bombo, tres cajas y platos.
  with_fx :level, amp: 0.3 do
    with_fx :reverb, room: 0.45, mix: 0.2 do
      fills = [:snare, :toms, :flam]
      nfill = 0
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        fill = nil
        if section_end?(plan, bar) && [:verse, :chorus, :break, :bridge].include?(sec)
          fill = fills[nfill % 3]
          nfill += 1
        end
        # Remate corto cada 4 compases de estrofa.
        mini = sec == :verse && bar % 4 == 1 && fill.nil?
        16.times do |s|
          if bar == 53
            # el último compás suena solo con el platillo y el bombo
          elsif fill && s >= (fill == :snare ? 12 : 8)
            case fill
            when :snare
              sample :sn_dolf, amp: 0.45 + (s - 12) * 0.15
            when :toms
              t = {8 => :drum_tom_hi_hard, 10 => :drum_tom_hi_hard, 11 => :drum_tom_mid_hard, 12 => :drum_tom_mid_hard,
                   13 => :drum_tom_mid_hard, 14 => :drum_tom_lo_hard, 15 => :drum_tom_lo_hard}[s]
              sample t, amp: 0.55 if t
              sample :sn_dolf, amp: 0.8 if s == 12
            else
              if [8, 10, 12, 13, 14, 15].include?(s)
                sample :sn_dolf, amp: 0.4 + (s - 8) * 0.07
                sample :drum_snare_hard, amp: 0.15 + (s - 8) * 0.03
              end
            end
          elsif mini && s >= 14
            sample :sn_dolf, amp: (s == 14 ? 0.25 : 0.4)
          else
            case sec
            when :intro
              sample :sn_dolf, amp: 0.5 if bar == 1 && (s == 4 || s == 12)
              sample :sn_dolf, amp: 0.3 + (s - 13) * 0.12 if bar == 1 && s >= 13
            when :verse
              if s == 4 || s == 12
                sample :sn_dolf, amp: hum.(0.9)
                sample :perc_snap, amp: hum.(0.4)
              end
              sample :drum_snare_soft, amp: 0.12 if bar.odd? && (s == 7 || s == 10)
            when :pre
              if bar == 14
                sample :sn_dolf, amp: hum.(0.85) if s == 4 || s == 12 || s == 14
              else
                sample :sn_dolf, amp: 0.3 + s * 0.045 if s >= 8 || s.even?
              end
            when :break
              if s == 8
                sample :sn_dolf, amp: hum.(0.95), rate: 0.92
                sample :perc_snap, amp: 0.25
              end
              sample :drum_snare_soft, amp: 0.1 if s == 15 && bar.odd?
            when :build
              k = bar - 32
              hit = [s % 4 == 0, s.even?, true, s < 15][k]
              sample :sn_dolf, amp: 0.4 + k * 0.1 + s * 0.012, rate: 1 + (k == 3 ? s * 0.025 : 0) if hit
            when :bridge
              sample :sn_dolf, amp: hum.(0.7) if s == 4 || s == 12
              sample :drum_tom_lo_soft, amp: hum.(0.45) if s == 6 || s == 15
              sample :drum_tom_mid_soft, amp: hum.(0.35) if s == 10
            else
              if s == 4 || s == 12
                sample :sn_dolf, amp: hum.(0.9)
                sample :perc_snap, amp: hum.(0.45)
                sample :drum_snare_hard, amp: hum.(0.22)
              end
              sample :drum_snare_soft, amp: 0.12 if s == 10 && bar.odd?
            end
          end
          sleep 0.25
        end
      end
    end
  end
end if stem?(:drums)

# --- Bajo -------------------------------------------------------------------
# Patrones en semicorcheas: [paso, nota, duración]. r raíz, o octava, f quinta y a nota de
# paso cromática hacia la raíz del compás siguiente.
in_thread do
  # Saturaba la grabación (un 3% de muestras a 1,0): a -8 dB, el grabador recupera el nivel.
  with_fx :level, amp: 0.4 do
    use_synth :dsaw
    pats = {
      intro: [[0, :r, 12], [12, :f, 2], [14, :a, 2]],
      verse: [[0, :r, 3], [3, :r, 1], [6, :r, 2], [8, :r, 2], [10, :o, 1], [11, :r, 2], [14, :a, 2]],
      pre: [[0, :r, 1], [2, :r, 1], [4, :r, 1], [6, :r, 1], [8, :r, 1], [10, :r, 1], [12, :o, 1], [14, :a, 1]],
      chorus: [[0, :r, 2], [2, :o, 1], [4, :r, 2], [6, :o, 1], [8, :r, 2], [10, :o, 1], [12, :r, 1], [13, :r, 1],
               [14, :o, 1], [15, :a, 1]],
      break: [[0, :r, 12], [12, :f, 2], [14, :o, 2]],
      build: (0..15).map { |s| [s, s % 4 == 2 ? :o : :r, 1] },
      bridge: [[0, :r, 6], [6, :r, 2], [8, :f, 4], [12, :o, 2], [14, :a, 2]],
    }
    pats[:final] = pats[:chorus]
    cuts = {intro: 60, verse: 72, pre: 76, chorus: 82, break: 62, build: 66, bridge: 74, final: 88}
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      pat = pats[sec]
      pat = [[0, :r, 16]] if bar == 0 || bar == 53 || (sec == :break && bar.even?)
      pos = 0
      pat.each do |s, kind, len|
        sleep (s - pos) * 0.25
        pos = s
        r = root_at.(bar, s / 4)
        nxt = root_at.(bar + 1, 0)
        n = case kind
            when :o then r + 12
            when :f then r + 7
            when :a then nxt == r ? r + 7 : nxt + (nxt < r ? 1 : -1)
            else r
            end
        d = len * 0.25
        long = len >= 8
        cut = cuts[sec] + (sec == :build ? (bar - 32) * 6 + s * 0.5 : 0)
        play n, attack: (long ? 0.1 : 0.005), sustain: d * (long ? 0.75 : 0.55), release: (long ? d * 0.3 : 0.08),
             cutoff: cut, detune: 0.12, amp: hum.(kind == :o ? 0.7 : 0.85) * (long ? 0.5 : 1)
      end
      sleep (16 - pos) * 0.25
    end
  end
end if stem?(:bass)

# --- Acordes ----------------------------------------------------------------
in_thread do
  with_fx :reverb, room: 0.8, mix: 0.4 do
    use_synth :prophet
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      parts = parts_of.(bar)
      if bar == 53
        v = voices_at.(bar, 0)
        play v + [v.last + 12], attack: 0.1, sustain: 3, release: 3, cutoff: 85, amp: 0.28
        sleep 4
        next
      end
      case sec
      when :chorus, :final
        # El colchón respira en cada tiempo, con la voz de arriba doblada a la octava, y
        # golpes cortos a contratiempo.
        16.times do |s|
          v = voices_at.(bar, s / 4)
          if s % 4 == 0
            play v + [v.last + 12], attack: 0.06, sustain: 0.6, release: 0.5, cutoff: (sec == :final ? 95 : 88), amp: hum.(sec == :final ? 0.55 : 0.45)
          end
          play v, release: 0.12, cutoff: 105, amp: hum.(0.2) if s == 6 || s == 14 || (s == 11 && bar.odd?)
          sleep 0.25
        end
      when :pre
        parts.each do |t, d, v|
          c0 = 68 + (bar - 14) * 20 + t * 5
          nd = play v, attack: 0.2, sustain: d - 0.2, release: 0.4, cutoff: c0, cutoff_slide: d, amp: 0.26 + (bar - 14) * 0.05
          control nd, cutoff: c0 + d * 5
          sleep d
        end
      when :break
        parts.each do |t, d, v|
          play v, attack: d * 0.3, sustain: d * 0.5, release: d * 0.6, cutoff: 64, amp: 0.22
          with_synth(:hollow) { play v.map { |n| n + 12 }, attack: d * 0.4, sustain: d * 0.4, release: d * 0.7, amp: 0.3 }
          sleep d
        end
      when :build
        16.times do |s|
          v = voices_at.(bar, s / 4)
          play v, release: 0.35, cutoff: 70 + ((bar - 32) * 16 + s) * 0.65, amp: hum.(0.6) if s.even?
          sleep 0.25
        end
      when :bridge
        parts.each do |t, d, v|
          play v, attack: 0.3, sustain: d - 0.3, release: 1, cutoff: 80, amp: 0.26
          with_synth(:hollow) { play v.map { |n| n + 12 }, attack: 0.5, sustain: d - 0.5, release: 1.2, amp: 0.4 }
          (d / 2).times do
            sleep 1
            play v, release: 0.2, cutoff: 95, amp: 0.12
            sleep 1
          end
        end
      else
        # Intro y estrofa: colchón que se abre un poco en cada acorde; en la última frase de
        # la estrofa, golpes a contratiempo para empujar hacia el pre.
        stabs = sec == :verse && bar >= 10
        parts.each do |t, d, v|
          a = d > 2 ? 0.6 : 0.3
          nd = play v, attack: a, sustain: d - a, release: (d > 2 ? 1.2 : 0.8), cutoff: 72, cutoff_slide: d, amp: 0.3
          control nd, cutoff: 82
          if stabs
            d.times do
              sleep 0.5
              play v, release: 0.15, cutoff: 92, amp: 0.13
              sleep 0.5
            end
          else
            sleep d
          end
        end
      end
    end
  end
end if stem?(:chords)

# --- Melodía ----------------------------------------------------------------
in_thread do
  with_fx :reverb, room: 0.6, mix: 0.3 do
    with_fx :echo, phase: 0.75, decay: 2, mix: 0.18 do
      use_synth :blade
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        parse_line(mel[bar]).each do |n, d|
          if n
            play n, attack: 0.01, sustain: d * 0.65, release: [d * 0.35, 0.15].max, cutoff: (sec == :final ? 108 : 100),
                 vibrato_depth: (d >= 1.5 ? 0.15 : 0.04), vibrato_delay: 0.3, amp: hum.(0.55)
          end
          sleep d
        end
      end
    end
  end
end if stem?(:melody)

# --- Arpegio ----------------------------------------------------------------
# Cada sección tiene su dibujo; en el break va a 3 contra 4 (una nota cada 3 semicorcheas)
# y en el puente en tresillos.
in_thread do
  with_fx :echo, phase: 0.75, decay: 2, mix: 0.22 do
    use_synth :pluck
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      if sec == :bridge
        12.times do |t|
          v = voices_at.(bar, t / 3)
          up = v.map { |n| n + 12 } + [v[0] + 24]
          play up[[0, 1, 2, 3, 2, 1][t % 6] % up.length], amp: hum.(0.45), coef: 0.35, pan: (t.even? ? -0.35 : 0.35)
          sleep 4.0 / 12
        end
        next
      end
      16.times do |s|
        v = voices_at.(bar, s / 4)
        up = v.map { |n| n + 12 } + [v[0] + 24]
        two = v.map { |n| n + 12 } + v.map { |n| n + 24 }
        g = bar * 16 + s
        n, a = case sec
               when :intro then [s.even? ? up[(s / 2) % up.length] : nil, 0.3 + bar * 0.1]
               when :verse then [s.even? ? up[[0, 1, 2, 3, 4, 3, 2, 1][s / 2] % up.length] : nil, 0.45]
               when :pre then [two[s % 8 % two.length], 0.35 + s * 0.015]
               when :break then [g % 3 == 0 ? up[(g / 3) % up.length] + 12 : nil, 0.65]
               when :build then [up[s % 4 % up.length] + ((bar - 32) / 2) * 12, 0.35 + (bar - 32) * 0.06]
               else [up[[0, 2, 1, 3, 2, 4, 3, 1][s % 8] % up.length], sec == :final ? 0.55 : 0.48]
               end
        n = s < 8 ? two[s % two.length] : nil if bar == 53
        play n, amp: hum.(a), coef: 0.35, pan: (s.even? ? -0.35 : 0.35) if n
        sleep 0.25
      end
    end
  end
end if stem?(:arp)

# --- Solo (solo en el estribillo final) --------------------------------------
in_thread do
  with_fx :reverb, room: 0.7, mix: 0.3 do
    with_fx :echo, phase: 0.75, decay: 1.5, mix: 0.15 do
      use_synth :supersaw
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        if sec == :final
          parse_line(solo[bar - 46]).each do |n, d|
            play n, attack: 0.01, sustain: d * 0.6, release: [d * 0.4, 0.12].max, cutoff: 102, amp: hum.(0.4) if n
            sleep d
          end
        else
          sleep 4
        end
      end
    end
  end
end if stem?(:solo)
