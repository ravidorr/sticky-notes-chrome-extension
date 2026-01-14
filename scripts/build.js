/**
 * Build script for Chrome extension
 * Runs separate Vite builds for content, background, and popup
 * 
 * Usage:
 *   npm run build      - Production build (Chrome Web Store OAuth client)
 *   npm run build:dev  - Development build (local OAuth client)
 */

import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { copyFileSync, mkdirSync, existsSync, rmSync, readdirSync, createWriteStream, readFileSync, writeFileSync } from 'fs';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// OAuth client IDs for different environments
const OAUTH_CLIENTS = {
  development: '413613230006-c8044e50sohrq813h1ejfjdojfcsfa2n.apps.googleusercontent.com',
  production: '413613230006-ukaectcb0rd3gq1jjnthc0kd4444ccg3.apps.googleusercontent.com'
};

// Determine build environment from command line args or env var
// Default is production; use --development flag or BUILD_ENV=development for dev builds
const isDevelopment = process.argv.includes('--development') || process.env.BUILD_ENV === 'development';
const buildEnv = isDevelopment ? 'development' : 'production';
const oauthClientId = OAUTH_CLIENTS[buildEnv];

// Output to dist/chrome for browser-specific builds
const distBaseDir = resolve(rootDir, 'dist');
const distDir = resolve(distBaseDir, 'chrome');

// Clean entire dist folder (will be rebuilt)
if (existsSync(distBaseDir)) {
  rmSync(distBaseDir, { recursive: true });
}
mkdirSync(distDir, { recursive: true });

// Copy static files
function copyStaticFiles() {
  const publicDir = resolve(rootDir, 'public');
  
  // Copy and transform manifest with correct OAuth client ID
  const manifestPath = resolve(publicDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  
  // Update OAuth client ID based on build environment
  if (manifest.oauth2) {
    manifest.oauth2.client_id = oauthClientId;
  }
  
  writeFileSync(
    resolve(distDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
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
  
  // Copy _locales folder
  const localesDir = resolve(publicDir, '_locales');
  if (existsSync(localesDir)) {
    copyLocalesFolder(localesDir, resolve(distDir, '_locales'));
  }
  
  console.log('Static files copied');
}

// Recursively copy locales folder
function copyLocalesFolder(src, dest) {
  mkdirSync(dest, { recursive: true });
  
  const entries = readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = resolve(src, entry.name);
    const destPath = resolve(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyLocalesFolder(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

// Common build options
const commonOptions = {
  configFile: false,
  publicDir: false, // Disable automatic copying from public/ - we handle it manually
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
  
  // Copy popup.css (Vite doesn't process linked CSS in HTML correctly with this config)
  copyFileSync(
    resolve(rootDir, 'src/popup/popup.css'),
    resolve(distDir, 'src/popup/popup.css')
  );
  
  console.log('Popup built');
}

// Create zip file of the chrome folder
async function createZipFile() {
  console.log('Creating zip file...');
  
  const zipPath = resolve(rootDir, 'dist/chrome.zip');
  
  // Remove existing zip if present
  if (existsSync(zipPath)) {
    rmSync(zipPath);
  }
  
  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });
    
    output.on('close', () => {
      const sizeKB = (archive.pointer() / 1024).toFixed(2);
      console.log(`Zip file created: dist/chrome.zip (${sizeKB} KB)`);
      resolve();
    });
    
    archive.on('error', (err) => {
      reject(err);
    });
    
    archive.pipe(output);
    
    // Add the contents of the chrome folder to the zip
    archive.directory(distDir, false);
    
    archive.finalize();
  });
}

// Run all builds
async function main() {
  console.log(`Building Chrome extension (${buildEnv.toUpperCase()})...\n`);
  console.log(`OAuth Client: ${buildEnv === 'production' ? 'Chrome Web Store' : 'Local Development'}\n`);
  
  try {
    copyStaticFiles();
    await buildContent();
    await buildBackground();
    await buildPopup();
    
    // Only create zip for production builds
    if (!isDevelopment) {
      await createZipFile();
      console.log('\nBuild complete! Output in dist/chrome/');
      console.log('Zip file ready for upload: dist/chrome.zip');
    } else {
      console.log('\nBuild complete! Output in dist/chrome/');
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

main();
