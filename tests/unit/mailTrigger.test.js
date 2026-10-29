/**
 * Mail trigger definition tests
 *
 * Checks the options, params and secret that the sendMail trigger registers,
 * and the config it hands to the mail handler.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const handleMailCreated = jest.fn();

// The Jest config maps relative .js specifiers, which breaks mocking one by its
// relative path. The absolute path resolves to the module mailTrigger.js imports.
const mailSenderPath = new URL('../../functions/lib/mailSender.js', import.meta.url).pathname;
jest.unstable_mockModule(mailSenderPath, () => ({ handleMailCreated }));

const { defineMailTrigger, MAIL_TRIGGER_OPTIONS } = await import('../../functions/lib/mailTrigger.js');

describe('mailTrigger', () => {
  const localThis = {};

  beforeEach(() => {
    handleMailCreated.mockReset();
    localThis.sdk = {
      defineSecret: jest.fn((name) => ({ name, value: () => `secret:${name}` })),
      defineString: jest.fn((name) => ({ name, value: () => `string:${name}` })),
      onDocumentCreated: jest.fn((options, handler) => ({ options, handler }))
    };
    localThis.trigger = defineMailTrigger(localThis.sdk);
  });

  it('should watch new mail documents with retry and a 60s timeout', () => {
    expect(MAIL_TRIGGER_OPTIONS).toEqual({
      document: 'mail/{mailId}',
      region: 'us-central1',
      timeoutSeconds: 60,
      retry: true
    });
    expect(localThis.trigger.options).toEqual(expect.objectContaining(MAIL_TRIGGER_OPTIONS));
  });

  it('should define the SMTP params and the password secret by name', () => {
    expect(localThis.sdk.defineSecret).toHaveBeenCalledWith('SMTP_PASSWORD');
    expect(localThis.sdk.defineString).toHaveBeenCalledWith('SMTP_USER');
    expect(localThis.sdk.defineString).toHaveBeenCalledWith('MAIL_FROM');
  });

  it('should bind the password secret to the function', () => {
    expect(localThis.trigger.options.secrets).toEqual([
      expect.objectContaining({ name: 'SMTP_PASSWORD' })
    ]);
  });

  it('should hand the SMTP config to the mail handler', () => {
    const event = { params: { mailId: 'm1' } };

    localThis.trigger.handler(event);

    expect(handleMailCreated).toHaveBeenCalledWith(event, {
      user: 'string:SMTP_USER',
      password: 'secret:SMTP_PASSWORD',
      from: 'string:MAIL_FROM'
    });
  });

  it('should read the param values when the handler runs, not when it is defined', () => {
    const readValue = jest.fn(() => 'v');
    const sdk = {
      defineSecret: jest.fn(() => ({ value: readValue })),
      defineString: jest.fn(() => ({ value: readValue })),
      onDocumentCreated: jest.fn((options, handler) => ({ options, handler }))
    };

    const trigger = defineMailTrigger(sdk);
    expect(readValue).not.toHaveBeenCalled();

    trigger.handler({});
    expect(readValue).toHaveBeenCalledTimes(3);
  });

  it('should return the handler result so a retry error reaches the platform', async () => {
    handleMailCreated.mockRejectedValue(new Error('retrying'));

    await expect(localThis.trigger.handler({})).rejects.toThrow('retrying');
  });
});
