import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages では https://<user>.github.io/family-game/jeanne/ に置かれる
  base: '/family-game/jeanne/',
  server: {
    host: true,
  },
  build: {
    // Phaser 本体だけで約1.2MBあるため、警告の基準を上げておく
    chunkSizeWarningLimit: 1500,
  },
});
