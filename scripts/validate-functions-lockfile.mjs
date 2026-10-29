import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];

const sameJson = (left, right) => JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});

const sortedEntries = (value) => Object.fromEntries(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)));

export function validateFunctionsLockfile(packageJson, lockfile, firebaseJson) {
  let pkg;
  let lock;
  let firebase;

  try {
    pkg = JSON.parse(packageJson);
    lock = JSON.parse(lockfile);
    firebase = JSON.parse(firebaseJson);
  } catch (error) {
    return { valid: false, errors: [`Unable to parse JSON: ${error.message}`] };
  }

  const root = lock.packages?.[""];

  if (!root) {
    return { valid: false, errors: ['functions/package-lock.json has no root package entry ("packages[\\"\\"]").'] };
  }

  const errors = [];

  if (!sameJson(root.engines, pkg.engines)) {
    errors.push(
      `engines differ: functions/package.json has ${JSON.stringify(pkg.engines ?? {})}, ` +
        `functions/package-lock.json has ${JSON.stringify(root.engines ?? {})}.`,
    );
  }

  for (const field of DEPENDENCY_FIELDS) {
    if (!sameJson(sortedEntries(root[field]), sortedEntries(pkg[field]))) {
      errors.push(`${field} differ between functions/package.json and functions/package-lock.json.`);
    }
  }

  const expectedRuntime = pkg.engines?.node ? `nodejs${pkg.engines.node}` : null;
  const runtime = firebase.functions?.runtime;

  if (expectedRuntime && runtime !== expectedRuntime) {
    errors.push(`firebase.json functions.runtime is ${runtime}, but engines.node requires ${expectedRuntime}.`);
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

export function validateFunctionsLockfileFiles(
  packageJsonPath = "functions/package.json",
  lockfilePath = "functions/package-lock.json",
  firebaseJsonPath = "firebase.json",
) {
  try {
    return validateFunctionsLockfile(
      readFileSync(packageJsonPath, "utf8"),
      readFileSync(lockfilePath, "utf8"),
      readFileSync(firebaseJsonPath, "utf8"),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { valid: false, errors: [`Unable to read functions files: ${message}`] };
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateFunctionsLockfileFiles(...process.argv.slice(2));

  if (!result.valid) {
    for (const error of result.errors) {
      console.error(error);
    }
    console.error("Run `npm install --package-lock-only` in functions/ and commit the result.");
    process.exit(1);
  }

  process.stdout.write("functions/package-lock.json and firebase.json match functions/package.json.\n");
}
