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
      local: {
        mailpitUrl: 'http://localhost:8025',
        googleIssuer: 'http://localhost:8080/google',
      },
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
        USER_POOL_ID: 'sa-east-1_Abc',
        USER_POOL_CLIENT_ID: 'cliente',
        USER_POOL_CLIENT_SECRET: 'segredo-do-cliente',
        AUTH_DOMAIN: 'auth.escolagratisdetecnologia.com.br',
      }),
    ).toEqual({
      environment: 'prod',
      version: '1.2.3',
      tableName: 'egt-prod-data-main',
      siteOrigin: 'https://escolagratisdetecnologia.com.br',
      originVerifySecret: 'segredo',
      cognito: {
        userPoolId: 'sa-east-1_Abc',
        clientId: 'cliente',
        clientSecret: 'segredo-do-cliente',
        domain: 'auth.escolagratisdetecnologia.com.br',
      },
    });
  });

  it('requires every AWS setting outside local', () => {
    expect(() =>
      loadConfig({ APP_ENV: 'dev', APP_VERSION: '1', SITE_ORIGIN: 'x', ORIGIN_VERIFY_SECRET: 'y' }),
    ).toThrow('Missing TABLE_NAME (required when APP_ENV is dev).');
    expect(() =>
      loadConfig({
        APP_ENV: 'dev',
        APP_VERSION: '1',
        TABLE_NAME: 't',
        SITE_ORIGIN: 'x',
        ORIGIN_VERIFY_SECRET: 'y',
        USER_POOL_ID: 'p',
        USER_POOL_CLIENT_ID: 'c',
        AUTH_DOMAIN: 'auth.example.com',
      }),
    ).toThrow('Missing USER_POOL_CLIENT_SECRET (required when APP_ENV is dev).');
  });

  it('rejects unknown environments', () => {
    expect(() => loadConfig({ APP_ENV: 'staging' })).toThrow(
      'Invalid APP_ENV "staging". Expected local, dev or prod.',
    );
  });
});
