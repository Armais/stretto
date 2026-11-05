# Stretto · Nivel 4 · "Túneles de montaña" · techno en la menor
# @bpm 132
# @bars 64
# @final 56
#
# Las secciones son las mismas que src/game/levels.ts usa para generar las líneas de cambio.

use_bpm 132
use_debug false
use_transpose (get(:transpose) || 0)
# Se lee una vez: get() no es instantáneo y saltar compases con él retrasa los hilos.
from_bar = get(:from_bar) || 0

plan = stretto_plan([[:intro, 4], [:verse, 16], [:pre, 4], [:chorus, 8], [:break, 8],
                     [:build, 4], [:chorus, 8], [:bridge, 4], [:final, 8]])

verse_chords = [chord(:a2, :m7), chord(:a2, :m7), chord(:f2, :major7), chord(:g2, :major)]
chorus_chords = [chord(:f2, :major), chord(:g2, :major), chord(:a2, :minor), chord(:e2, :minor)]
break_chords = [chord(:d3, :m9), chord(:d3, :m9), chord(:f3, :major7), chord(:e3, :sus4)]

chords_for = lambda do |section, bar|
  case section
  when :chorus, :final then chorus_chords[bar % 4]
  when :break then break_chords[bar % 4]
  else verse_chords[bar % 4]
  end
end
big = lambda { |sec| [:chorus, :final].include?(sec) }

acid = [0, 0, 12, 0, 3, 0, 10, 0, 0, 12, 0, 7, 0, 3, 12, 5]
verse_mel = [
  [:e5, nil, nil, nil, :c5, nil, nil, nil],
  [:d5, nil, nil, nil, :e5, nil, nil, nil],
  [:a5, nil, nil, nil, :g5, nil, nil, nil],
  [:e5, nil, nil, nil, nil, nil, :d5, nil],
]
chorus_mel = [
  [:a5, nil, :a5, nil, :g5, nil, :e5, nil],
  [:d5, nil, :e5, nil, :g5, nil, :b5, nil],
  [:c6, nil, :b5, nil, :a5, nil, :e5, nil],
  [:g5, nil, nil, :e5, :d5, nil, :e5, nil],
]
solo_acid = [24, 12, 19, 24, 27, 24, 12, 22, 24, 31, 24, 19, 22, 24, 27, 36]

stretto_click [:tb303, :prophet, :hollow, :dsaw, :beep], [:bd_tek, :bd_haus, :perc_snap, :drum_cymbal_closed, :drum_cymbal_open, :elec_blip2]

# --- Batería ----------------------------------------------------------------
in_thread do
  with_fx :compressor, threshold: 0.35 do
    with_fx :reverb, room: 0.4, mix: 0.12 do
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        16.times do |s|
          brk = (sec == :break)
          if (brk ? (s == 0) : s % 4 == 0)
            sample :bd_tek, amp: 1.5
            sample :bd_haus, amp: 0.7, cutoff: 80
          end
          sample :perc_snap, amp: 0.5 if (s == 4 || s == 12) && !brk && sec != :intro
          sample :drum_cymbal_closed, amp: (s % 4 == 2 ? 0.3 : 0.12), rate: 1.6 unless brk && s.odd?
          sample :drum_cymbal_open, amp: 0.22, release: 0.1, rate: 1.3 if big.call(sec) && s % 4 == 2
          sample :elec_blip2, amp: 0.15, rate: 0.8 if s == 14 && bar.odd?
          sample :bd_tek, amp: 0.35 + s * 0.04 if sec == :build && bar % 4 == 3 && s >= 8
          sleep 0.25
        end
      end
    end
  end
end if stem?(:drums)

# --- Bajo ácido ---------------------------------------------------------------
in_thread do
  use_synth :tb303
  plan.each_with_index do |sec, bar|
    next if bar < from_bar
    root = chords_for.call(sec, bar)[0] - 12
    16.times do |s|
      if sec == :break
        play root, release: 0.6, cutoff: 55, res: 0.1, amp: 0.6 if s == 0 || s == 8
      else
        cut = 60 + 25 * (0.5 + 0.5 * Math.sin((bar * 16 + s) * 0.07))
        play root + acid[s], release: 0.12, cutoff: cut, res: (big.call(sec) ? 0.6 : 0.35), wave: 0, amp: 0.7
      end
      sleep 0.25
    end
  end
end if stem?(:bass)

# --- Acordes (golpes oscuros) -------------------------------------------------
in_thread do
  with_fx :reverb, room: 0.9, mix: 0.5 do
    with_fx :echo, phase: 0.75, decay: 3, mix: 0.3 do
      use_synth :prophet
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        c = chords_for.call(sec, bar)
        if sec == :break
          use_synth :hollow
          play c, attack: 1, sustain: 2.5, release: 1.5, amp: 0.45
          use_synth :prophet
        else
          play c, release: 0.25, cutoff: (big.call(sec) ? 95 : 80), amp: 0.32
          time_warp(2.5) { play c, release: 0.2, cutoff: 85, amp: 0.25 }
        end
        sleep 4
      end
    end
  end
end if stem?(:chords)

# --- Melodía (metálica y espaciada) -------------------------------------------
in_thread do
  with_fx :reverb, room: 0.8, mix: 0.4 do
    with_fx :echo, phase: 0.5, decay: 3, mix: 0.25 do
      use_synth :dsaw
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        line = big.call(sec) ? chorus_mel[bar % 4] : verse_mel[bar % 4]
        line.each do |n|
          play n, attack: 0.01, release: 0.45, cutoff: 92, detune: 0.08, amp: 0.4 if n
          sleep 0.5
        end
      end
    end
  end
end if stem?(:melody)

# --- Arpegio (secuencia en semicorcheas) --------------------------------------
in_thread do
  with_fx :echo, phase: 0.375, decay: 2, mix: 0.3 do
    use_synth :beep
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      c = chords_for.call(sec, bar)
      notes = c.to_a.map { |n| n + 24 }
      16.times do |s|
        play notes[[0, 2, 1, 2, 0, 3, 1, 2][s % 8] % notes.length], release: 0.08, amp: 0.35, pan: (s % 4 < 2 ? -0.3 : 0.3)
        sleep 0.25
      end
    end
  end
end if stem?(:arp)

# --- Solo ácido (solo en el estribillo final) ---------------------------------
in_thread do
  with_fx :reverb, room: 0.6, mix: 0.25 do
    with_fx :distortion, distort: 0.3, mix: 0.3 do
      use_synth :tb303
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        if sec == :final
          root = chords_for.call(sec, bar)[0]
          16.times do |s|
            play root + solo_acid[s], release: 0.12, cutoff: 70 + s * 2, res: 0.8, wave: 1, amp: 0.35
            sleep 0.25
          end
        else
          sleep 4
        end
      end
    end
  end
end if stem?(:solo)
