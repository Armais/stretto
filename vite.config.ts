import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: itch.io sirve el juego desde una subcarpeta.
  base: './',
  build: {
    outDir: 'dist',
    // Three.js ya pasa de 500 kB minificado; el aviso por defecto no aporta.
    chunkSizeWarningLimit: 2000,
  },
});
