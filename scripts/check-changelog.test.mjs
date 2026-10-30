import assert from 'node:assert/strict';
import test from 'node:test';

import { checkChangelog } from './check-changelog.mjs';

test('accepts a commit that stages the changelog with other files', () => {
  assert.deepEqual(checkChangelog(['src/popup/popup.js', 'CHANGELOG.md']), { valid: true });
});

test('accepts a commit that stages only the changelog', () => {
  assert.deepEqual(checkChangelog(['CHANGELOG.md']), { valid: true });
});

test('accepts a commit with nothing staged', () => {
  assert.deepEqual(checkChangelog([]), { valid: true });
});

test('rejects a commit without the changelog and names the fix', () => {
  const result = checkChangelog(['README.md', 'docs/ROADMAP.md']);
  assert.equal(result.valid, false);
  assert.match(result.message, /2 file\(s\)/);
  assert.match(result.message, /git add CHANGELOG\.md/);
});

test('does not accept a changelog in another directory', () => {
  assert.equal(checkChangelog(['docs/CHANGELOG.md']).valid, false);
});
