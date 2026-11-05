# Stretto · Nivel 3 · "Desierto" · house progresivo en sol menor
# @bpm 124
# @bars 64
# @final 56
#
# Las secciones son las mismas que src/game/levels.ts usa para generar las líneas de cambio.

use_bpm 124
use_debug false
use_transpose (get(:transpose) || 0)
# Se lee una vez: get() no es instantáneo y saltar compases con él retrasa los hilos.
from_bar = get(:from_bar) || 0

plan = stretto_plan([[:intro, 4], [:verse, 16], [:pre, 4], [:chorus, 8], [:break, 8],
                     [:build, 4], [:chorus, 8], [:bridge, 4], [:final, 8]])

verse_chords = [chord(:g3, :m7), chord(:eb3, :major7), chord(:bb2, :major), chord(:f3, :sus4)]
chorus_chords = [chord(:eb3, :major), chord(:f3, :major), chord(:g3, :minor), chord(:g3, :minor)]
break_chords = [chord(:c3, :m9), chord(:c3, :m9), chord(:eb3, :major7), chord(:d3, :sus4)]

chords_for = lambda do |section, bar|
  case section
  when :chorus, :final then chorus_chords[bar % 4]
  when :break then break_chords[bar % 4]
  else verse_chords[bar % 4]
  end
end
big = lambda { |sec| [:chorus, :final].include?(sec) }

verse_mel = [
  [:d5, nil, nil, :bb4, nil, nil, :g4, nil],
  [:bb4, nil, nil, :c5, nil, :d5, nil, nil],
  [:f5, nil, nil, :d5, nil, nil, :c5, nil],
  [:c5, nil, nil, nil, :bb4, nil, :a4, nil],
]
chorus_mel = [
  [:g5, nil, :g5, nil, :f5, nil, :eb5, :d5],
  [:c5, nil, :d5, nil, :f5, nil, :a5, nil],
  [:bb5, nil, :a5, nil, :g5, nil, :d5, nil],
  [:g5, nil, nil, :f5, :g5, nil, nil, nil],
]
solo_line = [
  :g6, :d6, :bb5, :d6, :g6, nil, :a6, :bb6, :a6, :f6, :d6, :f6, :a6, nil, :g6, :f6,
  :d6, :f6, :g6, :bb6, :c7, :bb6, :g6, :f6, :g6, nil, :bb6, :c7, :d7, nil, :g6, nil,
]

stretto_click [:tb303, :supersaw, :hollow, :blade, :pluck], [:drum_splash_soft, :bd_tek, :perc_snap, :drum_cymbal_open, :drum_cymbal_closed]

# --- Batería ----------------------------------------------------------------
in_thread do
  with_fx :compressor, threshold: 0.4 do
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      sample :drum_splash_soft, amp: 0.4 if bar > 0 && plan[bar - 1] != sec && big.call(sec)
      16.times do |s|
        brk = (sec == :break)
        sample :bd_tek, amp: 1.6, cutoff: 100 if (brk ? (s == 0 && bar.even?) : s % 4 == 0)
        sample :perc_snap, amp: 0.55, rate: 0.95 if (s == 4 || s == 12) && !brk
        sample :drum_cymbal_open, amp: 0.28, release: 0.18 if s % 4 == 2
        sample :drum_cymbal_closed, amp: [0.1, 0.18, 0.12, 0.2][s % 4], rate: 1.4 unless brk
        sample :perc_snap, amp: 0.2 + s * 0.025, rate: 1.3 if sec == :build && s.odd?
        sleep 0.25
      end
    end
  end
end if stem?(:drums)

# --- Bajo (a contratiempo, rodando) -------------------------------------------
in_thread do
  use_synth :tb303
  plan.each_with_index do |sec, bar|
    next if bar < from_bar
    root = chords_for.call(sec, bar)[0] - 12
    16.times do |s|
      if sec == :break
        play root, release: 0.4, cutoff: 60, res: 0.1, amp: 0.6 if s % 8 == 2
      elsif s % 4 == 2 || (big.call(sec) && s % 4 == 3)
        play root + (s % 8 == 7 ? 12 : 0), release: 0.14, cutoff: (big.call(sec) ? 85 : 72), res: 0.25, wave: 1, amp: 0.8
      end
      sleep 0.25
    end
  end
end if stem?(:bass)

# --- Acordes (supersierras en el estribillo, colchón en el resto) -------------
in_thread do
  with_fx :reverb, room: 0.85, mix: 0.45 do
    with_fx :lpf, cutoff: 110 do
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        c = chords_for.call(sec, bar)
        if big.call(sec)
          use_synth :supersaw
          play c, attack: 0.05, sustain: 3.4, release: 0.5, cutoff: 105, amp: 0.25
        else
          use_synth :hollow
          play c + [c[0] + 12], attack: 1, sustain: 2.5, release: 1.5, amp: 0.4
        end
        sleep 4
      end
    end
  end
end if stem?(:chords)

# --- Melodía (notas largas que cantan) ----------------------------------------
in_thread do
  with_fx :reverb, room: 0.8, mix: 0.4 do
    with_fx :echo, phase: 0.75, decay: 3, mix: 0.25 do
      use_synth :blade
      plan.each_with_index do |sec, bar|
        next if bar < from_bar
        line = big.call(sec) ? chorus_mel[bar % 4] : verse_mel[bar % 4]
        line.each do |n|
          play n, attack: 0.05, release: 0.9, cutoff: 95, vibrato_rate: 5, vibrato_depth: 0.08, amp: 0.5 if n
          sleep 0.5
        end
      end
    end
  end
end if stem?(:melody)

# --- Arpegio (pulsos con el filtro que se abre en las subidas) ----------------
in_thread do
  with_fx :echo, phase: 0.75, decay: 2, mix: 0.3 do
    use_synth :pluck
    plan.each_with_index do |sec, bar|
      next if bar < from_bar
      c = chords_for.call(sec, bar)
      notes = c.to_a.map { |n| n + 12 }
      16.times do |s|
        play notes[[0, 1, 2, 1, 3, 1, 2, 1][s % 8] % notes.length], amp: 0.6, coef: (sec == :build ? 0.1 + s * 0.02 : 0.3), pan: Math.sin(s * 0.8) * 0.4
        sleep 0.25
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
        16.times do |s|
          n = solo_line[(bar % 2) * 16 + s]
          play n, release: 0.22, cutoff: 108, amp: 0.35 if n
          sleep 0.25
        end
      else
        sleep 4
      end
    end
  end
end if stem?(:solo)
