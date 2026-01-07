/**
 * Build script for Chrome extension
 * Runs separate Vite builds for content, background, and popup
 */

import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { copyFileSync, mkdirSync, existsSync, rmSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// Clean dist folder
const distDir = resolve(rootDir, 'dist');
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true });
}
mkdirSync(distDir, { recursive: true });

// Copy static files
function copyStaticFiles() {
  const publicDir = resolve(rootDir, 'public');
  
  // Copy manifest
  copyFileSync(
    resolve(publicDir, 'manifest.json'),
    resolve(distDir, 'manifest.json')
  );
  
  // Copy icons
  const iconsDir = resolve(distDir, 'icons');
  mkdirSync(iconsDir, { recursive: true });
  
  const iconSizes = ['16', '32', '48', '128'];
  iconSizes.forEach(size => {
    const iconPath = resolve(publicDir, 'icons', `icon${size}.png`);
    if (existsSync(iconPath)) {
      copyFileSync(iconPath, resolve(iconsDir, `icon${size}.png`));
    }
  });
  
  console.log('Static files copied');
}

// Common build options
const commonOptions = {
  configFile: false,
  resolve: {
    alias: {
      '@': resolve(rootDir, 'src')
    }
  },
  build: {
    minify: false,
    sourcemap: true
  }
};

// Build content script (IIFE - no ES modules)
async function buildContent() {
  console.log('Building content script...');
  
  // Create directory
  mkdirSync(resolve(distDir, 'src/content'), { recursive: true });
  
  await build({
    ...commonOptions,
    build: {
      ...commonOptions.build,
      outDir: distDir,
      emptyOutDir: false,
      rollupOptions: {
        input: resolve(rootDir, 'src/content/index.js'),
        output: {
          format: 'iife',
          name: 'StickyNotesContent',
          entryFileNames: 'src/content/content.js',
          inlineDynamicImports: true
        }
      }
    }
  });
  console.log('Content script built');
}

// Build background script (ES module - service workers support it)
async function buildBackground() {
  console.log('Building background script...');
  
  // Create directory
  mkdirSync(resolve(distDir, 'src/background'), { recursive: true });
  
  await build({
    ...commonOptions,
    build: {
      ...commonOptions.build,
      outDir: distDir,
      emptyOutDir: false,
      rollupOptions: {
        input: resolve(rootDir, 'src/background/index.js'),
        output: {
          format: 'es',
          entryFileNames: 'src/background/background.js',
          inlineDynamicImports: true
        }
      }
    }
  });
  console.log('Background script built');
}

// Build popup (standard web bundle)
async function buildPopup() {
  console.log('Building popup...');
  
  // Create popup directory
  mkdirSync(resolve(distDir, 'src/popup'), { recursive: true });
  
  await build({
    ...commonOptions,
    build: {
      ...commonOptions.build,
      outDir: distDir,
      emptyOutDir: false,
      rollupOptions: {
        input: {
          popup: resolve(rootDir, 'src/popup/popup.html')
        },
        output: {
          format: 'iife',
          entryFileNames: 'src/popup/[name].js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith('.css')) {
              return 'src/popup/[name][extname]';
            }
            return 'assets/[name][extname]';
          }
        }
      }
    }
  });
  console.log('Popup built');
}

// Run all builds
async function main() {
  console.log('Building Chrome extension...\n');
  
  try {
    copyStaticFiles();
    await buildContent();
    await buildBackground();
    await buildPopup();
    
    console.log('Build complete! Output in dist/');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

main();
