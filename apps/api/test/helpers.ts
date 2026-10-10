import { Logger } from '@aws-lambda-powertools/logger';
import type { ProgressCatalog } from '@egt/core';
import { createMemoryProgressRepository } from '@egt/db';
import { createApp, type AppDeps } from '../src/app.ts';
import type { AppConfig } from '../src/config.ts';

export const SITE = 'http://localhost:4321';
export const NOW = new Date('2026-10-09T12:00:00.000Z');

/** The courses and lessons the test app knows. */
export const CATALOG: ProgressCatalog = {
  site: { 'o-que-e-um-site': 1, a: 1, b: 1 },
  planilhas: { x: 0 },
};

export const config: AppConfig = {
  environment: 'local',
  version: '9.9.9',
  tableName: 'egt-test-data-main',
  siteOrigin: SITE,
};

/** The app with in-memory storage; the x-test-user header plays the logged-in learner. */
export function testApp(overrides: Partial<AppDeps> = {}) {
  return createApp({
    config,
    logger: new Logger({ logLevel: 'SILENT' }),
    progress: createMemoryProgressRepository(),
    catalog: CATALOG,
    checkDatabase: async () => {},
    authenticate: async (request) => {
      const sub = request.headers.get('x-test-user');
      return sub === null ? null : { sub };
    },
    now: () => NOW,
    ...overrides,
  });
}

/** Headers of a logged-in learner sending a change from the site. */
export const learner = (sub = 'ana') => ({
  'x-test-user': sub,
  origin: SITE,
  'content-type': 'application/json',
});
