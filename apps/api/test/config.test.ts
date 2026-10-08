import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

describe('loadConfig', () => {
  it('uses local defaults when nothing is set', () => {
    expect(loadConfig({})).toEqual({ environment: 'local', version: '0.0.0-local' });
  });

  it('reads APP_ENV and APP_VERSION', () => {
    expect(loadConfig({ APP_ENV: 'prod', APP_VERSION: '1.2.3' })).toEqual({
      environment: 'prod',
      version: '1.2.3',
    });
  });

  it('rejects unknown environments', () => {
    expect(() => loadConfig({ APP_ENV: 'staging' })).toThrow(
      'Invalid APP_ENV "staging". Expected local, dev or prod.',
    );
  });
});
