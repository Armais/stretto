# Stretto · Nivel 4 · "Túneles de montaña" · techno en la menor
# @bpm 132
# @bars 64
# @final 56
#
# Las secciones son las mismas que src/game/levels.ts usa para generar las líneas de cambio:
# intro 0-3 · estrofa 4-19 · pre 20-23 · estribillo 24-31 · break 32-39 · subida 40-43 ·
# estribillo 44-51 · puente 52-55 · estribillo final 56-63 (aquí entra el solo).
#
# Armonía: pedal de la en el bajo bajo re-9 y si bemol (novena menor, lo oscuro de los túneles)
# en la tercera frase de la estrofa y en el puente; estribillo fa → sol6 → la-9 → mi-7 con
# mi7 antes de volver a la. La línea ácida sigue los acordes (tercera y séptima según toque)
# y los blips van a 5 contra 4. Melodía y solo van en texto, un compás por cadena.

use_bpm 132
use_debug false
use_transpose (get(:transpose) || 0)
# Se lee una vez: get() no es instantáneo y saltar compases con él retrasa los hilos.
from_bar = get(:from_bar) || 0

plan = stretto_plan([[:intro, 4], [:verse, 16], [:pre, 4], [:chorus, 8], [:break, 8],
                     [:build, 4], [:chorus, 8], [:bridge, 4], [:final, 8]])

# Cada acorde: [bajo, voces]. Los terminados en _a llevan la en el bajo.
harm = {
  am9: [:a1, [:g3, :b3, :c4, :e4]],     fmaj7: [:f1, [:a3, :c4, :e4]],
  g6: [:g1, [:g3, :b3, :d4, :e4]],      fmaj7s11: [:f1, [:a3, :b3, :e4]],
  esus: [:e1, [:a3, :b3, :d4]],         e7: [:e1, [:gs3, :b3, :d4]],
  dm9_a: [:a1, [:f3, :a3, :c4, :e4]],   bbmaj7_a: [:a1, [:f3, :bb3, :d4]],
  dm9: [:d2, [:f3, :a3, :c4, :e4]],     em7: [:e1, [:g3, :b3, :d4]],
}

chorus_prog = [[:fmaj7], [:g6], [:am9], [:em7], [:fmaj7], [:g6], [:esus, :e7], [:am9]]
prog = [
  [:am9], [:am9], [:am9], [:am9],
  [:am9], [:am9], [:fmaj7], [:g6],
  [:am9], [:am9], [:fmaj7s11], [:esus, :e7],
  [:dm9_a], [:dm9_a], [:bbmaj7_a], [:esus, :e7],
  [:fmaj7], [:g6], [:am9], [:esus, :e7],
  [:dm9], [:fmaj7], [:g6], [:esus, :e7],
  *chorus_prog,
  [:dm9], [:dm9], [:fmaj7], [:fmaj7], [:g6], [:g6], [:esus], [:e7],
  [:dm9], [:fmaj7], [:g6], [:esus, :e7],
  *chorus_prog,
  [:bbmaj7_a], [:bbmaj7_a], [:am9], [:esus, :e7],
  *chorus_prog,
]

chord_at = lambda { |bar, beat| e = prog[bar] || prog[-1]; harm[e.length > 1 && beat >= 2 ? e[1] : e[0]] }
root_at = lambda { |bar, beat| note(chord_at.(bar, beat)[0]) }
voices_at = lambda { |bar, beat| chord_at.(bar, beat)[1].map { |n| note(n) } }
parts_of = lambda { |bar| prog[bar].length > 1 ? [[0, 2, voices_at.(bar, 0)], [2, 2, voices_at.(bar, 2)]] : [[0, 4, voices_at.(bar, 0)]] }
has_pc = lambda { |bar, beat, iv| r = root_at.(bar, beat); voices_at.(bar, beat).any? { |n| (n - r - iv) % 12 == 0 } }
third_at = lambda { |bar, beat| has_pc.(bar, beat, 4) && !has_pc.(bar, beat, 3) ? 4 : 3 }
seventh_at = lambda { |bar, beat| has_pc.(bar, beat, 11) ? 11 : 10 }
hum = lambda { |a| a * rrand(0.88, 1.04) }
grow = lambda { |bar| [[(bar - 4) / 15.0, 0].max, 1].min }

# Riff de la estrofa (3+3+2 semicorcheas, dos veces), uno por acorde.
riff = {
  am9: "a4:0.75 c5:0.75 e5:0.5 a4:0.75 g5:0.75 e5:0.5",
  fmaj7: "a4:0.75 c5:0.75 e5:0.5 a4:0.75 f5:0.75 e5:0.5",
  g6: "b4:0.75 d5:0.75 e5:0.5 b4:0.75 g5:0.75 d5:0.5",
  e: "b4:0.75 d5:0.75 e5:0.5 gs4:0.75 b4:0.75 d5:0.5",
  dm9_a: "a4:0.75 c5:0.75 f5:0.5 a4:0.75 e5:0.75 d5:0.5",
  bb_a: "bb4:0.75 d5:0.75 f5:0.5 bb4:0.75 a5:0.75 f5:0.5",
  fmaj7s11: "a4:0.75 b4:0.75 e5:0.5 a4:0.75 c5:0.75 e5:0.5",
  dm9: "f4:0.75 a4:0.75 d5:0.5 f4:0.75 c5:0.75 e5:0.5",
}
ch = [
  "e6:1.5 c6:0.5 a5:1 c6:1",
  "d6:1.5 b5:0.5 g5:1 e6:1",
  "c6:1 b5:1 a5:1 e5:1",
  "g5:3 r:1",
  "a5:0.5 c6:0.5 e6:1.5 f6:0.5 e6:1",
  "d6:1.5 b5:0.5 g5:0.5 b5:0.5 d6:1",
  "e6:1 d6:1 b5:0.5 gs5:0.5 e5:1",
  "a5:3 r:1",
]

mel = [
  "r:4", "r:4", "r:4", "r:4",
  # estrofa: el riff, que cambia con cada acorde
  riff[:am9], riff[:am9], riff[:fmaj7], riff[:g6],
  riff[:am9], riff[:am9], riff[:fmaj7s11], riff[:e],
  riff[:dm9_a], riff[:dm9_a], riff[:bb_a], riff[:e],
  riff[:fmaj7], riff[:g6], riff[:am9], riff[:e],
  # pre
  riff[:dm9], riff[:fmaj7], riff[:g6], riff[:e],
  *ch,
  # break: notas largas
  "r:2 a5:2", "f5:2 e5:2", "r:2 c6:2", "a5:2 g5:2", "r:2 d6:2", "b5:2 g5:2", "r:2 a5:1 b5:1", "gs5:2 b5:1 d6:1",
  # subida: arpegios a corcheas que suben
  "d5:0.5 f5:0.5 a5:0.5 d5:0.5 f5:0.5 a5:0.5 c6:0.5 e6:0.5",
  "c5:0.5 e5:0.5 a5:0.5 c5:0.5 e5:0.5 a5:0.5 c6:0.5 e6:0.5",
  "d5:0.5 e5:0.5 g5:0.5 b5:0.5 d6:0.5 e6:0.5 g6:0.5 b6:0.5",
  "a5:0.5 b5:0.5 d6:0.5 e6:0.5 gs5:0.5 b5:0.5 d6:0.5 e6:0.5",
  *ch,
  # puente
  riff[:bb_a], riff[:bb_a], riff[:am9], riff[:e],
  # estribillo final
  *ch[0, 7], "a5:4",
]

solo = [
  "f5:0.25 a5:0.25 c6:0.25 e6:0.25 f6:0.5 e6:0.25 c6:0.25 a5:0.5 c6:0.5 e6:1",
  "g5:0.25 b5:0.25 d6:0.25 e6:0.25 g6:0.5 e6:0.25 d6:0.25 b5:0.5 d6:0.5 g6:1",
  "a5:0.25 c6:0.25 e6:0.25 g6:0.25 b6:0.5 a6:0.5 g6:0.5 e6:0.5 c6:1",
  "b6:0.5 g6:0.5 e6:0.5 d6:0.5 b5:1 r:1",
  "c7:0.5 a6:0.25 f6:0.25 e6:0.5 c6:0.5 a5:0.5 c6:0.5 e6:1",
  "d7:0.5 b6:0.25 g6:0.25 e6:0.5 d6:0.5 b5:0.5 d6:0.5 g6:1",
  "e7:0.5 d7:0.5 b6:0.5 a6:0.5 gs6:0.5 b6:0.5 d7:0.5 e7:0.5",
  "a6:0.5 e6:0.5 c6:0.5 b5:0.5 a5:2",
]

stretto_click [:tb303, :prophet, :hollow, :dsaw, :beep, :bnoise],
              [:bd_tek, :bd_haus, :perc_snap, :sn_dolf, :drum_snare_hard, :drum_cymbal_closed, :drum_cymbal_open,
               :drum_cymbal_pedal, :drum_splash_hard, :drum_splash_soft, :elec_blip2,
               :drum_tom_mid_soft, :drum_tom_lo_soft, :drum_tom_hi_hard, :drum_tom_mid_hard, :drum_tom_lo_hard]

# --- Batería ----------------------------------------------------------------
# Bombo doble, platos, blips y barridos en un hilo; palmas, caja y toms con sala en otro.
# Todo a -9 dB: a nivel 1 los golpes saturan la grabación y el grabador recupera el nivel.
in_thread do
  with_fx :level, amp: 0.35 do
    with_fx :compressor, threshold: 0.4, clamp_time: 0.01 do
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        first = bar == 0 || plan[bar - 1] != sec
        sample :drum_splash_hard, amp: 0.4 if (first && [:chorus, :final].include?(sec)) || bar == 60 || bar == 63
        sample :drum_splash_soft, amp: 0.35 if first && [:verse, :break, :bridge].include?(sec)
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
        kcut = sec == :break ? 70 + (bar - 38) * 15 : 110
        16.times do |s|
          if kicks.include?(s)
            sample :bd_tek, amp: hum.(1.5), cutoff: kcut
            sample :bd_haus, amp: 0.7, cutoff: [kcut, 80].min
          end
          unless bar == 63 || (sec == :intro && bar < 2)
            big = [:chorus, :final].include?(sec)
            sample :drum_cymbal_closed, amp: hum.(s % 4 == 2 ? 0.3 : 0.12), rate: 1.6 unless sec == :break && s.odd?
            sample :drum_cymbal_open, amp: hum.(0.22), release: 0.1, rate: 1.3 if s % 4 == 2 && (big || (sec == :verse && bar >= 16) || sec == :bridge)
            sample :drum_cymbal_pedal, amp: hum.(0.12), rate: 1.2 if big && s.odd?
            sample :elec_blip2, amp: 0.15, rate: 0.8 if s == 14 && bar.odd? && sec != :break
          end
          sleep 0.25
        end
      end
    end
  end
end if stem?(:drums)

in_thread do
  with_fx :level, amp: 0.3 do
    with_fx :reverb, room: 0.55, mix: 0.25 do
      fills = [:flam, :toms, :snare]
      nfill = 0
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        fill = nil
        if section_end?(plan, bar) && [:verse, :chorus, :bridge].include?(sec)
          fill = fills[nfill % 3]
          nfill += 1
        end
        # Toms de percusión en la segunda mitad de la estrofa y en el puente.
        tribal = (sec == :verse && bar >= 12) || sec == :bridge
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
              sample :perc_snap, amp: 0.55 if s == 12
            else
              if [8, 10, 12, 13, 14, 15].include?(s)
                sample :sn_dolf, amp: 0.35 + (s - 8) * 0.07
                sample :drum_snare_hard, amp: 0.15 + (s - 8) * 0.03
              end
            end
          else
            case sec
            when :intro
              sample :perc_snap, amp: hum.(0.4) if back && bar >= 2
            when :pre, :build
              k = bar - (sec == :pre ? 20 : 40)
              hit = [s % 4 == 0, s.even?, true, true][k]
              hit = false if sec == :pre && bar == 23 && s >= 12
              sample :sn_dolf, amp: 0.3 + k * 0.1 + s * 0.012, rate: 1 + (k == 3 ? s * 0.02 : 0) if hit
              sample :perc_snap, amp: hum.(0.45) if back && k < 2
            when :break
              sample :perc_snap, amp: hum.(0.3) if s == 12 && bar.odd?
            else
              sample :perc_snap, amp: hum.([:chorus, :final].include?(sec) ? 0.6 : 0.5) if back
              sample :sn_dolf, amp: hum.(0.25), rate: 0.9 if back && [:chorus, :final].include?(sec)
            end
            if tribal
              sample :drum_tom_lo_soft, amp: hum.(0.4) if s == 3 || s == 11
              sample :drum_tom_mid_soft, amp: hum.(0.3) if s == 6 || (s == 14 && bar.even?)
            end
          end
          sleep 0.25
        end
      end
    end
  end
end if stem?(:drums)

# --- Bajo (línea ácida que sigue los acordes) ---------------------------------
# r raíz, o octava, t tercera, s séptima, f quinta; nil = silencio.
in_thread do
  with_fx :level, amp: 0.4 do
    use_synth :tb303
    acid = [:r, nil, :o, :r, :t, nil, :s, :r, nil, :o, :r, :f, nil, :t, :o, :f]
    full = [:r, :r, :o, :r, :t, :r, :s, :r, :r, :o, :r, :f, :r, :t, :o, :f]
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      if bar == 63 || (sec == :break && bar < 38)
        play root_at.(bar, 0), attack: 0.1, sustain: 2.8, release: 1, cutoff: 55, res: 0.1, amp: 0.35
        sleep 4
        next
      end
      16.times do |s|
        b = s / 4
        r = root_at.(bar, b)
        kind = case sec
               when :intro then [0, 3, 6, 8, 11, 14].include?(s) ? (s % 8 == 6 ? :o : :r) : nil
               when :verse, :bridge then acid[s]
               when :pre, :build, :break then s.even? ? :r : :o
               else full[s]
               end
        if kind
          n = r + {r: 0, o: 12, f: 7, t: third_at.(bar, b), s: seventh_at.(bar, b)}[kind]
          base = case sec
                 when :intro then 62
                 when :verse then 66 + grow.(bar) * 16
                 when :pre then 72 + (bar - 20) * 5 + s * 0.3
                 when :build then 70 + (bar - 40) * 7 + s * 0.4
                 when :break then 64 + (bar - 38) * 8
                 when :bridge then 74
                 when :chorus then 86
                 else 92
                 end
          # Acento cada 3 semicorcheas: el filtro se abre y suena más fuerte.
          acc = (bar * 16 + s) % 3 == 0
          play n, release: 0.14, cutoff: base + (acc ? 10 : 0) + Math.sin((bar * 16 + s) * 0.2) * 4,
               res: (sec == :bridge ? 0.5 : 0.3), wave: 0, amp: hum.(acc ? 0.85 : 0.65)
        end
        sleep 0.25
      end
    end
  end
end if stem?(:bass)

# --- Acordes (golpes de dub techno con eco, colchón en break y puente) --------
in_thread do
  with_fx :reverb, room: 0.8, mix: 0.4 do
    with_fx :echo, phase: 0.75, decay: 3, mix: 0.3 do
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        parts = parts_of.(bar)
        if bar == 63
          v = voices_at.(bar, 0)
          with_synth(:prophet) { play v, attack: 0.02, sustain: 1, release: 2, cutoff: 95, amp: 0.4 }
          with_synth(:hollow) { play v.map { |n| n + 12 }, attack: 0.3, sustain: 3, release: 3, amp: 0.45 }
          sleep 4
          next
        end
        if [:verse, :pre, :break, :bridge, :chorus, :final].include?(sec)
          parts.each do |t, d, v|
            with_synth(:hollow) { play v + [v.first + 12], attack: (sec == :break ? 1 : 0.3), sustain: d - 0.5, release: 1.2,
                                       amp: {verse: 0.2, pre: 0.3, break: 0.25, bridge: 0.35}.fetch(sec, 0.45) }
          end
        end
        hits, cut, a = case sec
                       when :intro then [bar.odd? ? [14] : [], 70, 0.3]
                       when :verse then [[3, 10, 14], 74 + grow.(bar) * 18, 0.6]
                       when :pre then [[0, 2, 4, 6, 8, 10, 12, 14], 72 + ((bar - 20) * 16) * 0.6, 0.42]
                       when :build then [(0..15).to_a, 70 + ((bar - 40) * 16) * 0.6, 0.36]
                       when :break then [[6], 68, 0.2]
                       when :bridge then [[3, 10], 76, 0.3]
                       else [[2, 7, 10, 15], 98, 0.38]
                       end
        16.times do |s|
          c = [:pre, :build].include?(sec) ? cut + s * 0.6 : cut
          with_synth(:prophet) { play voices_at.(bar, s / 4), release: 0.15, cutoff: c, amp: hum.(a) } if hits.include?(s)
          sleep 0.25
        end
      end
    end
  end
end if stem?(:chords)

# --- Melodía (riff de sierras; en los estribillos, notas largas) --------------
in_thread do
  # La sierra doble con eco saturaba la grabación (27.000 muestras a 1,0): -12 dB.
  with_fx :level, amp: 0.25 do
    with_fx :reverb, room: 0.6, mix: 0.3 do
      with_fx :echo, phase: 0.75, decay: 2, mix: 0.2 do
        use_synth :dsaw
        plan.each_with_index do |sec, bar|
          next if bar < from_bar
          long = [:chorus, :final, :break].include?(sec)
          parse_line(mel[bar]).each do |n, d|
            if n
              play n, attack: (long ? 0.05 : 0.01), sustain: d * (long ? 0.7 : 0.4), release: (long ? [d * 0.4, 0.3].max : 0.15),
                   cutoff: (long ? 96 : 84 + grow.(bar) * 12), detune: 0.15, amp: hum.(0.45)
            end
            sleep d
          end
        end
      end
    end
  end
end if stem?(:melody)

# --- Arpegio (blips en polimetría: 2 golpes cada 5 semicorcheas) --------------
in_thread do
  # Los blips agudos con eco saturaban la grabación: -6 dB.
  with_fx :level, amp: 0.5 do
    with_fx :echo, phase: 0.5, decay: 2, mix: 0.3 do
      use_synth :beep
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        16.times do |s|
          g = bar * 16 + s
          v = voices_at.(bar, s / 4)
          up = v.map { |n| n + 24 } + [v[0] + 36]
          two = v.map { |n| n + 12 } + v.map { |n| n + 24 }
          n, a = case sec
                 when :intro, :verse, :bridge
                   [[0, 3].include?(g % 5) ? up[(g / 5) % up.length] : nil, sec == :intro ? 0.15 + bar * 0.05 : 0.35]
                 when :pre, :build then [two[s % 8 % two.length], 0.25 + s * 0.01]
                 when :break then [g % 7 == 0 ? up[(g / 7) % up.length] : nil, 0.35]
                 else [up[(g / 3) % up.length], g % 3 == 0 ? 0.42 : 0.14]
                 end
          if bar == 63
            n = two[s % two.length]
            a *= 1 - s / 20.0
          end
          play n, release: 0.12, amp: hum.(a), pan: Math.sin(g * 0.37) * 0.5 if n
          sleep 0.25
        end
      end
    end
  end
end if stem?(:arp)

# --- Solo (303 agudo, solo en el estribillo final) -----------------------------
in_thread do
  with_fx :reverb, room: 0.6, mix: 0.3 do
    with_fx :echo, phase: 0.75, decay: 1.5, mix: 0.15 do
      use_synth :tb303
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        if sec == :final
          parse_line(solo[bar - 56]).each do |n, d|
            play n, attack: 0.005, sustain: d * 0.5, release: [d * 0.4, 0.1].max, cutoff: 100, res: 0.35, wave: 0, amp: hum.(0.3) if n
            sleep d
          end
        else
          sleep 4
        end
      end
    end
  end
end if stem?(:solo)
