import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// The workflow is YAML and the repo has no YAML parser, so this reads the few
// shapes the workflow uses: top level steps start with "      - " at six spaces.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const workflow = read('.github/workflows/publish-edge-addons.yml');
const packageJson = JSON.parse(read('package.json'));

const stepsText = workflow.slice(workflow.indexOf('\n    steps:\n') + '\n    steps:\n'.length);
const steps = stepsText.split(/^ {6}- /m).filter(Boolean).map((chunk) => `- ${chunk}`);
const stepNamed = (fragment) => steps.find((step) => step.includes(fragment));
const gateStep = stepNamed('id: gate');
const laterSteps = steps.slice(steps.indexOf(gateStep) + 1);

const envNames = (script) => [...script.matchAll(/process\.env\.([A-Z_]+)/g)].map((match) => match[1]);

describe('publish-edge-addons workflow', () => {
  it('runs on pushes to main and on manual dispatch, not on pull requests', () => {
    assert.match(workflow, /^ {2}push:\n {4}branches: \[main\]/m);
    assert.match(workflow, /^ {2}workflow_dispatch:/m);
    assert.doesNotMatch(workflow, /pull_request/);
  });

  it('only runs a push, or a manual dispatch from main', () => {
    const condition = workflow.match(/^ {4}if: (.+)$/m)[1];
    assert.match(condition, /github\.event_name == 'push'/);
    assert.match(condition, /github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
  });

  it('has a job timeout and does not overlap runs', () => {
    assert.match(workflow, /^ {4}timeout-minutes: 30$/m);
    assert.match(workflow, /group: edge-addons-publish\n {2}cancel-in-progress: false/);
  });

  it('checks out the pushed commit with full history, and gives the gate the push range', () => {
    assert.doesNotMatch(workflow, /^ {10}ref:/m);
    assert.match(workflow, /fetch-depth: 0/);
    assert.match(gateStep, /BASE_SHA: \$\{\{ github\.event\.before \}\}/);
    assert.match(gateStep, /HEAD_SHA: \$\{\{ github\.sha \}\}/);
  });

  it('has a gate step and every later step depends on its output', () => {
    assert.ok(gateStep, 'a step with id: gate');
    assert.match(gateStep, /scripts\/check-edge-addons-version\.mjs/);
    assert.ok(laterSteps.length >= 3);
    for (const step of laterSteps) {
      assert.match(step, /if: steps\.gate\.outputs\.submit == 'true'/);
    }
  });

  it('pins every action to a full commit SHA with a version comment', () => {
    const uses = [...workflow.matchAll(/uses: (\S+)(.*)$/gm)];
    assert.ok(uses.length >= 2);
    for (const [, action, rest] of uses) {
      assert.match(action, /@[0-9a-f]{40}$/, `${action} is pinned`);
      assert.match(rest, /# v\d/, `${action} has a version comment`);
    }
  });

  it('gives each script every environment variable it reads', () => {
    const gate = read('scripts/check-edge-addons-version.mjs');
    const publish = read('scripts/publish-edge-addons.mjs');
    const publishStep = stepNamed('scripts/publish-edge-addons.mjs');

    // Names the gate reads through its REQUIRED_SETTINGS list, plus its own
    const gateNames = ['EDGE_CLIENT_ID', 'EDGE_API_KEY', 'EDGE_PRODUCT_ID', 'EVENT_NAME', 'BASE_SHA', 'HEAD_SHA'];
    for (const name of gateNames) {
      assert.match(gateStep, new RegExp(`${name}: `), `gate step sets ${name}`);
    }
    for (const name of envNames(gate)) {
      assert.ok(gateNames.includes(name) || ['GITHUB_OUTPUT', 'GITHUB_STEP_SUMMARY'].includes(name), `unexpected ${name}`);
    }

    // Optional ones have defaults in the script; the workflow must set the required ones
    const optional = ['GITHUB_STEP_SUMMARY', 'PUBLISH_NOTES', 'MANIFEST_PATH', 'PACKAGE_JSON_PATH', 'EDGE_API_BASE_URL'];
    for (const name of envNames(publish)) {
      if (!optional.includes(name)) {
        assert.match(publishStep, new RegExp(`${name}: `), `publish step sets ${name}`);
      }
    }
  });

  it('uploads the zip that npm run build:edge produces', () => {
    assert.equal(packageJson.scripts['build:edge'], 'node scripts/build.js --browser=edge');
    const build = read('scripts/build.js');
    assert.match(build, /dist\/\$\{targetBrowser\}\.zip/);
    assert.match(stepNamed('scripts/publish-edge-addons.mjs'), /PACKAGE_PATH: dist\/edge\.zip/);
    assert.match(stepNamed('npm run build:edge'), /run: npm run build:edge/);
  });

  it('builds the manifest the publish script checks at its default path', () => {
    assert.match(read('scripts/publish-edge-addons.mjs'), /'dist\/edge\/manifest\.json'/);
    assert.match(read('scripts/build.js'), /resolve\(distDir, 'manifest\.json'\)/);
  });

  it('keeps the credentials in secrets and a variable', () => {
    assert.match(workflow, /EDGE_CLIENT_ID: \$\{\{ secrets\.EDGE_CLIENT_ID \}\}/);
    assert.match(workflow, /EDGE_API_KEY: \$\{\{ secrets\.EDGE_API_KEY \}\}/);
    assert.match(workflow, /EDGE_PRODUCT_ID: \$\{\{ vars\.EDGE_PRODUCT_ID \}\}/);
    assert.doesNotMatch(workflow, /e8c23177/);
  });
});
