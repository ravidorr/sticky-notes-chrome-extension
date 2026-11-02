/**
 * Tab cleanup wiring unit tests
 */

import { readFileSync } from 'node:fs';
import { jest, describe, it, expect } from '@jest/globals';
import { registerTabCleanup } from '../../src/background/tabCleanup.js';

function setup(releaseTab = jest.fn()) {
  const tabs = { onRemoved: { addListener: jest.fn() } };
  const handlers = { releaseTab };
  const log = { error: jest.fn() };
  registerTabCleanup(tabs, handlers, log);
  return { tabs, handlers, log, listener: tabs.onRemoved.addListener.mock.calls[0][0] };
}

describe('registerTabCleanup', () => {
  it('registers one listener on tabs.onRemoved', () => {
    const { tabs } = setup();

    expect(tabs.onRemoved.addListener).toHaveBeenCalledTimes(1);
  });

  it('releases the subscriptions of the closed tab', () => {
    const { handlers, listener } = setup();

    listener(123);

    expect(handlers.releaseTab).toHaveBeenCalledWith(123);
  });

  it('logs a failing release instead of throwing out of the listener', () => {
    const failure = new Error('boom');
    const { listener, log } = setup(jest.fn(() => { throw failure; }));

    expect(() => listener(7)).not.toThrow();
    expect(log.error).toHaveBeenCalledWith(expect.any(String), 7, failure);
  });
});

describe('background bootstrap wiring', () => {
  // src/background/index.js is excluded from coverage and only bootstraps outside Jest, so this
  // guards the one line that connects the tab listener to the handlers (and its argument order)
  it('calls registerTabCleanup with chrome.tabs, the handlers and the logger', () => {
    const source = readFileSync(new URL('../../src/background/index.js', import.meta.url), 'utf8');

    expect(source).toMatch(/import \{ registerTabCleanup \} from '\.\/tabCleanup\.js';/);
    expect(source).toMatch(/registerTabCleanup\(chrome\.tabs, handlers, log\);/);
  });
});
