/**
 * Pre-flight check for the Edge Add-ons workflow.
 *
 * Decides whether a merge needs a new Edge submission. The Edge Add-ons API does
 * not report the published version cheaply, so the decision uses the repository
 * instead: the version in package.json changes together with the extension code
 * (see scripts/validate-version-bump.mjs), so a merged pull request that changed
 * the version released a new one. Versions are compared as Chrome manifest
 * versions (1.2.3+8 is 1.2.3.8), the same way the build writes them.
 *
 * The workflow also skips, successfully, when the Edge credentials are not
 * configured yet, so a merge never fails before the owner sets them up.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import process from 'node:process';
import { compareManifestVersions } from './check-chrome-web-store-version.mjs';
import { isEntryPoint } from './is-entry-point.mjs';
import { createChromeManifestVersion } from './manifest-version.mjs';

export const REQUIRED_SETTINGS = ['EDGE_CLIENT_ID', 'EDGE_API_KEY', 'EDGE_PRODUCT_ID'];

export function readPackageVersion(packageJson) {
  let version;
  try {
    ({ version } = JSON.parse(packageJson));
  } catch {
    throw new Error('package.json is not valid JSON.');
  }

  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('package.json must contain a non-empty version.');
  }

  return version;
}

/**
 * @param {Object} settings - Environment values; only whether they are set matters
 * @returns {string[]} Names of the Edge settings that are empty or missing
 */
export function findMissingSettings(settings) {
  return REQUIRED_SETTINGS.filter((name) => !settings[name]);
}

/**
 * @param {Object} input
 * @param {string|undefined} input.baseVersion - package.json version at the pull request base
 * @param {string} input.headVersion - package.json version at the merge commit
 * @param {boolean} [input.forced] - Submit whatever the versions are (manual run)
 * @returns {{submit: boolean, reason: string}}
 * @throws {Error} When a version cannot be converted to a manifest version
 */
export function decideEdgeSubmission({ baseVersion, headVersion, forced = false }) {
  const headManifest = createChromeManifestVersion(headVersion);

  if (forced) {
    return { submit: true, reason: `Manual run: submitting version ${headManifest} whatever the base version is.` };
  }

  if (baseVersion === undefined) {
    return { submit: true, reason: `No base version to compare with, so version ${headManifest} is treated as new.` };
  }

  const baseManifest = createChromeManifestVersion(baseVersion);
  const difference = compareManifestVersions(headManifest, baseManifest);

  if (difference === 0) {
    return {
      submit: false,
      reason: `Version ${headManifest} did not change in this merge, so the extension code did not change. ` +
        'Nothing is submitted to Edge Add-ons.'
    };
  }

  if (difference < 0) {
    return {
      submit: false,
      reason: `Version went down from ${baseManifest} to ${headManifest}. Edge Add-ons rejects a lower version, so nothing is submitted.`
    };
  }

  return { submit: true, reason: `Version changed from ${baseManifest} to ${headManifest}.` };
}

function readPackageJsonAt(sha) {
  return execFileSync('git', ['show', `${sha}:package.json`], { encoding: 'utf8' });
}

// The workflow log and run summary get the reason; the notice is what the owner sees on the run page
function reportToGithub({ submit, reason, notice }) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `submit=${submit}\n`);
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `${submit ? 'Submitting to' : 'Not submitting to'} Edge Add-ons: ${reason}\n`
    );
  }

  process.stdout.write(`${notice ? '::notice::' : ''}${submit ? 'Submitting' : 'Skipping submission'}: ${reason}\n`);
}

export function runCheck(env = process.env, readPackageJson = readPackageJsonAt) {
  const missing = findMissingSettings(env);

  if (missing.length > 0) {
    return {
      submit: false,
      notice: true,
      reason: `Edge publishing is skipped: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not configured. ` +
        'Set the secrets and the variable described in docs/EDGE_ADDONS_PUBLISHING.md to turn it on.'
    };
  }

  const headSha = env.HEAD_SHA;
  if (!headSha) {
    throw new Error('HEAD_SHA is required.');
  }

  const forced = env.EVENT_NAME === 'workflow_dispatch';
  const headVersion = readPackageVersion(readPackageJson(headSha));
  const baseVersion = forced || !env.BASE_SHA ? undefined : readPackageVersion(readPackageJson(env.BASE_SHA));

  return decideEdgeSubmission({ baseVersion, headVersion, forced });
}

function runCli() {
  try {
    reportToGithub(runCheck());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export const cliExecutionPromise = isEntryPoint(import.meta.url)
  ? Promise.resolve(runCli())
  : undefined;
