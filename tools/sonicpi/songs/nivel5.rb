# Stretto · Nivel 5 · "Autopista al amanecer" · drum and bass luminoso en si menor
# @bpm 172
# @bars 86
# @final 74
#
# Las secciones son las mismas que src/game/levels.ts usa para generar las líneas de cambio.

use_bpm 172
use_debug false
use_transpose (get(:transpose) || 0)
# Se lee una vez: get() no es instantáneo y saltar compases con él retrasa los hilos.
from_bar = get(:from_bar) || 0

plan = stretto_plan([[:intro, 8], [:verse, 16], [:pre, 4], [:chorus, 16], [:break, 12],
                     [:build, 6], [:chorus, 8], [:bridge, 4], [:final, 8], [:outro, 4]])

verse_chords = [chord(:b2, :m9), chord(:b2, :m9), chord(:g2, :major7), chord(:g2, :major7),
                chord(:d3, :major), chord(:d3, :major), chord(:a2, :sus4), chord(:a2, :major)]
chorus_chords = [chord(:g2, :major7), chord(:g2, :major7), chord(:a2, :major), chord(:a2, :major),
                 chord(:b2, :m7), chord(:b2, :m7), chord(:d3, :major), chord(:fs2, :minor)]
break_chords = [chord(:e3, :m9), chord(:e3, :m9), chord(:g3, :major7), chord(:g3, :major7)]

chords_for = lambda do |section, bar|
  case section
  when :chorus, :final then chorus_chords[bar % 8]
  when :break then break_chords[bar % 4]
  else verse_chords[bar % 8]
  end
end
big = lambda { |sec| [:chorus, :final].include?(sec) }

# Melodía en negras (a 172 BPM, las corcheas serían un torbellino): 4 notas por compás.
verse_mel = [
  [:fs5, nil, :d5, :e5], [:fs5, nil, nil, nil], [:d5, nil, :b4, :d5], [:e5, nil, nil, nil],
  [:a5, nil, :fs5, :e5], [:d5, nil, nil, nil], [:cs5, nil, :e5, nil], [:a4, nil, nil, nil],
]
chorus_mel = [
  [:b5, nil, :a5, :fs5], [:d5, nil, nil, :e5], [:fs5, nil, :e5, :cs5], [:a4, nil, nil, nil],
  [:d5, nil, :fs5, :b5], [:a5, nil, nil, :fs5], [:a5, nil, :b5, :d6], [:cs6, nil, nil, nil],
]
solo_line = [:b5, :d6, :fs6, :e6, :d6, :b5, :a5, :b5, :d6, :e6, :fs6, :a6, :fs6, :e6, :d6, :e6]

stretto_click [:dsaw, :hollow, :prophet, :blade, :pluck, :supersaw], [:drum_splash_hard, :bd_haus, :sn_dolf, :drum_snare_hard, :drum_cymbal_closed, :drum_cymbal_open]

# --- Batería (break a dos pasos) ----------------------------------------------
in_thread do
  with_fx :compressor, threshold: 0.4 do
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      sample :drum_splash_hard, amp: 0.35 if bar > 0 && plan[bar - 1] != sec && big.call(sec)
      16.times do |s|
        calm = [:intro, :break, :outro].include?(sec)
        if calm
          sample :bd_haus, amp: 1.0, cutoff: 90 if s == 0 && bar.even?
          sample :drum_cymbal_closed, amp: 0.12, rate: 1.4 if s % 4 == 2
        else
          sample :bd_haus, amp: 1.5, cutoff: 110 if s == 0 || s == 10
          if s == 4 || s == 12
            sample :sn_dolf, amp: 1.0
            sample :drum_snare_hard, amp: 0.35, rate: 1.3
          end
          sample :sn_dolf, amp: 0.18, rate: 1.4 if s == 7 || s == 15
          sample :drum_cymbal_closed, amp: (s.even? ? 0.22 : 0.1), rate: 1.5
          sample :drum_cymbal_open, amp: 0.2, release: 0.1, rate: 1.2 if big.call(sec) && s == 14
        end
        sample :sn_dolf, amp: 0.2 + s * 0.03, rate: 1.2 if sec == :build && bar % 2 == 1 && s >= 8
        sleep 0.25
      end
    end
  end
end if stem?(:drums)

# --- Bajo "reese" -------------------------------------------------------------
in_thread do
  use_synth :dsaw
  plan.each_with_index do |sec, bar|
    next if bar < from_bar
    root = chords_for.call(sec, bar)[0] - 12
    if big.call(sec)
      [[0, 1.5], [0, 0.5], [12, 1], [7, 1]].each do |st, len|
        play root + st, attack: 0.02, sustain: len * 0.7, release: len * 0.3, cutoff: 75, detune: 0.25, amp: 0.85
        sleep len
      end
    else
      play root, attack: 0.1, sustain: 3, release: 0.8, cutoff: (sec == :break ? 55 : 68), detune: 0.25, amp: 0.85
      sleep 4
    end
  end
end if stem?(:bass)

# --- Acordes (colchón que se abre) --------------------------------------------
in_thread do
  with_fx :reverb, room: 0.9, mix: 0.5 do
    use_synth :hollow
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      c = chords_for.call(sec, bar)
      play c + [c[0] + 12], attack: 0.6, sustain: 2.6, release: 1.4, amp: 0.45
      if big.call(sec)
        use_synth :prophet
        play c, attack: 0.2, sustain: 3, release: 0.8, cutoff: 90, amp: 0.2
        use_synth :hollow
      end
      sleep 4
    end
  end
end if stem?(:chords)

# --- Melodía (lead líquido) ---------------------------------------------------
in_thread do
  with_fx :reverb, room: 0.85, mix: 0.4 do
    with_fx :echo, phase: 0.75, decay: 3, mix: 0.25 do
      use_synth :blade
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        line = big.call(sec) ? chorus_mel[bar % 8] : verse_mel[bar % 8]
        line.each do |n|
          play n, attack: 0.03, release: 1.0, cutoff: 98, vibrato_rate: 6, vibrato_depth: 0.1, amp: 0.5 if n
          sleep 1
        end
      end
    end
  end
end if stem?(:melody)

# --- Arpegio (corcheas) -------------------------------------------------------
in_thread do
  with_fx :echo, phase: 0.75, decay: 2, mix: 0.3 do
    use_synth :pluck
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      c = chords_for.call(sec, bar)
      notes = c.to_a.map { |n| n + 24 }
      8.times do |s|
        play notes[[0, 1, 2, 1, 3, 2, 1, 2][s] % notes.length], amp: 0.6, coef: 0.3, pan: (s.even? ? -0.3 : 0.3)
        sleep 0.5
      end
    end
  end
end if stem?(:arp)

# --- Solo (solo en el estribillo final) ---------------------------------------
in_thread do
  with_fx :reverb, room: 0.7, mix: 0.35 do
    use_synth :supersaw
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      if sec == :final
        8.times do |s|
          n = solo_line[(bar % 2) * 8 + s]
          play n, release: 0.35, cutoff: 105, amp: 0.35 if n
          sleep 0.5
        end
      else
        sleep 4
      end
    end
  end
end if stem?(:solo)
