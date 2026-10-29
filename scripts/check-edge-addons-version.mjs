/**
 * Pre-flight check for the Edge Add-ons workflow.
 *
 * Decides whether a merge needs a new Edge submission. Chrome compares the build
 * with what the store has; the Edge Add-ons API does not report the published
 * version, so the decision uses the repository instead: the version in
 * package.json changes together with the extension code (see
 * scripts/validate-version-bump.mjs), so a merge commit whose package.json
 * version differs from its first parent released a new one. Versions are
 * compared as Chrome manifest versions (1.2.3+8 is 1.2.3.8), the same way the
 * build writes them.
 *
 * The first parent is the previous tip of main for a squash or rebase-free merge
 * and for a merge commit alike, unlike the pull request base, which can be stale.
 *
 * Missing Edge credentials never fail a merge that has nothing to release. When
 * none are configured and a release was due, the run stays green but says loudly
 * that the version was NOT submitted. A half configured setup, or a manual run
 * without credentials, fails.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import process from 'node:process';
import { compareManifestVersions } from './check-chrome-web-store-version.mjs';
import { isEntryPoint } from './is-entry-point.mjs';
import { createChromeManifestVersion } from './manifest-version.mjs';

export const REQUIRED_SETTINGS = ['EDGE_CLIENT_ID', 'EDGE_API_KEY', 'EDGE_PRODUCT_ID'];

export class GateError extends Error {}

export function readPackageVersion(packageJson, label = 'package.json') {
  let version;
  try {
    ({ version } = JSON.parse(packageJson));
  } catch {
    throw new GateError(`${label} is not valid JSON.`);
  }

  if (typeof version !== 'string' || version.length === 0) {
    throw new GateError(`${label} must contain a non-empty version.`);
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

function toManifestVersion(version, side) {
  try {
    return createChromeManifestVersion(version);
  } catch (error) {
    throw new GateError(`The ${side} version is not usable: ${error.message}`);
  }
}

/**
 * @param {Object} input
 * @param {string|undefined} input.baseVersion - package.json version at the first parent
 * @param {string} input.headVersion - package.json version at the merge commit
 * @param {boolean} [input.forced] - Submit whatever the versions are (manual run)
 * @returns {{submit: boolean, version: string, change: 'new'|'same'|'down', reason: string}}
 * @throws {GateError} When a version cannot be converted to a manifest version
 */
export function decideEdgeSubmission({ baseVersion, headVersion, forced = false }) {
  const version = toManifestVersion(headVersion, 'head');

  if (forced) {
    return {
      submit: true,
      version,
      change: 'new',
      reason: `Manual run: submitting version ${version} whatever the earlier version was.`
    };
  }

  if (baseVersion === undefined) {
    throw new GateError('No earlier version to compare with.');
  }

  const base = toManifestVersion(baseVersion, 'base');
  const difference = compareManifestVersions(version, base);

  if (difference === 0) {
    return {
      submit: false,
      version,
      change: 'same',
      reason: `Version ${version} did not change in this merge, so no new release is needed.`
    };
  }

  if (difference < 0) {
    return {
      submit: false,
      version,
      change: 'down',
      reason: `Version went down from ${base} to ${version}. Edge would be expected to reject a lower version, so nothing is submitted.`
    };
  }

  return { submit: true, version, change: 'new', reason: `Version changed from ${base} to ${version}.` };
}

function readPackageJsonAt(rev) {
  return execFileSync('git', ['show', `${rev}:package.json`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function readSide(read, rev, side) {
  let text;
  try {
    text = read(rev);
  } catch (error) {
    throw new GateError(
      `Cannot read package.json at the ${side} commit (${rev}): ${String(error.stderr ?? error.message).trim()} ` +
      'The workflow checks out the full history (fetch-depth: 0); a shallow checkout has no parent commit.'
    );
  }
  return readPackageVersion(text, `package.json at the ${side} commit (${rev})`);
}

/**
 * Decides what the workflow does.
 *
 * @returns {{submit: boolean, status: string, reason: string, level: 'warning'|null}}
 * @throws {GateError} When the run has to fail
 */
export function runCheck(env = process.env, readPackageJson = readPackageJsonAt) {
  const headSha = env.HEAD_SHA;
  if (!headSha) {
    throw new GateError('HEAD_SHA is required: the merge commit of the pull request has not been computed.');
  }

  const forced = env.EVENT_NAME === 'workflow_dispatch';
  const headVersion = readSide(readPackageJson, headSha, 'head');
  const baseVersion = forced ? undefined : readSide(readPackageJson, `${headSha}^1`, 'base');
  const decision = decideEdgeSubmission({ baseVersion, headVersion, forced });

  const missing = findMissingSettings(env);
  const someConfigured = missing.length < REQUIRED_SETTINGS.length;

  if (missing.length > 0 && (forced || someConfigured)) {
    throw new GateError(
      `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not configured, but ` +
      `${forced ? 'a manual run needs all three' : 'the others are set, so the setup is incomplete'}. ` +
      'See docs/EDGE_ADDONS_PUBLISHING.md.'
    );
  }

  if (missing.length > 0) {
    // Nothing is configured: a merge without a release says nothing, one with a release warns
    if (decision.change === 'new') {
      return {
        submit: false,
        level: 'warning',
        status: 'SKIPPED (credentials missing)',
        reason: `Version ${decision.version} was NOT submitted: ${missing.join(', ')} are not configured ` +
          '(on a pull request from a fork the secrets are never available). ' +
          'Set them as described in docs/EDGE_ADDONS_PUBLISHING.md, then start a run with Run workflow on main.'
      };
    }
  }

  return decisionResult(decision);
}

function decisionResult(decision) {
  if (decision.submit) {
    return { submit: true, level: null, status: 'SUBMITTING', reason: decision.reason };
  }

  if (decision.change === 'down') {
    return { submit: false, level: 'warning', status: 'SKIPPED (version went DOWN)', reason: decision.reason };
  }

  return { submit: false, level: null, status: 'SKIPPED (no release)', reason: decision.reason };
}

// Workflow commands are one line: escape what would end or change one
function escapeAnnotation(text) {
  return String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function writeSummary(line) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
  }
}

function runCli() {
  try {
    const result = runCheck();

    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `submit=${result.submit}\n`);
    }

    writeSummary(`Edge Add-ons: ${result.status}. ${result.reason}`);
    process.stdout.write(
      result.level === 'warning'
        ? `::warning::${escapeAnnotation(`Edge Add-ons ${result.status}: ${result.reason}`)}\n`
        : `${result.status}: ${result.reason}\n`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeSummary(`Edge Add-ons: FAILED. ${message}`);
    console.error(`::error::${escapeAnnotation(message)}`);
    process.exit(1);
  }
}

export const cliExecutionPromise = isEntryPoint(import.meta.url)
  ? Promise.resolve(runCli())
  : undefined;
