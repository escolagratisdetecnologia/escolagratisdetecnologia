import type { ProgressCatalog } from '@egt/core';
import {
  checkDatabase,
  connect,
  createDynamoProfileRepository,
  createDynamoProgressRepository,
} from '@egt/db';
import { handle } from 'hono/aws-lambda';
import { createApp } from './app.ts';
import { apiError } from './errors.ts';
import { loadConfig } from './config.ts';
import { createCognitoIdentity } from './identity/cognito.ts';
import { createLogger } from './logger.ts';

/** Lessons of every course, from content/ (scripts/build.ts). */
declare const __PROGRESS_CATALOG__: ProgressCatalog;

const config = loadConfig();
if (config.cognito === undefined) throw new Error('Cognito settings are required in AWS.');
const logger = createLogger(config);
const db = connect({ table: config.tableName });
const handleRequest = handle(
  createApp({
    config,
    logger,
    progress: createDynamoProgressRepository(db),
    profiles: createDynamoProfileRepository(db),
    catalog: __PROGRESS_CATALOG__,
    checkDatabase: () => checkDatabase(db),
    identity: createCognitoIdentity(config.cognito),
  }),
);

/**
 * The WAF login limit compares the raw path, but these forms would reach other routes after
 * normalization (/api/./auth/..., /api/%61uth/...). No legitimate path has them (slugs are
 * [a-z0-9-]), so refuse them before routing.
 */
function isNonCanonicalPath(path: string): boolean {
  return (
    path.includes('%') ||
    path.includes('/./') ||
    path.includes('/../') ||
    path.endsWith('/.') ||
    path.endsWith('/..')
  );
}

export const handler: typeof handleRequest = async (event, context) => {
  logger.addContext(context);
  // HTTP API (payload v2) events carry rawPath.
  if ('rawPath' in event && isNonCanonicalPath(event.rawPath)) {
    return {
      statusCode: 404,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify(apiError('not_found', 'Rota não encontrada.')),
      isBase64Encoded: false,
    } as Awaited<ReturnType<typeof handleRequest>>;
  }
  return handleRequest(event, context);
};
