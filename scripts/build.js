/**
 * Build script for browser extensions (Chrome, Edge)
 * Runs separate Vite builds for content, background, and popup
 *
 * Usage:
 *   npm run build           - Production build for Chrome
 *   npm run build:dev       - Development build for Chrome
 *   npm run build:edge      - Production build for Edge
 *   npm run build:all       - Build for all browsers
 *   npm run build:analyze   - Build with bundle analysis
 */

import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { copyFileSync, mkdirSync, existsSync, rmSync, readdirSync, createWriteStream, readFileSync, writeFileSync } from 'fs';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// Supported browsers
const SUPPORTED_BROWSERS = ['chrome', 'edge'];

// OAuth client IDs for different environments and browsers
// Chrome uses "Chrome Extension" type OAuth clients (for getAuthToken)
// Edge uses "Web application" type OAuth clients (for launchWebAuthFlow)
const OAUTH_CLIENTS = {
  chrome: {
    development: '413613230006-c8044e50sohrq813h1ejfjdojfcsfa2n.apps.googleusercontent.com',
    production: '413613230006-ukaectcb0rd3gq1jjnthc0kd4444ccg3.apps.googleusercontent.com'
  },
  edge: {
    development: '413613230006-mu05ttk6b7kvu3j88fp514rkqmghrmiq.apps.googleusercontent.com',
    production: '413613230006-mu05ttk6b7kvu3j88fp514rkqmghrmiq.apps.googleusercontent.com' // TODO: Create separate production client
  }
};

// Determine build environment from command line args or env var
// Default is production; use --development flag or BUILD_ENV=development for dev builds
const isDevelopment = process.argv.includes('--development') || process.env.BUILD_ENV === 'development';
const buildEnv = isDevelopment ? 'development' : 'production';

// Determine if bundle analysis is enabled
const isAnalyze = process.argv.includes('--analyze');

// Determine target browser from command line args
// Default is chrome; use --browser=edge for Edge builds
const browserArg = process.argv.find(arg => arg.startsWith('--browser='));
const targetBrowser = browserArg ? browserArg.split('=')[1] : 'chrome';

// Validate browser target
if (!SUPPORTED_BROWSERS.includes(targetBrowser)) {
  console.error(`Unsupported browser: ${targetBrowser}. Supported: ${SUPPORTED_BROWSERS.join(', ')}`);
  process.exit(1);
}

// Get manifest filename for target browser
function getManifestFilename(browser) {
  if (browser === 'edge') return 'manifest.edge.json';
  return 'manifest.json';
}

// Output to dist/<browser> for browser-specific builds
const distBaseDir = resolve(rootDir, 'dist');
const distDir = resolve(distBaseDir, targetBrowser);

// Clean target browser folder only (preserve other browser builds)
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true });
}
mkdirSync(distDir, { recursive: true });

// Read version from package.json (single source of truth)
function getVersionFromPackageJson() {
  const packageJsonPath = resolve(rootDir, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  return packageJson.version;
}

// Copy static files
function copyStaticFiles() {
  const publicDir = resolve(rootDir, 'public');
  const version = getVersionFromPackageJson();
  
  // Copy and transform manifest with correct OAuth client ID and version
  const manifestFilename = getManifestFilename(targetBrowser);
  const manifestPath = resolve(publicDir, manifestFilename);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  
  // Sync version from package.json to manifest
  manifest.version = version;
  
  // Remove 'key' field - it's used for development but not allowed in Chrome Web Store
  delete manifest.key;
  
  // Update OAuth client ID based on build environment and browser
  if (manifest.oauth2) {
    manifest.oauth2.client_id = OAUTH_CLIENTS[targetBrowser][buildEnv];
  }
  
  // Always output as manifest.json regardless of source filename
  writeFileSync(
    resolve(distDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  
  console.log(`Version synced from package.json: ${version}`);
  
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

// Get OAuth client ID for current browser and environment
function getOAuthClientIdForBuild() {
  return OAUTH_CLIENTS[targetBrowser][buildEnv];
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
  define: {
    // Inject OAuth client ID at build time
    'import.meta.env.VITE_OAUTH_CLIENT_ID': JSON.stringify(getOAuthClientIdForBuild())
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

// Build page context script (IIFE - runs in MAIN world for console capture)
async function buildPageContext() {
  console.log('Building page context script...');
  
  await build({
    ...commonOptions,
    build: {
      ...commonOptions.build,
      outDir: distDir,
      emptyOutDir: false,
      rollupOptions: {
        input: resolve(rootDir, 'src/content/pageContext.js'),
        output: {
          format: 'iife',
          name: 'StickyNotesPageContext',
          entryFileNames: 'src/content/pageContext.js',
          inlineDynamicImports: true
        }
      }
    }
  });
  console.log('Page context script built');
}

// Build background script (ES module - service workers support it)
// Uses code splitting to lazy-load Firebase SDK for faster cold starts
async function buildBackground() {
  console.log('Building background script...');

  // Create directory
  mkdirSync(resolve(distDir, 'src/background'), { recursive: true });

  // Conditionally add visualizer plugin for bundle analysis
  const plugins = [];
  if (isAnalyze) {
    const { visualizer } = await import('rollup-plugin-visualizer');
    plugins.push(visualizer({
      filename: resolve(distBaseDir, `${targetBrowser}-stats.html`),
      open: true,
      gzipSize: true,
      brotliSize: true,
      template: 'treemap'
    }));
    console.log('Bundle analysis enabled - will generate stats.html');
  }

  // Build as ES module with code splitting for Firebase lazy loading
  await build({
    ...commonOptions,
    plugins,
    build: {
      ...commonOptions.build,
      outDir: distDir,
      emptyOutDir: false,
      // Disable module preload polyfill - we'll fix window references manually
      modulePreload: false,
      rollupOptions: {
        input: resolve(rootDir, 'src/background/index.js'),
        output: {
          format: 'es',
          entryFileNames: 'src/background/background.js',
          // Enable code splitting - Firebase will be in separate chunks
          chunkFileNames: 'src/background/[name]-[hash].js',
          // Don't use manualChunks - let Rollup handle chunking naturally
          // This keeps lazy.js in the main bundle so its dynamic imports
          // actually work as lazy imports instead of being statically bundled
        }
      }
    }
  });
  
  // Post-process: Fix Vite's preload helper for service worker compatibility
  // Service workers don't have 'window' or 'document', so we need to replace
  // the entire __vitePreload function with a simple version that just calls import()
  const backgroundDir = resolve(distDir, 'src/background');
  const files = readdirSync(backgroundDir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const filePath = resolve(backgroundDir, file);
    let content = readFileSync(filePath, 'utf-8');
    let modified = false;
    
    // Replace the entire __vitePreload function with a service worker compatible version
    // The original uses document.* APIs which don't exist in service workers
    const vitePreloadRegex = /const __vitePreload = function preload\(baseModule, deps, importerUrl\) \{[\s\S]*?^\};$/m;
    if (vitePreloadRegex.test(content)) {
      content = content.replace(vitePreloadRegex, 
        `const __vitePreload = (baseModule) => baseModule();`
      );
      modified = true;
      console.log(`Simplified __vitePreload for service worker in ${file}`);
    }
    
    // Also fix any remaining window references
    if (content.includes('window.dispatchEvent')) {
      content = content.replace(/window\.dispatchEvent/g, 'self.dispatchEvent');
      modified = true;
      console.log(`Fixed window.dispatchEvent in ${file}`);
    }
    
    if (modified) {
      writeFileSync(filePath, content);
    }
  }
  
  console.log('Background script built');
}

// Build popup (IIFE bundle for fastest loading)
// Note: Code splitting hurts popup performance because each open is a fresh load
async function buildPopup() {
  console.log('Building popup...');
  
  // Create popup directory
  mkdirSync(resolve(distDir, 'src/popup'), { recursive: true });
  
  // Build popup.js as IIFE - single file loads faster than ES modules with chunks
  await build({
    ...commonOptions,
    build: {
      ...commonOptions.build,
      outDir: distDir,
      emptyOutDir: false,
      rollupOptions: {
        input: resolve(rootDir, 'src/popup/popup.js'),
        output: {
          format: 'iife',
          name: 'StickyNotesPopup',
          entryFileNames: 'src/popup/popup.js',
          inlineDynamicImports: true
        }
      }
    }
  });
  
  // Copy and transform popup.html to use regular script (not module)
  let popupHtml = readFileSync(resolve(rootDir, 'src/popup/popup.html'), 'utf-8');
  // Remove type="module" from script tags
  popupHtml = popupHtml.replace(/<script\s+type="module"\s+/g, '<script ');
  popupHtml = popupHtml.replace(/<script\s+type='module'\s+/g, '<script ');
  // If no script tag exists, add one before closing body tag
  if (!popupHtml.includes('<script')) {
    popupHtml = popupHtml.replace(
      '</body>',
      '  <script src="popup.js"></script>\n</body>'
    );
  }
  writeFileSync(resolve(distDir, 'src/popup/popup.html'), popupHtml);
  
  // Copy popup.css
  copyFileSync(
    resolve(rootDir, 'src/popup/popup.css'),
    resolve(distDir, 'src/popup/popup.css')
  );
  
  console.log('Popup built');
}

// Build options page (standard web bundle)
async function buildOptions() {
  console.log('Building options page...');
  
  // Create options directory
  mkdirSync(resolve(distDir, 'src/options'), { recursive: true });
  
  // Build options.js as IIFE (not using HTML entry to avoid type="module")
  await build({
    ...commonOptions,
    build: {
      ...commonOptions.build,
      outDir: distDir,
      emptyOutDir: false,
      rollupOptions: {
        input: resolve(rootDir, 'src/options/options.js'),
        output: {
          format: 'iife',
          name: 'StickyNotesOptions',
          entryFileNames: 'src/options/options.js',
          inlineDynamicImports: true
        }
      }
    }
  });
  
  // Copy and transform options.html to use regular script (not module)
  let optionsHtml = readFileSync(resolve(rootDir, 'src/options/options.html'), 'utf-8');
  // Remove type="module" from script tags - Chrome extension CSP doesn't allow module imports
  optionsHtml = optionsHtml.replace(/<script\s+type="module"\s+/g, '<script ');
  optionsHtml = optionsHtml.replace(/<script\s+type='module'\s+/g, '<script ');
  // If no script tag exists, add one before closing body tag
  if (!optionsHtml.includes('<script')) {
    optionsHtml = optionsHtml.replace(
      '</body>',
      '  <script src="options.js"></script>\n</body>'
    );
  }
  writeFileSync(resolve(distDir, 'src/options/options.html'), optionsHtml);
  
  // Copy options.css
  copyFileSync(
    resolve(rootDir, 'src/options/options.css'),
    resolve(distDir, 'src/options/options.css')
  );
  
  console.log('Options page built');
}

// Create zip file of the browser folder
async function createZipFile() {
  console.log('Creating zip file...');
  
  const zipPath = resolve(rootDir, `dist/${targetBrowser}.zip`);
  
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
      console.log(`Zip file created: dist/${targetBrowser}.zip (${sizeKB} KB)`);
      resolve();
    });
    
    archive.on('error', (err) => {
      reject(err);
    });
    
    archive.pipe(output);
    
    // Add the contents of the browser folder to the zip
    archive.directory(distDir, false);
    
    archive.finalize();
  });
}

// Run all builds
async function main() {
  const browserName = targetBrowser.charAt(0).toUpperCase() + targetBrowser.slice(1);
  const storeName = targetBrowser === 'edge' ? 'Edge Add-ons' : 'Chrome Web Store';
  
  console.log(`Building ${browserName} extension (${buildEnv.toUpperCase()})...\n`);
  console.log(`OAuth Client: ${buildEnv === 'production' ? storeName : 'Local Development'}\n`);
  
  try {
    copyStaticFiles();
    await buildContent();
    await buildPageContext();
    await buildBackground();
    await buildPopup();
    await buildOptions();
    
    // Only create zip for production builds
    if (!isDevelopment) {
      await createZipFile();
      console.log(`\nBuild complete! Output in dist/${targetBrowser}/`);
      console.log(`Zip file ready for upload: dist/${targetBrowser}.zip`);
    } else {
      console.log(`\nBuild complete! Output in dist/${targetBrowser}/`);
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

main();
