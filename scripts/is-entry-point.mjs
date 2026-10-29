import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Tells a script whether it was started directly (node script.mjs) rather than
 * imported by another module.
 *
 * Compares real paths, so a script started through a symlink or through a
 * differently spelled path still counts as the entry point. A wrapper module
 * that imports the script does not. A plain comparison of process.argv[1] with
 * the module path silently does nothing in the symlink case, which makes a
 * validation script pass without checking anything.
 *
 * Returns false only when there is no entry file at all: no entry path (node -e,
 * a REPL, stdin) or one that does not exist. Any other failure to resolve a
 * path throws, because returning false would let a gate script exit 0 without
 * running its checks.
 *
 * @param {string} moduleUrl - The script's import.meta.url
 * @param {string|null|undefined} [entryPath] - The path node was started with
 * @returns {boolean} True when the script is the entry point
 */
export function isEntryPoint(moduleUrl, entryPath = process.argv[1]) {
  if (!entryPath) {
    return false;
  }

  let entryRealPath;
  try {
    entryRealPath = realpathSync.native(entryPath);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      return false;
    }
    throw error;
  }

  return entryRealPath === realpathSync.native(fileURLToPath(moduleUrl));
}
