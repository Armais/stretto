# Stretto · Nivel 2 · "Carretera de costa" · nu-disco / funk en mi menor
# @bpm 115
# @bars 58
# @final 50
#
# Las secciones son las mismas que src/game/levels.ts usa para generar las líneas de cambio.

use_bpm 115
use_debug false
use_transpose (get(:transpose) || 0)
# Se lee una vez: get() no es instantáneo y saltar compases con él retrasa los hilos.
from_bar = get(:from_bar) || 0

plan = stretto_plan([[:intro, 4], [:verse, 12], [:pre, 2], [:chorus, 8], [:break, 8],
                     [:build, 4], [:chorus, 8], [:bridge, 4], [:final, 8]])

verse_chords = [chord(:e3, :m9), chord(:a2, '7'), chord(:d3, :major7), chord(:b2, :m7)]
chorus_chords = [chord(:c3, :major7), chord(:d3, :major), chord(:b2, :m7), chord(:e3, :m7)]
break_chords = [chord(:a2, :m9), chord(:a2, :m9), chord(:b2, :m7), chord(:b2, :m7)]

chords_for = lambda do |section, bar|
  case section
  when :chorus, :final then chorus_chords[bar % 4]
  when :break then break_chords[bar % 4]
  else verse_chords[bar % 4]
  end
end
big = lambda { |sec| [:chorus, :final].include?(sec) }

verse_mel = [
  [:b4, nil, :d5, :e5, nil, :d5, :b4, nil],
  [:a4, nil, nil, :g4, :a4, nil, :b4, nil],
  [:fs4, nil, :a4, nil, :d5, nil, :cs5, :a4],
  [:b4, nil, nil, nil, :d5, :e5, :fs5, nil],
]
chorus_mel = [
  [:g5, nil, :e5, nil, :g5, :a5, :g5, :e5],
  [:fs5, nil, :d5, nil, :a4, nil, :d5, nil],
  [:d5, :e5, :fs5, nil, :d5, nil, :b4, nil],
  [:e5, nil, nil, :g5, nil, :b5, :a5, :g5],
]
bass_steps = [0, nil, 12, 0, nil, 0, 12, nil, 0, nil, 10, 12, nil, 0, 7, 12]
solo_line = [
  :e6, :d6, :b5, :d6, :e6, nil, :g6, :e6, :d6, :b5, :a5, :b5, :d6, nil, :b5, :a5,
  :g5, :a5, :b5, :d6, :e6, :d6, :b5, :a5, :b5, nil, :d6, :e6, :fs6, nil, :b6, nil,
]

stretto_click [:fm, :hollow, :tech_saws, :pluck, :pretty_bell, :mod_saw], [:drum_splash_soft, :bd_haus, :perc_snap, :sn_dolf, :drum_cymbal_open, :drum_cymbal_closed]

# --- Batería ----------------------------------------------------------------
in_thread do
  with_fx :compressor, threshold: 0.4 do
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      sample :drum_splash_soft, amp: 0.45 if bar > 0 && plan[bar - 1] != sec && (big.call(sec) || sec == :verse)
      16.times do |s|
        brk = (sec == :break)
        sample :bd_haus, amp: 1.5, cutoff: 105 if (brk ? s == 0 : s % 4 == 0)
        if s == 4 || s == 12
          sample :perc_snap, amp: 0.7
          sample :sn_dolf, amp: 0.45, rate: 1.15
        end
        sample :drum_cymbal_open, amp: 0.3, release: 0.12, rate: 1.2 if !brk && s % 4 == 2
        sample :drum_cymbal_closed, amp: [0.12, 0.2, 0.15, 0.25][s % 4], rate: 1.5
        sample :sn_dolf, amp: 0.25 + s * 0.02, rate: 1.2 if section_end?(plan, bar) && s >= 13
        sleep 0.25
      end
    end
  end
end if stem?(:drums)

# --- Bajo (FM sincopado con octavas) -----------------------------------------
in_thread do
  use_synth :fm
  plan.each_with_index do |sec, bar|
    next if bar < from_bar
    root = chords_for.call(sec, bar)[0] - 12
    if sec == :break
      play root, attack: 0.02, sustain: 1.5, release: 0.4, divisor: 1, depth: 1, amp: 0.8
      sleep 2
      play root + 7, attack: 0.02, sustain: 1.5, release: 0.4, divisor: 1, depth: 1, amp: 0.7
      sleep 2
    else
      bass_steps.each do |st|
        play root + st, release: 0.16, divisor: 0.5, depth: (big.call(sec) ? 2.5 : 1.8), amp: 0.85 if st
        sleep 0.25
      end
    end
  end
end if stem?(:bass)

# --- Acordes (colchón y golpes a contratiempo) --------------------------------
in_thread do
  with_fx :reverb, room: 0.7, mix: 0.4 do
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      c = chords_for.call(sec, bar)
      use_synth :hollow
      play c, attack: 0.5, sustain: 2.8, release: 1, amp: 0.35
      use_synth :tech_saws
      if sec != :break
        [1.5, 2.5, 3.5].each do |t|
          time_warp t do
            play c, release: 0.2, cutoff: (big.call(sec) ? 100 : 88), amp: 0.22
          end
        end
      end
      sleep 4
    end
  end
end if stem?(:chords)

# --- Melodía (punteo tipo guitarra) -------------------------------------------
in_thread do
  with_fx :reverb, room: 0.5, mix: 0.25 do
    with_fx :echo, phase: 0.75, decay: 2, mix: 0.18 do
      use_synth :pluck
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        line = big.call(sec) ? chorus_mel[bar % 4] : verse_mel[bar % 4]
        line.each do |n|
          play n, amp: 0.8, coef: 0.25, release: 0.6 if n
          sleep 0.5
        end
      end
    end
  end
end if stem?(:melody)

# --- Arpegio (campanas brillantes) --------------------------------------------
in_thread do
  with_fx :echo, phase: 0.375, decay: 1.5, mix: 0.3 do
    use_synth :pretty_bell
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      c = chords_for.call(sec, bar)
      notes = c.to_a.map { |n| n + 12 }
      16.times do |s|
        play notes[[0, 2, 1, 3, 2, 1, 3, 2][s % 8] % notes.length], release: 0.2, amp: 0.3, pan: (s.even? ? -0.35 : 0.35)
        sleep 0.25
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
        16.times do |s|
          n = solo_line[(bar % 2) * 16 + s]
          play n, release: 0.2, cutoff: 100, mod_range: 0.3, mod_phase: 0.25, amp: 0.35 if n
          sleep 0.25
        end
      else
        sleep 4
      end
    end
  end
end if stem?(:solo)
