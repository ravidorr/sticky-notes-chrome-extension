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

  it('clears the override when the preference is removed', async () => {
    const storage = makeStorage({ logLevel: 'warn' });
    await initLogLevel({ chromeStorage: storage });
    const listener = storage.onChanged.addListener.mock.calls[0][0];

    listener({ preferences: {} }, 'sync');

    expect(getLogLevelName()).toBeNull();
  });

  it('works when onChanged is unavailable', async () => {
    const result = await initLogLevel({ chromeStorage: makeStorage({ logLevel: 'error' }, false) });

    expect(result).toBe('error');
  });
});
