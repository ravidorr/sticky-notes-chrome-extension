/**
 * Decides whether a change touches the code that ships in the Chrome extension.
 *
 * The version bump rule and the Chrome Web Store submission both depend on it:
 * a release is only needed, and a version bump is only allowed, when the
 * extension itself changes. Documentation, tests, CI, the marketing site and
 * the Cloud Functions are never shipped in the extension.
 */

// Source that is bundled into the extension
const EXTENSION_DIRECTORIES = ['src/'];

// What copyStaticFiles() in scripts/build.js copies out of public/: the Chrome
// manifest, the four PNG icons and the locales. Vite's own copying of public/ is
// disabled, so any other file there (the Edge manifest, SVG icons) never ships.
const PACKAGED_PUBLIC_FILE = /^public\/(manifest\.json|icons\/icon(16|32|48|128)\.png|_locales\/.+)$/;

// Files that decide what gets built, even though they are not packaged. The
// build runs Vite with configFile: false, so vite.config.js is not one of them.
const EXTENSION_BUILD_FILES = [
  'scripts/build.js',
  'scripts/manifest-version.mjs'
];
const TEST_FILE = /\.(test|spec)\.[cm]?js$/;

// package.json fields that change what is bundled or how it is built
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'overrides'
];

const MAX_LISTED_FILES = 5;

export function isExtensionFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/');

  if (TEST_FILE.test(normalized)) {
    return false;
  }

  return EXTENSION_BUILD_FILES.includes(normalized) ||
    PACKAGED_PUBLIC_FILE.test(normalized) ||
    EXTENSION_DIRECTORIES.some((directory) => normalized.startsWith(directory));
}

// JSON with sorted keys, so reordering keys does not look like a change
function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.keys(value).sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

function parseJson(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Whether package.json changed in a field that affects the bundle. Scripts,
 * lint settings and the version itself do not count. Unreadable input counts
 * as changed, so a broken file never hides a change.
 */
export function packageDependenciesChanged(basePackageJson, currentPackageJson) {
  const base = parseJson(basePackageJson);
  const current = parseJson(currentPackageJson);

  if (!base || !current) {
    return true;
  }

  return DEPENDENCY_FIELDS.some(
    (field) => stableStringify(base[field] ?? null) !== stableStringify(current[field] ?? null)
  );
}

function withoutVersion(lock) {
  const copy = JSON.parse(JSON.stringify(lock));
  delete copy.version;

  if (copy.packages?.['']) {
    delete copy.packages[''].version;
  }

  return copy;
}

/**
 * Whether package-lock.json changed beyond the version of the root package.
 * Unreadable input counts as changed.
 */
export function lockDependenciesChanged(baseLockJson, currentLockJson) {
  const base = parseJson(baseLockJson);
  const current = parseJson(currentLockJson);

  if (!base || !current) {
    return true;
  }

  return stableStringify(withoutVersion(base)) !== stableStringify(withoutVersion(current));
}

/**
 * @param {Object} change
 * @param {string[]} change.changedFiles - Paths changed by the pull request
 * @param {string} change.basePackage - package.json before the change
 * @param {string} change.currentPackage - package.json after the change
 * @param {string} change.basePackageLock - package-lock.json before the change
 * @param {string} change.currentPackageLock - package-lock.json after the change
 * @returns {{changed: boolean, reasons: string[]}} Whether extension code changed, and why
 */
export function describeExtensionChange({
  changedFiles,
  basePackage,
  currentPackage,
  basePackageLock,
  currentPackageLock
}) {
  const reasons = [];
  const files = changedFiles.filter(isExtensionFile);

  if (files.length > 0) {
    const listed = files.slice(0, MAX_LISTED_FILES).join(', ');
    const more = files.length > MAX_LISTED_FILES ? `, and ${files.length - MAX_LISTED_FILES} more` : '';
    reasons.push(`extension files changed: ${listed}${more}`);
  }

  if (packageDependenciesChanged(basePackage, currentPackage)) {
    reasons.push('dependencies changed in package.json');
  }

  if (lockDependenciesChanged(basePackageLock, currentPackageLock)) {
    reasons.push('dependencies changed in package-lock.json');
  }

  return { changed: reasons.length > 0, reasons };
}
