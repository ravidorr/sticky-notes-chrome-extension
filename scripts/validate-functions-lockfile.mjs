import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const FUNCTIONS_SOURCE = 'functions';

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function parseObject(label, text) {
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { error: `${label} is not valid JSON: ${error.message}` };
  }

  return isObject(parsed) ? { value: parsed } : { error: `${label} must contain a JSON object.` };
}

function describeDependencyDrift(field, manifest, locked) {
  const names = [...new Set([...Object.keys(manifest), ...Object.keys(locked)])].sort();
  const differing = names.filter((name) => manifest[name] !== locked[name]);
  const detail = differing
    .map((name) => `${name} (package.json: ${manifest[name] ?? 'absent'}, lockfile: ${locked[name] ?? 'absent'})`)
    .join(', ');

  return differing.length > 0 ? `${field} differ between functions/package.json and the lockfile: ${detail}.` : null;
}

// firebase.json "functions" is an object, or an array when there are several codebases
function findFunctionsConfig(firebase) {
  const config = firebase.functions;

  if (Array.isArray(config)) {
    return config.find((entry) => isObject(entry) && entry.source === FUNCTIONS_SOURCE);
  }

  return isObject(config) ? config : undefined;
}

export function validateFunctionsLockfile(packageJson, lockfile, firebaseJson) {
  const parsed = [
    parseObject('functions/package.json', packageJson),
    parseObject('functions/package-lock.json', lockfile),
    parseObject('firebase.json', firebaseJson)
  ];
  const parseErrors = parsed.filter((result) => result.error).map((result) => result.error);

  if (parseErrors.length > 0) {
    return { valid: false, errors: parseErrors };
  }

  const [{ value: pkg }, { value: lock }, { value: firebase }] = parsed;
  const root = lock.packages?.[''];

  if (!isObject(root)) {
    return { valid: false, errors: ['functions/package-lock.json has no root package entry (packages[""]).'] };
  }

  const errors = [];
  const engineNode = pkg.engines?.node;

  if (typeof engineNode !== 'string' || !/^\d+$/.test(engineNode)) {
    errors.push(
      `functions/package.json engines.node must be a bare major version such as "22", got ${JSON.stringify(engineNode)}. ` +
        'deploy-functions.yml and firebase.json functions.runtime both derive from it.'
    );
  } else {
    const expectedRuntime = `nodejs${engineNode}`;
    const runtime = findFunctionsConfig(firebase)?.runtime;

    if (runtime !== expectedRuntime) {
      errors.push(`firebase.json functions.runtime is ${runtime}, but engines.node requires ${expectedRuntime}.`);
    }
  }

  if (root.engines?.node !== engineNode) {
    errors.push(
      `engines.node differs: functions/package.json has ${JSON.stringify(engineNode)}, ` +
        `functions/package-lock.json has ${JSON.stringify(root.engines?.node)}.`
    );
  }

  for (const field of DEPENDENCY_FIELDS) {
    const drift = describeDependencyDrift(field, pkg[field] ?? {}, root[field] ?? {});

    if (drift) {
      errors.push(drift);
    }
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

export function validateFunctionsLockfileFiles(
  packageJsonPath = 'functions/package.json',
  lockfilePath = 'functions/package-lock.json',
  firebaseJsonPath = 'firebase.json'
) {
  const texts = [];

  for (const path of [packageJsonPath, lockfilePath, firebaseJsonPath]) {
    try {
      texts.push(readFileSync(path, 'utf8'));
    } catch (error) {
      return { valid: false, errors: [`Unable to read functions files: ${error.message}`] };
    }
  }

  return validateFunctionsLockfile(...texts);
}

// Compare real paths so running through a symlink or wrapper still executes the check
function isEntryPoint() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  const result = validateFunctionsLockfileFiles(...process.argv.slice(2));

  if (!result.valid) {
    for (const message of result.errors) {
      console.error(message);
    }
    console.error('Run `npm install --package-lock-only` in functions/ and commit the result.');
    process.exit(1);
  }

  process.stdout.write('functions/package-lock.json and firebase.json match functions/package.json.\n');
}
