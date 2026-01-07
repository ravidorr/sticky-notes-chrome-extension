import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Vite config for development/watch mode
 * 
 * NOTE: Main build is handled by scripts/build.js which creates
 * self-contained bundles for Chrome extension compatibility.
 * 
 * This config is used for:
 * - `npm run dev` (watch mode - runs build.js first, then watches)
 * - Tests and other development tooling
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    outDir: 'dist',
    minify: false,
    sourcemap: true
  }
});
