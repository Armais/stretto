# Runner de Stretto: evalúa el código que llega por OSC /run-code al puerto de cues (lo que
# manda stems.py) y avisa al grabador cuando ha entrado.
# Adaptado del runner de mantle (EliasEliseo/mantle/tools/audio/sonicpi/runner.rb).

live_loop :stretto_listen do
  use_real_time
  d = sync "/osc*/run-code"
  code = d[0].to_s
  use_osc "127.0.0.1", 5053
  begin
    eval(code)
    osc "/stretto/started"
    puts "STRETTO runner: segmento en marcha (#{code.length} chars)"
  rescue Exception => e
    osc "/stretto/error", e.message.to_s[0, 200]
    puts "STRETTO runner ERROR: #{e.message}"
  end
end

puts "STRETTO runner listo: esperando /run-code"
