import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  validateSecurityPolicyFiles,
  validateSecurityPolicyVersion,
} from "./validate-security-policy-version.mjs";

const supportedStatus = 'Yes';
const policyFor = (version) => `## Supported Versions

| Version | Supported |
| ------- | --------- |
| ${version} | ${supportedStatus} |
| Earlier releases | No |
`;

test("accepts the exact package version", () => {
  assert.deepEqual(
    validateSecurityPolicyVersion('{"version":"1.2.3"}', policyFor("1.2.3")),
    { valid: true, version: "1.2.3" },
  );
});

test("accepts SemVer build metadata when the policy matches exactly", () => {
  const version = "1.2.3+build.4";
  assert.deepEqual(
    validateSecurityPolicyVersion(`{"version":"${version}"}`, policyFor(version)),
    { valid: true, version },
  );
});

test("rejects prerelease package versions", () => {
  assert.equal(
    validateSecurityPolicyVersion('{"version":"1.2.3-beta.1"}', policyFor("1.2.3")).valid,
    false,
  );
});

test("uses only the table in the Supported Versions section", () => {
  const policy = `## Example

| Version | Supported |
| ------- | --------- |
| 1.2.2 | ${supportedStatus} |

${policyFor("1.2.3")}`;
  assert.deepEqual(
    validateSecurityPolicyVersion('{"version":"1.2.3"}', policy),
    { valid: true, version: "1.2.3" },
  );
});

test("rejects a malformed supported-versions table", () => {
  const policy = `## Supported Versions

| Version | Supported |
This is not a table delimiter.
| 1.2.3 | ${supportedStatus} |`;
  assert.equal(
    validateSecurityPolicyVersion('{"version":"1.2.3"}', policy).error,
    "SECURITY.md is missing a supported-versions table.",
  );
});

test("reads package and policy files", () => {
  const directory = mkdtempSync(join(tmpdir(), "security-policy-"));

  try {
    const packageJsonPath = join(directory, "package.json");
    const policyPath = join(directory, "SECURITY.md");
    writeFileSync(packageJsonPath, '{"version":"1.2.3"}');
    writeFileSync(policyPath, policyFor("1.2.3"));

    assert.deepEqual(
      validateSecurityPolicyFiles(packageJsonPath, policyPath),
      { valid: true, version: "1.2.3" },
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
