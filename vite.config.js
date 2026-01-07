import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Plugin to copy static files after build
function copyManifestPlugin() {
  return {
    name: 'copy-manifest',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      const publicDir = resolve(__dirname, 'public');
      
      // Create icons directory
      const iconsDir = resolve(distDir, 'icons');
      if (!existsSync(iconsDir)) {
        mkdirSync(iconsDir, { recursive: true });
      }
      
      // Copy manifest
      copyFileSync(
        resolve(publicDir, 'manifest.json'),
        resolve(distDir, 'manifest.json')
      );
      
      // Copy icons if they exist
      const iconSizes = ['16', '32', '48', '128'];
      iconSizes.forEach(size => {
        const iconPath = resolve(publicDir, 'icons', `icon${size}.png`);
        if (existsSync(iconPath)) {
          copyFileSync(iconPath, resolve(iconsDir, `icon${size}.png`));
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [
    copyManifestPlugin()
  ],
  build: {
    outDir: 'dist',
    emptyDirFirst: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/popup.html'),
        content: resolve(__dirname, 'src/content/index.js'),
        background: resolve(__dirname, 'src/background/index.js')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          // Keep the same directory structure
          if (chunkInfo.name === 'popup') {
            return 'src/popup/[name].js';
          }
          if (chunkInfo.name === 'content') {
            return 'src/content/[name].js';
          }
          if (chunkInfo.name === 'background') {
            return 'src/background/[name].js';
          }
          return '[name].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            if (assetInfo.name.includes('content')) {
              return 'src/content/[name][extname]';
            }
            return 'src/popup/[name][extname]';
          }
          return 'assets/[name][extname]';
        }
      }
    },
    // Don't minify for easier debugging during development
    minify: false,
    sourcemap: true
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});
