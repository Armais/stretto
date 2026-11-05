# Efectos de sonido de Stretto (P13). Se graban todos en una toma: tras el golpe de
# sincronía, cada efecto suena al principio de su casilla de @slot segundos y stems.py los
# corta por esas posiciones. @sounds dice el orden y cuántas variantes tiene cada uno
# (stems.py lo lee de aquí y lo manda en sfx_order). Se manda detrás de lib.rb.
# @slot 2.5
# @sounds shift_good:3 shift_perfect:3 grind:2 overrev:1 lug:1 crash:2 nitro:1 repair:1 points:1 multiplier:1

use_bpm 60
use_debug false

# ---------------------------------------------------------------- piezas

# Palanca que entra: golpe sordo, clac metálico y un segundo clic al asentarse en la guía.
clunk = lambda do |a, r|
  sample :bd_tek, rate: 1.6 * r, amp: 1.1 * a, lpf: 105, sustain: 0.06, release: 0.08
  sample :elec_tick, rate: 0.8 * r, amp: 0.7 * a
  sample :drum_cymbal_closed, rate: 1.8 * r, amp: 0.22 * a, hpf: 90, sustain: 0.01, release: 0.05
  synth :bnoise, attack: 0.001, sustain: 0.015, release: 0.06, cutoff: 100, amp: 0.3 * a
  sleep 0.035
  sample :elec_tick, rate: 1.2 * r, amp: 0.35 * a
end

# Engranajes que no casan: zumbido troceado, chirrido metálico y distorsión.
grind_core = lambda do |dur, a, v|
  with_fx :distortion, distort: 0.6, mix: 0.7 do
    with_fx :slicer, phase: 0.025 + v * 0.004, wave: 0, pulse_width: 0.4, smooth: 0.002 do
      synth :saw, note: 50 + v, attack: 0.005, sustain: dur * 0.7, release: dur * 0.3, cutoff: 105, amp: 0.45 * a
      with_fx :ring_mod, freq: 70 + v * 2, mod_amp: 1 do
        with_fx :rbpf, centre: 95, res: 0.5 do
          synth :noise, attack: 0.003, sustain: dur * 0.7, release: dur * 0.3, amp: 1.0 * a
        end
      end
    end
  end
  sample :elec_tick, rate: 0.5, amp: 0.6 * a
end

# La marcha que entra sola tras pisar la línea: un poco de rascada y un golpe más duro.
crunch = lambda do |v|
  grind_core.call(0.12, 0.8, v)
  sleep 0.1
  clunk.call(1.15, 0.85)
end

# ---------------------------------------------------------------- efectos

shift_good = lambda do |v|
  clunk.call(1.0, [1.0, 0.96, 1.04][v])
end

shift_perfect = lambda do |v|
  in_thread { clunk.call(1.0, [1.0, 0.96, 1.04][v]) }
  # Destello que sube: un barrido, no una nota fija, para que no choque con ninguna tonalidad.
  with_fx :reverb, room: 0.4, mix: 0.3 do
    s = synth :sine, note: 86 + v, note_slide: 0.09, attack: 0.004, sustain: 0.05, release: 0.14, amp: 0.25
    control s, note: 100 + v
    with_fx :hpf, cutoff: 110 do
      synth :noise, attack: 0.004, sustain: 0.05, release: 0.16, amp: 0.18
    end
  end
end

grind = lambda do |v|
  grind_core.call(0.38, 1.0, v)
end

# Línea de subir pisada: el motor rebota contra el corte de inyección, petardea y entra la marcha.
overrev = lambda do |v|
  with_fx :distortion, distort: 0.55 do
    with_fx :lpf, cutoff: 98 do
      4.times do |i|
        synth :dsaw, note: 56 - i * 0.25, detune: 0.15, attack: 0.004, sustain: 0.045, release: 0.02, amp: 0.55
        synth :square, note: 44 - i * 0.25, attack: 0.004, sustain: 0.045, release: 0.02, amp: 0.25
        sleep 0.085
      end
    end
  end
  sample :drum_snare_hard, rate: 0.6, amp: 0.35, lpf: 85, sustain: 0.05, release: 0.15
  sleep 0.06
  crunch.call(v)
end

# Línea de bajar pisada: el motor se ahoga a pocas vueltas, da tirones y entra la marcha.
lug = lambda do |v|
  sample :bd_fat, rate: 0.6, amp: 0.5
  with_fx :slicer, phase: 0.08, wave: 1, pulse_width: 0.6, smooth: 0.01 do
    with_fx :distortion, distort: 0.4 do
      with_fx :lpf, cutoff: 75 do
        s = synth :square, note: 36, note_slide: 0.4, attack: 0.01, sustain: 0.32, release: 0.08, amp: 0.7
        control s, note: 30
      end
    end
  end
  sleep 0.42
  crunch.call(v)
end

crash = lambda do |v|
  use_random_seed 100 + v
  sample [:perc_impact1, :perc_impact2][v], amp: 0.8, rate: 0.9
  sample :drum_heavy_kick, rate: 0.6, amp: 0.7, lpf: 90
  s = synth :sine, note: 40, note_slide: 0.35, sustain: 0.1, release: 0.35, amp: 0.8
  control s, note: 26
  with_fx :reverb, room: 0.5, mix: 0.25 do
    synth :bnoise, attack: 0.001, sustain: 0.05, release: 0.5, cutoff: 110, amp: 0.7
    sample :drum_splash_hard, rate: 1.4, amp: 0.35, hpf: 80, sustain: 0.2, release: 0.6
    # Restos de chapa y cristal que caen.
    5.times do
      sleep rrand(0.04, 0.09)
      sample [:elec_tick, :perc_snap, :drum_cymbal_closed].choose, rate: rrand(1.4, 2.2), amp: rrand(0.1, 0.25), hpf: 80
    end
  end
end

# Nitro: soplido que se abre y silbido de turbo que sube.
nitro = lambda do |v|
  sample :perc_swoosh, amp: 0.5, rate: 1.2
  with_fx :reverb, room: 0.4, mix: 0.2 do
    with_fx :rbpf, centre: 70, res: 0.5, centre_slide: 0.45 do |f|
      synth :noise, attack: 0.05, sustain: 0.3, release: 0.35, amp: 1.2
      control f, centre: 118
    end
    s = synth :saw, note: 60, note_slide: 0.45, attack: 0.05, sustain: 0.25, release: 0.3, cutoff: 90, amp: 0.15
    control s, note: 84
  end
end

# Reparación: carraca de llave, chapa y dos notas que suben una quinta.
repair = lambda do |v|
  5.times do |i|
    sample :elec_tick, rate: 1.6 + i * 0.05, amp: 0.5, hpf: 60
    sample :drum_cymbal_closed, rate: 2.5, amp: 0.12, sustain: 0.01, release: 0.03
    sleep 0.035
  end
  sleep 0.04
  sample :drum_cowbell, rate: 0.8, amp: 0.3, lpf: 100
  with_fx :reverb, room: 0.3, mix: 0.2 do
    synth :pretty_bell, note: 79, release: 0.25, amp: 0.25
    sleep 0.08
    synth :pretty_bell, note: 86, release: 0.4, amp: 0.25
  end
end

# Puntos: dos campanitas a una quinta (sin tercera, para no chocar con el modo de la canción).
points = lambda do |v|
  with_fx :reverb, room: 0.25, mix: 0.2 do
    sample :elec_tick, rate: 2, amp: 0.3
    synth :pretty_bell, note: 84, release: 0.15, amp: 0.3
    sleep 0.06
    synth :pretty_bell, note: 91, release: 0.35, amp: 0.3
  end
end

# Multiplicador: arpegio de quintas y octavas que sube, con un brillo al final.
multiplier = lambda do |v|
  with_fx :reverb, room: 0.5, mix: 0.3 do
    [72, 79, 84, 91, 96].each_with_index do |n, i|
      synth :pretty_bell, note: n, release: 0.3 + i * 0.05, amp: 0.22
      synth :sine, note: n + 12, release: 0.15, amp: 0.06
      sleep 0.05
    end
    with_fx :hpf, cutoff: 110 do
      synth :noise, attack: 0.02, sustain: 0.1, release: 0.4, amp: 0.12
    end
  end
end

sfx = {
  "shift_good" => shift_good, "shift_perfect" => shift_perfect, "grind" => grind,
  "overrev" => overrev, "lug" => lug, "crash" => crash, "nitro" => nitro,
  "repair" => repair, "points" => points, "multiplier" => multiplier,
}

# ---------------------------------------------------------------- toma

# En su propio hilo: el runner solo avisa al grabador cuando la evaluación termina.
in_thread do
  # Calentamiento: todo suena una vez en silencio, a la vez, para que carguen sintetizadores,
  # efectos y muestras (el primer sonido de cada uno se pierde mientras carga).
  # Escalonado: todos a la vez dan "Timing error: can't keep up".
  with_fx :level, amp: 0 do
    sfx_order.each do |name, n|
      n.times do |v|
        in_thread { sfx[name].call(v) }
        sleep 0.12
      end
    end
  end
  sleep 1.5

  stretto_click
  # A nivel 0.3: a nivel 1 la grabación satura. stems.py normaliza cada efecto después.
  sfx_order.each do |name, n|
    n.times do |v|
      in_thread { with_fx(:level, amp: 0.3) { sfx[name].call(v) } }
      sleep sfx_slot
    end
  end
end
