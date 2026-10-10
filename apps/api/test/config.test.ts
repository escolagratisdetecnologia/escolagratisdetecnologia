import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

describe('loadConfig', () => {
  it('uses local defaults when nothing is set', () => {
    expect(loadConfig({})).toEqual({
      environment: 'local',
      version: '0.0.0-local',
      tableName: 'egt-local-data-main',
      dynamodbEndpoint: 'http://localhost:8000',
      siteOrigin: 'http://localhost:4321',
    });
  });

  it('reads everything AWS sets', () => {
    expect(
      loadConfig({
        APP_ENV: 'prod',
        APP_VERSION: '1.2.3',
        TABLE_NAME: 'egt-prod-data-main',
        SITE_ORIGIN: 'https://escolagratisdetecnologia.com.br',
        ORIGIN_VERIFY_SECRET: 'segredo',
      }),
    ).toEqual({
      environment: 'prod',
      version: '1.2.3',
      tableName: 'egt-prod-data-main',
      siteOrigin: 'https://escolagratisdetecnologia.com.br',
      originVerifySecret: 'segredo',
    });
  });

  it('requires every AWS setting outside local', () => {
    expect(() =>
      loadConfig({ APP_ENV: 'dev', APP_VERSION: '1', SITE_ORIGIN: 'x', ORIGIN_VERIFY_SECRET: 'y' }),
    ).toThrow('Missing TABLE_NAME (required when APP_ENV is dev).');
  });

  it('rejects unknown environments', () => {
    expect(() => loadConfig({ APP_ENV: 'staging' })).toThrow(
      'Invalid APP_ENV "staging". Expected local, dev or prod.',
    );
  });
});
