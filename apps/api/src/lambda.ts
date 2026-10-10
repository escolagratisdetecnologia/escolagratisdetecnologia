import type { ProgressCatalog } from '@egt/core';
import {
  checkDatabase,
  connect,
  createDynamoProfileRepository,
  createDynamoProgressRepository,
} from '@egt/db';
import { handle } from 'hono/aws-lambda';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { noAccounts } from './identity.ts';
import { createLogger } from './logger.ts';

/** Lessons of every course, from content/ (scripts/build.ts). */
declare const __PROGRESS_CATALOG__: ProgressCatalog;

const config = loadConfig();
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
    identity: noAccounts,
  }),
);

export const handler: typeof handleRequest = async (event, context) => {
  logger.addContext(context);
  return handleRequest(event, context);
};
