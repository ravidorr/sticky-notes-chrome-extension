import assert from "node:assert/strict";
import test from "node:test";

import { validateFunctionsLockfile, validateFunctionsLockfileFiles } from "./validate-functions-lockfile.mjs";

const pkg = (overrides = {}) =>
  JSON.stringify({
    name: "fn",
    engines: { node: "22" },
    dependencies: { "firebase-functions": "^7.4.0", cors: "^2.8.5" },
    ...overrides,
  });

const lock = (root = {}) =>
  JSON.stringify({
    packages: {
      "": {
        name: "fn",
        engines: { node: "22" },
        dependencies: { cors: "^2.8.5", "firebase-functions": "^7.4.0" },
        ...root,
      },
    },
  });

const firebase = (runtime = "nodejs22") => JSON.stringify({ functions: { runtime } });

test("accepts a consistent package, lockfile and runtime", () => {
  assert.deepEqual(validateFunctionsLockfile(pkg(), lock(), firebase()), { valid: true });
});

test("rejects a stale lockfile engine", () => {
  const result = validateFunctionsLockfile(pkg(), lock({ engines: { node: "20" } }), firebase());
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /engines differ/);
});

test("rejects a dependency range the lockfile does not know about", () => {
  const result = validateFunctionsLockfile(pkg(), lock({ dependencies: { cors: "^2.8.5", "firebase-functions": "^7.0.3" } }), firebase());
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /dependencies differ/);
});

test("rejects a firebase.json runtime that disagrees with engines.node", () => {
  const result = validateFunctionsLockfile(pkg(), lock(), firebase("nodejs20"));
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /nodejs22/);
});

test("rejects a missing engines.node even when the lockfile matches", () => {
  const result = validateFunctionsLockfile(pkg({ engines: undefined }), lock({ engines: undefined }), firebase());
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /engines\.node must be a bare major version/);
});

test("rejects an engines.node range that cannot map to a firebase runtime", () => {
  const result = validateFunctionsLockfile(pkg({ engines: { node: ">=22" } }), lock({ engines: { node: ">=22" } }), firebase());
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /bare major version/);
});

test("rejects a lockfile without a root entry", () => {
  const result = validateFunctionsLockfile(pkg(), JSON.stringify({ packages: {} }), firebase());
  assert.equal(result.valid, false);
});

test("reports unparseable and missing files", () => {
  assert.equal(validateFunctionsLockfile("{", lock(), firebase()).valid, false);
  assert.equal(validateFunctionsLockfileFiles("missing.json").valid, false);
});

test("passes for the files checked into this repository", () => {
  assert.deepEqual(validateFunctionsLockfileFiles(), { valid: true });
});
