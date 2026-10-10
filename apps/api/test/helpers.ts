import { Logger } from '@aws-lambda-powertools/logger';
import type { ProgressCatalog } from '@egt/core';
import {
  createMemoryProfileRepository,
  createMemoryProgressRepository,
  type Profile,
} from '@egt/db';
import { createApp, type AppDeps } from '../src/app.ts';
import type { AppConfig } from '../src/config.ts';
import { createFakeIdentity } from './fake-identity.ts';

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

export const PROFILE: Profile = {
  birthYear: 2008,
  termsVersion: '2026-10-10',
  termsAcceptedAt: '2026-10-09T10:00:00.000Z',
  createdAt: '2026-10-09T10:00:00.000Z',
};

/**
 * The app with in-memory storage and the fake identity provider. Ana and Bia have accounts and
 * finished sign-up; anyone else signs up on the first sign-in.
 */
export function testApp(overrides: Partial<AppDeps> = {}) {
  return createApp({
    config,
    logger: new Logger({ logLevel: 'SILENT' }),
    progress: createMemoryProgressRepository(),
    profiles: createMemoryProfileRepository({ ana: PROFILE, bia: PROFILE }),
    catalog: CATALOG,
    checkDatabase: async () => {},
    identity: createFakeIdentity({ 'ana@example.com': 'ana', 'bia@example.com': 'bia' }),
    now: () => NOW,
    ...overrides,
  });
}

/** Headers of a logged-in learner sending a change from the site. */
export const learner = (sub = 'ana') => ({
  cookie: `egt_at=access.${sub}`,
  origin: SITE,
  'content-type': 'application/json',
});
