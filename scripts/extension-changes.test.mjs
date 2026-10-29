import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  describeExtensionChange,
  isExtensionFile,
  lockDependenciesChanged,
  packageDependenciesChanged
} from './extension-changes.mjs';

const pkg = (fields = {}) => JSON.stringify({ name: 'x', version: '1.0.0', ...fields });

const lock = (version = '1.0.0', packages = {}, rootFields = {}) => JSON.stringify({
  name: 'x',
  version,
  lockfileVersion: 3,
  packages: { '': { name: 'x', version, ...rootFields }, ...packages }
});

describe('isExtensionFile', () => {
  it('counts files that are packaged into the extension', () => {
    for (const file of [
      'src/content/index.js',
      'src/popup/popup.html',
      'public/manifest.json',
      'public/_locales/en/messages.json',
      'public/icons/icon128.png',
      'public/icons/icon16.png'
    ]) {
      assert.equal(isExtensionFile(file), true, file);
    }
  });

  it('counts the files that decide what gets built', () => {
    for (const file of ['scripts/build.js', 'scripts/manifest-key.mjs', 'scripts/manifest-version.mjs']) {
      assert.equal(isExtensionFile(file), true, file);
    }
  });

  it('does not count vite.config.js, which the build ignores (configFile: false)', () => {
    assert.equal(isExtensionFile('vite.config.js'), false);
  });

  it('does not count files in public/ that the build does not copy', () => {
    for (const file of ['public/icons/icon16.svg', 'public/icons/icon64.png', 'public/README.md']) {
      assert.equal(isExtensionFile(file), false, file);
    }
  });

  it('accepts Windows path separators', () => {
    assert.equal(isExtensionFile('src\\content\\index.js'), true);
    assert.equal(isExtensionFile('docs\\README.md'), false);
  });

  it('does not count the Edge manifest, which is not in the Chrome package', () => {
    assert.equal(isExtensionFile('public/manifest.edge.json'), false);
  });

  it('does not count test files, even inside src', () => {
    assert.equal(isExtensionFile('src/shared/utils.test.js'), false);
    assert.equal(isExtensionFile('src/shared/utils.spec.mjs'), false);
    assert.equal(isExtensionFile('tests/unit/utils.test.js'), false);
  });

  it('does not count documentation, the site, functions, CI or other scripts', () => {
    for (const file of [
      'README.md',
      'CLAUDE.md',
      'SECURITY.md',
      'docs/FUNCTIONS_DEPLOYMENT.md',
      'site/index.html',
      'functions/index.js',
      'functions/lib/mailSender.js',
      '.github/workflows/ci.yml',
      'scripts/validate-version-bump.mjs',
      'jest.config.js',
      'package.json',
      'package-lock.json'
    ]) {
      assert.equal(isExtensionFile(file), false, file);
    }
  });

  it('matches whole directory names, not prefixes', () => {
    assert.equal(isExtensionFile('srcs/other.js'), false);
    assert.equal(isExtensionFile('public-docs/page.html'), false);
  });
});

describe('packageDependenciesChanged', () => {
  it('detects an added, removed or changed dependency', () => {
    assert.equal(packageDependenciesChanged(pkg(), pkg({ dependencies: { firebase: '^12.0.0' } })), true);
    assert.equal(
      packageDependenciesChanged(pkg({ dependencies: { firebase: '^12.0.0' } }), pkg()),
      true
    );
    assert.equal(
      packageDependenciesChanged(
        pkg({ devDependencies: { vite: '^6.0.0' } }),
        pkg({ devDependencies: { vite: '^7.0.0' } })
      ),
      true
    );
  });

  it('detects changes to the other dependency fields', () => {
    assert.equal(packageDependenciesChanged(pkg(), pkg({ overrides: { glob: '^10.5.0' } })), true);
    assert.equal(packageDependenciesChanged(pkg(), pkg({ optionalDependencies: { fsevents: '^2.0.0' } })), true);
    assert.equal(packageDependenciesChanged(pkg(), pkg({ peerDependencies: { react: '^18.0.0' } })), true);
  });

  it('ignores the version, scripts and lint settings', () => {
    assert.equal(packageDependenciesChanged(pkg(), pkg({ version: '1.0.1' })), false);
    assert.equal(packageDependenciesChanged(pkg(), pkg({ scripts: { test: 'jest' } })), false);
    assert.equal(packageDependenciesChanged(pkg(), pkg({ 'lint-staged': { '*.js': ['eslint'] } })), false);
  });

  it('ignores the order of keys', () => {
    assert.equal(
      packageDependenciesChanged(
        pkg({ dependencies: { a: '1', b: '2' } }),
        pkg({ dependencies: { b: '2', a: '1' } })
      ),
      false
    );
  });

  it('treats an unreadable file as changed', () => {
    assert.equal(packageDependenciesChanged('not json', pkg()), true);
    assert.equal(packageDependenciesChanged(pkg(), 'not json'), true);
  });
});

describe('lockDependenciesChanged', () => {
  it('ignores a change of the root package version only', () => {
    assert.equal(lockDependenciesChanged(lock('1.0.0'), lock('1.0.1')), false);
  });

  it('detects an added, removed or changed package', () => {
    const withFoo = lock('1.0.0', { 'node_modules/foo': { version: '1.0.0' } });
    const withNewerFoo = lock('1.0.0', { 'node_modules/foo': { version: '1.1.0' } });

    assert.equal(lockDependenciesChanged(lock('1.0.0'), withFoo), true);
    assert.equal(lockDependenciesChanged(withFoo, lock('1.0.0')), true);
    assert.equal(lockDependenciesChanged(withFoo, withNewerFoo), true);
  });

  it('detects a change in what the root package depends on', () => {
    assert.equal(
      lockDependenciesChanged(lock('1.0.0'), lock('1.0.0', {}, { dependencies: { foo: '^1.0.0' } })),
      true
    );
  });

  it('still detects a real change when the version changed too', () => {
    assert.equal(
      lockDependenciesChanged(lock('1.0.0'), lock('1.0.1', { 'node_modules/foo': { version: '1.0.0' } })),
      true
    );
  });

  it('treats an unreadable file as changed', () => {
    assert.equal(lockDependenciesChanged('not json', lock()), true);
    assert.equal(lockDependenciesChanged(lock(), ''), true);
  });
});

describe('describeExtensionChange', () => {
  const unchanged = {
    basePackage: pkg(),
    currentPackage: pkg({ version: '1.0.1' }),
    basePackageLock: lock('1.0.0'),
    currentPackageLock: lock('1.0.1')
  };

  it('reports no change for documentation, CI and functions only', () => {
    const result = describeExtensionChange({
      ...unchanged,
      changedFiles: ['README.md', 'docs/FUNCTIONS_DEPLOYMENT.md', '.github/workflows/ci.yml', 'functions/index.js']
    });

    assert.deepEqual(result, { changed: false, reasons: [] });
  });

  it('reports a change in extension files', () => {
    const result = describeExtensionChange({
      ...unchanged,
      changedFiles: ['README.md', 'src/popup/popup.js']
    });

    assert.deepEqual(result, { changed: true, reasons: ['extension files changed: src/popup/popup.js'] });
  });

  it('lists a few extension files and counts the rest', () => {
    const files = Array.from({ length: 7 }, (_, index) => `src/file${index}.js`);
    const result = describeExtensionChange({ ...unchanged, changedFiles: files });

    assert.equal(result.changed, true);
    assert.match(result.reasons[0], /src\/file0\.js, src\/file1\.js, src\/file2\.js, src\/file3\.js, src\/file4\.js, and 2 more$/);
  });

  it('reports a dependency change in package.json', () => {
    const result = describeExtensionChange({
      ...unchanged,
      currentPackage: pkg({ version: '1.0.1', dependencies: { firebase: '^12.19.0' } }),
      changedFiles: ['package.json']
    });

    assert.deepEqual(result, { changed: true, reasons: ['dependencies changed in package.json'] });
  });

  it('reports a dependency change in package-lock.json', () => {
    const result = describeExtensionChange({
      ...unchanged,
      currentPackageLock: lock('1.0.1', { 'node_modules/foo': { version: '1.0.0' } }),
      changedFiles: ['package-lock.json']
    });

    assert.deepEqual(result, { changed: true, reasons: ['dependencies changed in package-lock.json'] });
  });

  it('reports every reason together', () => {
    const result = describeExtensionChange({
      basePackage: pkg(),
      currentPackage: pkg({ dependencies: { firebase: '^12.19.0' } }),
      basePackageLock: lock(),
      currentPackageLock: lock('1.0.0', { 'node_modules/foo': { version: '1.0.0' } }),
      changedFiles: ['src/a.js']
    });

    assert.equal(result.changed, true);
    assert.equal(result.reasons.length, 3);
  });
});
