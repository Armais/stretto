# Stretto · Nivel 1 · "Salida del centro" · synth-pop en re menor
# @bpm 100
# @bars 54
# @final 46
#
# Secciones alineadas con las líneas de cambio del nivel (src/game/song.ts):
# intro 0-1 · estrofa 2-13 · pre 14-15 · estribillo 16-23 · break 24-31 · subida 32-35 ·
# estribillo 36-39 · puente 40-45 · estribillo final 46-53 (aquí entra el solo).

use_bpm 100
use_debug false
use_transpose (get(:transpose) || 0)
# Se lee una vez: get() no es instantáneo y saltar compases con él retrasa los hilos.
from_bar = get(:from_bar) || 0

plan = stretto_plan([[:intro, 2], [:verse, 12], [:pre, 2], [:chorus, 8], [:break, 8],
                     [:build, 4], [:chorus, 4], [:bridge, 6], [:final, 8]])

verse_chords = [chord(:d3, :minor), chord(:bb2, :major), chord(:f3, :major), chord(:c3, :major)]
chorus_chords = [chord(:bb2, :major), chord(:c3, :major), chord(:f3, :major), chord(:a2, :major)]
break_chords = [chord(:d3, :minor), chord(:d3, :minor), chord(:bb2, :major7), chord(:bb2, :major7)]

chords_for = lambda do |section, bar|
  case section
  when :chorus, :final then chorus_chords[bar % 4]
  when :break then break_chords[bar % 4]
  else verse_chords[bar % 4]
  end
end

verse_mel = [
  [:a4, nil, :a4, :g4, :f4, nil, :e4, :d4],
  [:f4, nil, nil, :g4, :a4, nil, :bb4, nil],
  [:c5, nil, :a4, nil, :g4, :f4, nil, :g4],
  [:e4, nil, nil, nil, :g4, nil, :e4, nil],
]
chorus_mel = [
  [:d5, nil, :d5, :c5, :d5, nil, :f5, nil],
  [:e5, nil, :c5, nil, :g4, nil, :c5, nil],
  [:a4, nil, :c5, :d5, :c5, nil, :a4, :f4],
  [:e4, nil, :a4, nil, :cs5, nil, :e5, nil],
]
solo_line = [
  :d6, :a5, :f5, :a5, :d6, nil, :e6, :d6, :c6, :a5, :g5, :a5, :c6, nil, :a5, :g5,
  :f5, :g5, :a5, :c6, :d6, :c6, :a5, :g5, :a5, nil, :c6, :d6, :e6, nil, :a6, nil,
]

stretto_click [:dsaw, :prophet, :blade, :pluck, :supersaw], [:drum_splash_soft, :bd_haus, :sn_dolf, :perc_snap, :drum_cymbal_closed, :drum_cymbal_open]

# --- Batería ----------------------------------------------------------------
in_thread do
  with_fx :compressor, threshold: 0.4, clamp_time: 0.01 do
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      sample :drum_splash_soft, amp: 0.5 if bar > 0 && plan[bar - 1] != sec && [:chorus, :final, :verse].include?(sec)
      16.times do |s|
        half = (sec == :break)
        kick = half ? (s == 0 || s == 10) : (s % 4 == 0)
        sample :bd_haus, amp: 1.6, cutoff: 110 if kick
        if s == 4 || s == 12
          sample :sn_dolf, amp: 0.9
          sample :perc_snap, amp: 0.45 unless half
        end
        sample :drum_cymbal_closed, amp: (s % 2 == 0 ? 0.35 : 0.2), rate: 1.3 if !half && s.odd? || s % 4 == 2
        sample :drum_cymbal_open, amp: 0.25, release: 0.15, rate: 1.1 if [:chorus, :final].include?(sec) && s % 4 == 2
        sample :sn_dolf, amp: 0.35 + s * 0.02, rate: 1.1 if section_end?(plan, bar) && s >= 12
        sleep 0.25
      end
    end
  end
end if stem?(:drums)

# --- Bajo -------------------------------------------------------------------
in_thread do
  use_synth :dsaw
  plan.each_with_index do |sec, bar|
    next if bar < from_bar
    root = chords_for.call(sec, bar)[0] - 12
    if sec == :break
      play root, attack: 0.05, sustain: 3.2, release: 0.6, cutoff: 60, detune: 0.1, amp: 0.8
      sleep 4
    else
      8.times do |e|
        n = (e % 2 == 1 && [:chorus, :final].include?(sec)) ? root + 12 : root
        play n, release: 0.22, cutoff: (sec == :final ? 82 : 72), detune: 0.12, amp: 0.85
        sleep 0.5
      end
    end
  end
end if stem?(:bass)

# --- Acordes ----------------------------------------------------------------
in_thread do
  with_fx :reverb, room: 0.8, mix: 0.45 do
    use_synth :prophet
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      c = chords_for.call(sec, bar)
      if [:chorus, :final].include?(sec)
        # Estribillo: golpes a contratiempo además del colchón.
        play c + [c[0] + 12], attack: 0.3, sustain: 2.6, release: 1, cutoff: 80, amp: 0.22
        4.times do
          sleep 0.5
          play c, release: 0.18, cutoff: 95, amp: 0.25
          sleep 0.5
        end
      else
        play c + [c[0] + 12], attack: 0.6, sustain: 2.6, release: 1.2, cutoff: 78, amp: 0.3
        sleep 4
      end
    end
  end
end if stem?(:chords)

# --- Melodía ----------------------------------------------------------------
in_thread do
  with_fx :reverb, room: 0.6, mix: 0.3 do
    with_fx :echo, phase: 0.75, decay: 2, mix: 0.2 do
      use_synth :blade
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        line = [:chorus, :final].include?(sec) ? chorus_mel[bar % 4] : verse_mel[bar % 4]
        shift = sec == :bridge ? 12 : 0
        line.each do |n|
          play n + shift, attack: 0.01, release: 0.35, cutoff: 100, vibrato_depth: 0.1, amp: 0.55 if n
          sleep 0.5
        end
      end
    end
  end
end if stem?(:melody)

# --- Arpegio ----------------------------------------------------------------
in_thread do
  with_fx :echo, phase: 0.375, decay: 1.5, mix: 0.25 do
    use_synth :pluck
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      c = chords_for.call(sec, bar)
      notes = [c[0] + 12, c[1] + 12, c[2] + 12, c[0] + 24]
      16.times do |s|
        n = notes[[0, 1, 2, 3, 2, 1][s % 6]]
        play n, amp: 0.55, coef: 0.35, pan: (s.even? ? -0.3 : 0.3)
        sleep 0.25
      end
    end
  end
end if stem?(:arp)

# --- Solo (solo en el estribillo final) --------------------------------------
in_thread do
  with_fx :reverb, room: 0.7, mix: 0.3 do
    use_synth :supersaw
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      if sec == :final
        16.times do |s|
          n = solo_line[(bar % 2) * 16 + s]
          play n, release: 0.2, cutoff: 105, amp: 0.4 if n
          sleep 0.25
        end
      else
        sleep 4
      end
    end
  end
end if stem?(:solo)
