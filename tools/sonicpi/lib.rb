# Biblioteca común de las canciones de Stretto. Se manda delante de cada canción.
# get(:stem) dice qué capa se está grabando (:drums, :bass, :chords, :melody, :arp,
# :solo) o :all para oírlo todo junto.

define :stem? do |layer|
  get(:stem) == :all || get(:stem) == layer
end

# Calentamiento, golpe agudo de sincronía y un compás de espera. El grabador busca el golpe
# en cada pista y corta un compás después, así las seis quedan alineadas a la muestra.
# El primer sonido de cada sintetizador tras mandar código se pierde (se está cargando), así
# que antes se tocan todos en silencio y se precargan las muestras.
define :stretto_click do |synths = [], samples = []|
  load_samples(samples) unless samples.empty?
  ([:sine] + synths).each { |s| synth s, note: 60, amp: 0.0001, release: 0.05 }
  sleep 2
  synth :sine, note: :c8, attack: 0, sustain: 0.02, release: 0.03, amp: 1.5
  sleep 4
end

# Plan de la canción: un símbolo de sección por compás.
define :stretto_plan do |sections|
  sections.flat_map { |name, bars| [name] * bars }
end

# ¿Es el último compás de una sección? (para los redobles)
define :section_end? do |plan, bar|
  bar + 1 < plan.length && plan[bar + 1] != plan[bar]
end
