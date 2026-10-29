import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Tells a script whether it was started directly (node script.mjs) rather than
 * imported by another module.
 *
 * Compares real paths, so running through a symlink or a wrapper still runs the
 * script. A plain comparison of process.argv[1] with the module path silently
 * does nothing in that case, which makes a validation script pass without
 * checking anything.
 *
 * @param {string} moduleUrl - The script's import.meta.url
 * @param {string} [entryPath] - The path node was started with
 * @returns {boolean} True when the script is the entry point
 */
export function isEntryPoint(moduleUrl, entryPath = process.argv[1]) {
  try {
    return realpathSync(entryPath) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
