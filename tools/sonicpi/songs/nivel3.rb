# Stretto · Nivel 3 · "Desierto" · house progresivo en sol menor
# @bpm 124
# @bars 64
# @final 56
#
# Las secciones son las mismas que src/game/levels.ts usa para generar las líneas de cambio:
# intro 0-3 · estrofa 4-19 · pre 20-23 · estribillo 24-31 · break 32-39 · subida 40-43 ·
# estribillo 44-51 · puente 52-55 · estribillo final 56-63 (aquí entra el solo).
#
# Armonía: la estrofa crece de frase en frase (la tercera baja por grados sol, fa, mi bemol y
# la cuarta acaba en re7), el estribillo sube mi bemol → fa → sol-9 y el break pasa por
# la bemol maj7 (préstamo frigio) antes de re7. Las capas se abren de filtro a lo largo de la
# estrofa, como en el house progresivo. Melodía y solo van en texto, un compás por cadena.

use_bpm 124
use_debug false
use_transpose (get(:transpose) || 0)
# Se lee una vez: get() no es instantáneo y saltar compases con él retrasa los hilos.
from_bar = get(:from_bar) || 0

plan = stretto_plan([[:intro, 4], [:verse, 16], [:pre, 4], [:chorus, 8], [:break, 8],
                     [:build, 4], [:chorus, 8], [:bridge, 4], [:final, 8]])

# Cada acorde: [bajo, voces].
harm = {
  gm9: [:g2, [:bb3, :d4, :f4, :a4]],      ebmaj7: [:eb2, [:bb3, :d4, :g4]],
  ebmaj9: [:eb2, [:bb3, :d4, :f4, :g4]],  bbadd9: [:bb1, [:bb3, :c4, :d4, :f4]],
  fsus4: [:f2, [:bb3, :c4, :f4]],         f: [:f2, [:a3, :c4, :f4]],
  fadd9: [:f2, [:a3, :c4, :f4, :g4]],     bb_d: [:d2, [:bb3, :d4, :f4]],
  cm7: [:c2, [:bb3, :eb4, :g4]],          cm9: [:c2, [:bb3, :d4, :eb4, :g4]],
  gm_f: [:f2, [:bb3, :d4, :g4]],          d7: [:d2, [:a3, :c4, :fs4]],
  dsus: [:d2, [:a3, :c4, :g4]],           dm7: [:d2, [:a3, :c4, :f4]],
  ebmaj7s11: [:eb2, [:bb3, :d4, :g4, :a4]], abmaj7: [:ab1, [:c4, :eb4, :g4]],
}

chorus_prog = [[:ebmaj9], [:fadd9], [:gm9], [:bb_d], [:ebmaj9], [:fadd9], [:cm9, :d7], [:gm9]]
prog = [
  [:gm9], [:gm9], [:ebmaj9], [:fsus4, :f],
  [:gm9], [:ebmaj7], [:bbadd9], [:fsus4, :f],
  [:gm9], [:ebmaj7], [:bb_d], [:cm7, :f],
  [:gm9], [:gm_f], [:ebmaj7], [:cm9, :d7],
  [:ebmaj7], [:dm7], [:cm9], [:dsus, :d7],
  [:cm9], [:ebmaj9], [:fsus4], [:f],
  *chorus_prog,
  [:cm9], [:cm9], [:ebmaj7s11], [:ebmaj7s11], [:abmaj7], [:abmaj7], [:dsus], [:d7],
  [:ebmaj7], [:fadd9], [:gm9], [:fsus4, :f],
  *chorus_prog,
  [:ebmaj9], [:dm7], [:cm9], [:dsus, :d7],
  *chorus_prog,
]

chord_at = lambda { |bar, beat| e = prog[bar] || prog[-1]; harm[e.length > 1 && beat >= 2 ? e[1] : e[0]] }
root_at = lambda { |bar, beat| note(chord_at.(bar, beat)[0]) }
voices_at = lambda { |bar, beat| chord_at.(bar, beat)[1].map { |n| note(n) } }
parts_of = lambda { |bar| prog[bar].length > 1 ? [[0, 2, voices_at.(bar, 0)], [2, 2, voices_at.(bar, 2)]] : [[0, 4, voices_at.(bar, 0)]] }
hum = lambda { |a| a * rrand(0.88, 1.04) }
# Avance de 0 a 1 dentro de la estrofa (compases 4-19): el filtro se va abriendo.
grow = lambda { |bar| [[(bar - 4) / 15.0, 0].max, 1].min }

ch = [
  "g5:0.5 bb5:1 d6:0.5 bb5:1 f5:1",
  "a5:0.5 c6:1 f6:0.5 c6:1 g5:1",
  "bb5:0.5 a5:1 g5:0.5 d5:1 f5:1",
  "f5:0.5 d5:2.5 r:1",
  "g5:0.5 bb5:1 d6:0.5 eb6:1 d6:1",
  "c6:0.5 f6:1 g6:0.5 f6:1 c6:1",
  "eb6:1 d6:1 c6:0.5 a5:0.5 fs5:1",
  "g5:3 r:1",
]
verse_a = "d5:1.5 bb4:0.5 r:0.5 g4:0.5 a4:0.5 bb4:0.5"

mel = [
  "r:4", "r:4", "r:4", "r:4",
  # estrofa: cuatro frases, cada una un poco más arriba
  verse_a, "g4:2 r:0.5 bb4:0.5 d5:0.5 f5:0.5", "d5:1.5 c5:0.5 bb4:1 c5:1", "c5:2 a4:2",
  verse_a, "g4:1.5 bb4:0.5 eb5:1 d5:1", "f5:1.5 d5:0.5 bb4:1 d5:1", "eb5:1 c5:1 c5:0.5 a4:0.5 f4:1",
  "bb5:1.5 a5:0.5 g5:1 d5:1", "f5:2 d5:1 bb4:1", "g5:1.5 f5:0.5 eb5:1 d5:1", "eb5:1 d5:1 c5:0.5 a4:0.5 fs4:1",
  "g4:1 bb4:1 d5:1.5 eb5:0.5", "f5:2 d5:1 a4:1", "g5:1.5 f5:0.5 eb5:1 d5:1", "g5:1 a5:1 fs5:2",
  # pre
  "g5:0.5 g5:0.5 eb5:0.5 g5:0.5 bb5:1 g5:1",
  "bb5:0.5 bb5:0.5 g5:0.5 bb5:0.5 d6:1 bb5:1",
  "c6:0.5 c6:0.5 bb5:0.5 c6:0.5 f6:1 c6:1",
  "a5:1 c6:1 f6:2",
  *ch,
  # break: notas sueltas que dejan sitio al colchón
  "r:1 g5:1 eb5:1 d5:1", "c5:3 r:1", "r:1 bb5:1 a5:1 g5:1", "d5:3 r:1",
  "r:1 c6:1 bb5:1 g5:1", "eb5:3 r:1", "r:1 a5:1 g5:1 d5:1", "fs5:2 a5:1 c6:1",
  # subida
  "bb4:0.5 bb4:0.5 d5:0.5 bb4:0.5 g5:1 d5:1",
  "c5:0.5 c5:0.5 f5:0.5 c5:0.5 a5:1 g5:1",
  "d5:0.5 d5:0.5 g5:0.5 d5:0.5 bb5:1 a5:1",
  "bb5:0.5 c6:0.5 bb5:0.5 c6:0.5 a5:0.5 c6:0.5 f6:1",
  *ch,
  # puente
  "bb5:2 g5:2", "a5:2 f5:2", "g5:2 eb5:1 d5:1", "g5:1 a5:1 fs5:1 a5:1",
  # estribillo final
  *ch[0, 7], "g5:4",
]

solo = [
  "bb5:0.25 d6:0.25 g6:0.25 bb6:0.25 a6:0.5 g6:0.5 f6:0.5 d6:0.5 g6:1",
  "a5:0.25 c6:0.25 f6:0.25 a6:0.25 g6:0.5 f6:0.5 c6:0.5 a5:0.5 g6:1",
  "bb6:1 a6:0.5 g6:0.5 d6:1 f6:0.5 g6:0.5",
  "f6:1.5 d6:0.5 bb5:0.5 d6:0.5 f6:1",
  "g6:0.25 bb6:0.25 d7:0.5 c7:0.5 bb6:0.5 g6:0.5 f6:0.5 g6:1",
  "a6:0.25 c7:0.25 f7:0.5 c7:0.5 a6:0.5 g6:0.5 f6:0.5 g6:1",
  "eb7:0.5 d7:0.5 c7:0.5 g6:0.5 fs6:0.5 a6:0.5 c7:0.5 d7:0.5",
  "bb6:0.5 a6:0.5 g6:3",
]

stretto_click [:tb303, :supersaw, :hollow, :blade, :pluck, :bnoise],
              [:drum_splash_soft, :drum_splash_hard, :bd_tek, :perc_snap, :sn_dolf, :drum_snare_hard,
               :drum_snare_soft, :drum_cymbal_open, :drum_cymbal_closed, :drum_cymbal_pedal,
               :drum_tom_hi_hard, :drum_tom_mid_hard, :drum_tom_lo_hard]

# --- Batería ----------------------------------------------------------------
# Bombo, platos y barridos de ruido en un hilo; palmas, caja y toms con sala en otro.
# Todo a -9 dB: a nivel 1 los golpes saturan la grabación y el grabador recupera el nivel.
in_thread do
  with_fx :level, amp: 0.35 do
    with_fx :compressor, threshold: 0.4, clamp_time: 0.01 do
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        first = bar == 0 || plan[bar - 1] != sec
        sample :drum_splash_hard, amp: 0.45 if (first && [:chorus, :final].include?(sec)) || bar == 60 || bar == 63
        sample :drum_splash_soft, amp: 0.4 if (first && [:verse, :break, :bridge].include?(sec)) || bar == 12
        # Barridos de ruido: 4 compases antes de cada estribillo, 1 antes de la subida y del final.
        if [20, 40].include?(bar) || [39, 55].include?(bar)
          len = [20, 40].include?(bar) ? 16 : 4
          nz = synth :bnoise, attack: len - 0.4, sustain: 0, release: 0.3, cutoff: 55, cutoff_slide: len - 0.2, amp: 0.16
          control nz, cutoff: 120
        end
        kicks = case sec
                when :break then bar < 38 ? [] : [0, 4, 8, 12]
                when :pre then bar == 23 ? [0, 4, 8] : [0, 4, 8, 12]
                when :build then bar == 43 ? [0, 2, 4, 6, 8, 10, 12, 14] : [0, 4, 8, 12]
                else [0, 4, 8, 12]
                end
        kicks = [0] if bar == 63
        kcut = sec == :break ? 70 + (bar - 38) * 15 : 100
        16.times do |s|
          sample :bd_tek, amp: hum.(1.6), cutoff: kcut if kicks.include?(s)
          unless bar == 63
            if sec == :break
              sample :drum_cymbal_closed, amp: hum.(0.12), rate: 1.4 if s.even?
            else
              sample :drum_cymbal_open, amp: hum.([:chorus, :final].include?(sec) ? 0.32 : 0.26), release: 0.18 if s % 4 == 2 && !(sec == :intro && bar < 2)
              sample :drum_cymbal_closed, amp: hum.([0.1, 0.18, 0.12, 0.2][s % 4]), rate: 1.4
              sample :drum_cymbal_pedal, amp: hum.(0.14) if [:chorus, :final].include?(sec) && s.odd?
            end
          end
          sleep 0.25
        end
      end
    end
  end
end if stem?(:drums)

in_thread do
  with_fx :level, amp: 0.3 do
    with_fx :reverb, room: 0.6, mix: 0.25 do
      fills = [:snare, :toms, :flam]
      nfill = 0
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        fill = nil
        if section_end?(plan, bar) && [:verse, :chorus, :bridge].include?(sec)
          fill = fills[nfill % 3]
          nfill += 1
        end
        mini = sec == :verse && bar % 8 == 3 && fill.nil?
        16.times do |s|
          back = s == 4 || s == 12
          if bar == 63
            # el último compás suena solo con el platillo y el bombo
          elsif fill && s >= (fill == :snare ? 12 : 8)
            case fill
            when :snare
              sample :sn_dolf, amp: 0.4 + (s - 12) * 0.15
            when :toms
              t = {8 => :drum_tom_hi_hard, 10 => :drum_tom_hi_hard, 11 => :drum_tom_mid_hard, 12 => :drum_tom_mid_hard,
                   13 => :drum_tom_mid_hard, 14 => :drum_tom_lo_hard, 15 => :drum_tom_lo_hard}[s]
              sample t, amp: 0.5 if t
              sample :perc_snap, amp: 0.6 if s == 12
            else
              if [8, 10, 12, 13, 14, 15].include?(s)
                sample :sn_dolf, amp: 0.35 + (s - 8) * 0.07
                sample :drum_snare_hard, amp: 0.15 + (s - 8) * 0.03
              end
            end
          elsif mini && s >= 14
            sample :perc_snap, amp: (s == 14 ? 0.3 : 0.45)
          else
            case sec
            when :intro
              sample :perc_snap, amp: hum.(0.45) if back && bar >= 2
            when :pre, :build
              # Redoble de 4 compases: negras, corcheas, semicorcheas y semicorcheas que suben.
              k = bar - (sec == :pre ? 20 : 40)
              hit = [s % 4 == 0, s.even?, true, true][k]
              hit = false if sec == :pre && bar == 23 && s >= 12
              sample :sn_dolf, amp: 0.3 + k * 0.1 + s * 0.012, rate: 1 + (k == 3 ? s * 0.02 : 0) if hit
              sample :perc_snap, amp: hum.(0.5) if back && k < 2
            when :break
              sample :perc_snap, amp: hum.(0.35) if s == 12 && bar.odd?
            when :bridge
              sample :perc_snap, amp: hum.(0.5) if back
            else
              if back
                sample :perc_snap, amp: hum.(0.6), rate: 0.95
                sample :sn_dolf, amp: hum.(0.3), rate: 0.9 if [:chorus, :final].include?(sec)
              end
              sample :drum_snare_soft, amp: 0.1 if bar.odd? && (s == 7 || s == 15)
            end
          end
          sleep 0.25
        end
      end
    end
  end
end if stem?(:drums)

# --- Bajo (303 rodando entre los bombos) --------------------------------------
in_thread do
  with_fx :level, amp: 0.4 do
    use_synth :tb303
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      nxt = root_at.(bar + 1, 0)
      if bar == 63 || (sec == :break && bar < 38)
        r = root_at.(bar, 0)
        play r, attack: 0.1, sustain: 2.8, release: 1, cutoff: 58, res: 0.1, amp: 0.35
        sleep 4
        next
      end
      16.times do |s|
        r = root_at.(bar, s / 4)
        on, n = case sec
                when :intro, :bridge, :break then [s % 4 == 2, r]
                when :verse then [[2, 3, 6, 7, 10, 11, 14, 15].include?(s), s % 8 == 7 ? r + 12 : r]
                else [s % 4 != 0, s % 4 == 3 ? r + 12 : r]
                end
        n = nxt + (nxt < r ? 1 : -1) if s == 15 && on && nxt != r && sec != :intro
        cut = case sec
              when :verse then 66 + grow.(bar) * 14
              when :pre then 74 + (bar - 20) * 4 + s * 0.3
              when :build then 70 + (bar - 40) * 6 + s * 0.4
              when :chorus then 84
              when :final then 90
              else 66
              end
        play n, release: 0.14, cutoff: cut + (s % 4) * 2, res: 0.25, wave: 1, amp: hum.(0.8) if on
        sleep 0.25
      end
    end
  end
end if stem?(:bass)

# --- Acordes (colchón que se abre; supersierras que bombean en el estribillo) --
in_thread do
  with_fx :reverb, room: 0.85, mix: 0.45 do
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      parts = parts_of.(bar)
      if bar == 63
        v = voices_at.(bar, 0)
        with_synth(:supersaw) { play v + [v.first - 12], attack: 0.05, sustain: 3, release: 3, cutoff: 100, amp: 0.3 }
        with_synth(:hollow) { play v.map { |n| n + 12 }, attack: 0.3, sustain: 3, release: 3, amp: 0.45 }
        sleep 4
        next
      end
      case sec
      when :chorus, :final
        16.times do |s|
          v = voices_at.(bar, s / 4)
          if s % 4 == 0
            with_synth(:supersaw) { play v + [v.first - 12], attack: 0.04, sustain: 0.55, release: 0.4, cutoff: (sec == :final ? 108 : 102), amp: hum.(0.42) }
            with_synth(:hollow) { play v.map { |n| n + 12 }, attack: 0.1, sustain: 0.6, release: 0.5, amp: hum.(0.5) }
          end
          sleep 0.25
        end
      when :pre, :build
        # Supersierra a corcheas con el filtro abriéndose en los 4 compases.
        k = bar - (sec == :pre ? 20 : 40)
        16.times do |s|
          v = voices_at.(bar, s / 4)
          with_synth(:supersaw) { play v, release: 0.3, cutoff: 68 + (k * 16 + s) * 0.6, amp: hum.(0.5) } if s.even?
          sleep 0.25
        end
      when :break
        parts.each do |t, d, v|
          with_synth(:hollow) { play v + [v.first + 12], attack: d * 0.35, sustain: d * 0.4, release: d * 0.6, amp: 0.25 }
          with_synth(:supersaw) { play v, attack: d * 0.5, sustain: d * 0.3, release: d * 0.5, cutoff: 64, amp: 0.1 }
          sleep d
        end
      else
        # Intro, estrofa y puente: colchón y golpes a contratiempo que se abren con la estrofa.
        c = sec == :verse ? 70 + grow.(bar) * 22 : (sec == :bridge ? 88 : 66)
        parts.each do |t, d, v|
          with_synth(:hollow) { play v + [v.first + 12], attack: (d > 2 ? 1 : 0.4), sustain: d - 0.6, release: 1.2, amp: 0.4 }
          (d * 2).times do |e|
            with_synth(:supersaw) { play v, release: 0.16, cutoff: c, amp: hum.(0.14) } if e.odd? && sec != :intro
            sleep 0.5
          end
        end
      end
    end
  end
end if stem?(:chords)

# --- Melodía (notas largas que cantan) ----------------------------------------
in_thread do
  with_fx :reverb, room: 0.8, mix: 0.4 do
    with_fx :echo, phase: 0.75, decay: 3, mix: 0.22 do
      use_synth :blade
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        parse_line(mel[bar]).each do |n, d|
          if n
            play n, attack: 0.04, sustain: d * 0.6, release: [d * 0.5, 0.3].max, cutoff: (sec == :final ? 105 : 96),
                 vibrato_rate: 5, vibrato_depth: (d >= 1.5 ? 0.12 : 0.05), vibrato_delay: 0.4, amp: hum.(0.5)
          end
          sleep d
        end
      end
    end
  end
end if stem?(:melody)

# --- Arpegio (secuencia que se aclara a lo largo de la estrofa) ---------------
in_thread do
  # El ataque del pluck da picos sueltos que saturan la grabación: -3 dB.
  with_fx :level, amp: 0.7 do
    with_fx :echo, phase: 0.75, decay: 2, mix: 0.3 do
      use_synth :pluck
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        16.times do |s|
          v = voices_at.(bar, s / 4)
          up = v.map { |n| n + 12 } + [v[0] + 24]
          two = v.map { |n| n + 12 } + v.map { |n| n + 24 }
          n, coef, a = case sec
                       when :intro then [up[[0, 1, 2, 1, 3, 1, 2, 1][s % 8] % up.length], 0.5, 0.35 + bar * 0.06]
                       when :verse then [up[[0, 1, 2, 1, 3, 1, 2, 1][s % 8] % up.length], 0.45 - grow.(bar) * 0.2, 0.55]
                       when :pre then [two[s % 8 % two.length], 0.3, 0.45 + s * 0.01]
                       when :break then [s.even? ? up[[0, 2, 1, 3][(s / 2) % 4] % up.length] + 12 : nil, 0.35, 0.4]
                       when :build then [up[[0, 1, 2, 1][s % 4] % up.length] + ((bar - 40) / 2) * 12, 0.5 - (bar - 40) * 0.1 - s * 0.006, 0.5]
                       when :bridge then [[0, 3, 6, 8, 11, 14].include?(s) ? up[(s / 3) % up.length] : nil, 0.3, 0.55]
                       else [up[[0, 2, 1, 3, 2, 4, 3, 1][s % 8] % up.length], 0.22, sec == :final ? 0.65 : 0.6]
                       end
          if bar == 63
            n = two[s % two.length]
            a *= 1 - s / 20.0
          end
          play n, amp: hum.(a), coef: coef, pan: Math.sin(s * 0.8) * 0.4 if n
          sleep 0.25
        end
      end
    end
  end
end if stem?(:arp)

# --- Solo (solo en el estribillo final) ---------------------------------------
in_thread do
  with_fx :reverb, room: 0.7, mix: 0.35 do
    with_fx :echo, phase: 0.75, decay: 1.5, mix: 0.15 do
      use_synth :supersaw
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        if sec == :final
          parse_line(solo[bar - 56]).each do |n, d|
            play n, attack: 0.01, sustain: d * 0.6, release: [d * 0.4, 0.12].max, cutoff: 106, amp: hum.(0.35) if n
            sleep d
          end
        else
          sleep 4
        end
      end
    end
  end
end if stem?(:solo)
