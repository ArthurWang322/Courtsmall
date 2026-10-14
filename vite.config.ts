import { defineConfig } from 'vitest/config';

// Tauri expects a fixed dev port and a static build in dist/.
// Three pages: the main window, and the stats (players.html) and line score (linescore.html) windows.
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true, rollupOptions: { input: { main: 'index.html', players: 'players.html', linescore: 'linescore.html' } } },
  test: { include: ['tests/**/*.test.ts'] },
});
