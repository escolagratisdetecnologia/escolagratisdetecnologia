import { Logger } from '@aws-lambda-powertools/logger';
import { createApp, type AppDeps } from '../src/app.ts';
import type { AppConfig } from '../src/config.ts';

export const SITE = 'http://localhost:4321';

export const config: AppConfig = {
  environment: 'local',
  version: '9.9.9',
  tableName: 'egt-test-data-main',
  siteOrigin: SITE,
};

/** The app with a database that always answers; override what a test needs. */
export function testApp(overrides: Partial<AppDeps> = {}) {
  return createApp({
    config,
    logger: new Logger({ logLevel: 'SILENT' }),
    checkDatabase: async () => {},
    ...overrides,
  });
}
