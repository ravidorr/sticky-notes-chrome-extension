/**
 * Log Level Sync Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { initLogLevel } from '../../src/shared/logLevel.js';
import { getLogLevelName, setLogLevel } from '../../src/shared/logger.js';

function makeStorage(preferences, withOnChanged = true) {
  const storage = {
    sync: {
      get: jest.fn(async () => (preferences ? { preferences } : {}))
    }
  };
  if (withOnChanged) {
    storage.onChanged = { addListener: jest.fn() };
  }
  return storage;
}

describe('initLogLevel', () => {
  afterEach(() => {
    setLogLevel(null);
  });

  it('applies the stored log level', async () => {
    const result = await initLogLevel({ chromeStorage: makeStorage({ logLevel: 'debug' }) });

    expect(result).toBe('debug');
    expect(getLogLevelName()).toBe('debug');
  });

  it('defaults to silent when nothing is stored', async () => {
    const result = await initLogLevel({ chromeStorage: makeStorage(null) });

    expect(result).toBe('silent');
    expect(getLogLevelName()).toBe('silent');
  });

  it('follows sync preference changes', async () => {
    const storage = makeStorage({ logLevel: 'silent' });
    await initLogLevel({ chromeStorage: storage });
    const listener = storage.onChanged.addListener.mock.calls[0][0];

    listener({ preferences: { newValue: { logLevel: 'info' } } }, 'sync');

    expect(getLogLevelName()).toBe('info');
  });

  it('ignores changes in other areas or other keys', async () => {
    const storage = makeStorage({ logLevel: 'warn' });
    await initLogLevel({ chromeStorage: storage });
    const listener = storage.onChanged.addListener.mock.calls[0][0];

    listener({ preferences: { newValue: { logLevel: 'debug' } } }, 'local');
    listener({ other: { newValue: {} } }, 'sync');

    expect(getLogLevelName()).toBe('warn');
  });

  it('uses the default when a change lacks logLevel (older build on another device)', async () => {
    const storage = makeStorage({ logLevel: 'debug' });
    await initLogLevel({ chromeStorage: storage });
    const listener = storage.onChanged.addListener.mock.calls[0][0];

    listener({ preferences: { newValue: { fontSize: 'large' } } }, 'sync');
    expect(getLogLevelName()).toBe('silent');

    listener({ preferences: { newValue: { logLevel: 'verbose' } } }, 'sync');
    expect(getLogLevelName()).toBe('silent');

    listener({ preferences: {} }, 'sync');
    expect(getLogLevelName()).toBe('silent');
  });

  it('applies the default synchronously while the preference loads', async () => {
    setLogLevel('debug');
    const storage = makeStorage({ logLevel: 'debug' });

    const pending = initLogLevel({ chromeStorage: storage });
    expect(getLogLevelName()).toBe('silent');

    await pending;
    expect(getLogLevelName()).toBe('debug');
  });

  it('does not reject when the change listener cannot be registered', async () => {
    const storage = makeStorage({ logLevel: 'debug' });
    storage.onChanged.addListener.mockImplementation(() => { throw new Error('no listener'); });

    await expect(initLogLevel({ chromeStorage: storage })).resolves.toBe('debug');
    expect(getLogLevelName()).toBe('debug');
  });

  it('keeps a change that arrives while the preference is loading', async () => {
    const storage = makeStorage({ logLevel: 'debug' });
    let release;
    storage.sync.get.mockImplementation(() => new Promise(resolve => {
      release = () => resolve({ preferences: { logLevel: 'debug' } });
    }));

    const pending = initLogLevel({ chromeStorage: storage });
    const listener = storage.onChanged.addListener.mock.calls[0][0];
    listener({ preferences: { newValue: { logLevel: 'error' } } }, 'sync');
    release();

    await pending;
    expect(getLogLevelName()).toBe('error');
  });

  it('works when onChanged is unavailable', async () => {
    const result = await initLogLevel({ chromeStorage: makeStorage({ logLevel: 'error' }, false) });

    expect(result).toBe('error');
  });
});
